const TIMEZONE = "America/Manaus";

export interface LocalTime {
  /** Data em pt-BR (ex.: "07/05/2026"), já no fuso de Manaus. */
  datePt: string;
  /** Hora em 24h (ex.: "17:43"), já no fuso de Manaus. */
  time: string;
  /** Data em YYYY-MM-DD (fuso de Manaus), independente do navegador — usada para comparar "dia". */
  isoLocal: string;
}

/** Projeta um timestamp para o fuso de Manaus (UTC-4). O offset que vem no texto (`Z`,
 * `+00:00` ou `-04:00`, conforme o fuso da sessão do banco — ver migração
 * ajusta_timezone_banco_manaus) É respeitado: `new Date()` já resolve o instante correto. Um
 * texto sem offset é tratado como UTC. (Antes o offset era descartado e o horário local era
 * lido como UTC, o que deslocava a hora exibida em 4h para trás.) */
export function ensureLocalTime(dateStr: string): LocalTime {
  try {
    const semOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(dateStr);
    const comoUtc = new Date(semOffset ? `${dateStr}Z` : dateStr);
    if (Number.isNaN(comoUtc.getTime())) throw new Error(`data inválida: ${dateStr}`);

    return {
      datePt: comoUtc.toLocaleDateString("pt-BR", { timeZone: TIMEZONE }),
      time: comoUtc.toLocaleTimeString("pt-BR", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }),
      isoLocal: comoUtc.toLocaleDateString("en-CA", { timeZone: TIMEZONE }),
    };
  } catch {
    const bruto = new Date(dateStr);
    return {
      datePt: bruto.toLocaleDateString("pt-BR"),
      time: bruto.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }),
      isoLocal: bruto.toLocaleDateString("en-CA"),
    };
  }
}
