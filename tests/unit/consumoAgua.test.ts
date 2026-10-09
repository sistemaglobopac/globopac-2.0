import { describe, expect, it } from "vitest";
import {
  agregar,
  calcularEventos,
  fatiasPorHora,
  inicioDoBucket,
  PONTOS_AGUA,
  resolverAditivos,
  rotuloDoBucket,
  type RegistroAgua,
  type TemplateAgua,
} from "@/modules/bi/consumoAgua/calculo";

// Manaus é UTC−4: "2026-10-05 08:00" em Manaus = 12:00Z.
const manaus = (dataHora: string) => Date.parse(`${dataHora}:00-04:00`);
const iso = (dataHora: string) => new Date(manaus(dataHora)).toISOString();

const template: TemplateAgua = {
  id: "t1",
  codigo: "RAC-001/006 V2",
  schema_campos: [
    { chave: "carcacas", tipo: "chiller_carcacas" },
    { chave: "partes", tipo: "chiller_partes" },
    { chave: "chuveiro", tipo: "lavagem_final" },
  ],
};
const templates = new Map([["t1", template]]);

const tanque = (prev: string, cur: string, ice = "0") => ({ prev, cur, ice });

interface Leituras {
  pre?: [string, string, string?];
  c1?: [string, string, string?];
  partes1?: [string, string, string?];
  chuveiro?: [string, string];
}

let sequencia = 0;
function registro(hora: string, l: Leituras, extra: Partial<RegistroAgua> = {}): RegistroAgua {
  sequencia += 1;
  const t = (a?: [string, string, string?]) => (a ? tanque(a[0], a[1], a[2]) : tanque("", ""));
  return {
    id: `r${sequencia}`,
    ficha_template_id: "t1",
    setor: "Pré-resfriamento",
    criado_em: iso(hora),
    hora_monitoramento: iso(hora),
    aditivo_de: null,
    dados_dinamicos: {
      carcacas: { tanques: { preChiller: t(l.pre), chiller1: t(l.c1), chiller2: tanque("", "") } },
      partes: { tanques: { chiller1: t(l.partes1), chiller2: tanque("", "") } },
      chuveiro: { chuveiro: { prev: l.chuveiro?.[0] ?? "", cur: l.chuveiro?.[1] ?? "" } },
    },
    ...extra,
  };
}

