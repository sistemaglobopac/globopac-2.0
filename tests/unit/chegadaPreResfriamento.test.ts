import { describe, expect, it } from "vitest";
import { acumuladoPorCarga, avesDoPeriodo, avesQueChegaram, tempoTransitoSegundos, type CargaDaProgramacao } from "@/modules/fichas/fields/chegadaPreResfriamento";

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
