import { describe, expect, it } from "vitest";
import {
  avaliarRecebimentoEmbalagens,
  estatisticasAmostras,
  lerMedidaEmbalagem,
  montarValorRecebimentoEmbalagens,
  motivosBloqueioRecebimentoEmbalagens,
  QTD_AMOSTRAS_EMBALAGEM,
  recebimentoEmbalagensVazio,
} from "@/modules/fichas/fields/recebimentoEmbalagens";
import type { RecebimentoEmbalagensValor } from "@/modules/fichas/fields/tiposCompostos";
import { caminhoDaNaoConformidade } from "@/modules/fichas/utils/alvoNaoConformidade";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import { desviosEspeciais } from "@/modules/fichas/utils/desviosEspeciais";
import type { CampoTemplate } from "@/shared/schema-campos";

function completo(parcial: Partial<RecebimentoEmbalagensValor> = {}): RecebimentoEmbalagensValor {
  return {
    ...recebimentoEmbalagensVazio(),
    fornecedor: "Plasbel",
    notaFiscal: "12345",
    lote: "L2026-10",
    contaminacaoFisica: false,
    contaminacaoQuimica: false,
    condensacao: false,
    higieneGeral: "satisfatoria",
    temRotulo: false,
    quantidadeRecebida: "120",
    codigoEmbalagem: "BOB-001",
    relatorioEnsaio: true,
    situacaoLote: "aprovado",
    amostras: Array.from({ length: QTD_AMOSTRAS_EMBALAGEM }, (_, i) => ({ largura: `${300 + i},5`, micragem: "40" })),
    ...parcial,
  };
}

describe("recebimento de embalagens secundárias (caixas)", () => {
  const caixas = (parcial: Partial<RecebimentoEmbalagensValor> = {}): RecebimentoEmbalagensValor => ({
    ...completo(),
    aplicacaoResina: true,
    absorcaoAgua: false,
    amostras: Array.from({ length: 32 }, (_, i) => ({ largura: `${300 + i}`, comprimento: "400", altura: "250,5", micragem: "5", peso: "820" })),
    ...parcial,
  });

  it("começa com 32 amostras de cinco medidas e sem rótulo", () => {
    const v = recebimentoEmbalagensVazio("secundarias");
    expect(v.amostras).toHaveLength(32);
    expect(v.amostras[0]).toEqual({ largura: "", comprimento: "", altura: "", micragem: "", peso: "" });
  });

  it("assina com tudo preenchido, sem perguntar do rótulo", () => {
    const v = montarValorRecebimentoEmbalagens(caixas({ temRotulo: null }));
    expect(v.conformidade).toBe(true);
    expect(motivosBloqueioRecebimentoEmbalagens(v, "secundarias")).toEqual([]);
  });

  it("exige o teste de resina, a absorção e as cinco medidas das 32 amostras", () => {
    const m = motivosBloqueioRecebimentoEmbalagens(caixas({ aplicacaoResina: null, absorcaoAgua: null }), "secundarias").join(" ");
    expect(m).toContain("aplicação de resina");
    expect(m).toContain("absorção de água");
    const amostras = caixas().amostras.map((a, i) => (i === 31 ? { ...a, peso: "" } : i === 0 ? { ...a, altura: "x" } : a));
    expect(motivosBloqueioRecebimentoEmbalagens(caixas({ amostras }), "secundarias").join(" ")).toContain(
      "largura, comprimento, altura, micragem e peso das amostras 1, 32"
    );
  });

  it("sem resina ou com absorção de água é não conforme; resina e sem absorção é conforme", () => {
    expect(montarValorRecebimentoEmbalagens(caixas({ aplicacaoResina: false })).detalhesRNC).toContain("resina");
    expect(montarValorRecebimentoEmbalagens(caixas({ absorcaoAgua: true })).detalhesRNC).toContain("Absorção de água");
    expect(montarValorRecebimentoEmbalagens(caixas()).conformidade).toBe(true);
  });

  it("bobina e sacos nunca são reprovados pelas perguntas das caixas", () => {
    expect(montarValorRecebimentoEmbalagens(completo()).conformidade).toBe(true);
  });

  it("calcula peso e altura e integra com bloqueios, desvios e alvo pelo tipo recebimento_secundarias", () => {
    expect(estatisticasAmostras(caixas()).peso).toEqual({ n: 32, min: 820, max: 820, media: 820 });
    const campos = [{ chave: "cx", tipo: "recebimento_secundarias", obrigatorio: true, label: "Caixas" }] as CampoTemplate[];
    const nc = montarValorRecebimentoEmbalagens(caixas({ absorcaoAgua: true }));
    expect(motivosDeBloqueioSpr(campos, { cx: nc })).toEqual([]);
    expect(motivosDeBloqueioSpr(campos, { cx: montarValorRecebimentoEmbalagens(completo()) }).join(" ")).toContain("resina");
    expect(desviosEspeciais(campos, { cx: nc })[0]).toContain("Absorção de água");
    expect(caminhoDaNaoConformidade("recebimento_secundarias", nc)).toBe("absorcaoAgua");
  });
});

