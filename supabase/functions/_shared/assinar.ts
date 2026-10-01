// Lógica de assinatura reutilizável — usada por assinar-documento (chamada direta do
// cliente) e por verificar-monitoramento (assina automaticamente como VERIFICADOR ao
// concluir a verificação). Único lugar que grava em assinaturas_eletronicas/
// fila_carimbo_tempo — evita duas implementações divergentes do mesmo passo crítico
// (o mesmo princípio do débito técnico "queryWithFallback() utilitária, não copy-paste").
import type { SupabaseClient } from "@supabase/supabase-js";
import { conteudoAssinavelMonitoramento, sha256Hex } from "./hash.ts";
import { carimbarAgora } from "./carimbo-imediato.ts";

export const TIPO_PERMITIDO_POR_PERFIL: Record<string, string[]> = {
  INSPETOR_QUALIDADE: ["INSPETOR", "INSPETOR_PARCIAL"],
  VERIFICADOR: ["VERIFICADOR"],
  GESTOR_SETOR: ["GESTOR"],
  ADMIN_MASTER: ["INSPETOR", "INSPETOR_PARCIAL", "VERIFICADOR", "GESTOR", "ADMIN", "LIBERACAO_DIARIA"],
};

export type ResultadoAssinatura =
  | { ok: true; id: string; hash_documento: string; criado_em: string }
  | { ok: false; status: number; mensagem: string };

/**
 * Busca o monitoramento via o cliente do CHAMADOR (RLS decide o que ele pode ver), recalcula
 * o hash no servidor e grava a assinatura + o item de fila de carimbo via o cliente admin
 * (service_role). Nunca aceita hash do chamador.
 */
export async function assinarMonitoramento(
  callerClient: SupabaseClient,
  adminClient: SupabaseClient,
  params: { monitoramentoId: string; tipo: string; userId: string; aguardarCarimbo?: boolean }
): Promise<ResultadoAssinatura> {
  const { data: monitoramento, error: monitoramentoError } = await callerClient
    .from("monitoramentos")
    .select(
      "id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, conformidade, verificado_por, criado_em, status_ficha"
    )
    .eq("id", params.monitoramentoId)
    .single();

  if (monitoramentoError || !monitoramento) {
    return { ok: false, status: 404, mensagem: "monitoramento não encontrado" };
  }

  // Absorção em duas fases: EM_ANDAMENTO só aceita a assinatura PARCIAL (prova da pesagem inicial);
  // a assinatura INSPETOR completa só existe depois de FINALIZADO; nenhuma outra assinatura
  // (verificador, gestor, liberação) vale para um registro em andamento.
  const emAndamento = monitoramento.status_ficha === "EM_ANDAMENTO";
  if (params.tipo === "INSPETOR_PARCIAL" && !emAndamento) {
    return { ok: false, status: 409, mensagem: "a assinatura parcial só vale para registro em andamento" };
  }
  if (params.tipo !== "INSPETOR_PARCIAL" && emAndamento) {
    return { ok: false, status: 409, mensagem: "registro em andamento só pode receber a assinatura INSPETOR_PARCIAL" };
  }

  if ((params.tipo === "INSPETOR" || params.tipo === "INSPETOR_PARCIAL") && monitoramento.user_id !== params.userId) {
    return { ok: false, status: 403, mensagem: "só o criador do registro pode assiná-lo como INSPETOR" };
  }
  if (params.tipo === "VERIFICADOR" && monitoramento.verificado_por !== params.userId) {
    return {
      ok: false,
      status: 403,
      mensagem: "só quem verificou o registro pode assiná-lo como VERIFICADOR",
    };
  }

  const hashDocumento = await sha256Hex(conteudoAssinavelMonitoramento(monitoramento));

  const { data: assinatura, error: assinaturaError } = await adminClient
    .from("assinaturas_eletronicas")
    .insert({
      monitoramento_id: params.monitoramentoId,
      user_id: params.userId,
      tipo: params.tipo,
      hash_documento: hashDocumento,
      algoritmo: "SHA-256",
    })
    .select("id, criado_em")
    .single();

  if (assinaturaError || !assinatura) {
    return { ok: false, status: 500, mensagem: "falha ao gravar assinatura" };
  }

  const { data: itemFila, error: filaError } = await adminClient
    .from("fila_carimbo_tempo")
    .insert({ assinatura_id: assinatura.id, tipo_assinatura: "ficha", status: "pendente" })
    .select("id")
    .single();
  if (filaError) {
    console.log(
      JSON.stringify({
        nivel: "error",
        evento: "enfileirar_carimbo_falhou",
        assinaturaId: assinatura.id,
        erro: filaError.message,
      })
    );
  }

  if (!filaError && itemFila) {
    await carimbarAgora(adminClient, itemFila.id as string, { aguardar: params.aguardarCarimbo ?? true });
  }

  return { ok: true, id: assinatura.id, hash_documento: hashDocumento, criado_em: assinatura.criado_em };
}
