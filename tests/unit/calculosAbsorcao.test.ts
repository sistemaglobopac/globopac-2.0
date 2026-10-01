import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  absorcaoLinhaDripping,
  amostrasAbsorcaoIniciais,
  amostrasDrippingIniciais,
  calcularAbsorcaoAgua,
  calcularDrippingTest,
  duracaoDrenagemMin,
  formatarPercentual,
  percentualIndividualAbsorcao,
  tempoMinimoDrenagem,
  tempoNaoConforme,
  textoSeloDripping,
} from "@/modules/fichas/fields/calculosAbsorcao";
import { desviosEspeciais, mensagemDesvioAbsorcao, mensagemDesvioDripping } from "@/modules/fichas/utils/desviosEspeciais";
import {
  apagarRascunhoDripping,
  carregarRascunhoDripping,
  CHAVE_RASCUNHO_DRIPPING,
  salvarRascunhoDripping,
} from "@/modules/fichas/fields/rascunhoDripping";
import { valoresIniciaisDe, zodFromSchemaCampos, type CampoTemplate } from "@/shared/schema-campos";

const abs = (linhas: [string, string][]) => {
  const items = amostrasAbsorcaoIniciais();
  linhas.forEach(([initial, final], i) => {
    items[i] = { ...items[i]!, initial, final };
  });
  return items;
};

describe("A) Teste de Absorção de Água", () => {
  it("tem 10 linhas", () => {
    expect(amostrasAbsorcaoIniciais()).toHaveLength(10);
  });

  it("média por SOMA: (1,000→1,150) e (4,000→4,200) = 7,00% CONFORME (média de % daria 10%)", () => {
    const r = calcularAbsorcaoAgua(abs([["1.000", "1.150"], ["4.000", "4.200"]]));
    expect(r.sumInitial).toBeCloseTo(5, 9);
    expect(r.sumFinal).toBeCloseTo(5.35, 9);
    expect(r.averagePercentage).toBeCloseTo(7.0, 9);
    expect(formatarPercentual(r.averagePercentage)).toBe("7,00%");
    expect(r.status).toBe("conforme");
    expect(r.validCount).toBe(2);
    // a média aritmética dos % individuais seria 10% — não é a conta oficial
    const individuais = [percentualIndividualAbsorcao({ initial: "1", final: "1.15" }), percentualIndividualAbsorcao({ initial: "4", final: "4.2" })];
    expect((individuais[0]! + individuais[1]!) / 2).toBeCloseTo(10, 6);
  });

  it("no limite: 10,000→10,800 = 8,00% é CONFORME (só acima de 8,0 reprova)", () => {
    const r = calcularAbsorcaoAgua(abs([["10.000", "10.800"]]));
    expect(formatarPercentual(r.averagePercentage)).toBe("8,00%");
    expect(r.status).toBe("conforme");
  });

  it("acima do limite reprova", () => {
    expect(calcularAbsorcaoAgua(abs([["10.000", "10.801"]])).status).toBe("nao-conforme");
    expect(calcularAbsorcaoAgua(abs([["10", "11"]])).status).toBe("nao-conforme");
  });

  it("linha válida exige inicial > 0 e final numérico; o lacre não entra", () => {
    const r = calcularAbsorcaoAgua(abs([["0", "5"], ["", "5"], ["5", ""], ["2.000", "2.100"]]));
    expect(r.validCount).toBe(1);
    expect(r.sumInitial).toBeCloseTo(2, 9);
    // lacre preenchido sem pesos não vira linha válida
    const items = amostrasAbsorcaoIniciais();
    items[0] = { ...items[0]!, seal: "ABC" };
    expect(calcularAbsorcaoAgua(items).validCount).toBe(0);
  });

  it("nenhuma linha válida = conforme, média 0", () => {
    const r = calcularAbsorcaoAgua(amostrasAbsorcaoIniciais());
    expect(r).toEqual({ status: "conforme", averagePercentage: 0, validCount: 0, sumInitial: 0, sumFinal: 0 });
  });

  it("% individual só com inicial > 0 e final numérico, senão null (—)", () => {
    expect(percentualIndividualAbsorcao({ initial: "2", final: "2.1" })).toBeCloseTo(5, 9);
    expect(percentualIndividualAbsorcao({ initial: "0", final: "2" })).toBeNull();
    expect(percentualIndividualAbsorcao({ initial: "2", final: "" })).toBeNull();
  });
});

