import { describe, expect, it } from "vitest";
import {
  apurar,
  loteDeCarga,
  pesoMedioVivo,
  pesoVivoDeHerdado,
  avesNoChuveiro,
  avesNoPeriodo,
  detalheDesvio,
  exibirPesoVivo,
  GELO_PADRAO_CARCACAS,
  mascararPesoVivo,
  massaPartes,
  metaTanqueCarcacas,
  pesoMedioCarcaca,
  pesosMiudosPorCarcaca,
  totalAvesBruto,
} from "@/modules/fichas/fields/calculosSpr";

// Exemplo numérico de referência (2º monitoramento do dia): 1 lote de 10.000 aves, peso vivo
// 2,850 kg; parciais 40; totalmente condenadas 80.
const cargas = [{ quantity: "10000", avgLiveWeight: "2.850" }];

describe("SPR Carcaças", () => {
  it("peso médio da carcaça = peso vivo × 0,84", () => {
    expect(pesoMedioCarcaca(cargas)).toBeCloseTo(2.394, 6);
  });

  it("média do peso vivo é PONDERADA pelas aves de cada lote", () => {
    const dois = [
      { quantity: "1000", avgLiveWeight: "2.000" },
      { quantity: "3000", avgLiveWeight: "3.000" },
    ];
    // (1000×2 + 3000×3) / 4000 = 2,75 → × 0,84
    expect(pesoMedioCarcaca(dois)).toBeCloseTo(2.75 * 0.84, 6);
  });

  it("aves no período = bruto − (parciais + totalmente condenadas)", () => {
    expect(avesNoPeriodo(totalAvesBruto(cargas), 40, 80)).toBe(9880);
    expect(avesNoPeriodo(10, 8, 8)).toBe(0);
  });

  it("metas por tanque respondem às 3 faixas de peso (≤2,5 / ≤5,0 / >5,0)", () => {
    expect(metaTanqueCarcacas("preChiller", 2.394)).toBe(1.5);
    expect(metaTanqueCarcacas("chiller1", 2.394)).toBe(1.1);
    expect(metaTanqueCarcacas("chiller2", 2.394)).toBe(1.0);
    expect(metaTanqueCarcacas("preChiller", 2.5)).toBe(1.5);
    expect(metaTanqueCarcacas("preChiller", 2.6)).toBe(1.7);
    expect(metaTanqueCarcacas("chiller1", 5.0)).toBe(1.6);
    expect(metaTanqueCarcacas("chiller2", 5.1)).toBe(2.0);
    expect(metaTanqueCarcacas("preChiller", 5.1)).toBe(2.2);
    expect(metaTanqueCarcacas("chiller1", 5.1)).toBe(2.1);
    expect(metaTanqueCarcacas("preChiller", 0)).toBe(0);
  });

  it("gelo padrão de cada tanque", () => {
    expect(GELO_PADRAO_CARCACAS).toEqual({ preChiller: "1995", chiller1: "2394", chiller2: "1596" });
  });

  it("Pré-chiller 100,000 → 120,000 com gelo 1995 = 2,226 L/ave (conforme, meta 1,5)", () => {
    const aves = avesNoPeriodo(10000, 40, 80);
    const valor = apurar("100,000", "120,000", 1995, aves)!;
    expect(valor.toFixed(3)).toBe("2.226");
    expect(valor >= metaTanqueCarcacas("preChiller", pesoMedioCarcaca(cargas))).toBe(true);
  });

  it("aceita vírgula ou ponto nas leituras; atual vazio = apuração 0; sem aves = sem apuração", () => {
    expect(apurar("10,5", "12.5", 0, 1000)).toBeCloseTo(2, 6);
    expect(apurar("10", "", 0, 1000)).toBe(0);
    expect(apurar("10", "12", 0, 0)).toBeNull();
  });
});

describe("SPR Partes", () => {
  it("massa = parciais × peso carcaça × 0,70 = 67,032 kg", () => {
    expect(massaPartes(40, 2.394)).toBeCloseTo(67.032, 3);
  });

  it("50,00 → 50,10 com gelo 332 = 6,445 L/kg", () => {
    const valor = apurar("50,00", "50,10", 332, massaPartes(40, 2.394))!;
    expect(valor.toFixed(3)).toBe("6.445");
  });
});

describe("SPR Miúdos", () => {
  it("2,394 cai na linha 2,450 (primeira em que peso ≤ max)", () => {
    const pesos = pesosMiudosPorCarcaca(2.394);
    expect(pesos).toMatchObject({ coracao: 0.011, moela: 0.031, figado: 0.039, cabeca: 0.053, pes: 0.082 });
  });

  it("valores nas bordas da tabela", () => {
    expect(pesosMiudosPorCarcaca(1.199).coracao).toBe(0.006);
    expect(pesosMiudosPorCarcaca(1.2).coracao).toBe(0.007);
    expect(pesosMiudosPorCarcaca(2.75).pes).toBe(0.084);
    expect(pesosMiudosPorCarcaca(2.751).pes).toBe(0.097);
  });

  it("coração: 9880 × 0,011 = 108,68 kg; 10,000 → 10,100 com gelo 332 = 3,975 L/kg", () => {
    const kg = 9880 * pesosMiudosPorCarcaca(2.394).coracao;
    expect(kg).toBeCloseTo(108.68, 2);
    expect(apurar("10,000", "10,100", 332, kg)!.toFixed(3)).toBe("3.975");
  });
});

