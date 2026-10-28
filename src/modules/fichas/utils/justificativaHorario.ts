// Justificativa de monitoramento NÃO REALIZADO em um horário (Absorção de Água pelas Carcaças, PAC 11) — funções PURAS (sem React).
// O inspetor registra por que o monitoramento de um horário (inclusive de horas que já passaram no turno) não foi feito; a
// justificativa aparece no relatório da ficha e, quando é do horário em atraso, dispensa o alarme daquele período. Testadas em
// tests/unit/justificativaHorario.test.ts.
import { diaManaus, turnoDoDia } from "@/modules/bordo/api";

/** As fichas do PAC 11 (absorção: dados do processo, qualidade dos miúdos, dripping test e absorção de água) aceitam a justificativa. */
export const PAC_JUSTIFICAVEL = "PAC 11";

export const MOTIVO_OUTRO = "Outro";

/** Motivos oferecidos ao inspetor. "Outro" exige descrição. */
export const MOTIVOS_NAO_REALIZADO = [
  "Processo parado",
  "Sem abate / sem produção",
  "Equipamento em manutenção",
  "Falta de energia ou de água",
  "Higienização / limpeza",
  "Troca de turno ou intervalo",
  "Intervenção do SIF",
  MOTIVO_OUTRO,
] as const;

/** Linha de `monitoramentos_nao_realizados` (registro de auditoria: só se insere). */
export interface JustificativaHorario {
  ficha_codigo: string;
  setor: string | null;
  /** Horário em que o monitoramento deveria ter sido feito (ISO). */
  horario_devido: string;
  motivo: string;
  detalhes: string | null;
  registrado_por: string;
  registrado_em: string;
}

/** A ficha é do PAC 11? `pac_correspondente` pode trazer mais de um PAC separado por vírgula. */
export function fichaJustificavel(ficha: { pac_correspondente?: string | null }): boolean {
  return (ficha.pac_correspondente ?? "")
    .split(",")
    .map((p) => p.trim())
    .includes(PAC_JUSTIFICAVEL);
}

/** Valor de um campo datetime-local (AAAA-MM-DDTHH:mm), tomado como horário de Manaus (UTC-4, sem horário de verão). */
export function instanteDoHorarioLocal(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}:00-04:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Instante no formato do campo datetime-local, em horário de Manaus. */
export function horarioLocalManaus(instante: Date): string {
  const hora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Manaus", hour: "2-digit", minute: "2-digit", hour12: false }).format(instante);
  return `${diaManaus(instante)}T${hora === "24:00" ? "00:00" : hora}`;
}

/** Tolerância para o relógio do aparelho adiantado em relação ao servidor. */
const FOLGA_FUTURO_MS = 60_000;

/** Mensagem do que falta para registrar a justificativa; null quando está tudo certo. */
export function erroDaJustificativa(entrada: { horario: string; motivo: string; detalhes: string }, agora: Date): string | null {
  const horario = instanteDoHorarioLocal(entrada.horario);
  if (!horario) return "Informe o horário em que o monitoramento deveria ter sido feito.";
  if (horario.getTime() > agora.getTime() + FOLGA_FUTURO_MS) return "O horário não pode estar no futuro: justifique só monitoramentos que já deveriam ter sido feitos.";
  const motivo = entrada.motivo.trim();
  if (!motivo) return "Escolha por que o monitoramento não foi realizado.";
  if (motivo === MOTIVO_OUTRO && entrada.detalhes.trim().length < 5) return 'Descreva o motivo (mínimo de 5 caracteres) quando escolher "Outro".';
  return null;
}

const minuto = (iso: string) => Math.floor(new Date(iso).getTime() / 60_000);

/** Uma justificativa por ficha, setor e horário: se foi registrada de novo, vale a mais recente (a anterior segue gravada no banco). */
export function justificativasVigentes(lista: readonly JustificativaHorario[]): JustificativaHorario[] {
  const porChave = new Map<string, JustificativaHorario>();
  for (const j of lista) {
    const chave = `${j.ficha_codigo}|${j.setor ?? ""}|${minuto(j.horario_devido)}`;
    const atual = porChave.get(chave);
    if (!atual || new Date(j.registrado_em) > new Date(atual.registrado_em)) porChave.set(chave, j);
  }
  return [...porChave.values()].sort((a, b) => new Date(a.horario_devido).getTime() - new Date(b.horario_devido).getTime());
}

/** Justificativas no formato que o cálculo de atraso já entende ("conta como se tivesse sido feito"): a próxima cobrança vem um
 * intervalo depois do horário justificado. Só pesa se o horário for posterior ao último monitoramento. */
export function comoReferenciaDeAtraso(lista: readonly JustificativaHorario[]): { ficha_codigo: string; referencia_em: string; motivo: string; registrado_em: string }[] {
  return lista.map((j) => ({ ficha_codigo: j.ficha_codigo, referencia_em: j.horario_devido, motivo: j.motivo, registrado_em: j.registrado_em }));
}

/** Dia do turno: o 2º turno começa à tarde e vai até as 4h, então a madrugada pertence ao dia anterior. */
export function diaDoTurno(instante: Date): string {
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Manaus", hour: "2-digit", hour12: false }).format(instante)) % 24;
  return hora < 4 ? diaManaus(new Date(instante.getTime() - 24 * 60 * 60 * 1000)) : diaManaus(instante);
}

/** Justificativas que entram no relatório de uma ficha: mesmo código (qualquer versão), setor dos registros, e o dia e o turno dos
 * monitoramentos do relatório. Em ordem de horário; repetida para o mesmo horário vale a mais recente. */
export function justificativasDoRelatorio(
  lista: readonly JustificativaHorario[],
  contexto: { codigos: readonly string[]; setores: readonly string[]; instantesDosRegistros: readonly Date[] }
): JustificativaHorario[] {
  if (contexto.instantesDosRegistros.length === 0) return [];
  const dias = new Set(contexto.instantesDosRegistros.map(diaDoTurno));
  const turnos = new Set(contexto.instantesDosRegistros.map(turnoDoDia));
  return justificativasVigentes(
    lista.filter((j) => {
      if (!contexto.codigos.includes(j.ficha_codigo)) return false;
      if (j.setor && contexto.setores.length > 0 && !contexto.setores.includes(j.setor)) return false;
      const quando = new Date(j.horario_devido);
      return dias.has(diaDoTurno(quando)) && turnos.has(turnoDoDia(quando));
    })
  );
}
