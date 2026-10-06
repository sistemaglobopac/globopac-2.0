import { describe, expect, it } from "vitest";
import { acumuladoPorCarga, avesDoPeriodo, avesQueChegaram, intervalosDePausa, tempoAndandoMs, tempoTransitoSegundos, type CargaDaProgramacao } from "@/modules/fichas/fields/chegadaPreResfriamento";

// Dia de exemplo (Manaus = UTC-4): pendura começa às 06:00 locais = 10:00Z.
const z = (hhmm: string, ss = "00") => new Date(`2026-10-06T${hhmm}:${ss}Z`);
const MIN = 60_000;
const inicio = z("10:00").getTime();
// 5.000 aves a 6.960 aves/h => 43,103 min por carga
const dur = (5000 / 6960) * 60 * MIN;
const carga = (n: number, offsetMs: number): CargaDaProgramacao => ({
  cargaId: `c${n}`,
  gta: `GTA${n}`,
  qtdAves: 5000,
  penduraInicioEm: new Date(inicio + offsetMs).toISOString(),
});
const tres = [carga(1, 0), carga(2, dur), carga(3, 2 * dur)];

describe("tempo de trânsito pendura → pré-resfriamento", () => {
  it("reproduz os pontos medidos", () => {
    expect(Math.round(tempoTransitoSegundos(6960))).toBe(13 * 60 + 4);
    expect(Math.round(tempoTransitoSegundos(5820))).toBe(14 * 60 + 32);
  });

  it("velocidade intermediária fica entre os dois pontos (≈13:46 a 6.390 aves/h)", () => {
    const t = tempoTransitoSegundos(6390);
    expect(t).toBeGreaterThan(13 * 60 + 4);
    expect(t).toBeLessThan(14 * 60 + 32);
    expect(Math.abs(t - (13 * 60 + 46))).toBeLessThan(4);
  });

  it("velocidade menor, trânsito maior", () => {
    expect(tempoTransitoSegundos(5000)).toBeGreaterThan(tempoTransitoSegundos(6000));
  });
});

describe("aves que já chegaram ao pré-resfriamento", () => {
  it("exemplo do usuário: 3 cargas de 5.000, 6.960 aves/h, monitoramento às 08:10 (06:00 local = 10:00Z)", () => {
    // monitoramento às 08:10 locais = 12:10Z. A carga 3 ainda não tem a seguinte: usa a velocidade deduzida (6.960).
    const r = avesQueChegaram(tres, z("12:10"));
    expect(r.origemVelocidade).toBe("observada");
    expect(r.velocidadeAvesH).toBe(6960);
    expect(r.transitoSegundos).toBe(13 * 60 + 4);
    expect(r.porCarga.map((c) => [c.gta, c.completa])).toEqual([
      ["GTA1", true],
      ["GTA2", true],
      ["GTA3", false],
    ]);
    // carga 3: 30 min 45 s a 6.960/h ≈ 3.567 aves → total ≈ 13.567
    expect(r.porCarga[2]!.aves).toBeGreaterThan(3560);
    expect(r.porCarga[2]!.aves).toBeLessThan(3575);
    expect(r.total).toBeGreaterThan(13560);
    expect(r.total).toBeLessThan(13575);
  });

  it("antes de o trânsito terminar nada chegou (a carga 1 começou há menos de 13 min)", () => {
    expect(avesQueChegaram(tres, z("10:12")).total).toBe(0);
    expect(avesQueChegaram(tres, z("10:14")).total).toBeGreaterThan(0);
  });

  it("carga com a seguinte já iniciada conta a parte proporcional ao tempo decorrido", () => {
    // corte a meio da carga 1: metade das aves da carga 1 (o corte cai a ~21,5 min do início)
    const corteMeio = inicio + dur / 2;
    const em = new Date(corteMeio + 784_000); // trânsito de 13:04 a 6.960/h
    const r = avesQueChegaram(tres, em);
    expect(r.porCarga).toHaveLength(1);
    expect(r.porCarga[0]!.aves).toBeGreaterThan(2490);
    expect(r.porCarga[0]!.aves).toBeLessThan(2510);
    expect(r.porCarga[0]!.completa).toBe(false);
  });

  it("sem nenhuma carga concluída usa a velocidade nominal e avisa a origem", () => {
    const r = avesQueChegaram([tres[0]!], z("10:30"));
    expect(r.origemVelocidade).toBe("nominal");
    expect(r.velocidadeAvesH).toBe(6960);
  });

  it("linha mais lenta: o trânsito aumenta e chega menos", () => {
    // 5.000 aves em 51,5 min = 5.820 aves/h
    const durLenta = (5000 / 5820) * 60 * MIN;
    const lentas = [carga(1, 0), carga(2, durLenta), carga(3, 2 * durLenta)];
    const r = avesQueChegaram(lentas, z("12:10"));
    expect(r.velocidadeAvesH).toBe(5820);
    expect(r.transitoSegundos).toBe(14 * 60 + 32);
    expect(r.total).toBeLessThan(avesQueChegaram(tres, z("12:10")).total);
  });

  it("carga sem pendura iniciada não entra", () => {
    const semPendura = [...tres, { cargaId: "c4", gta: "GTA4", qtdAves: 5000, penduraInicioEm: "" }];
    expect(avesQueChegaram(semPendura, z("12:10")).porCarga.map((c) => c.gta)).toEqual(["GTA1", "GTA2", "GTA3"]);
  });
});

