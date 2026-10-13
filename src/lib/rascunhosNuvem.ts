// Cópia dos rascunhos na nuvem (tabela rascunhos_monitoramento). O aparelho continua sendo a fonte e funciona sem rede; quando há
// rede, o rascunho é enviado e qualquer outro aparelho em que o inspetor entrar o traz para a lista local — a assinatura segue o
// fluxo de sempre. Tudo aqui é "melhor esforço": falha de rede nunca atrapalha o inspetor, a próxima sincronização repete.
import { supabase } from "@/lib/supabase";
import {
  apagarRascunhoLocal,
  colocarRascunhoLocal,
  listarRascunhos,
  registrarOuvintesRascunho,
  type MotivoRemocaoRascunho,
  type Rascunho,
} from "@/lib/rascunhos";
import { planejarSincronizacao, type RascunhoNuvemMin } from "@/lib/rascunhosSync";

const TABELA = "rascunhos_monitoramento";
const CHAVE_PENDENTES = "globopac-rascunhos-nuvem-pendentes";

interface MarcaPendente {
  id: string;
  motivo: MotivoRemocaoRascunho;
}

function lerMarcasPendentes(): MarcaPendente[] {
  try {
    const bruto = localStorage.getItem(CHAVE_PENDENTES);
    return bruto ? (JSON.parse(bruto) as MarcaPendente[]) : [];
  } catch {
    return [];
  }
}

function gravarMarcasPendentes(marcas: MarcaPendente[]): void {
  try {
    localStorage.setItem(CHAVE_PENDENTES, JSON.stringify(marcas));
  } catch {
    /* armazenamento indisponível: a marca se perde, o pior caso é o rascunho voltar a aparecer */
  }
}

function paraLinha(r: Rascunho) {
  return {
    id: r.id,
    user_id: r.userId,
    setor: r.setor,
    ficha_template_id: r.fichaTemplateId,
    hora_monitoramento: r.horaMonitoramento,
    conteudo: { ...r, status: "rascunho", ultimoErro: undefined },
    status: "pendente",
    salvo_em: r.salvoEm,
  };
}

async function enviarParaNuvem(r: Rascunho): Promise<void> {
  const { error } = await supabase.from(TABELA).upsert(paraLinha(r));
  if (error) throw error;
}

async function marcarNaNuvem(id: string, motivo: MotivoRemocaoRascunho): Promise<void> {
  const { error } = await supabase.from(TABELA).update({ status: motivo }).eq("id", id);
  if (error) throw error;
}

/** Marca o rascunho como assinado/descartado na nuvem; se não der agora, guarda a marca para a próxima sincronização. */
async function avisarRemocao(id: string, motivo: MotivoRemocaoRascunho): Promise<void> {
  try {
    await marcarNaNuvem(id, motivo);
  } catch {
    const marcas = lerMarcasPendentes().filter((m) => m.id !== id);
    gravarMarcasPendentes([...marcas, { id, motivo }]);
  }
}

registrarOuvintesRascunho({
  aoSalvar: (r) => {
    void enviarParaNuvem(r).catch(() => undefined); // sem rede: a próxima sincronização envia
  },
  aoRemover: (id, motivo) => {
    void avisarRemocao(id, motivo);
  },
});

interface LinhaNuvem {
  id: string;
  status: RascunhoNuvemMin["status"];
  salvo_em: string;
  conteudo: Rascunho;
}

/** Sincroniza os rascunhos do usuário. Devolve se algo mudou NESTE aparelho (para atualizar a lista na tela). */
export async function sincronizarRascunhosNuvem(userId: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

  // 1) marcas de remoção que não chegaram à nuvem
  const marcas = lerMarcasPendentes();
  if (marcas.length > 0) {
    const restantes: MarcaPendente[] = [];
    for (const m of marcas) {
      try {
        await marcarNaNuvem(m.id, m.motivo);
      } catch {
        restantes.push(m);
      }
    }
    gravarMarcasPendentes(restantes);
  }

  // 2) o que há aqui e o que há na nuvem
  const locais = await listarRascunhos(userId);
  const { data: linhas, error } = await supabase
    .from(TABELA)
    .select("id, status, salvo_em, conteudo")
    .eq("user_id", userId)
    .order("hora_monitoramento", { ascending: false })
    .limit(500)
    .overrideTypes<LinhaNuvem[], { merge: false }>();
  if (error) throw error;
  const nuvem = linhas ?? [];

  // 3) o que já virou monitoramento (assinado em algum aparelho) não é mais rascunho
  const idsParaChecar = [...new Set([...locais.map((l) => l.id), ...nuvem.filter((c) => c.status === "pendente").map((c) => c.id)])];
  let comMonitoramento = new Set<string>();
  if (idsParaChecar.length > 0) {
    const { data: gravados, error: erroGravados } = await supabase.from("monitoramentos").select("id").in("id", idsParaChecar).overrideTypes<{ id: string }[], { merge: false }>();
    if (erroGravados) throw erroGravados;
    comMonitoramento = new Set((gravados ?? []).map((g) => g.id));
  }

  const plano = planejarSincronizacao(
    locais.map((l) => ({ id: l.id, salvoEm: l.salvoEm, status: l.status })),
    nuvem.map((c) => ({ id: c.id, status: c.status, salvoEm: c.salvo_em })),
    comMonitoramento
  );

  let mudou = false;
  const porId = new Map(locais.map((l) => [l.id, l]));
  for (const id of plano.enviar) {
    const r = porId.get(id);
    if (r) await enviarParaNuvem(r).catch(() => undefined);
  }
  for (const id of plano.marcarAssinadoNaNuvem) await marcarNaNuvem(id, "assinado").catch(() => undefined);
  for (const id of plano.apagarLocal) {
    await apagarRascunhoLocal(id);
    mudou = true;
  }
  const nuvemPorId = new Map(nuvem.map((c) => [c.id, c]));
  for (const id of plano.baixar) {
    const c = nuvemPorId.get(id);
    if (!c) continue;
    // O conteúdo traz o rascunho como o outro aparelho o guardou; o usuário é o dono (a RLS só devolve os dele).
    await colocarRascunhoLocal({ ...c.conteudo, userId, salvoEm: c.salvo_em, status: "rascunho" });
    mudou = true;
  }
  return mudou;
}
