// "Hora do monitoramento": a hora em que a medição foi feita, informada MANUALMENTE pelo inspetor
// (abrir a ficha só para olhar não registra hora nenhuma). É diferente de criado_em (hora do servidor
// ao gravar/assinar, inalterável) e da hora da assinatura. Vale para o intervalo mínimo entre
// monitoramentos, o atraso, a herança da leitura anterior e o relatório. Fica em dados_dinamicos
// (dentro do hash assinado) e é espelhada na coluna monitoramentos.hora_monitoramento.

/** Chave reservada em dados_dinamicos. */
export const CHAVE_HORA_MONITORAMENTO = "hora_monitoramento";
/** Prazo máximo, a partir da hora do monitoramento, para assinar (a internet pode faltar). Espelha o banco. */
export const PRAZO_ASSINATURA_HORAS = 168; // 7 dias
/** Folga para relógio de aparelho adiantado. Espelha o banco. */
export const TOLERANCIA_FUTURO_MIN = 5;

const FUSO_MANAUS = "-04:00"; // America/Manaus é UTC-4 fixo

/** Hora efetiva de um registro: a informada pelo inspetor; registros antigos caem na hora de criação. */
export function horaEfetiva(m: { hora_monitoramento?: string | null; criado_em: string }): string {
  return m.hora_monitoramento ?? m.criado_em;
}

/** Instante em que o monitoramento foi REALIZADO, para decidir dia, turno e ordem (painel de verificação, relatório
 * consolidado, arquivo do SIF): a hora informada pelo inspetor (coluna ou, na falta, o valor assinado em
 * dados_dinamicos); registros antigos caem em criado_em. Uma continuação de ontem, gravada hoje, fica no consolidado de
 * ontem. A hora de gravação (criado_em) segue inalterada — ela entra na verificação de integridade do documento. */
export function instanteDoRegistro(m: { criado_em: string; hora_monitoramento?: string | null; dados_dinamicos?: Record<string, unknown> | null }): string {
  const noDado = m.dados_dinamicos?.[CHAVE_HORA_MONITORAMENTO];
  return m.hora_monitoramento ?? (typeof noDado === "string" && noDado ? noDado : null) ?? m.criado_em;
}

/** "AAAA-MM-DD" + "HH:MM" (digitados no fuso de Manaus) → ISO UTC. null se inválido. */
export function isoDeManaus(data: string, hora: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) return null;
  const d = new Date(`${data}T${hora}:00${FUSO_MANAUS}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function dataManaus(referencia: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit" }).format(referencia);
}

export function horaManaus(referencia: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", minute: "2-digit", hour12: false }).format(referencia);
}

export interface EntradaValidacaoHora {
  /** ISO da hora informada. */
  hora: string | null;
  agora: Date;
  /** Hora efetiva do monitoramento anterior desta ficha+setor (registro ou rascunho), se houver. */
  anteriorEm?: string | null;
  /** tempo_entre_apontamentos_min da ficha. */
  intervaloMin?: number | null;
}

/** Mensagem de erro para a hora informada, ou null se válida. */
export function validarHoraMonitoramento({ hora, agora, anteriorEm, intervaloMin }: EntradaValidacaoHora): string | null {
  if (!hora) return "Informe a data e a hora em que o monitoramento foi realizado.";
  const t = new Date(hora).getTime();
  if (t > agora.getTime() + TOLERANCIA_FUTURO_MIN * 60_000) return "A hora do monitoramento não pode ser futura.";
  if (t < agora.getTime() - PRAZO_ASSINATURA_HORAS * 3_600_000) {
    return `A hora do monitoramento passou de 7 dias: não é mais possível registrá-lo.`;
  }
  if (anteriorEm) {
    const ant = new Date(anteriorEm).getTime();
    if (t <= ant) return "A hora do monitoramento deve ser posterior à do monitoramento anterior desta ficha.";
    if (intervaloMin && intervaloMin > 0 && t < ant + intervaloMin * 60_000) {
      return `O intervalo mínimo entre monitoramentos desta ficha é de ${intervaloMin} min (anterior às ${horaManaus(new Date(anteriorEm))}).`;
    }
  }
  return null;
}
