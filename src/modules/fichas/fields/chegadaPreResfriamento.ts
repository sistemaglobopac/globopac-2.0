// Aves que já CHEGARAM ao pré-resfriamento numa hora qualquer — funções PURAS (sem React).
//
// A ave leva um tempo (trânsito) entre a pendura e o pré-resfriamento, e esse tempo depende da
// velocidade da linha. A velocidade da linha NÃO é informada em lugar nenhum do sistema: ela é
// DEDUZIDA da programação do dia — aves da carga ÷ tempo entre o início da pendura dela e o da carga
// seguinte (já inclui as paradas). Para a carga em andamento vale a velocidade da última carga
// concluída; sem nenhuma, a velocidade nominal da linha.
//
// Em cada monitoramento: corte = hora do monitoramento − trânsito(velocidade). As aves penduradas
// até o corte são as que já chegaram: cargas cuja seguinte já começou contam inteiras; a carga em
// andamento conta a parte proporcional. Aves do período = acumulado agora − acumulado do
// monitoramento anterior (por carga, para a média ponderada do peso).
// Testadas em tests/unit/chegadaPreResfriamento.test.ts.

/** Pontos medidos de trânsito (pendura → pré-resfriamento). Ordem livre; mais pontos = curva melhor.
 * 6.960 aves/h → 13 min 04 s; 5.820 aves/h → 14 min 32 s. */
export const CALIBRACAO_TRANSITO: { avesPorHora: number; segundos: number }[] = [
  { avesPorHora: 6960, segundos: 13 * 60 + 4 },
  { avesPorHora: 5820, segundos: 14 * 60 + 32 },
];

/** Velocidade usada só quando ainda não há nenhuma carga concluída para deduzir a real. */
export const VELOCIDADE_NOMINAL_AVES_H = 6960;

/** Tempo de trânsito (segundos) numa velocidade (aves/h): interpolação linear em 1/velocidade entre os
 * pontos medidos (o trânsito cresce com o inverso da velocidade); fora da faixa, prolonga o último trecho. */
export function tempoTransitoSegundos(avesPorHora: number, calibracao = CALIBRACAO_TRANSITO): number {
  const pontos = calibracao.map((p) => ({ x: 1 / p.avesPorHora, y: p.segundos })).sort((a, b) => a.x - b.x);
  if (pontos.length === 1) return pontos[0]!.y;
  const x = 1 / Math.max(avesPorHora, 1);
  let i = 0;
  while (i < pontos.length - 2 && x > pontos[i + 1]!.x) i++;
  const [p0, p1] = [pontos[i]!, pontos[i + 1]!];
  return p0.y + ((x - p0.x) / (p1.x - p0.x)) * (p1.y - p0.y);
}

export interface CargaDaProgramacao {
  cargaId: string;
  gta: string;
  /** Aves da GTA. */
  qtdAves: number;
  /** Início da pendura (ISO). Cargas sem pendura iniciada ainda não entram. */
  penduraInicioEm: string;
}

export interface AvesDaCarga {
  cargaId: string;
  gta: string;
  /** Aves desta carga que já chegaram ao pré-resfriamento (inteira ou parte). */
  aves: number;
  completa: boolean;
}

export interface ChegadaAcumulada {
  /** Hora de corte (ISO): o que foi pendurado até aqui já chegou ao pré-resfriamento. */
  corteEm: string;
  velocidadeAvesH: number;
  /** "observada": deduzida da programação; "nominal": nenhuma carga concluída ainda. */
  origemVelocidade: "observada" | "nominal";
  transitoSegundos: number;
  total: number;
  porCarga: AvesDaCarga[];
}

const HORA_MS = 3_600_000;

/** Velocidade (aves/h) deduzida de cada carga cuja seguinte já começou. */
function velocidadesObservadas(ordenadas: { qtdAves: number; inicio: number }[]): (number | null)[] {
  return ordenadas.map((c, i) => {
    const prox = ordenadas[i + 1];
    if (!prox || prox.inicio <= c.inicio) return null;
    return c.qtdAves / ((prox.inicio - c.inicio) / HORA_MS);
  });
}

/** Aves que já chegaram ao pré-resfriamento na hora `em`. */
export function avesQueChegaram(cargas: CargaDaProgramacao[], em: Date, calibracao = CALIBRACAO_TRANSITO): ChegadaAcumulada {
  const ordenadas = cargas
    .filter((c) => c.penduraInicioEm && c.qtdAves > 0)
    .map((c) => ({ ...c, inicio: new Date(c.penduraInicioEm).getTime() }))
    .filter((c) => c.inicio <= em.getTime())
    .sort((a, b) => a.inicio - b.inicio);

  const obs = velocidadesObservadas(ordenadas);
  const ultimaObservada = [...obs].reverse().find((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  const velocidade = ultimaObservada ?? VELOCIDADE_NOMINAL_AVES_H;
  const transitoSegundos = tempoTransitoSegundos(velocidade, calibracao);
  const corte = em.getTime() - transitoSegundos * 1000;

  const porCarga: AvesDaCarga[] = [];
  ordenadas.forEach((c, i) => {
    if (c.inicio >= corte) return; // ainda não chegou nada desta carga
    const prox = ordenadas[i + 1];
    let aves: number;
    if (prox && corte >= prox.inicio) aves = c.qtdAves;
    else if (prox) aves = Math.min(c.qtdAves, (c.qtdAves * (corte - c.inicio)) / (prox.inicio - c.inicio));
    else aves = Math.min(c.qtdAves, (velocidade * (corte - c.inicio)) / HORA_MS);
    aves = Math.round(aves);
    porCarga.push({ cargaId: c.cargaId, gta: c.gta, aves, completa: aves >= c.qtdAves });
  });

  return {
    corteEm: new Date(corte).toISOString(),
    velocidadeAvesH: Math.round(velocidade),
    origemVelocidade: ultimaObservada ? "observada" : "nominal",
    transitoSegundos: Math.round(transitoSegundos),
    total: porCarga.reduce((s, c) => s + c.aves, 0),
    porCarga,
  };
}

/** Aves do período = o que chegou agora menos o que já tinha chegado no monitoramento anterior, por carga
 * (cargas que já entraram inteiras antes saem). `anterior` = acumulado por carga do monitoramento anterior. */
export function avesDoPeriodo(
  agora: ChegadaAcumulada,
  anterior: Record<string, number> | null | undefined
): { total: number; porCarga: AvesDaCarga[] } {
  const porCarga = agora.porCarga
    .map((c) => ({ ...c, aves: Math.max(0, c.aves - (anterior?.[c.cargaId] ?? 0)) }))
    .filter((c) => c.aves > 0);
  return { total: porCarga.reduce((s, c) => s + c.aves, 0), porCarga };
}

/** Acumulado por carga, no formato guardado no registro para o próximo monitoramento usar como base. */
export function acumuladoPorCarga(c: ChegadaAcumulada): Record<string, number> {
  return Object.fromEntries(c.porCarga.map((x) => [x.cargaId, x.aves]));
}
