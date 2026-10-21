/** A tela de nova ficha recusa uma hora igual ou anterior à do monitoramento anterior da mesma
 * ficha, no nível do MINUTO (ver validarHoraMonitoramento: "inclusive no mesmo minuto, que também
 * é recusado"). O botão "Agora" preenche a hora atual sem segundos, então duas fichas criadas pelos
 * testes dentro do mesmo minuto fazem a segunda mostrar um erro de hora em vez de pedir a senha.
 *
 * Quanto falta (em ms) para o minuto seguinte ao do monitoramento mais recente, ou 0 se já dá para
 * criar outra ficha. `margemMs` cobre diferenças pequenas de relógio entre o teste e o app. */
export function msAteMinutoLivre(horaMaisRecenteIso: string | null | undefined, agoraMs: number, margemMs = 1_500): number {
  if (!horaMaisRecenteIso) return 0;
  const t = new Date(horaMaisRecenteIso).getTime();
  if (!Number.isFinite(t)) return 0;
  const minutoDoUltimo = Math.floor(t / 60_000);
  if (Math.floor(agoraMs / 60_000) > minutoDoUltimo) return 0;
  return (minutoDoUltimo + 1) * 60_000 - agoraMs + margemMs;
}

/** A mais recente entre as horas informadas (ISO), ignorando valores vazios ou inválidos. */
export function horaMaisRecente(horas: (string | null | undefined)[]): string | null {
  let melhor: number | null = null;
  for (const h of horas) {
    const t = h ? new Date(h).getTime() : NaN;
    if (Number.isFinite(t) && (melhor === null || t > melhor)) melhor = t;
  }
  return melhor === null ? null : new Date(melhor).toISOString();
}
