// Cargas (e aves) que entram no período do monitoramento de vazão do SPR, calculadas pela CHEGADA ao
// pré-resfriamento (ver chegadaPreResfriamento.ts). Funções PURAS.
import { avesDoPeriodo, avesQueChegaram, acumuladoPorCarga, type ChegadaAcumulada } from "./chegadaPreResfriamento";
import { pesoVivoDeHerdado } from "./calculosSpr";

/** Carga do dia como devolvida por `cargas_rastreabilidade_do_dia` (campos usados aqui). */
export interface CargaDoDia {
  carga_id: string;
  gta: string;
  qtd_aves: number;
  /** `YYYY-MM-DDTHH:mm` (horário de Manaus, sem fuso) ou ISO; vazio = pendura ainda não registrada. */
  pendura_inicio_em: string | null;
  /** Peso médio do monitoramento de peso por caixa; vazio = a balança ainda não passou. */
  peso_medio_kg: string | null;
}

export interface LoteDoPeriodo {
  cargaId: string;
  gta: string;
  /** Aves desta carga que entram NESTE período (pode ser só parte da carga). */
  aves: number;
  /** A carga inteira já chegou ao pré-resfriamento. */
  completa: boolean;
  /** Peso vivo médio no formato do lote ("2.904"); "" = aguardando o peso da balança. */
  pesoVivo: string;
}

export interface PeriodoCalculado {
  chegada: ChegadaAcumulada;
  lotes: LoteDoPeriodo[];
  totalAves: number;
  /** Lotes ainda sem peso da balança (etapa 2). */
  semPeso: LoteDoPeriodo[];
}

/** Início da pendura (horário de Manaus quando vem sem fuso) → ISO. */
export function penduraParaIso(texto: string): string {
  if (!texto) return "";
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(texto) ? texto : `${texto.length === 16 ? `${texto}:00` : texto}-04:00`;
}

/** Aves de cada carga que já foram usadas em monitoramentos anteriores, quando o anterior não guardou o acumulado
 * (registros antigos ou feitos à mão): as cargas já apuradas contam inteiras. */
export function baseDeCargasJaUsadas(cargas: CargaDoDia[], jaUsadas: ReadonlySet<string> | undefined): Record<string, number> {
  return Object.fromEntries(cargas.filter((c) => jaUsadas?.has(c.carga_id)).map((c) => [c.carga_id, c.qtd_aves]));
}

export function calcularPeriodo(cargas: CargaDoDia[], horaMonitoramento: Date, base: Record<string, number> | null | undefined): PeriodoCalculado {
  const chegada = avesQueChegaram(
    cargas.filter((c) => c.pendura_inicio_em).map((c) => ({ cargaId: c.carga_id, gta: c.gta, qtdAves: c.qtd_aves, penduraInicioEm: penduraParaIso(c.pendura_inicio_em!) })),
    horaMonitoramento
  );
  const periodo = avesDoPeriodo(chegada, base);
  const porId = new Map(cargas.map((c) => [c.carga_id, c]));
  const lotes: LoteDoPeriodo[] = periodo.porCarga.map((p) => ({
    cargaId: p.cargaId,
    gta: p.gta,
    aves: p.aves,
    completa: p.completa,
    pesoVivo: pesoVivoDeHerdado(porId.get(p.cargaId)?.peso_medio_kg),
  }));
  return { chegada, lotes, totalAves: periodo.total, semPeso: lotes.filter((l) => l.pesoVivo === "") };
}

/** Acumulado por carga a guardar no registro, base do próximo monitoramento. */
export function baseParaProximo(chegada: ChegadaAcumulada): Record<string, number> {
  return acumuladoPorCarga(chegada);
}