const drip = (linhas: Partial<Record<"m0" | "m1" | "m2" | "m3" | "horaRetirada", string>>[]) => {
  const items = amostrasDrippingIniciais();
  linhas.forEach((l, i) => {
    items[i] = { ...items[i]!, ...l };
  });
  return items;
};

describe("B) Dripping Test", () => {
  it("tem 6 linhas", () => {
    expect(amostrasDrippingIniciais()).toHaveLength(6);
  });

  it("média ARITMÉTICA: 5,00% e 7,98% → 6,49% > 6 = NÃO CONFORME (ACIMA DE 6%)", () => {
    const r = calcularDrippingTest(
      drip([
        { m0: "1000", m1: "10", m3: "50", m2: "943" },
        { m0: "1000", m1: "10", m3: "50", m2: "915" },
      ]),
      ""
    );
    expect(absorcaoLinhaDripping(r.items[0]!)!.toFixed(2)).toBe("5.00");
    expect(absorcaoLinhaDripping(r.items[1]!)!.toFixed(2)).toBe("7.98");
    expect(formatarPercentual(r.averagePercentage)).toBe("6,49%");
    expect(r.validCount).toBe(2);
    expect(r.status).toBe("nao-conforme");
    expect(r.timeNonConformity).toBe(false);
    expect(textoSeloDripping(r.averagePercentage, r.timeNonConformity)).toBe("ACIMA DE 6%");
  });

  it("limite 6,0 estrito: exatamente 6% é conforme", () => {
    // (1000−0−940)/(1000−0−0)×100 = 6,00%
    const r = calcularDrippingTest(drip([{ m0: "1000", m1: "0", m3: "0", m2: "940" }]), "");
    expect(formatarPercentual(r.averagePercentage)).toBe("6,00%");
    expect(r.status).toBe("conforme");
  });

  it("linha inválida: (M0 − M1 − M3) = 0 é ignorada; sem M2 também", () => {
    const r = calcularDrippingTest(drip([{ m0: "1000", m1: "500", m3: "500", m2: "10" }, { m0: "1000", m1: "10", m3: "50", m2: "" }]), "");
    expect(r.validCount).toBe(0);
    expect(r.status).toBe("conforme");
  });

  it("tabela de tempo mínimo por M0 (primeira faixa em que M0 ≤ limite)", () => {
    const esperado: [number, number][] = [
      [700, 65], [800, 65], [801, 72], [900, 72], [1000, 78], [1100, 85], [1200, 91], [1300, 98], [1400, 105],
      [1500, 112], [1600, 119], [1700, 126], [1800, 133], [1900, 140], [2000, 147], [2100, 154], [2200, 161], [2300, 168],
    ];
    for (const [m0, min] of esperado) expect(tempoMinimoDrenagem(m0), `M0=${m0}`).toBe(min);
    expect(tempoMinimoDrenagem(NaN)).toBeNull();
    expect(tempoMinimoDrenagem(0)).toBeNull();
  });

  it("acima de 2300 g: 168 + 7 × ceil((M0 − 2300)/100)", () => {
    expect(tempoMinimoDrenagem(2301)).toBe(175);
    expect(tempoMinimoDrenagem(2400)).toBe(175);
    expect(tempoMinimoDrenagem(2450)).toBe(182);
    expect(tempoMinimoDrenagem(2500)).toBe(182);
    expect(tempoMinimoDrenagem(2501)).toBe(189);
  });

  it("tempo: M0=1000 exige 78 min; 08:00→09:10 (70) é NC; 08:00→09:20 (80) é ok", () => {
    expect(tempoNaoConforme("08:00", "09:10", "1000")).toBe(true);
    expect(tempoNaoConforme("08:00", "09:20", "1000")).toBe(false);
    expect(tempoNaoConforme("08:00", "09:18", "1000")).toBe(false); // exatamente 78
  });

  it("virada da meia-noite: 23:30 → 00:50 = 80 min", () => {
    expect(duracaoDrenagemMin("23:30", "00:50")).toBe(80);
    expect(tempoNaoConforme("23:30", "00:50", "1000")).toBe(false);
  });

  it("só avalia com Hora Início E Retirada E M0 numérico", () => {
    expect(tempoNaoConforme("", "09:10", "1000")).toBe(false);
    expect(tempoNaoConforme("08:00", "", "1000")).toBe(false);
    expect(tempoNaoConforme("08:00", "08:10", "")).toBe(false);
  });

  it("o tempo reprova o campo MESMO com validCount = 0 e mesmo com a média boa", () => {
    const semM2 = calcularDrippingTest(drip([{ m0: "1000", m1: "10", m3: "50", horaRetirada: "09:10" }]), "08:00");
    expect(semM2.validCount).toBe(0);
    expect(semM2.timeNonConformity).toBe(true);
    expect(semM2.status).toBe("nao-conforme");

    const mediaBoa = calcularDrippingTest(drip([{ m0: "1000", m1: "10", m3: "50", m2: "943", horaRetirada: "09:10" }]), "08:00");
    expect(mediaBoa.averagePercentage).toBeCloseTo(5, 2);
    expect(mediaBoa.status).toBe("nao-conforme");
    expect(textoSeloDripping(mediaBoa.averagePercentage, mediaBoa.timeNonConformity)).toBe("TEMPO INFERIOR À META");
  });

  it("selo com média acima e tempo inferior", () => {
    expect(textoSeloDripping(6.49, true)).toBe("ACIMA DE 6 E TEMPO INFERIOR");
  });

  it("sem linhas válidas e sem tempoNC = conforme", () => {
    const r = calcularDrippingTest(amostrasDrippingIniciais(), "");
    expect(r.status).toBe("conforme");
    expect(r.validCount).toBe(0);
  });

  it("marca timeNc por linha", () => {
    const r = calcularDrippingTest(drip([{ m0: "1000", horaRetirada: "09:10" }, { m0: "1000", horaRetirada: "09:20" }]), "08:00");
    expect(r.items.map((i) => i.timeNc)).toEqual([true, false, false, false, false, false]);
  });
});

