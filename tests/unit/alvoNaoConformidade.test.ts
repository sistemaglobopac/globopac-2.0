import { describe, expect, it } from "vitest";
import { alvosDoCampo } from "@/modules/fichas/utils/adendoCampos";
import { alvoDaNaoConformidade, caminhoDaNaoConformidade, observacaoInicialDoAdendo } from "@/modules/fichas/utils/alvoNaoConformidade";
import type { ChillerCarcacasValor, ControleAbsorcaoValor, EsperaAvesValor, LavagemFinalValor, PesoCaixaValor } from "@/modules/fichas/fields/tiposCompostos";

const t = (prev: string, cur: string, ice = "0") => ({ prev, cur, ice });

// Pré-chiller usa 10 m³ (10 000 L) para 5 000 aves = 2 L/carcaça (conforme); chiller 1 usa 1 m³ = 0,2 L/carcaça (abaixo da meta).
const carcacas: ChillerCarcacasValor = {
  cargas: [],
  tanques: { preChiller: t("10", "20"), chiller1: t("30", "31"), chiller2: t("50", "60") },
  condenasParcial: "0",
  condenasTotal: "0",
  totalAves: 5000,
  totalAvesBruto: 5000,
  pesoMedioCarcaca: 2.3,
  conformidade: false,
  detalhesRNC: "Vazão Insuficiente: Chiller 01 abaixo da meta",
};

describe("alvosDoCampo — dados dentro dos tanques", () => {
  it("oferece a leitura atual de cada tanque com rótulo legível", () => {
    const alvos = alvosDoCampo({ chave: "c_1", label: "SPR Carcaças", tipo: "chiller_carcacas" }, carcacas);
    const alvo = alvos.find((a) => a.caminho === "c_1.tanques.chiller1.cur");
    expect(alvo?.valorAtual).toBe("31");
    expect(alvo?.rotulo).toBe("SPR Carcaças › Chiller 1 › Hidr. atual (m³)");
  });
});

describe("alvo da não conformidade", () => {
  it("vazão: aponta a leitura atual do tanque abaixo da meta", () => {
    expect(caminhoDaNaoConformidade("chiller_carcacas", carcacas)).toBe("tanques.chiller1.cur");
    const campo = { chave: "c_1", label: "SPR Carcaças", tipo: "chiller_carcacas" };
    const alvo = alvoDaNaoConformidade(campo, carcacas, alvosDoCampo(campo, carcacas));
    expect(alvo?.caminho).toBe("c_1.tanques.chiller1.cur");
  });

  it("vazão: tudo conforme não aponta nada", () => {
    const ok = { ...carcacas, tanques: { preChiller: t("10", "20"), chiller1: t("30", "40"), chiller2: t("50", "60") } };
    expect(caminhoDaNaoConformidade("chiller_carcacas", ok)).toBeUndefined();
  });

  it("chuveiro final", () => {
    const v: LavagemFinalValor = {
      chuveiro: { prev: "4", cur: "5" },
      condenacoesParciais: "0",
      totalAvesBruto: 5000,
      condenasTotalSPR: 0,
      totalAves: 5000,
      avesIndisponivel: false,
      conformidade: false,
      detalhesRNC: "x",
    };
    expect(caminhoDaNaoConformidade("lavagem_final", v)).toBe("chuveiro.cur");
  });

  it("controle de absorção: a temperatura do primeiro tanque acima do limite", () => {
    const v: ControleAbsorcaoValor = {
      tempoPermanenciaMin: "30",
      temperaturas: { preChiller: "10", chiller1: "9", chiller2: "9" },
      borbulhamento: { preChiller: "moderado", chiller1: "moderado", chiller2: "moderado" },
      observacao: "",
      conformidade: false,
      detalhesRNC: "x",
    };
    const resultado = caminhoDaNaoConformidade("controle_absorcao", v);
    // o limite do pré-chiller é 16 °C, o do chiller 1 é 4 °C: 9 °C no chiller 1 é o primeiro acima do limite
    expect(resultado).toBe("temperaturas.chiller1");
  });

  it("peso por caixa: o peso médio da carga acima do limite", () => {
    const base = { cargaId: "c", gta: "1", integrado: "", aviario: "", nucleo: "", qtdAves: 100 };
    const v: PesoCaixaValor = {
      cargas: [
        { ...base, avesPorCaixa: "8", pesoMedioKg: "2" },
        { ...base, gta: "2", avesPorCaixa: "10", pesoMedioKg: "3" },
      ],
      conformidade: false,
      detalhesRNC: "x",
    };
    expect(caminhoDaNaoConformidade("peso_caixa", v)).toBe("cargas.1.pesoMedioKg");
  });

  it("espera: aspersores desligados primeiro, depois ventiladores", () => {
    const base = {
      boxes: [{ box: "1", comportamento: "ofegantes" }],
      temperaturaC: "30",
      houveOfegantes: true,
      acaoCorretiva: false,
      acaoCorretivaEm: "",
      conformidade: false,
      detalhesRNC: "x",
    } as unknown as EsperaAvesValor;
    expect(caminhoDaNaoConformidade("espera_aves", { ...base, aspersoresLigados: false, ventiladoresLigados: true })).toBe("aspersoresLigados");
    expect(caminhoDaNaoConformidade("espera_aves", { ...base, aspersoresLigados: true, ventiladoresLigados: false })).toBe("ventiladoresLigados");
  });

  it("tipo sem resolvedor ou valor estranho: não aponta nada (o verificador escolhe)", () => {
    expect(caminhoDaNaoConformidade("rastreabilidade_doa", {})).toBeUndefined();
    expect(caminhoDaNaoConformidade("chiller_carcacas", {})).toBeUndefined();
    expect(caminhoDaNaoConformidade(undefined, carcacas)).toBeUndefined();
  });

  it("campo com um único alvo já o tem escolhido", () => {
    const alvos = [{ caminho: "x", rotulo: "X", valorAtual: "1" }];
    expect(alvoDaNaoConformidade({ chave: "x" }, "1", alvos)).toBe(alvos[0]);
  });
});