describe("Chuveiro Final", () => {
  it("aves = bruto − (totais SPR + parciais do chuveiro) = 9.890", () => {
    expect(avesNoChuveiro(10000, 80, 30)).toBe(9890);
  });

  it("200,000 → 215,000 SEM gelo = 1,517 L/carcaça", () => {
    expect(apurar("200,000", "215,000", 0, 9890)!.toFixed(3)).toBe("1.517");
  });
});

describe("Máscara do peso vivo e texto da RNC", () => {
  it("digitar 2850 → 2,850", () => {
    expect(mascararPesoVivo("2850")).toBe("2.850");
    expect(exibirPesoVivo(mascararPesoVivo("2850"))).toBe("2,850");
    expect(mascararPesoVivo("28")).toBe("0.028");
    expect(mascararPesoVivo("")).toBe("");
    expect(mascararPesoVivo("2,85a0")).toBe("2.850");
  });

  it("detalhe de desvio no formato pedido", () => {
    expect(detalheDesvio("Pré-chiller", 1.2346, 1.5, "L/c")).toBe("Pré-chiller (Apurado: 1.235L/c | Meta: 1.500L/c)");
  });
});

describe("herança de cargas do Bem-Estar Animal", () => {
  it("converte o peso médio do Bem-Estar para o formato do lote", () => {
    expect(pesoVivoDeHerdado("2,904")).toBe("2.904");
    expect(pesoVivoDeHerdado("3")).toBe("3.000");
    expect(pesoVivoDeHerdado(null)).toBe("");
    expect(pesoVivoDeHerdado("abc")).toBe("");
  });

  it("lote herdado traz aves da GTA, peso e a identificação da carga", () => {
    const lote = loteDeCarga({ carga_id: "c1", gta: "46017", qtd_aves: 3078, peso_medio_kg: "2,904" }, "l1");
    expect(lote).toEqual({ id: "l1", quantity: "3078", avgLiveWeight: "2.904", cargaId: "c1", gta: "46017" });
    expect(loteDeCarga({ carga_id: "c2", gta: "46019", qtd_aves: 100, peso_medio_kg: null }, "l2").avgLiveWeight).toBe("");
  });

  it("o lote herdado entra no cálculo ponderado como um lote digitado", () => {
    const l1 = loteDeCarga({ carga_id: "c1", gta: "1", qtd_aves: 1000, peso_medio_kg: "3,000" }, "a");
    const l2 = loteDeCarga({ carga_id: "c2", gta: "2", qtd_aves: 3000, peso_medio_kg: "2,000" }, "b");
    expect(pesoMedioVivo([l1, l2])).toBeCloseTo(2.25, 5);
  });
});

import { pesoMedioParcial } from "@/modules/fichas/fields/calculosSpr";

describe("peso médio parcial (só com os pesos informados)", () => {
  it("pondera só os lotes com peso e informa o que ficou de fora", () => {
    const r = pesoMedioParcial([
      { quantity: "5000", avgLiveWeight: "2.900" },
      { quantity: "3000", avgLiveWeight: "3.100" },
      { quantity: "2000", avgLiveWeight: "" },
    ]);
    expect(r.pesoMedioVivo).toBeCloseTo((5000 * 2.9 + 3000 * 3.1) / 8000, 9);
    expect(r.pesoMedioCarcaca).toBeCloseTo(r.pesoMedioVivo * 0.84, 9);
    expect(r).toMatchObject({ avesComPeso: 8000, avesSemPeso: 2000, lotesSemPeso: 1 });
  });

  it("peso pela metade (ainda digitando) conta como lote sem peso", () => {
    const r = pesoMedioParcial([
      { quantity: "5000", avgLiveWeight: "2.900" },
      { quantity: "1000", avgLiveWeight: "0.285" },
    ]);
    expect(r).toMatchObject({ avesComPeso: 5000, avesSemPeso: 1000, lotesSemPeso: 1, pesoMedioVivo: 2.9 });
  });

  it("nenhum lote com peso: média zero (não há como calcular)", () => {
    const r = pesoMedioParcial([{ quantity: "5000", avgLiveWeight: "" }]);
    expect(r).toMatchObject({ pesoMedioVivo: 0, pesoMedioCarcaca: 0, avesComPeso: 0, avesSemPeso: 5000 });
  });

  it("lote sem aves é ignorado", () => {
    expect(pesoMedioParcial([{ quantity: "", avgLiveWeight: "" }, { quantity: "100", avgLiveWeight: "2.500" }]).lotesSemPeso).toBe(0);
  });
});