describe("recebimento de embalagens (sacos)", () => {
  const sacos = (parcial: Partial<RecebimentoEmbalagensValor> = {}) => ({
    ...completo(),
    amostras: Array.from({ length: 30 }, (_, i) => ({ largura: `${200 + i}`, comprimento: "350,5", micragem: "50" })),
    ...parcial,
  });

  it("começa com 30 amostras com comprimento", () => {
    const v = recebimentoEmbalagensVazio("sacos");
    expect(v.amostras).toHaveLength(30);
    expect(v.amostras[0]).toEqual({ largura: "", comprimento: "", micragem: "" });
    expect(recebimentoEmbalagensVazio().amostras[0]).toEqual({ largura: "", micragem: "" });
  });

  it("exige as 30 amostras com largura, comprimento e micragem", () => {
    expect(motivosBloqueioRecebimentoEmbalagens(sacos(), "sacos")).toEqual([]);
    const faltando = sacos().amostras.map((a, i) => (i === 4 ? { ...a, comprimento: "" } : i === 29 ? { ...a, micragem: "0" } : a));
    expect(motivosBloqueioRecebimentoEmbalagens(sacos({ amostras: faltando }), "sacos").join(" ")).toContain("largura, comprimento e micragem das amostras 5, 30");
    // As 10 amostras da bobina não bastam para os sacos.
    expect(motivosBloqueioRecebimentoEmbalagens(completo(), "sacos").join(" ")).toContain("amostras 1, 2, 3");
  });

  it("calcula a média do comprimento e usa as mesmas regras de não conformidade", () => {
    expect(estatisticasAmostras(sacos()).comprimento).toEqual({ n: 30, min: 350.5, max: 350.5, media: 350.5 });
    expect(montarValorRecebimentoEmbalagens(sacos({ situacaoLote: "reprovado" })).conformidade).toBe(false);
    expect(montarValorRecebimentoEmbalagens(sacos()).conformidade).toBe(true);
  });

  it("integra com bloqueios, desvios e alvo do adendo pelo tipo recebimento_sacos", () => {
    const campos = [{ chave: "sc", tipo: "recebimento_sacos", obrigatorio: true, label: "Sacos" }] as CampoTemplate[];
    const nc = montarValorRecebimentoEmbalagens(sacos({ condensacao: true }));
    expect(motivosDeBloqueioSpr(campos, { sc: nc })).toEqual([]);
    expect(motivosDeBloqueioSpr(campos, { sc: montarValorRecebimentoEmbalagens(completo()) }).join(" ")).toContain("amostras 1, 2");
    expect(desviosEspeciais(campos, { sc: nc })[0]).toContain("Condensação");
    expect(caminhoDaNaoConformidade("recebimento_sacos", nc)).toBe("condensacao");
  });
});

