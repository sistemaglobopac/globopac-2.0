import { describe, expect, it } from "vitest";
import {
  lotesSemPeso,
  motivosPreenchimentoCarcacas,
  motivosPreenchimentoChuveiro,
  motivosPreenchimentoMiudos,
  motivosPreenchimentoPartes,
} from "@/modules/fichas/fields/preenchimentoSpr";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import type { ChillerCarcacasValor, ChillerPartesValor, LavagemFinalValor, MiniChillersValor } from "@/modules/fichas/fields/tiposCompostos";
import type { CampoTemplate } from "@/shared/schema-campos";

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

describe("SPR Carcaças", () => {
  it("completo: sem motivos", () => {
    expect(motivosPreenchimentoCarcacas(carcacas())).toEqual([]);
  });

  it("1º do dia: só a leitura atual é exigida", () => {
    const v = carcacas({
      cargas: [{ id: "1", quantity: "", avgLiveWeight: "" }],
      tanques: { preChiller: t("", "20"), chiller1: t("", "40"), chiller2: t("", "60") },
      condenasParcial: "",
      condenasTotal: "",
    });
    expect(motivosPreenchimentoCarcacas(v)).toEqual([]);
    expect(motivosPreenchimentoCarcacas({ ...v, tanques: { ...v.tanques, chiller1: t("", "") } })).toEqual(["SPR Carcaças — Chiller 1: informe o Hidr. Atual."]);
  });

  it("fora do 1º do dia: lote, condenas, gelo e leitura atual em branco bloqueiam", () => {
    const m = motivosPreenchimentoCarcacas(
      carcacas({
        cargas: [{ id: "1", quantity: "5000", avgLiveWeight: "" }],
        tanques: { preChiller: t("10", ""), chiller1: t("30", "40", ""), chiller2: t("50", "60") },
        condenasParcial: "",
      })
    );
    expect(m).toEqual([
      "SPR Carcaças — Pré-chiller: informe o Hidr. Atual.",
      "SPR Carcaças — Chiller 1: informe o Gelo Adicionado (use 0 se não houve).",
      "SPR Carcaças — Lote 1: informe o Peso Vivo (kg).",
      "SPR Carcaças: informe as Carcaças Parcialmente Aproveitadas (use 0 se não houve).",
    ]);
  });

  it("valor ausente bloqueia", () => {
    expect(motivosPreenchimentoCarcacas(undefined)).toHaveLength(1);
    expect(motivosPreenchimentoCarcacas(null)).toHaveLength(1);
  });
});

describe("SPR Partes", () => {
  const partes = (c1: ReturnType<typeof t>, c2: ReturnType<typeof t>): ChillerPartesValor => ({
    tanques: { chiller1: c1, chiller2: c2 },
    totalCondenacoes: 0,
    pesoMedioCarcaca: 0,
    pesoCarcacaIndisponivel: false,
    conformidade: true,
    detalhesRNC: null,
  });

  it("caso real: leitura atual vazia nos dois chillers bloqueia", () => {
    expect(motivosPreenchimentoPartes(partes(t("21480", ""), t("16089", "")))).toEqual([
      "SPR Partes — Chiller 1: informe o Hidr. Atual.",
      "SPR Partes — Chiller 2: informe o Hidr. Atual.",
    ]);
  });

  it("completo e 1º do dia passam", () => {
    expect(motivosPreenchimentoPartes(partes(t("21480", "21500", "332"), t("16089", "16100", "332")))).toEqual([]);
    expect(motivosPreenchimentoPartes(partes(t("", "21500"), t("", "16100")))).toEqual([]);
  });

  it("fora do 1º do dia: gelo em branco bloqueia (0 passa)", () => {
    expect(motivosPreenchimentoPartes(partes(t("1", "2", ""), t("1", "2", "0")))).toEqual(["SPR Partes — Chiller 1: informe o Gelo Adicionado (use 0 se não houve)."]);
  });
});

describe("SPR Miúdos e Chuveiro Final", () => {
  const miudos = (cur: string): MiniChillersValor => ({
    tanques: { coracao: t("1", cur), moela: t("1", "2"), figado: t("1", "2"), cabeca: t("1", "2"), pes: t("1", "2") },
    totalAves: 0,
    pesoCarcaca: 0,
    avesIndisponivel: false,
    pesoMiudoIndisponivel: false,
    conformidade: true,
    detalhesRNC: null,
  });
  it("Miúdos: um tanque sem leitura bloqueia", () => {
    expect(motivosPreenchimentoMiudos(miudos("2"))).toEqual([]);
    expect(motivosPreenchimentoMiudos(miudos(""))).toEqual(["SPR Miúdos — Coração: informe o Hidr. Atual."]);
  });

  const chuveiro = (prev: string, cur: string, parciais: string): LavagemFinalValor => ({
    chuveiro: { prev, cur },
    condenacoesParciais: parciais,
    totalAvesBruto: 0,
    condenasTotalSPR: 0,
    totalAves: 0,
    avesIndisponivel: false,
    conformidade: true,
    detalhesRNC: null,
  });
  it("Chuveiro: 1º do dia só exige a leitura atual; depois exige as parciais", () => {
    expect(motivosPreenchimentoChuveiro(chuveiro("", "5", ""))).toEqual([]);
    expect(motivosPreenchimentoChuveiro(chuveiro("4", "5", ""))).toHaveLength(1);
    expect(motivosPreenchimentoChuveiro(chuveiro("4", "", "0"))).toEqual(["Chuveiro Final: informe o Hidr. Atual."]);
  });
});

