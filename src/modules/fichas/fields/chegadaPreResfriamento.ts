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
  /** Início da pendura (ISO). Vazio = a pendura ainda não foi registrada: a carga só entra quando o andamento do processo
   * (as cargas anteriores já penduradas por inteiro) chega até ela, na ordem da programação. */
  penduraInicioEm: string;
}

export interface AvesDaCarga {
  cargaId: string;
  gta: string;
  /** Aves desta carga que já chegaram ao pré-resfriamento (inteira ou parte). */
  aves: number;
  completa: boolean;
  /** A pendura desta carga não foi registrada: as aves vêm do andamento do processo (a carga anterior já foi toda pendurada). */
  penduraNaoRegistrada?: boolean;
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

export interface ParadaDaLinha {
  /** ISO. */
  inicio: string;
  /** ISO; nulo = ainda parada na hora do monitoramento. */
  fim: string | null;
}

type Intervalo = [number, number];

/** Pausas como intervalos [início, fim] em ms, mescladas (pausas sobrepostas não contam em dobro). Pausa sem fim vale
 * até `ate`. */
export function intervalosDePausa(paradas: ParadaDaLinha[] | undefined, ate: number): Intervalo[] {
  const lista: Intervalo[] = (paradas ?? [])
    .map((p): Intervalo => [new Date(p.inicio).getTime(), p.fim ? new Date(p.fim).getTime() : ate])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  const mescladas: Intervalo[] = [];
  for (const [a, b] of lista) {
    const ultimo = mescladas[mescladas.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else mescladas.push([a, b]);
  }
  return mescladas;
}

/** Tempo (ms) com a linha ANDANDO entre `a` e `b`: o intervalo menos as pausas que caem nele. */
export function tempoAndandoMs(a: number, b: number, pausas: Intervalo[]): number {
  if (b <= a) return 0;
  const parado = pausas.reduce((soma, [i, f]) => soma + Math.max(0, Math.min(b, f) - Math.max(a, i)), 0);
  return Math.max(0, b - a - parado);
}

/** Velocidade (aves/h) deduzida de cada carga cuja seguinte já começou, sobre o tempo com a linha andando. */
function velocidadesObservadas(ordenadas: { qtdAves: number; inicio: number }[], pausas: Intervalo[]): (number | null)[] {
  return ordenadas.map((c, i) => {
    const prox = ordenadas[i + 1];
    if (!prox || prox.inicio <= c.inicio) return null;
    const andando = tempoAndandoMs(c.inicio, prox.inicio, pausas);
    return andando > 0 ? c.qtdAves / (andando / HORA_MS) : null;
  });
}

/** Aves que já chegaram ao pré-resfriamento na hora `em`. */
export function avesQueChegaram(
  cargas: CargaDaProgramacao[],
  em: Date,
  calibracao = CALIBRACAO_TRANSITO,
  /** Pausas da linha: a pendura para, mas as aves já penduradas seguem até o pré-resfriamento no trânsito normal (o
   * corte continua em tempo de relógio); a pausa só tira tempo de pendura da duração das cargas. */
  paradas?: ParadaDaLinha[]
): ChegadaAcumulada {
  const pausas = intervalosDePausa(paradas, em.getTime());
  const ordenadas = cargas
    .filter((c) => c.penduraInicioEm && c.qtdAves > 0)
    .map((c) => ({ ...c, inicio: new Date(c.penduraInicioEm).getTime() }))
    .filter((c) => c.inicio <= em.getTime())
    .sort((a, b) => a.inicio - b.inicio);

  // Cargas ainda sem pendura registrada, na ordem da programação (a de `cargas`): consomem as aves que a linha já pendurou
  // além da última carga registrada.
  const semPendura = cargas.filter((c) => !c.penduraInicioEm && c.qtdAves > 0);

  const obs = velocidadesObservadas(ordenadas, pausas);
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
    else if (prox) {
      const duracao = tempoAndandoMs(c.inicio, prox.inicio, pausas);
      aves = duracao > 0 ? Math.min(c.qtdAves, (c.qtdAves * tempoAndandoMs(c.inicio, corte, pausas)) / duracao) : c.qtdAves;
    } else {
      const penduradas = (velocidade * tempoAndandoMs(c.inicio, corte, pausas)) / HORA_MS;
      aves = Math.min(c.qtdAves, penduradas);
      // Última carga registrada já toda pendurada: o que a linha pendurou além dela é da(s) carga(s) seguinte(s) da programação.
      let sobra = penduradas - c.qtdAves;
      for (const s of semPendura) {
        if (sobra <= 0) break;
        const doS = Math.round(Math.min(s.qtdAves, sobra));
        porCarga.push({ cargaId: s.cargaId, gta: s.gta, aves: doS, completa: doS >= s.qtdAves, penduraNaoRegistrada: true });
        sobra -= s.qtdAves;
      }
    }
    aves = Math.round(aves);
    // (a carga registrada entra antes das estimadas, que foram acrescentadas acima: reordena ao final)
    porCarga.push({ cargaId: c.cargaId, gta: c.gta, aves, completa: aves >= c.qtdAves });
  });
  // Estimadas depois das registradas, cada grupo na sua ordem.
  porCarga.sort((a, b) => Number(!!a.penduraNaoRegistrada) - Number(!!b.penduraNaoRegistrada));

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
