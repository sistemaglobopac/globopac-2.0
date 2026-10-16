// Situação de conformidade de um monitoramento para painéis e exportações. Vem da coluna
// `monitoramentos.situacao_conformidade` (mantida por trigger; ver a migração
// 20260930000005): TRATADO = havia não conformidade e a(s) RNC(s) vinculada(s) foram fechadas pelo
// Verificador como procedentes. Se a coluna ainda não existir/estiver nula, cai para `conformidade`.
export type SituacaoConformidade = "CONFORME" | "NAO_CONFORME" | "TRATADO";

export function situacaoDe(m: { situacao_conformidade?: SituacaoConformidade | null; conformidade: boolean | null }): SituacaoConformidade | null {
  if (m.situacao_conformidade) return m.situacao_conformidade;
  if (m.conformidade === true) return "CONFORME";
  if (m.conformidade === false) return "NAO_CONFORME";
  return null;
}

/** Não conformidade que já recebeu RNC ou adendo: não é mais "não conforme" (vermelho), é tratada (âmbar). */
export const ROTULO_NC_TRATADA = "NÃO CONFORMIDADE TRATADA";

export const ROTULO_SITUACAO: Record<SituacaoConformidade, string> = {
  CONFORME: "Conforme",
  NAO_CONFORME: "Não conforme",
  TRATADO: "Não conformidade tratada",
};

/** Texto para telas e CSV; sem decisão ainda = "Aguardando verificação". */
export function rotuloSituacao(m: { situacao_conformidade?: SituacaoConformidade | null; conformidade: boolean | null }): string {
  const situacao = situacaoDe(m);
  return situacao ? ROTULO_SITUACAO[situacao] : "Aguardando verificação";
}
