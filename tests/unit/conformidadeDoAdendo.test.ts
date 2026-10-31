import { describe, expect, it } from "vitest";
import { aplicarNoCaminho } from "@/modules/fichas/utils/adendoCampos";
import { refazerConformidadeDosCamposCorrigidos } from "@/modules/fichas/utils/conformidadeDoAdendo";

const CAMPOS = [{ chave: "campo_1", tipo: "controle_absorcao" }];

// Registro real de 31/10/2026 10:34 (Controle de Absorção): Chiller 2 digitado como 4096 e corrigido por adendo para 2,3.
const registro = {
  campo_1: {
    observacao: "",
    detalhesRNC: "Controle de absorção — temperatura acima do limite — Água do Chiller 02: 4.096 ºC (limite 4 ºC)",
    conformidade: false,
    temperaturas: { chiller1: "1.8", chiller2: "4096", preChiller: "15.6" },
    borbulhamento: { chiller1: "intenso", chiller2: "intenso", preChiller: "intenso" },
    tanquesParados: {},
    tempoPermanenciaMin: "26",
  },
};
const correcoes = { "campo_1.temperaturas.chiller2": { old: "4096", new: "2,3" } };

describe("refazerConformidadeDosCamposCorrigidos", () => {
  it("adendo que leva a temperatura para dentro do limite deixa o campo conforme e sem texto de RNC", () => {
    const corrigido = aplicarNoCaminho(registro, "campo_1.temperaturas.chiller2", "2,3");
    const refeito = refazerConformidadeDosCamposCorrigidos(corrigido, correcoes, CAMPOS);
    expect(refeito.campo_1).toMatchObject({ conformidade: true, detalhesRNC: null, temperaturas: { chiller1: "1.8", chiller2: "2,3", preChiller: "15.6" } });
  });

  it("adendo que mantém a temperatura acima do limite segue não conforme, com o texto do valor novo", () => {
    const corrigido = aplicarNoCaminho(registro, "campo_1.temperaturas.chiller2", "5,5");
    const refeito = refazerConformidadeDosCamposCorrigidos(corrigido, { "campo_1.temperaturas.chiller2": { old: "4096", new: "5,5" } }, CAMPOS);
    expect(refeito.campo_1).toMatchObject({ conformidade: false });
    expect((refeito.campo_1 as { detalhesRNC: string }).detalhesRNC).toContain("5,5");
  });

  it("não mexe em campo que o adendo não corrigiu", () => {
    const outro = { ...registro, campo_2: { conformidade: false, detalhesRNC: "x", temperaturas: { chiller2: "1" } } };
    const refeito = refazerConformidadeDosCamposCorrigidos(outro, correcoes, [...CAMPOS, { chave: "campo_2", tipo: "controle_absorcao" }]);
    expect(refeito.campo_2).toEqual(outro.campo_2);
  });

  // Registro real de 29/10/2026 14:24 (Dripping Test): M2 do item 1 digitado como 2098 e corrigido por adendo para "2,098".
  const dripping = {
    campo_d: {
      lote: "L26301nk",
      horaInicio: "06:16",
      status: "conforme",
      validCount: 6,
      averagePercentage: -15715.518754259063,
      timeNonConformity: false,
      items: [
        { id: 0, m0: "2.228", m1: "0.006", m2: "2098", m3: "0.00", seal: "01", timeNc: false, horaRetirada: "09:04" },
        { id: 1, m0: "2.568", m1: "0.006", m2: "2.416", m3: "0.00", seal: "02", timeNc: false, horaRetirada: "09:46" },
        { id: 2, m0: "2.420", m1: "0.006", m2: "2.303", m3: "0.00", seal: "03", timeNc: false, horaRetirada: "09:32" },
        { id: 3, m0: "2.508", m1: "0.006", m2: "2.357", m3: "0.00", seal: "04", timeNc: false, horaRetirada: "09:46" },
        { id: 4, m0: "2.562", m1: "0.006", m2: "2.413", m3: "0.00", seal: "05", timeNc: false, horaRetirada: "09:46" },
        { id: 5, m0: "2.160", m1: "0.006", m2: "2.054", m3: "0.00", seal: "06", timeNc: false, horaRetirada: "08:57" },
      ],
    },
  };

  it("dripping: adendo refaz a média das linhas e lê a vírgula decimal como ponto", () => {
    const corrigido = aplicarNoCaminho(dripping, "campo_d.items.0.m2", "2,098");
    const refeito = refazerConformidadeDosCamposCorrigidos(corrigido, { "campo_d.items.0.m2": { old: "2098", new: "2,098" } }, [{ chave: "campo_d", tipo: "dripping_test" }]);
    const campo = refeito.campo_d as typeof dripping.campo_d;
    expect(campo.items[0]!.m2).toBe("2.098");
    expect(campo.validCount).toBe(6);
    expect(campo.averagePercentage).toBeGreaterThan(5.3);
    expect(campo.averagePercentage).toBeLessThan(5.45);
    expect(campo.status).toBe("conforme");
  });

  it("dripping: o valor novo acima do limite vira não conforme", () => {
    const corrigido = aplicarNoCaminho(dripping, "campo_d.items.0.m2", "1.900");
    const refeito = refazerConformidadeDosCamposCorrigidos(corrigido, { "campo_d.items.0.m2": { old: "2098", new: "1.900" } }, [{ chave: "campo_d", tipo: "dripping_test" }]);
    expect((refeito.campo_d as typeof dripping.campo_d).status).toBe("nao-conforme");
  });

  it("absorção de água: adendo refaz status, média e somas", () => {
    const absorcao = {
      campo_a: {
        fase: "FINAL",
        status: "nao-conforme",
        averagePercentage: 50,
        validCount: 2,
        sumInitial: 4,
        sumFinal: 6,
        items: [
          { id: 0, seal: "1", initial: "2", final: "3" },
          { id: 1, seal: "2", initial: "2", final: "2,05" },
        ],
      },
    };
    const corrigido = aplicarNoCaminho(absorcao, "campo_a.items.0.final", "2,1");
    const refeito = refazerConformidadeDosCamposCorrigidos(corrigido, { "campo_a.items.0.final": { old: "3", new: "2,1" } }, [{ chave: "campo_a", tipo: "absorcao_agua" }]);
    expect(refeito.campo_a).toMatchObject({ status: "conforme", validCount: 2, sumInitial: 4, sumFinal: 4.15, fase: "FINAL" });
    expect((refeito.campo_a as { averagePercentage: number }).averagePercentage).toBeCloseTo(3.75, 5);
  });

  it("campo de tipo sem regra (ex.: vazão, feita no banco) ou ausente do template fica como está", () => {
    const corrigido = aplicarNoCaminho(registro, "campo_1.temperaturas.chiller2", "2,3");
    expect(refazerConformidadeDosCamposCorrigidos(corrigido, correcoes, [{ chave: "campo_1", tipo: "chiller_carcacas" }])).toBe(corrigido);
    expect(refazerConformidadeDosCamposCorrigidos(corrigido, correcoes, [])).toBe(corrigido);
  });
});