describe("observação inicial do adendo", () => {
  it("traz o desvio detectado no preenchimento", () => {
    expect(observacaoInicialDoAdendo({ detalhesRNC: "Chiller 01 abaixo da meta" })).toBe("Não conformidade identificada: Chiller 01 abaixo da meta.");
  });
  it("vazia quando não há detalhe", () => {
    expect(observacaoInicialDoAdendo({ detalhesRNC: null })).toBe("");
    expect(observacaoInicialDoAdendo(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Todos os demais tipos de monitoramento com não conformidade. Cada caso confere o dado apontado E que esse dado está
// entre os alvos oferecidos ao verificador (senão o adendo não conseguiria pré-selecioná-lo).
// ---------------------------------------------------------------------------------------------------------------
import { TIPOS_VAZAO } from "@/modules/fichas/utils/desviosEspeciais";
import { TIPOS_COM_ALVO_DE_NC } from "@/modules/fichas/utils/alvoNaoConformidade";
import { checklistVazio, itensDaSala, respostaNaoConforme, salasDoChecklist } from "@/modules/fichas/fields/checklistConformidade";

function alvoPreSelecionado(tipo: string, valor: unknown): string | undefined {
  const campo = { chave: "c_1", label: "Campo", tipo };
  return alvoDaNaoConformidade(campo, valor, alvosDoCampo(campo, valor))?.caminho.replace("c_1.", "");
}

describe("alvo da não conformidade — todos os tipos", () => {
  it("todo tipo que pode ficar não conforme tem resolvedor", () => {
    for (const tipo of [...TIPOS_VAZAO, "absorcao_agua", "dripping_test"]) expect(TIPOS_COM_ALVO_DE_NC).toContain(tipo);
  });

  it("temperatura de resfriamento: água, ambiente e amostras de produto", () => {
    const base = {
      agua: { preChiller: "10", chiller1: "3", chiller2: "3", chillerPartes1: "3", chillerPartes2: "3", miniFigado: "3" },
      ambiente: { carcacas: "5", miudos: "5" },
      produtos: { carcaca: { amostra1: "2", amostra2: "2" } },
      tipoParte: "",
      conformidade: false,
      detalhesRNC: "x",
    } as never;
    expect(alvoPreSelecionado("temperatura_resfriamento", { ...(base as object), agua: { ...(base as { agua: object }).agua, chiller1: "9" } })).toBe("agua.chiller1");
    expect(alvoPreSelecionado("temperatura_resfriamento", { ...(base as object), produtos: { carcaca: { amostra1: "2", amostra2: "30" } } })).toBe("produtos.carcaca.amostra2");
  });

  it("potabilidade da água e dos pontos: pH ou cloro", () => {
    const sist = { tanque: "t1", ph: "7", cloro: "1" };
    const v = { sistemas: { carcacas: sist, partes: { ...sist, cloro: "9" }, miudos: sist }, conformidade: false, detalhesRNC: "x" };
    expect(alvoPreSelecionado("potabilidade_agua", v)).toBe("sistemas.partes.cloro");
    expect(alvoPreSelecionado("potabilidade_pontos", { ponto: "p", ph: "3", cloro: "1", conformidade: false, detalhesRNC: "x" })).toBe("ph");
  });

  it("qualidade de miúdos: o defeito acima do máximo", () => {
    const v = {
      partes: {
        cabeca: { existe: "sim", amostra: "100", defeitos: { pena: "50", excessoEscalda: "0" } },
        pes: { existe: "nao", amostra: "", defeitos: {} },
        moela: { existe: "nao", amostra: "", defeitos: {} },
        figado: { existe: "nao", amostra: "", defeitos: {} },
        coracao: { existe: "nao", amostra: "", defeitos: {} },
      },
      observacao: "",
      conformidade: false,
      detalhesRNC: "x",
    };
    expect(alvoPreSelecionado("qualidade_miudos", v)).toBe("partes.cabeca.defeitos.pena");
    const alvos = alvosDoCampo({ chave: "c_1", label: "Campo", tipo: "qualidade_miudos" }, v);
    expect(alvos.find((a) => a.caminho === "c_1.partes.cabeca.defeitos.pena")?.rotulo).toBe("Campo › Cabeça › Pena");
  });

  it("checklists: o primeiro item não conforme, com o rótulo do item", () => {
    const v = checklistVazio("ventilacao");
    const sala = salasDoChecklist("ventilacao")[0]!;
    const item = itensDaSala("ventilacao", sala.chave)[0]!;
    // a resposta não conforme depende do modo do item (conforme: "nao_conforme"; sim_e_nc: "sim")
    const resposta = ["nao_conforme", "sim"].find((o) => respostaNaoConforme(item.modo, o));
    expect(resposta).toBeDefined();
    v.salas[sala.chave][item.chave] = resposta!;
    expect(alvoPreSelecionado("ventilacao", v)).toBe(`salas.${sala.chave}.${item.chave}`);
    const alvos = alvosDoCampo({ chave: "c_1", label: "Campo", tipo: "ventilacao" }, v);
    expect(alvos.find((a) => a.caminho === `c_1.salas.${sala.chave}.${item.chave}`)?.rotulo).toBe(`Campo › ${sala.curto} › ${item.rotulo}`);
  });

  it("absorção: a amostra de maior ganho; dripping: a de maior absorção", () => {
    const abs = {
      items: [
        { id: 1, seal: "a", initial: "1000", final: "1020" },
        { id: 2, seal: "b", initial: "1000", final: "1200" },
      ],
      status: "nao-conforme",
      averagePercentage: 10,
      validCount: 2,
      sumInitial: 2000,
      sumFinal: 2220,
    };
    expect(alvoPreSelecionado("absorcao_agua", abs)).toBe("items.1.final");
    const drip = {
      items: [
        { id: 1, seal: "a", m0: "1000", m1: "10", m2: "980", m3: "900", horaRetirada: "10:00", timeNc: false },
        { id: 2, seal: "b", m0: "1000", m1: "10", m2: "950", m3: "900", horaRetirada: "10:00", timeNc: true },
      ],
      lote: "1",
      horaInicio: "09:00",
      status: "nao-conforme",
      averagePercentage: 1,
      validCount: 2,
      timeNonConformity: true,
    };
    expect(alvoPreSelecionado("dripping_test", drip)).toBe("items.1.horaRetirada");
  });

  it("bem-estar: pendura, eletronarcose, caixas vazias e recepção", () => {
    expect(alvoPreSelecionado("pendura_aves", { temperaturaC: "", ruidosDesnecessarios: false, auxiliaresConformes: false })).toBe("auxiliaresConformes");
    expect(alvoPreSelecionado("eletronarcose_aves", { voltagemV: "200", frequenciaHz: "50", correnteMa: "100", sangriaS: "", preChoque: null })).toBe("voltagemV");
    expect(alvoPreSelecionado("eletronarcose_aves", { voltagemV: "50", frequenciaHz: "50", correnteMa: "100", sangriaS: "", preChoque: true })).toBe("preChoque");
    expect(alvoPreSelecionado("caixas_vazias", { todasVazias: false, caixasNaoVazias: "2", acaoCorretiva: "", conformidade: false, detalhesRNC: "x" })).toBe("todasVazias");
    expect(
      alvoPreSelecionado("recepcao_aves", {
        condicaoVeiculo: "CONFORME",
        placa: "ABC1D23",
        retiradaRacaoEm: "2026-10-01T01:00",
        embarqueInicioEm: "",
        embarqueFimEm: "",
        chegadaEm: "",
        penduraInicioEm: "2026-10-01T20:00",
      })
    ).toBe("retiradaRacaoEm");
  });
});