describe("consumo de água — cálculo por leitura", () => {
  it("conta SÓ a água: (atual − anterior), sem somar o gelo", () => {
    const { eventos } = calcularEventos([registro("2026-10-05 08:00", { pre: ["500", "504.635", "1995"] })], templates);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.pontoId).toBe("carcacas.preChiller");
    expect(eventos[0]!.m3).toBeCloseTo(4.635, 6); // com gelo seriam 6,630 m³
  });

  it("aceita vírgula como decimal", () => {
    const { eventos } = calcularEventos([registro("2026-10-05 08:00", { c1: ["10,5", "12,25"] })], templates);
    expect(eventos[0]!.m3).toBeCloseTo(1.75, 6);
  });

  it("1º monitoramento do dia (sem leitura anterior) não gera consumo, mas serve de partida do intervalo seguinte", () => {
    const primeiro = registro("2026-10-05 08:00", { pre: ["", "500"] });
    const segundo = registro("2026-10-05 10:00", { pre: ["500", "504"] });
    const { eventos } = calcularEventos([primeiro, segundo], templates);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ inicio: manaus("2026-10-05 08:00"), fim: manaus("2026-10-05 10:00"), m3: 4 });
  });

  it("sem leitura atual não conta; leitura menor que a anterior é descartada e contada", () => {
    const { eventos, descartadasEm } = calcularEventos(
      [registro("2026-10-05 08:00", { pre: ["500", ""], c1: ["50", "40"] })],
      templates
    );
    expect(eventos).toHaveLength(0);
    expect(descartadasEm).toEqual([manaus("2026-10-05 08:00")]);
    const r = agregar(eventos, "dia", manaus("2026-10-05 00:00"), manaus("2026-10-06 00:00"), descartadasEm);
    expect(r.descartadas).toBe(1);
    expect(agregar(eventos, "dia", manaus("2026-10-06 00:00"), manaus("2026-10-07 00:00"), descartadasEm).descartadas).toBe(0);
  });

  it("separa cada ponto (chillers, partes e chuveiro) com a sua leitura", () => {
    const { eventos } = calcularEventos(
      [registro("2026-10-05 08:00", { pre: ["1", "2"], partes1: ["10", "13"], chuveiro: ["100", "101.5"] })],
      templates
    );
    const por = Object.fromEntries(eventos.map((e) => [e.pontoId, e.m3]));
    expect(por).toEqual({ "carcacas.preChiller": 1, "partes.chiller1": 3, "chuveiro.final": 1.5 });
  });

  it("leitura anterior há mais de 6 h (outro período) não distribui o volume nas horas do meio", () => {
    const a = registro("2026-10-05 06:00", { pre: ["", "500"] });
    const b = registro("2026-10-05 14:00", { pre: ["500", "508"] });
    const { eventos } = calcularEventos([a, b], templates);
    expect(eventos[0]!.inicio).toBeNull();
  });

  it("ficha reeditada (outra versão, mesmo código) continua a mesma série de leituras", () => {
    const v2: TemplateAgua = { ...template, id: "t2" };
    const mapa = new Map([...templates, ["t2", v2]]);
    const a = registro("2026-10-05 08:00", { pre: ["", "500"] });
    const b = registro("2026-10-05 10:00", { pre: ["500", "503"] }, { ficha_template_id: "t2" });
    expect(calcularEventos([a, b], mapa).eventos[0]!.inicio).toBe(manaus("2026-10-05 08:00"));
  });

  it("ignora registros de fichas sem monitoramento de água", () => {
    const outro: TemplateAgua = { id: "t9", codigo: "X", schema_campos: [{ chave: "temp", tipo: "numero" }] };
    const r = registro("2026-10-05 08:00", { pre: ["1", "2"] }, { ficha_template_id: "t9" });
    expect(calcularEventos([r], new Map([["t9", outro]])).eventos).toHaveLength(0);
  });
});

describe("consumo de água — aditivos", () => {
  it("o aditivo (cópia corrigida) substitui o original: o consumo não conta duas vezes", () => {
    const original = registro("2026-10-05 08:00", { pre: ["500", "504"] });
    const aditivo = registro("2026-10-05 08:00", { pre: ["500", "505"] }, { aditivo_de: original.id, criado_em: iso("2026-10-06 09:00") });
    expect(resolverAditivos([original, aditivo])).toEqual([aditivo]);
    const { eventos } = calcularEventos([original, aditivo], templates);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.m3).toBe(5);
  });

  it("com mais de um aditivo vale o mais recente; aditivo sem o original na janela segue valendo", () => {
    const original = registro("2026-10-05 08:00", {});
    const a1 = registro("2026-10-05 08:00", {}, { aditivo_de: original.id, criado_em: iso("2026-10-06 09:00") });
    const a2 = registro("2026-10-05 08:00", {}, { aditivo_de: original.id, criado_em: iso("2026-10-07 09:00") });
    expect(resolverAditivos([original, a1, a2])).toEqual([a2]);
    expect(resolverAditivos([a1])).toEqual([a1]);
  });
});

describe("consumo de água — hora a hora", () => {
  it("distribui o volume do intervalo proporcionalmente nas horas do relógio", () => {
    const fatias = fatiasPorHora({ pontoId: "x", registroId: "r", inicio: manaus("2026-10-05 08:30"), fim: manaus("2026-10-05 10:30"), m3: 8 });
    expect(fatias.map((f) => [f.hora, f.m3])).toEqual([
      [manaus("2026-10-05 08:00"), 2], // 30 min de 120
      [manaus("2026-10-05 09:00"), 4],
      [manaus("2026-10-05 10:00"), 2],
    ]);
  });

  it("sem início conhecido, o volume fica na hora da leitura", () => {
    const fatias = fatiasPorHora({ pontoId: "x", registroId: "r", inicio: null, fim: manaus("2026-10-05 10:20"), m3: 3 });
    expect(fatias).toEqual([{ hora: manaus("2026-10-05 10:00"), m3: 3 }]);
  });

  it("a soma das horas é igual ao volume da leitura, inclusive atravessando a meia-noite", () => {
    const fatias = fatiasPorHora({ pontoId: "x", registroId: "r", inicio: manaus("2026-10-05 23:00"), fim: manaus("2026-10-06 02:00"), m3: 9 });
    expect(fatias.reduce((s, f) => s + f.m3, 0)).toBeCloseTo(9, 9);
    expect(fatias).toHaveLength(3);
  });
});

