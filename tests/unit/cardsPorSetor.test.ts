import { describe, expect, it } from "vitest";
import { agruparPorSetor, groupFichaCards, type AppointmentDisplay, type MonitoramentoVerificacao } from "@/modules/fichas/utils/recordGrouping";

// Manaus = UTC-4; todos no 1º turno de 2026-10-01.
const mon = (id: string, setor: string, criado_em: string, ficha = "t1"): MonitoramentoVerificacao => ({
  id,
  ficha_template_id: ficha,
  user_id: "u1",
  setor,
  dados_dinamicos: {},
  conformidade: null,
  verificado_por: null,
  verificado_em: null,
  criado_em,
  capturado_em: null,
});
const exibir = (itens: MonitoramentoVerificacao[]): AppointmentDisplay[] => itens.map((appt, i) => ({ id: appt.id, status: "aguardando", appt, ordemDia: i + 1 }));
const pacs = new Map([["t1", "PAC 14"], ["t2", "PAC 15"]]);
const codigos = new Map([["t1", "RAC-001/014"], ["t2", "RAC-002/015"]]);
const agrupar = (itens: MonitoramentoVerificacao[], porSetor?: boolean) =>
  groupFichaCards(exibir(itens), new Set(), new Map(), pacs, codigos, undefined, porSetor === undefined ? undefined : { porSetor });

const itens = [
  mon("a1", "EVISCERAÇÃO", "2026-10-01T14:00:00Z"),
  mon("a2", "EVISCERAÇÃO", "2026-10-01T15:00:00Z"),
  mon("b1", "SALA DE CORTES", "2026-10-01T14:30:00Z"),
  mon("b2", "SALA DE CORTES", "2026-10-01T15:30:00Z"),
  mon("c1", "EXPEDIÇÃO", "2026-10-01T15:00:00Z", "t2"),
];

describe("cards do painel de verificação separados por setor", () => {
  it("sem porSetor, a mesma ficha de setores diferentes continua num único dossiê (arquivo/auditoria)", () => {
    const { dossies } = agrupar(itens);
    expect(dossies).toHaveLength(1);
    expect(dossies[0]!.ids.sort()).toEqual(["a1", "a2", "b1", "b2"]);
    expect(dossies[0]!.setor).toBe("EVISCERAÇÃO / SALA DE CORTES");
  });

  it("com porSetor, cada setor tem o seu dossiê e nenhum mistura setores", () => {
    const { dossies, avulsos } = agrupar(itens, true);
    expect(dossies).toHaveLength(2);
    expect(dossies.map((d) => d.setor).sort()).toEqual(["EVISCERAÇÃO", "SALA DE CORTES"]);
    for (const d of dossies) expect(new Set(d.items.map((i) => i.appt.setor)).size).toBe(1);
    expect(avulsos.map((a) => a.id)).toEqual(["c1"]);
  });

  it("um setor com um único registro da ficha vira avulso, não dossiê", () => {
    const { dossies, avulsos } = agrupar([mon("a1", "EVISCERAÇÃO", "2026-10-01T14:00:00Z"), mon("b1", "SALA DE CORTES", "2026-10-01T14:30:00Z")], true);
    expect(dossies).toHaveLength(0);
    expect(avulsos.map((a) => a.id).sort()).toEqual(["a1", "b1"]);
  });

  it("agruparPorSetor monta uma seção por setor, em ordem alfabética, com dossiês antes dos avulsos", () => {
    const { dossies, avulsos } = agrupar(itens, true);
    const secoes = agruparPorSetor(dossies, avulsos);
    expect(secoes.map((s) => s.setor)).toEqual(["EVISCERAÇÃO", "EXPEDIÇÃO", "SALA DE CORTES"]);
    expect(secoes[0]!.dossies).toHaveLength(1);
    expect(secoes[0]!.avulsos).toHaveLength(0);
    expect(secoes[1]!.dossies).toHaveLength(0);
    expect(secoes[1]!.avulsos.map((a) => a.id)).toEqual(["c1"]);
    expect(secoes[2]!.dossies[0]!.ids).toEqual(["b1", "b2"]);
  });

  it("sem registros, nenhuma seção", () => {
    expect(agruparPorSetor([], [])).toEqual([]);
  });
});
