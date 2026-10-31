import { describe, expect, it } from "vitest";
import { podeAutocorrigirNaVerificacao } from "@/modules/fichas/utils/autocorrecaoNaVerificacao";

const comDesvio = { verificado_por: null, dados_dinamicos: { campo: { conformidade: false } } };

describe("podeAutocorrigirNaVerificacao", () => {
  it("verificador e administrador registram em monitoramento não conforme, não verificado e sem RNC/autocorreção", () => {
    expect(podeAutocorrigirNaVerificacao("VERIFICADOR", comDesvio, false)).toBe(true);
    expect(podeAutocorrigirNaVerificacao("ADMIN_MASTER", comDesvio, false)).toBe(true);
  });

  it("reconhece o desvio por status 'nao-conforme' (absorção/dripping) também", () => {
    expect(podeAutocorrigirNaVerificacao("VERIFICADOR", { verificado_por: null, dados_dinamicos: { abs: { status: "nao-conforme" } } }, false)).toBe(true);
  });

  it("outros perfis não registram por esta tela", () => {
    expect(podeAutocorrigirNaVerificacao("INSPETOR_QUALIDADE", comDesvio, false)).toBe(false);
    expect(podeAutocorrigirNaVerificacao("GESTOR_SETOR", comDesvio, false)).toBe(false);
    expect(podeAutocorrigirNaVerificacao(undefined, comDesvio, false)).toBe(false);
  });

  it("não registra em monitoramento já verificado, que já tem RNC/autocorreção ou que está conforme", () => {
    expect(podeAutocorrigirNaVerificacao("VERIFICADOR", { ...comDesvio, verificado_por: "u1" }, false)).toBe(false);
    expect(podeAutocorrigirNaVerificacao("VERIFICADOR", comDesvio, true)).toBe(false);
    expect(podeAutocorrigirNaVerificacao("VERIFICADOR", { verificado_por: null, dados_dinamicos: { campo: { conformidade: true } } }, false)).toBe(false);
  });
});
