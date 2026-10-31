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

  it("campo de tipo sem regra (ex.: vazão, feita no banco) ou ausente do template fica como está", () => {
    const corrigido = aplicarNoCaminho(registro, "campo_1.temperaturas.chiller2", "2,3");
    expect(refazerConformidadeDosCamposCorrigidos(corrigido, correcoes, [{ chave: "campo_1", tipo: "chiller_carcacas" }])).toBe(corrigido);
    expect(refazerConformidadeDosCamposCorrigidos(corrigido, correcoes, [])).toBe(corrigido);
  });
});
