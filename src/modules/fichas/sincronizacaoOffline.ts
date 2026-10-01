// Orquestra o envio da fila offline (ADR 0002, ADR 0014) — chamada pelo hook
// useSincronizacaoOffline em resposta a: montagem do app, evento `online`, e sessão
// restaurada após reautenticação. Sempre a MESMA sequência do fluxo online (INSERT + assinar
// como INSPETOR), nunca uma segunda implementação — só com passos extras de idempotência,
// necessários porque aqui (ao contrário do fluxo online) uma tentativa pode falhar a meio e
// ser retomada mais tarde com o mesmo id gerado no cliente.
import { supabase } from "@/lib/supabase";
import {
  atualizarStatusFicha,
  listarFichasEnfileiradas,
  removerFichaEnfileirada,
  type FichaEnfileirada,
} from "@/lib/offlineQueue";

export interface ResultadoSincronizacao {
  sincronizadas: string[];
  falharam: string[];
  precisaReautenticar: boolean;
}

function ehErroDeAutenticacao(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  return /jwt|jwt expired|not authenticated|401|invalid.*token/i.test(mensagem);
}

async function jaAssinadaComoInspetor(monitoramentoId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("assinaturas_eletronicas")
    .select("id")
    .eq("monitoramento_id", monitoramentoId)
    .eq("tipo", "INSPETOR")
    .eq("user_id", userId)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function sincronizarUmaFicha(item: FichaEnfileirada): Promise<void> {
  // 1) Garante que o registro existe (upsert idempotente — se uma tentativa anterior já
  // inseriu e falhou só na assinatura, ignoreDuplicates faz isto virar um no-op).
  const { error: erroUpsert } = await supabase.from("monitoramentos").upsert(
    {
      id: item.id,
      ficha_template_id: item.fichaTemplateId,
      versao_template: item.versaoTemplate,
      user_id: item.userId,
      setor: item.setor,
      dados_dinamicos: item.dadosDinamicos,
      capturado_em: item.capturadoEm,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (erroUpsert) throw erroUpsert;

  // 2) Assina como INSPETOR só se ainda não assinou (idempotência do passo 2, independente
  // do passo 1 — o upsert acima não informa se a linha já existia antes desta chamada).
  if (await jaAssinadaComoInspetor(item.id, item.userId)) return;

  const { error: erroAssinar } = await supabase.functions.invoke("assinar-documento", {
    body: { monitoramento_id: item.id, tipo: "INSPETOR" },
  });
  if (erroAssinar) throw erroAssinar;
}

export async function sincronizarFilaOffline(): Promise<ResultadoSincronizacao> {
  const resultado: ResultadoSincronizacao = { sincronizadas: [], falharam: [], precisaReautenticar: false };
  const fila = await listarFichasEnfileiradas();
  const pendentes = fila.filter((item) => item.status !== "sincronizando");

  for (const item of pendentes) {
    await atualizarStatusFicha(item.id, "sincronizando");
    try {
      await sincronizarUmaFicha(item);
      await removerFichaEnfileirada(item.id);
      resultado.sincronizadas.push(item.id);
    } catch (erro) {
      if (ehErroDeAutenticacao(erro)) {
        await atualizarStatusFicha(item.id, "falha_autenticacao", "Sessão expirada — faça login novamente.");
        resultado.precisaReautenticar = true;
        // Para a fila inteira aqui: os itens seguintes falhariam pelo mesmo motivo, e vale
        // mais parar e pedir login do que gastar tentativas previsíveis.
        break;
      }
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await atualizarStatusFicha(item.id, "falhou", mensagem);
      resultado.falharam.push(item.id);
    }
  }

  return resultado;
}
