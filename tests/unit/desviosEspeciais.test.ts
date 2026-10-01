import { describe, expect, it } from "vitest";
import type { CampoTemplate } from "@/shared/schema-campos";
import { desviosEspeciais, temNaoConformidade } from "@/modules/fichas/utils/desviosEspeciais";

const campo = (chave: string, tipo: CampoTemplate["tipo"], label?: string) => ({ chave, tipo, obrigatorio: true, label }) as CampoTemplate;

describe("desviosEspeciais (pedem confirmação antes de assinar NÃO CONFORME)", () => {
  it("sem desvio: lista vazia", () => {
    const campos = [campo("carcacas", "chiller_carcacas"), campo("pragas", "ocorrencia_pragas")];
    const dados = { carcacas: { conformidade: true, detalhesRNC: null }, pragas: { houvePraga: false } };
    expect(desviosEspeciais(campos, dados)).toEqual([]);
  });

  it("vazão abaixo da meta (conformidade=false) entra com o detalhe do desvio", () => {
    const campos = [campo("carcacas", "chiller_carcacas", "Renovação da Água do SPR Carcaças")];
    const dados = { carcacas: { conformidade: false, detalhesRNC: "Vazão Insuficiente: Pré-chiller (Apurado: 1.500L/c | Meta: 1.700L/c)" } };
    const avisos = desviosEspeciais(campos, dados);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("Renovação da Água do SPR Carcaças");
    expect(avisos[0]).toContain("Pré-chiller");
  });

  it("ocorrência de pragas NÃO é desvio (não pede confirmação nem RNC)", () => {
    const campos = [campo("pragas", "ocorrencia_pragas", "Pragas")];
    expect(desviosEspeciais(campos, { pragas: { houvePraga: true } })).toEqual([]);
  });

  it("absorção não conforme continua sendo detectada", () => {
    const campos = [campo("abs", "absorcao_agua", "Absorção")];
    const avisos = desviosEspeciais(campos, { abs: { status: "nao-conforme", averagePercentage: 9.5 } });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("8%");
  });
});

describe("temNaoConformidade (alerta no Painel de Bordo após assinar)", () => {
  it("detecta vazão, absorção/dripping e pragas; ignora conforme, adendos e valores simples", () => {
    expect(temNaoConformidade({ carcacas: { conformidade: false } })).toBe(true);
    expect(temNaoConformidade({ abs: { status: "nao-conforme" } })).toBe(true);
    expect(temNaoConformidade({ pragas: { houvePraga: true } })).toBe(false);
    expect(temNaoConformidade({ carcacas: { conformidade: true }, obs: "ok", adendos: [{ conformidade: false }], n: 3 })).toBe(false);
    expect(temNaoConformidade(null)).toBe(false);
  });
});
