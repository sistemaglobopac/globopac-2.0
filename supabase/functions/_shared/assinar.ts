// Lógica de assinatura reutilizável — usada por assinar-documento (chamada direta do
// cliente) e por verificar-monitoramento (assina automaticamente como VERIFICADOR ao
// concluir a verificação). Único lugar que grava em assinaturas_eletronicas/
// fila_carimbo_tempo — evita duas implementações divergentes do mesmo passo crítico
// (o mesmo princípio do débito técnico "queryWithFallback() utilitária, não copy-paste").
import type { SupabaseClient } from "@supabase/supabase-js";
import { conteudoAssinavelMonitoramento, sha256Hex } from "./hash.ts";

export const TIPO_PERMITIDO_POR_PERFIL: Record<string, string[]> = {
  INSPETOR_QUALIDADE: ["INSPETOR"],
  VERIFICADOR: ["VERIFICADOR"],
  GESTOR_SETOR: ["GESTOR"],
  ADMIN_MASTER: ["INSPETOR", "VERIFICADOR", "GESTOR", "ADMIN", "LIBERACAO_DIARIA"],
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
  params: { monitoramentoId: string; tipo: string; userId: string }
): Promise<ResultadoAssinatura> {
  const { data: monitoramento, error: monitoramentoError } = await callerClient
    .from("monitoramentos")
    .select(
      "id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, conformidade, verificado_por, criado_em"
    )
    .eq("id", params.monitoramentoId)
    .single();

  if (monitoramentoError || !monitoramento) {
    return { ok: false, status: 404, mensagem: "monitoramento não encontrado" };
  }

  if (params.tipo === "INSPETOR" && monitoramento.user_id !== params.userId) {
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

  const { error: filaError } = await adminClient.from("fila_carimbo_tempo").insert({
    assinatura_id: assinatura.id,
    tipo_assinatura: "ficha",
    status: "pendente",
  });
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

  return { ok: true, id: assinatura.id, hash_documento: hashDocumento, criado_em: assinatura.criado_em };
}
