import { describe, expect, it } from "vitest";
import { AUTOCORRECAO_MIN_CARACTERES, descricaoAutocorrecaoValida, type AutocorrecaoImediata } from "@/modules/autocorrecao/api";
import { situacaoDoRegistro } from "@/modules/fichas/components/relatorio/RelatorioMonitoramento";
import type { MonitoramentoRelatorio } from "@/modules/fichas/api";

const registro = (parcial: Partial<MonitoramentoRelatorio>): MonitoramentoRelatorio =>
  ({
    id: "m1",
    conformidade: null,
    dados_dinamicos: { campo: { conformidade: false } },
    ...parcial,
  }) as MonitoramentoRelatorio;

const auto: AutocorrecaoImediata = {
  id: "a1",
  monitoramento_id: "m1",
  user_id: "u1",
  descricao: "Equipamento ajustado e produto reinspecionado",
  executada_em: "2026-10-02T14:00:00Z",
  criado_em: "2026-10-02T14:00:00Z",
};

describe("autocorreção imediata — situação do monitoramento", () => {
  it("monitoramento com desvio e sem autocorreção continua 'desvio pendente'", () => {
    expect(situacaoDoRegistro(registro({}))).toBe("desvio-pendente");
  });

  it("a autocorreção imediata restabelece a conformidade (antes da decisão do verificador)", () => {
    expect(situacaoDoRegistro(registro({}), undefined, auto)).toBe("autocorrigido");
  });

  it("reconhece desvio por status 'nao-conforme' (absorção/dripping) também", () => {
    expect(situacaoDoRegistro(registro({ dados_dinamicos: { abs: { status: "nao-conforme" } } }), undefined, auto)).toBe("autocorrigido");
  });

  it("a decisão do verificador prevalece: aprovado = conforme; reprovado = não conforme", () => {
    expect(situacaoDoRegistro(registro({ conformidade: true }), undefined, auto)).toBe("conforme");
    expect(situacaoDoRegistro(registro({ conformidade: false }), undefined, auto)).toBe("nao-conforme");
  });

  it("sem desvio no preenchimento, autocorreção não muda nada", () => {
    expect(situacaoDoRegistro(registro({ dados_dinamicos: { campo: { conformidade: true } } }), undefined, auto)).toBe("aguardando");
  });
});

describe("autocorreção imediata — descrição obrigatória", () => {
  it(`exige pelo menos ${AUTOCORRECAO_MIN_CARACTERES} caracteres (ignorando espaços nas pontas)`, () => {
    expect(descricaoAutocorrecaoValida("")).toBe(false);
    expect(descricaoAutocorrecaoValida("   curta   ")).toBe(false);
    expect(descricaoAutocorrecaoValida("1234567890")).toBe(true);
    expect(descricaoAutocorrecaoValida("  Ajustei o equipamento.  ")).toBe(true);
  });
});