describe("aves do período (acumulado − acumulado do monitoramento anterior)", () => {
  it("o 2º monitoramento só recebe o que chegou depois do 1º, por carga", () => {
    const m1 = avesQueChegaram(tres, z("11:00")); // 07:00 locais
    const m2 = avesQueChegaram(tres, z("12:10")); // 08:10 locais
    const periodo = avesDoPeriodo(m2, acumuladoPorCarga(m1));
    expect(periodo.total).toBe(m2.total - m1.total);
    // a carga 1 já tinha entrado inteira (ou quase) no 1º: sobra pouco ou nada dela
    expect(periodo.porCarga.find((c) => c.gta === "GTA1")?.aves ?? 0).toBeLessThan(m2.porCarga[0]!.aves);
    expect(periodo.porCarga.some((c) => c.gta === "GTA3")).toBe(true);
  });

  it("sem monitoramento anterior, vale o acumulado todo", () => {
    const m = avesQueChegaram(tres, z("12:10"));
    expect(avesDoPeriodo(m, null).total).toBe(m.total);
  });
});

// ---------------- Pausas da linha ----------------
// A pendura para; as aves já penduradas seguem até o pré-resfriamento no trânsito normal (corte em tempo de RELÓGIO). A pausa
// só tira tempo de pendura da duração de cada carga (velocidade real) e do avanço da carga em andamento.
const min = (m: number) => new Date(inicio + m * MIN).toISOString();
// c1 em 0, c2 em 43,1 min e c3 em 96,2 min (a carga 2 levou 43,1 min andando + 10 min parada: 06:55–07:05)
const durAnda = (5000 / 6960) * 60; // 43,1 min
const comPausa = (n: number, m: number): CargaDaProgramacao => ({ cargaId: `c${n}`, gta: `GTA${n}`, qtdAves: 5000, penduraInicioEm: min(m) });
const cargasComPausa = [comPausa(1, 0), comPausa(2, durAnda), comPausa(3, 2 * durAnda + 10)];
const pausaNaCarga2 = [{ inicio: min(55), fim: min(65) }];

describe("pausas da linha de abate", () => {
  it("tempo andando = intervalo menos as pausas; pausas sobrepostas não contam em dobro; sem fim vale até a hora do monitoramento", () => {
    const pausas = intervalosDePausa([{ inicio: min(10), fim: min(20) }, { inicio: min(15), fim: min(25) }, { inicio: min(60), fim: null }], inicio + 70 * MIN);
    expect(pausas).toEqual([[inicio + 10 * MIN, inicio + 25 * MIN], [inicio + 60 * MIN, inicio + 70 * MIN]]);
    expect(tempoAndandoMs(inicio, inicio + 100 * MIN, pausas)).toBe(75 * MIN);
    expect(tempoAndandoMs(inicio + 12 * MIN, inicio + 20 * MIN, pausas)).toBe(0);
  });

  it("a pausa dentro da carga não derruba a velocidade deduzida (sem informá-la, a velocidade sai menor e o trânsito maior)", () => {
    const em = new Date(inicio + 140 * MIN);
    const informada = avesQueChegaram(cargasComPausa, em, undefined, pausaNaCarga2);
    const naoInformada = avesQueChegaram(cargasComPausa, em);
    expect(informada.velocidadeAvesH).toBe(6960);
    expect(informada.transitoSegundos).toBe(13 * 60 + 4);
    expect(naoInformada.velocidadeAvesH).toBeLessThan(5700);
    expect(naoInformada.transitoSegundos).toBeGreaterThan(informada.transitoSegundos);
  });

  it("a carga em andamento só avança com a linha andando: pausa de 10 min tira ~1.160 aves da parte que chegou", () => {
    const semPausaNaTres = avesQueChegaram(cargasComPausa, new Date(inicio + 140 * MIN), undefined, pausaNaCarga2);
    const pausaNaTres = avesQueChegaram(cargasComPausa, new Date(inicio + 140 * MIN), undefined, [...pausaNaCarga2, { inicio: min(100), fim: min(110) }]);
    const aves3 = (r: typeof semPausaNaTres) => r.porCarga.find((c) => c.gta === "GTA3")!.aves;
    expect(aves3(semPausaNaTres) - aves3(pausaNaTres)).toBeGreaterThan(1100);
    expect(aves3(semPausaNaTres) - aves3(pausaNaTres)).toBeLessThan(1220);
    // as cargas 1 e 2 já tinham chegado inteiras: a pausa na carga 3 não as altera
    expect(pausaNaTres.porCarga.filter((c) => c.gta !== "GTA3").every((c) => c.completa)).toBe(true);
  });

  it("o corte é sempre em tempo de relógio (hora − trânsito): as aves já penduradas seguem até o pré-resfriamento durante a pausa", () => {
    const em = new Date(inicio + 140 * MIN);
    for (const paradas of [undefined, pausaNaCarga2, [...pausaNaCarga2, { inicio: min(125), fim: min(135) }]]) {
      const r = avesQueChegaram(cargasComPausa, em, undefined, paradas);
      expect(Math.abs(new Date(r.corteEm).getTime() - (em.getTime() - r.transitoSegundos * 1000))).toBeLessThan(1000); // trânsito arredondado a segundos
    }
    // uma pausa que acabou de começar (depois do corte) não tira nenhuma ave que já estava a caminho
    const antes = avesQueChegaram(cargasComPausa, em, undefined, pausaNaCarga2);
    const depois = avesQueChegaram(cargasComPausa, em, undefined, [...pausaNaCarga2, { inicio: min(130), fim: min(138) }]);
    expect(depois.total).toBe(antes.total);
  });

  it("pausa sem fim (linha ainda parada) vale até a hora do monitoramento", () => {
    const em = new Date(inicio + 140 * MIN);
    const aberta = avesQueChegaram(cargasComPausa, em, undefined, [{ inicio: min(120), fim: null }]);
    const fechada = avesQueChegaram(cargasComPausa, em, undefined, [{ inicio: min(120), fim: min(140) }]);
    expect(aberta.total).toBe(fechada.total);
  });
});

