import { describe, expect, it } from "vitest";
import { apuracaoCarcacas, apuracaoChuveiro, apuracaoMiudos, apuracaoPartes } from "@/modules/fichas/fields/apuracaoRelatorio";
import type { ChillerCarcacasValor, ChillerPartesValor, LavagemFinalValor, MiniChillersValor } from "@/modules/fichas/fields/tiposCompostos";

const tanque = (prev: string, cur: string, ice = "0") => ({ prev, cur, ice });

describe("apuração para o relatório", () => {
  it("SPR Carcaças: 500 → 504,635 + 1995 kg de gelo, 3.900 aves, carcaça 2,52 kg = 1,700 L/carcaça (conforme, meta 1,7)", () => {
    const valor = {
      tanques: { preChiller: tanque("500", "504.635", "1995"), chiller1: tanque("", ""), chiller2: tanque("", "") },
      totalAves: 3900,
      pesoMedioCarcaca: 2.52,
    } as unknown as ChillerCarcacasValor;
    const [pre] = apuracaoCarcacas(valor);
    expect(pre!.aguaL).toBeCloseTo(6630, 6);
    expect(pre!.litrosPorCarcaca).toBeCloseTo(1.7, 6);
    expect(pre!.litrosPorKg).toBeCloseTo(6630 / (3900 * 2.52), 6);
    expect(pre!.meta).toBe(1.7);
    expect(pre!.conforme).toBe(true);
    expect(pre!.memoria).toContain("6.630 L");
  });

  it("SPR Carcaças: um pouco abaixo da leitura mínima fica abaixo da meta", () => {
    const valor = {
      tanques: { preChiller: tanque("500", "504.6", "1995"), chiller1: tanque("", ""), chiller2: tanque("", "") },
      totalAves: 3900,
      pesoMedioCarcaca: 2.52,
    } as unknown as ChillerCarcacasValor;
    expect(apuracaoCarcacas(valor)[0]!.conforme).toBe(false);
  });

  it("1º monitoramento do dia (sem leitura anterior) não apura", () => {
    const valor = {
      tanques: { preChiller: tanque("", "500"), chiller1: tanque("", ""), chiller2: tanque("", "") },
      totalAves: 0,
      pesoMedioCarcaca: 0,
    } as unknown as ChillerCarcacasValor;
    const [pre] = apuracaoCarcacas(valor);
    expect(pre!.apurada).toBe(false);
    expect(pre!.conforme).toBeNull();
  });

  it("Partes: base = parciais × peso × 0,70; meta 1,5 L/kg; também informa L/carcaça", () => {
    const valor = {
      tanques: { chiller1: tanque("100", "100.5", "332"), chiller2: tanque("", "") },
      totalCondenacoes: 100,
      pesoMedioCarcaca: 2,
    } as unknown as ChillerPartesValor;
    const [c1] = apuracaoPartes(valor);
    expect(c1!.base).toBeCloseTo(140, 6);
    expect(c1!.aguaL).toBeCloseTo(832, 6);
    expect(c1!.litrosPorKg).toBeCloseTo(832 / 140, 6);
    expect(c1!.litrosPorCarcaca).toBeCloseTo(8.32, 6);
    expect(c1!.conforme).toBe(true);
  });

  it("Miúdos: base = aves × peso unitário da Tabela DE-PARA", () => {
    const valor = {
      tanques: {
        coracao: tanque("0", "0.1", "332"),
        moela: tanque("", ""),
        figado: tanque("", ""),
        cabeca: tanque("", ""),
        pes: tanque("", ""),
      },
      totalAves: 1000,
      pesoCarcaca: 1.1, // ≤ 1,199 → coração 0,006 kg
    } as unknown as MiniChillersValor;
    const [coracao] = apuracaoMiudos(valor);
    expect(coracao!.base).toBeCloseTo(6, 6);
    expect(coracao!.litrosPorKg).toBeCloseTo(432 / 6, 6);
  });

  it("Chuveiro: sem gelo, L/carcaça decide; L/kg só com o peso da carcaça", () => {
    const valor = { chuveiro: { prev: "10", cur: "12" }, totalAves: 1000 } as unknown as LavagemFinalValor;
    const [semPeso] = apuracaoChuveiro(valor);
    expect(semPeso!.aguaL).toBeCloseTo(2000, 6);
    expect(semPeso!.litrosPorCarcaca).toBeCloseTo(2, 6);
    expect(semPeso!.litrosPorKg).toBeNull();
    expect(semPeso!.conforme).toBe(true);
    const [comPeso] = apuracaoChuveiro(valor, 2);
    expect(comPeso!.litrosPorKg).toBeCloseTo(1, 6);
  });
});
