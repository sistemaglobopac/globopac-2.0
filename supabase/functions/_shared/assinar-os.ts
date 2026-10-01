// Lógica de assinatura e transição de estado reutilizável para o ciclo de OS de manutenção
// (seção 7.4) — usada por avancar-etapa-os e liberar-relatorio-os-sif. Único lugar que grava
// em assinaturas_os_eletronicas/fila_carimbo_tempo para OS, mesmo princípio de
// _shared/assinar.ts (uma implementação, nunca duas divergentes).
import type { SupabaseClient } from "@supabase/supabase-js";
import { conteudoAssinavelOs, sha256Hex } from "./hash.ts";

/** Tabela de transições da máquina de estados da OS (ADR 0012) — nunca if/else disperso.
 * `colunaResponsavel` é preenchida com o user_id de quem assina; `deStatus: null` marca a
 * assinatura de abertura, que não faz UPDATE (a linha já nasce no status correto). */
export const TRANSICOES_OS: Record<
  string,
  { deStatus: string | null; paraStatus: string; colunaResponsavel: string }
> = {
  ABERTURA: { deStatus: null, paraStatus: "ABERTURA", colunaResponsavel: "aberto_por" },
  AUTORIZACAO: { deStatus: "ABERTURA", paraStatus: "AUTORIZACAO", colunaResponsavel: "autorizado_por" },
  PROGRAMACAO: { deStatus: "AUTORIZACAO", paraStatus: "PROGRAMACAO", colunaResponsavel: "programado_por" },
  EXECUCAO: { deStatus: "PROGRAMACAO", paraStatus: "EXECUCAO", colunaResponsavel: "executado_por" },
  VALIDACAO: { deStatus: "EXECUCAO", paraStatus: "CONCLUIDA", colunaResponsavel: "validado_por" },
};

interface OsCompleta {
  id: string;
  descricao: string;
  setor: string;
  ativo_referencia: string | null;
  status: string;
  aberto_por: string;
  autorizado_por: string | null;
  programado_por: string | null;
  executado_por: string | null;
  validado_por: string | null;
  concluido_em: string | null;
  criado_em: string;
}

export type ResultadoAssinaturaOs =
  | { ok: true; id: string; hash_documento: string; criado_em: string; os: OsCompleta }
  | { ok: false; status: number; mensagem: string };

const SELECT_OS =
  "id, descricao, setor, ativo_referencia, status, aberto_por, autorizado_por, programado_por, executado_por, validado_por, concluido_em, criado_em";

/**
 * Executa (se aplicável) a transição de status da OS via o cliente do CHAMADOR (RLS decide
 * se é permitido) e grava a assinatura correspondente + item de fila de carimbo via o
 * cliente admin (service_role) — mesmo padrão de _shared/assinar.ts.
 */
export async function assinarEtapaOs(
  callerClient: SupabaseClient,
  adminClient: SupabaseClient,
  params: { osId: string; tipo: keyof typeof TRANSICOES_OS; userId: string }
): Promise<ResultadoAssinaturaOs> {
  const transicao = TRANSICOES_OS[params.tipo];
  if (!transicao) {
    return { ok: false, status: 400, mensagem: `tipo de etapa desconhecido: ${params.tipo}` };
  }

  let osAtualizada: OsCompleta | null;

  if (transicao.deStatus === null) {
    // Abertura: só documenta a criação já feita pelo INSERT do cliente — exige que o próprio
    // criador seja quem assina, e que a OS ainda esteja no status inicial.
    const { data, error } = await callerClient
      .from("manutencao_os")
      .select(SELECT_OS)
      .eq("id", params.osId)
      .eq("status", transicao.paraStatus)
      .eq("aberto_por", params.userId)
      .single();
    if (error || !data) {
      return { ok: false, status: 404, mensagem: "OS não encontrada, ou você não é quem a abriu" };
    }
    osAtualizada = data as unknown as OsCompleta;
  } else {
    const payload: Record<string, string> = { status: transicao.paraStatus, [transicao.colunaResponsavel]: params.userId };
    if (transicao.paraStatus === "CONCLUIDA") payload.concluido_em = new Date().toISOString();

    // Guarda otimista: só afeta a linha se ainda estiver exatamente no status de origem
    // esperado — impede avançar duas vezes em corrida ou pular uma etapa (mesma técnica de
    // verificar-monitoramento: .is("verificado_por", null)).
    const { data, error } = await callerClient
      .from("manutencao_os")
      .update(payload)
      .eq("id", params.osId)
      .eq("status", transicao.deStatus)
      .select(SELECT_OS)
      .single();
    if (error || !data) {
      return {
        ok: false,
        status: 409,
        mensagem: `OS não encontrada, sem permissão, ou não está mais em ${transicao.deStatus}`,
      };
    }
    osAtualizada = data as unknown as OsCompleta;
  }

  const resultado = await gravarAssinaturaOs(adminClient, {
    osId: params.osId,
    userId: params.userId,
    tipo: params.tipo,
    os: osAtualizada,
  });
  if (!resultado.ok) return resultado;

  // Histórico append-only: sem policy de INSERT para authenticated (deny by default), grava
  // sempre via adminClient — mesmo princípio de assinaturas_* (só a Edge Function escreve).
  await adminClient.from("manutencao_os_historico").insert({
    os_id: params.osId,
    alteracao: { tipo: params.tipo, de_status: transicao.deStatus, para_status: transicao.paraStatus },
    user_id: params.userId,
  });

  return { ...resultado, os: osAtualizada };
}

/** Assinatura LIBERACAO_DIARIA de uma OS já concluída — chamada por liberar-relatorio-os-sif
 * DEPOIS de a OS já ter sido atualizada (liberado_sif=true), para que o hash cubra o estado
 * final. Não passa pela tabela de transições: não muda `status`, só documenta a liberação. */
export async function assinarLiberacaoOs(
  adminClient: SupabaseClient,
  params: { osId: string; userId: string; os: OsCompleta }
): Promise<ResultadoAssinaturaOs> {
  const resultado = await gravarAssinaturaOs(adminClient, {
    osId: params.osId,
    userId: params.userId,
    tipo: "LIBERACAO_DIARIA",
    os: params.os,
  });
  if (!resultado.ok) return resultado;
  return { ...resultado, os: params.os };
}

async function gravarAssinaturaOs(
  adminClient: SupabaseClient,
  params: { osId: string; userId: string; tipo: string; os: OsCompleta }
): Promise<ResultadoAssinaturaOs> {
  const hashDocumento = await sha256Hex(conteudoAssinavelOs(params.os));

  const { data: assinatura, error: assinaturaError } = await adminClient
    .from("assinaturas_os_eletronicas")
    .insert({
      os_id: params.osId,
      user_id: params.userId,
      tipo: params.tipo,
      hash_documento: hashDocumento,
      algoritmo: "SHA-256",
    })
    .select("id, criado_em")
    .single();

  if (assinaturaError || !assinatura) {
    return { ok: false, status: 500, mensagem: "falha ao gravar assinatura da etapa" };
  }

  const { error: filaError } = await adminClient.from("fila_carimbo_tempo").insert({
    assinatura_id: assinatura.id,
    tipo_assinatura: "os",
    status: "pendente",
  });
  if (filaError) {
    console.log(
      JSON.stringify({
        nivel: "error",
        evento: "enfileirar_carimbo_os_falhou",
        assinaturaId: assinatura.id,
        erro: filaError.message,
      })
    );
  }

  return { ok: true, id: assinatura.id, hash_documento: hashDocumento, criado_em: assinatura.criado_em, os: params.os };
}