describe("consumo de água — agregação", () => {
  const eventos = calcularEventos(
    [
      registro("2026-10-05 08:00", { pre: ["", "500"], c1: ["", "200"], partes1: ["", "10"], chuveiro: ["", "50"] }),
      registro("2026-10-05 10:00", { pre: ["500", "504"], c1: ["200", "202"], partes1: ["10", "11"], chuveiro: ["50", "51"] }),
      registro("2026-10-07 08:00", { pre: ["", "504"], chuveiro: ["", "51"] }),
      registro("2026-10-07 09:00", { pre: ["504", "505"], chuveiro: ["51", "52"] }),
    ],
    templates
  ).eventos;
  const de = manaus("2026-10-05 00:00");
  const ate = manaus("2026-10-08 00:00"); // exclusivo

  it("totais: chillers somados, chuveiro à parte e total geral", () => {
    const r = agregar(eventos, "dia", de, ate);
    expect(r.chillers).toBeCloseTo(4 + 2 + 1 + 1, 6); // pré 4 + chiller1 2 + partes 1 + pré 1
    expect(r.chuveiro).toBeCloseTo(2, 6);
    expect(r.total).toBeCloseTo(r.chillers + r.chuveiro, 9);
    expect(r.totaisPorPonto["carcacas.preChiller"]).toBeCloseTo(5, 6);
    expect(r.totaisPorSistema.carcacas).toBeCloseTo(7, 6);
    expect(r.diasComConsumo).toBe(2);
    expect(r.leituras).toBe(6); // 4 pontos às 10h do dia 5 + 2 pontos às 9h do dia 7
  });

  it("por dia: lista todos os dias do intervalo (os sem consumo valem 0)", () => {
    const r = agregar(eventos, "dia", de, ate);
    expect(r.buckets.map((b) => b.rotulo)).toEqual(["05/10/2026", "06/10/2026", "07/10/2026"]);
    expect(r.buckets[0]!.porPonto["carcacas.preChiller"]).toBeCloseTo(4, 6);
    expect(r.buckets[1]!.total).toBe(0);
    expect(r.buckets[2]!.chuveiro).toBeCloseTo(1, 6);
  });

  it("por hora: só as horas com consumo, cada hora com a sua fatia", () => {
    const r = agregar(eventos, "hora", de, ate);
    expect(r.buckets.map((b) => b.rotulo)).toEqual(["05/10/2026 08h", "05/10/2026 09h", "07/10/2026 08h"]);
    expect(r.buckets[0]!.porPonto["carcacas.preChiller"]).toBeCloseTo(2, 6);
    expect(r.buckets[1]!.porPonto["carcacas.preChiller"]).toBeCloseTo(2, 6);
    expect(r.buckets[2]!.porPonto["carcacas.preChiller"]).toBeCloseTo(1, 6);
  });

  it("por semana (segunda a domingo) e por mês", () => {
    const semana = agregar(eventos, "semana", manaus("2026-09-28 00:00"), ate);
    expect(semana.buckets.map((b) => b.rotulo)).toEqual(["28/09 a 04/10/2026", "05/10 a 11/10/2026"]);
    expect(semana.buckets[0]!.total).toBe(0);
    expect(semana.buckets[1]!.total).toBeCloseTo(semana.total, 9);

    const mes = agregar(eventos, "mes", de, ate);
    expect(mes.buckets.map((b) => b.rotulo)).toEqual(["out/2026"]);
    expect(mes.buckets[0]!.total).toBeCloseTo(mes.total, 9);
  });

  it("o período recorta: leituras e horas fora de [de, ate) não entram", () => {
    const r = agregar(eventos, "dia", manaus("2026-10-07 00:00"), ate);
    expect(r.leituras).toBe(2);
    expect(r.total).toBeCloseTo(2, 6);
  });

  it("um intervalo que cruza a virada do dia é dividido entre os dois dias", () => {
    const ev = calcularEventos(
      [registro("2026-10-05 23:00", { pre: ["", "10"] }), registro("2026-10-06 01:00", { pre: ["10", "14"] })],
      templates
    ).eventos;
    const r = agregar(ev, "dia", manaus("2026-10-05 00:00"), manaus("2026-10-07 00:00"));
    expect(r.buckets[0]!.total).toBeCloseTo(2, 6);
    expect(r.buckets[1]!.total).toBeCloseTo(2, 6);
  });

  it("lista de pontos cobre chillers e o chuveiro, sem repetir id", () => {
    expect(new Set(PONTOS_AGUA.map((p) => p.id)).size).toBe(PONTOS_AGUA.length);
    expect(PONTOS_AGUA.filter((p) => p.sistema === "chuveiro")).toHaveLength(1);
    expect(PONTOS_AGUA.filter((p) => p.sistema !== "chuveiro")).toHaveLength(10);
  });
});

