import { describe, expect, it } from "vitest";
import { definirSemProducao, marcasParaGravar, tanqueSemProducao } from "@/modules/fichas/fields/tanqueSemProducao";
import { motivosPreenchimentoCarcacas, motivosPreenchimentoChuveiro, motivosPreenchimentoMiudos, motivosPreenchimentoPartes } from "@/modules/fichas/fields/preenchimentoSpr";
import { apuracaoCarcacas, apuracaoChuveiro, apuracaoMiudos, apuracaoPartes } from "@/modules/fichas/fields/apuracaoRelatorio";
import { leituraHerdada } from "@/modules/fichas/fields/hidrometro";
import type { ChillerCarcacasValor, ChillerPartesValor, LavagemFinalValor, MiniChillersValor } from "@/modules/fichas/fields/tiposCompostos";

const t = (prev: string, cur: string, ice = "0") => ({ prev, cur, ice });

const carcacas = (over: Partial<ChillerCarcacasValor> = {}): ChillerCarcacasValor => ({
  cargas: [{ id: "1", quantity: "5000", avgLiveWeight: "2.800" }],
  tanques: { preChiller: t("10", "20"), chiller1: t("30", "40"), chiller2: t("50", "60") },
  condenasParcial: "0",
  condenasTotal: "0",
  totalAves: 5000,
  totalAvesBruto: 5000,
  pesoMedioCarcaca: 2.3,
  conformidade: true,
  detalhesRNC: null,
  ...over,
});

describe("tanque sem produção — helpers", () => {
  it("marcar descarta a leitura atual e o gelo, mantém a anterior", () => {
    const tanques = { a: t("30", "40", "332"), b: t("50", "60", "332") };
    const r = definirSemProducao(tanques, {}, "a", true, "332");
    expect(r.tanques.a).toEqual({ prev: "30", cur: "", ice: "" });
    expect(r.tanques.b).toEqual(tanques.b);
    expect(tanqueSemProducao(r.marcas, "a")).toBe(true);
    expect(tanqueSemProducao(r.marcas, "b")).toBe(false);
  });

  it("desmarcar devolve o gelo padrão e remove a marca", () => {
    const marcado = definirSemProducao({ a: t("30", "", "332") }, {}, "a", true, "332");
    const r = definirSemProducao(marcado.tanques, marcado.marcas, "a", false, "250");
    expect(r.tanques.a).toEqual({ prev: "30", cur: "", ice: "250" });
    expect(r.marcas).toEqual({});
  });

  it("a leitura anterior do tanque sem produção é a herdada pelo próximo monitoramento", () => {
    const r = definirSemProducao({ a: t("30", "40") }, {}, "a", true, "0");
    expect(leituraHerdada(r.tanques.a)).toBe("30");
  });

  it("só grava as marcas verdadeiras (nada quando nenhum tanque está sem produção)", () => {
    expect(marcasParaGravar({})).toEqual({});
    expect(marcasParaGravar({ a: false })).toEqual({});
    expect(marcasParaGravar({ a: true, b: false })).toEqual({ tanquesSemProducao: { a: true } });
  });
});