describe("motivosDeBloqueioSpr", () => {
  it("campo de texto obrigatório em branco bloqueia; opcional não", () => {
    const campos: CampoTemplate[] = [
      { chave: "a", tipo: "texto", obrigatorio: true, label: "Observação" },
      { chave: "b", tipo: "texto_longo", obrigatorio: false },
    ];
    expect(motivosDeBloqueioSpr(campos, { a: "  ", b: "" })).toEqual(["Observação: campo obrigatório sem preencher."]);
    expect(motivosDeBloqueioSpr(campos, { a: "ok", b: "" })).toEqual([]);
  });

  it("widget SPR nulo (nunca tocado) bloqueia", () => {
    const campos: CampoTemplate[] = [{ chave: "p", tipo: "chiller_partes", obrigatorio: true }];
    expect(motivosDeBloqueioSpr(campos, { p: null })).toHaveLength(1);
  });
});

describe("pausa da linha obrigatória quando o período é calculado pela chegada ao pré-resfriamento", () => {
  const v = (extra: Record<string, unknown>) =>
    ({
      cargas: [{ id: "1", quantity: "100", avgLiveWeight: "2.9" }],
      tanques: { preChiller: { prev: "1", cur: "2", ice: "0" }, chiller1: { prev: "1", cur: "2", ice: "0" }, chiller2: { prev: "1", cur: "2", ice: "0" } },
      condenasParcial: "0",
      condenasTotal: "0",
      totalAves: 100,
      totalAvesBruto: 100,
      pesoMedioCarcaca: 0,
      conformidade: true,
      detalhesRNC: null,
      ...extra,
    }) as unknown as Parameters<typeof motivosPreenchimentoCarcacas>[0];
  const chegada = { corteEm: "2026-10-06T12:00:00Z", velocidadeAvesH: 6960, origemVelocidade: "observada", transitoSegundos: 784, acumulado: {} };

  it("com período calculado e sem resposta, bloqueia; respondendo (sim ou não) libera", () => {
    expect(motivosPreenchimentoCarcacas(v({ chegada })).some((m) => m.includes("pausa da linha"))).toBe(true);
    expect(motivosPreenchimentoCarcacas(v({ chegada, pausaInformada: "nao" })).some((m) => m.includes("pausa da linha"))).toBe(false);
    expect(motivosPreenchimentoCarcacas(v({ chegada, pausaInformada: "sim" })).some((m) => m.includes("pausa da linha"))).toBe(false);
  });

  it("lotes digitados à mão (sem período calculado) não exigem a resposta", () => {
    expect(motivosPreenchimentoCarcacas(v({})).some((m) => m.includes("pausa da linha"))).toBe(false);
  });
});


describe("SPR Carcaças com peso parcial", () => {
  const semPeso = { id: "2", quantity: "2000", avgLiveWeight: "" };

  it("sem o peso parcial, lote sem peso bloqueia e fica pendente", () => {
    const v = carcacas({ cargas: [{ id: "1", quantity: "5000", avgLiveWeight: "2.800" }, semPeso] });
    expect(motivosPreenchimentoCarcacas(v)).toContain("SPR Carcaças — Lote 2: informe o Peso Vivo (kg).");
    expect(lotesSemPeso(v)).toHaveLength(1);
  });

  it("com o peso parcial escolhido, o lote sem peso não bloqueia nem deixa o registro pendente", () => {
    const v = carcacas({ cargas: [{ id: "1", quantity: "5000", avgLiveWeight: "2.800" }, semPeso], pesoParcial: { avesComPeso: 5000, avesSemPeso: 2000, lotesSemPeso: 1 } });
    expect(motivosPreenchimentoCarcacas(v)).toEqual([]);
    expect(lotesSemPeso(v)).toEqual([]);
  });

  it("peso parcial sem nenhum lote com peso não vale", () => {
    const v = carcacas({ cargas: [semPeso], pesoParcial: { avesComPeso: 0, avesSemPeso: 2000, lotesSemPeso: 1 } });
    expect(motivosPreenchimentoCarcacas(v).join(" ")).toContain("ao menos um lote com peso vivo");
  });
});