describe("mensagens de desvio", () => {
  const campoA = { chave: "abs", tipo: "absorcao_agua", obrigatorio: true, label: "Absorção" } as CampoTemplate;
  const campoB = { chave: "drip", tipo: "dripping_test", obrigatorio: true, label: "Dripping" } as CampoTemplate;

  it("A: limite padrão 8", () => {
    expect(mensagemDesvioAbsorcao("Absorção", 8.5)).toBe('O campo "Absorção" ultrapassou o limite máximo tolerado de 8% (Média: 8.50%).');
  });

  it("B: tempo abaixo do mínimo quando a média está dentro do limite", () => {
    expect(mensagemDesvioDripping("Dripping", { averagePercentage: 5, timeNonConformity: true })).toBe(
      'O tempo de drenagem no campo "Dripping" está abaixo do mínimo exigido pela Portaria 210/1998.'
    );
  });

  it("B: média acima do limite (com ou sem tempo)", () => {
    const esperado = 'A média de gotejamento no campo "Dripping" ultrapassou o limite de 6% (Portaria 210/1998) (Média: 6.49%).';
    expect(mensagemDesvioDripping("Dripping", { averagePercentage: 6.49, timeNonConformity: false })).toBe(esperado);
    expect(mensagemDesvioDripping("Dripping", { averagePercentage: 6.49, timeNonConformity: true })).toBe(esperado);
  });

  it("valorMaximo do campo vale como <limite> na MENSAGEM", () => {
    const campo = { ...campoA, valorMaximo: 7 } as CampoTemplate;
    const avisos = desviosEspeciais([campo], { abs: { status: "nao-conforme", averagePercentage: 7.5 } });
    expect(avisos).toEqual(['O campo "Absorção" ultrapassou o limite máximo tolerado de 7% (Média: 7.50%).']);
  });

  it("só gera aviso quando o status é nao-conforme", () => {
    expect(desviosEspeciais([campoA, campoB], { abs: { status: "conforme" }, drip: { status: "conforme" } })).toEqual([]);
    expect(
      desviosEspeciais([campoA, campoB], {
        abs: { status: "nao-conforme", averagePercentage: 9 },
        drip: { status: "nao-conforme", averagePercentage: 5, timeNonConformity: true },
      })
    ).toHaveLength(2);
  });
});