describe("consumo de água — buckets de tempo", () => {
  it("semana começa na segunda; mês no dia 1 (Manaus)", () => {
    expect(inicioDoBucket(manaus("2026-10-07 15:00"), "semana")).toBe(manaus("2026-10-05 00:00"));
    expect(inicioDoBucket(manaus("2026-10-11 23:59"), "semana")).toBe(manaus("2026-10-05 00:00"));
    expect(inicioDoBucket(manaus("2026-10-31 23:00"), "mes")).toBe(manaus("2026-10-01 00:00"));
    expect(rotuloDoBucket(manaus("2026-10-01 00:00"), "mes")).toBe("out/2026");
  });
});

describe("dias excluídos do BI", () => {
  const eventos = calcularEventos(
    [
      registro("2026-10-05 08:00", { pre: ["", "500"] }),
      registro("2026-10-05 10:00", { pre: ["500", "900"] }), // leitura fora da realidade
      registro("2026-10-07 08:00", { pre: ["", "900"] }),
      registro("2026-10-07 09:00", { pre: ["900", "901"] }),
    ],
    templates
  ).eventos;
  const de = manaus("2026-10-05 00:00");
  const ate = manaus("2026-10-08 00:00");
  const excluir5 = new Set([manaus("2026-10-05 00:00")]);

  it("o dia excluído some do eixo, dos totais e da contagem de dias", () => {
    const r = agregar(eventos, "dia", de, ate, [], excluir5);
    expect(r.buckets.map((b) => b.rotulo)).toEqual(["06/10/2026", "07/10/2026"]);
    expect(r.total).toBeCloseTo(1, 6);
    expect(r.diasComConsumo).toBe(1);
    expect(r.leituras).toBe(1);
  });

  it("sem exclusão o dia continua entrando (o comportamento padrão não muda)", () => {
    const r = agregar(eventos, "dia", de, ate);
    expect(r.buckets).toHaveLength(3);
    expect(r.total).toBeGreaterThan(300);
  });

  it("por semana e por hora, só o dia excluído sai", () => {
    const semana = agregar(eventos, "semana", de, ate, [], excluir5);
    expect(semana.total).toBeCloseTo(1, 6);
    const hora = agregar(eventos, "hora", de, ate, [], excluir5);
    expect(hora.buckets.every((b) => !b.rotulo.startsWith("05/10"))).toBe(true);
  });

  it("leituras descartadas do dia excluído não são avisadas", () => {
    expect(agregar(eventos, "dia", de, ate, [manaus("2026-10-05 09:00")], excluir5).descartadas).toBe(0);
    expect(agregar(eventos, "dia", de, ate, [manaus("2026-10-06 09:00")], excluir5).descartadas).toBe(1);
  });
});
