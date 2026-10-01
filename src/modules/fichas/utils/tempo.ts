const TIMEZONE = "America/Manaus";

export interface LocalTime {
  /** Data em pt-BR (ex.: "07/05/2026"), já no fuso de Manaus. */
  datePt: string;
  /** Hora em 24h (ex.: "17:43"), já no fuso de Manaus. */
  time: string;
  /** Data em YYYY-MM-DD (fuso de Manaus), independente do navegador — usada para comparar "dia". */
  isoLocal: string;
}

/** O Supabase retorna timestamps como '2026-05-07T21:43:39.021162-04:00' (UTC com offset já
 * embutido no valor). Extrai só a parte YYYY-MM-DDTHH:MM:SS e força como UTC puro (ignora o
 * offset — o valor cru já representa o instante correto em UTC, sem precisar reaplicar o
 * deslocamento), depois projeta para o fuso de Manaus para exibição. */
export function ensureLocalTime(dateStr: string): LocalTime {
  try {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(dateStr);
    if (!match) throw new Error(`formato de data inesperado: ${dateStr}`);
    const comoUtc = new Date(`${match[1]}Z`);
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