describe("tanque sem produção — preenchimento", () => {
  it("Carcaças: tanque em branco sem a marca bloqueia; com a marca não", () => {
    const base = carcacas({ tanques: { preChiller: t("10", "20"), chiller1: t("30", ""), chiller2: t("50", "60") } });
    expect(motivosPreenchimentoCarcacas(base)).toContain("SPR Carcaças — Chiller 1: informe o Hidr. Atual.");
    expect(motivosPreenchimentoCarcacas({ ...base, tanquesSemProducao: { chiller1: true } })).toEqual([]);
  });

  it("Carcaças: a marca dispensa também a leitura anterior e o gelo", () => {
    const v = carcacas({ tanques: { preChiller: t("10", "20"), chiller1: t("", "", ""), chiller2: t("50", "60") }, tanquesSemProducao: { chiller1: true } });
    expect(motivosPreenchimentoCarcacas(v)).toEqual([]);
  });

  it("a marca vale só para o tanque marcado: os outros continuam exigidos", () => {
    const v = carcacas({ tanques: { preChiller: t("10", ""), chiller1: t("30", ""), chiller2: t("50", "60") }, tanquesSemProducao: { chiller1: true } });
    expect(motivosPreenchimentoCarcacas(v)).toEqual(["SPR Carcaças — Pré-chiller: informe o Hidr. Atual."]);
  });

  it("Partes e Miúdos aceitam tanque sem produção", () => {
    const partes: ChillerPartesValor = {
      tanques: { chiller1: t("30", "40"), chiller2: t("50", "") },
      totalCondenacoes: 10,
      pesoMedioCarcaca: 2.3,
      pesoCarcacaIndisponivel: false,
      conformidade: true,
      detalhesRNC: null,
    };
    expect(motivosPreenchimentoPartes(partes)).toHaveLength(1);
    expect(motivosPreenchimentoPartes({ ...partes, tanquesSemProducao: { chiller2: true } })).toEqual([]);

    const miudos: MiniChillersValor = {
      tanques: { coracao: t("1", "2"), moela: t("1", "2"), figado: t("1", "2"), cabeca: t("1", "2"), pes: t("1", "") },
      totalAves: 100,
      pesoCarcaca: 2.3,
      avesIndisponivel: false,
      pesoMiudoIndisponivel: false,
      conformidade: true,
      detalhesRNC: null,
    };
    expect(motivosPreenchimentoMiudos(miudos)).toHaveLength(1);
    expect(motivosPreenchimentoMiudos({ ...miudos, tanquesSemProducao: { pes: true } })).toEqual([]);
  });
});

const chuveiro = (prev: string, cur: string, over: Partial<LavagemFinalValor> = {}): LavagemFinalValor => ({
  chuveiro: { prev, cur },
  condenacoesParciais: "",
  totalAvesBruto: 1000,
  condenasTotalSPR: 0,
  totalAves: 1000,
  avesIndisponivel: false,
  conformidade: true,
  detalhesRNC: null,
  ...over,
});

describe("chuveiro final sem produção", () => {
  it("sem a marca exige a leitura atual e as parciais; com a marca não exige nada", () => {
    expect(motivosPreenchimentoChuveiro(chuveiro("4", ""))).toHaveLength(2);
    expect(motivosPreenchimentoChuveiro(chuveiro("4", "", { semProducao: true }))).toEqual([]);
  });

  it("a apuração do relatório marca o chuveiro como sem produção", () => {
    const linha = apuracaoChuveiro(chuveiro("4", "", { semProducao: true }))[0];
    expect(linha.semProducao).toBe(true);
    expect(linha.apurada).toBe(false);
    expect(linha.conforme).toBeNull();
  });
});

describe("tanque sem produção — apuração do relatório", () => {
  it("Carcaças: a linha do tanque sem produção não é apurada nem conforme/não conforme", () => {
    const v = carcacas({ tanques: { preChiller: t("10", "20"), chiller1: t("30", ""), chiller2: t("50", "60") }, tanquesSemProducao: { chiller1: true } });
    const linha = apuracaoCarcacas(v).find((l) => l.ponto === "Chiller 01")!;
    expect(linha.semProducao).toBe(true);
    expect(linha.apurada).toBe(false);
    expect(linha.conforme).toBeNull();
    expect(linha.memoria).toMatch(/sem produção/i);
    expect(apuracaoCarcacas(v).filter((l) => l.semProducao)).toHaveLength(1);
  });

  it("Partes e Miúdos marcam só o tanque sem produção", () => {
    const partes: ChillerPartesValor = {
      tanques: { chiller1: t("30", "40"), chiller2: t("50", "") },
      totalCondenacoes: 10,
      pesoMedioCarcaca: 2.3,
      pesoCarcacaIndisponivel: false,
      conformidade: true,
      detalhesRNC: null,
      tanquesSemProducao: { chiller2: true },
    };
    expect(apuracaoPartes(partes).map((l) => !!l.semProducao)).toEqual([false, true]);

    const miudos: MiniChillersValor = {
      tanques: { coracao: t("1", "2"), moela: t("1", ""), figado: t("1", "2"), cabeca: t("1", "2"), pes: t("1", "2") },
      totalAves: 100,
      pesoCarcaca: 2.3,
      avesIndisponivel: false,
      pesoMiudoIndisponivel: false,
      conformidade: true,
      detalhesRNC: null,
      tanquesSemProducao: { moela: true },
    };
    expect(apuracaoMiudos(miudos).map((l) => !!l.semProducao)).toEqual([false, true, false, false, false]);
  });
});