describe("rascunho da Fase 1 (localStorage)", () => {
  // localStorage em memória: o ambiente de teste não traz um completo.
  beforeEach(() => {
    const memoria = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
      removeItem: (k: string) => void memoria.delete(k),
      clear: () => memoria.clear(),
    });
  });
  const dados = { items: amostrasDrippingIniciais(), lote: "L1", horaInicio: "08:00" };

  it("guarda com a chave @globopac:dripping_test_draft e as chaves {items, lote, horaInicio, date}", () => {
    salvarRascunhoDripping(dados, new Date(2026, 8, 29, 8));
    const bruto = JSON.parse(localStorage.getItem("@globopac:dripping_test_draft")!);
    expect(Object.keys(bruto).sort()).toEqual(["date", "horaInicio", "items", "lote"]);
    expect(CHAVE_RASCUNHO_DRIPPING).toBe("@globopac:dripping_test_draft");
  });

  it("carrega o rascunho do MESMO dia", () => {
    salvarRascunhoDripping(dados, new Date(2026, 8, 29, 8));
    expect(carregarRascunhoDripping(new Date(2026, 8, 29, 17))?.lote).toBe("L1");
  });

  it("descarta o rascunho de OUTRO dia (apaga e ignora)", () => {
    salvarRascunhoDripping(dados, new Date(2026, 8, 28, 8));
    expect(carregarRascunhoDripping(new Date(2026, 8, 29, 8))).toBeNull();
    expect(localStorage.getItem("@globopac:dripping_test_draft")).toBeNull();
  });

  it("apagar remove o rascunho", () => {
    salvarRascunhoDripping(dados);
    apagarRascunhoDripping();
    expect(carregarRascunhoDripping()).toBeNull();
  });
});

describe("campo obrigatório (schema)", () => {
  const campos = [
    { chave: "abs", tipo: "absorcao_agua", obrigatorio: true },
    { chave: "drip", tipo: "dripping_test", obrigatorio: true },
  ] as CampoTemplate[];

  it("vazio (valor inicial) não passa; o objeto emitido pelo widget passa", () => {
    const schema = zodFromSchemaCampos(campos);
    expect(schema.safeParse(valoresIniciaisDe(campos)).success).toBe(false);
    expect(schema.safeParse({ abs: { items: amostrasAbsorcaoIniciais() }, drip: { items: amostrasDrippingIniciais() } }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("não obrigatório aceita vazio", () => {
    const opcionais = campos.map((c) => ({ ...c, obrigatorio: false })) as CampoTemplate[];
    expect(zodFromSchemaCampos(opcionais).safeParse(valoresIniciaisDe(opcionais)).success).toBe(true);
  });
});
