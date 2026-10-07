import { describe, expect, it } from "vitest";
import {
  avaliarControleAbsorcao,
  controleAbsorcaoVazio,
  montarValorControleAbsorcao,
  motivosBloqueioControleAbsorcao,
  rotuloBorbulhamento,
  TANQUES_ABSORCAO,
} from "@/modules/fichas/fields/controleAbsorcao";

function preenchido() {
  const v = controleAbsorcaoVazio();
  v.tempoPermanenciaMin = "15";
  v.temperaturas = { preChiller: "14,5", chiller1: "3", chiller2: "2,5" };
  v.borbulhamento = { preChiller: "moderado", chiller1: "intenso", chiller2: "moderado" };
  return v;
}

describe("controle de absorção", () => {
  it("cobre pré-chiller, chiller 1 e chiller 2, com borbulhamento moderado ou intenso", () => {
    expect(TANQUES_ABSORCAO.map((t) => t.rotulo)).toEqual(["Pré-chiller", "Chiller 01", "Chiller 02"]);
    expect(rotuloBorbulhamento("moderado")).toBe("Moderado");
    expect(rotuloBorbulhamento("intenso")).toBe("Intenso");
    expect(rotuloBorbulhamento("")).toBe("—");
  });

  it("temperaturas dentro dos limites e qualquer borbulhamento são conformes", () => {
    const v = preenchido();
    expect(montarValorControleAbsorcao(v)).toMatchObject({ conformidade: true, detalhesRNC: null });
    expect(motivosBloqueioControleAbsorcao(v)).toEqual([]);
    v.temperaturas = { preChiller: "16", chiller1: "4", chiller2: "4" };
    expect(avaliarControleAbsorcao(v).conformidade).toBe(true);
  });

  it("temperatura acima do limite reprova e entra na RNC", () => {
    const v = preenchido();
    v.temperaturas.preChiller = "17";
    v.temperaturas.chiller2 = "4,5";
    const r = avaliarControleAbsorcao(v);
    expect(r.conformidade).toBe(false);
    expect(r.motivos).toEqual(["Água do Pré-chiller: 17 ºC (limite 16 ºC)", "Água do Chiller 02: 4,5 ºC (limite 4 ºC)"]);
    expect(montarValorControleAbsorcao(v).detalhesRNC).toContain("Controle de absorção");
  });

  it("o tempo de permanência só é registrado, sem limite", () => {
    const v = preenchido();
    v.tempoPermanenciaMin = "999";
    expect(avaliarControleAbsorcao(v).conformidade).toBe(true);
  });

  it("bloqueia a assinatura sem tempo, temperatura ou borbulhamento", () => {
    expect(motivosBloqueioControleAbsorcao(undefined)).toHaveLength(1);
    expect(motivosBloqueioControleAbsorcao(controleAbsorcaoVazio())).toHaveLength(7);
    const v = preenchido();
    v.tempoPermanenciaMin = "0";
    v.temperaturas.chiller1 = "";
    v.borbulhamento.chiller2 = "";
    expect(motivosBloqueioControleAbsorcao(v)).toHaveLength(3);
  });
});