describe("recebimento de embalagens (bobina)", () => {
  it("tudo em ordem: conforme e pode assinar", () => {
    const v = montarValorRecebimentoEmbalagens(completo());
    expect(v.conformidade).toBe(true);
    expect(v.detalhesRNC).toBeNull();
    expect(motivosBloqueioRecebimentoEmbalagens(v)).toEqual([]);
  });

  it("ficha em branco ou ausente bloqueia, listando o que falta", () => {
    expect(motivosBloqueioRecebimentoEmbalagens(null)).toHaveLength(1);
    const m = motivosBloqueioRecebimentoEmbalagens(recebimentoEmbalagensVazio());
    expect(m.join(" ")).toContain("fornecedor");
    expect(m.join(" ")).toContain("nota fiscal");
    expect(m.join(" ")).toContain("número do lote");
    expect(m.join(" ")).toContain("aprovado, reprovado ou utilizado");
    expect(m.join(" ")).toContain("amostras 1, 2, 3, 4, 5, 6, 7, 8, 9, 10");
  });

  it.each([
    ["contaminação física", { contaminacaoFisica: true }, "Contaminação física"],
    ["contaminação química", { contaminacaoQuimica: true }, "Contaminação química"],
    ["condensação", { condensacao: true }, "Condensação"],
    ["higiene insatisfatória", { higieneGeral: "insatisfatoria" as const }, "higiene"],
    ["sem relatório de ensaio", { relatorioEnsaio: false }, "relatório de ensaio"],
    ["lote reprovado", { situacaoLote: "reprovado" as const }, "reprovado"],
  ])("%s torna o registro não conforme", (_nome, parcial, trecho) => {
    const v = montarValorRecebimentoEmbalagens(completo(parcial));
    expect(v.conformidade).toBe(false);
    expect(v.detalhesRNC).toContain(trecho);
  });

  it("lote utilizado ou aprovado não é desvio", () => {
    expect(avaliarRecebimentoEmbalagens(completo({ situacaoLote: "utilizado" })).conformidade).toBe(true);
    expect(avaliarRecebimentoEmbalagens(completo({ situacaoLote: "aprovado" })).conformidade).toBe(true);
  });

  it("respostas do rótulo só valem quando há rótulo", () => {
    const comRotulo = completo({ temRotulo: true });
    expect(motivosBloqueioRecebimentoEmbalagens(comRotulo)).toHaveLength(3);
    const ok = completo({ temRotulo: true, leiauteConforme: true, descricaoProduto: true, qualidadeImpressao: "satisfatoria" });
    expect(montarValorRecebimentoEmbalagens(ok).conformidade).toBe(true);
    const ruim = montarValorRecebimentoEmbalagens({ ...ok, leiauteConforme: false, descricaoProduto: false, qualidadeImpressao: "insatisfatoria" });
    expect(ruim.conformidade).toBe(false);
    expect(ruim.detalhesRNC).toContain("Leiaute");
    expect(ruim.detalhesRNC).toContain("descrição");
    expect(ruim.detalhesRNC).toContain("impressão");
  });

  it("sem rótulo, descarta respostas do rótulo deixadas de uma marcação anterior", () => {
    const v = montarValorRecebimentoEmbalagens(completo({ temRotulo: false, leiauteConforme: false, descricaoProduto: false, qualidadeImpressao: "insatisfatoria" }));
    expect(v.conformidade).toBe(true);
    expect(v.leiauteConforme).toBeNull();
    expect(v.qualidadeImpressao).toBe("");
  });

  it("exige as 10 amostras com largura e micragem", () => {
    const amostras = completo().amostras.map((a, i) => (i === 3 ? { ...a, micragem: "" } : i === 7 ? { largura: "abc", micragem: "40" } : a));
    expect(motivosBloqueioRecebimentoEmbalagens(completo({ amostras })).join(" ")).toContain("amostras 4, 8");
  });

  it("lê medidas com vírgula e recusa zero, negativo e texto", () => {
    expect(lerMedidaEmbalagem("12,5")).toBe(12.5);
    expect(lerMedidaEmbalagem("0")).toBeNull();
    expect(lerMedidaEmbalagem("-3")).toBeNull();
    expect(lerMedidaEmbalagem("x")).toBeNull();
    expect(lerMedidaEmbalagem("")).toBeNull();
  });

  it("calcula menor, maior e média só das amostras medidas", () => {
    const e = estatisticasAmostras({ amostras: [{ largura: "300", micragem: "40" }, { largura: "310,0", micragem: "" }, { largura: "", micragem: "" }] });
    expect(e.largura).toEqual({ n: 2, min: 300, max: 310, media: 305 });
    expect(e.micragem.n).toBe(1);
  });

  it("integra com bloqueios, desvios e alvo do adendo", () => {
    const campos = [{ chave: "emb", tipo: "recebimento_embalagens", obrigatorio: true, label: "Recebimento" }] as CampoTemplate[];
    const nc = montarValorRecebimentoEmbalagens(completo({ contaminacaoQuimica: true }));
    expect(motivosDeBloqueioSpr(campos, { emb: nc })).toEqual([]);
    expect(motivosDeBloqueioSpr(campos, { emb: null }).length).toBeGreaterThan(0);
    expect(desviosEspeciais(campos, { emb: nc })[0]).toContain("Contaminação química");
    expect(desviosEspeciais(campos, { emb: montarValorRecebimentoEmbalagens(completo()) })).toEqual([]);
    expect(caminhoDaNaoConformidade("recebimento_embalagens", nc)).toBe("contaminacaoQuimica");
  });
});
