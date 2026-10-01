import { describe, expect, it } from "vitest";
import {
  agruparPorDossie,
  chaveDossie,
  groupFichaCards,
  type AppointmentDisplay,
  type MonitoramentoVerificacao,
} from "@/modules/fichas/utils/recordGrouping";

// Manaus = UTC-4. 2026-10-01 10:00/11:00/12:30 locais = 14:00Z/15:00Z/16:30Z (todos 1º turno).
const mon = (id: string, user: string, criado_em: string, ficha = "t1"): MonitoramentoVerificacao => ({
  id,
  ficha_template_id: ficha,
  user_id: user,
  setor: "EVISCERAÇÃO 01",
  dados_dinamicos: {},
  conformidade: null,
  verificado_por: null,
  verificado_em: null,
  criado_em,
  capturado_em: null,
});

const B = "inspetor-b";
const A = "inspetor-a";
const itens = [
  mon("m3", A, "2026-10-01T16:30:00Z"), // A cobre o almoço de B: 3ª apuração
  mon("m1", B, "2026-10-01T14:00:00Z"),
  mon("m2", B, "2026-10-01T15:00:00Z"),
];

describe("cobertura de almoço: A dá sequência aos monitoramentos de B", () => {
  it("a chave do relatório consolidado não separa por inspetor", () => {
    expect(chaveDossie(itens[0]!)).toBe(chaveDossie(itens[1]!));
  });

  it("continua separando por turno, dia e tipo de ficha", () => {
    const base = chaveDossie(itens[1]!);
    expect(chaveDossie(mon("x", B, "2026-10-02T00:30:00Z"))).not.toBe(base); // 20:30 Manaus = 2º turno
    expect(chaveDossie(mon("x", B, "2026-10-02T14:00:00Z"))).not.toBe(base); // outro dia
    expect(chaveDossie(mon("x", B, "2026-10-01T14:00:00Z", "t2"))).not.toBe(base); // outra ficha
  });

  it("agruparPorDossie junta B e A em um só relatório, em ordem de horário", () => {
    const grupos = agruparPorDossie(itens);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.items.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("o dossiê de verificação reúne os dois inspetores", () => {
    const display: AppointmentDisplay[] = itens.map((appt, i) => ({ id: appt.id, status: "aguardando", appt, ordemDia: i + 1 }));
    const { dossies, avulsos } = groupFichaCards(
      display,
      new Set(),
      new Map([
        [A, "Ana"],
        [B, "Bruno"],
      ]),
      new Map([["t1", "PAC 14"]]),
      new Map([["t1", "RAC-001/014"]])
    );
    expect(avulsos).toHaveLength(0);
    expect(dossies).toHaveLength(1);
    const d = dossies[0]!;
    expect(d.ids).toEqual(["m1", "m2", "m3"]);
    expect([...d.userIds].sort()).toEqual([A, B]);
    expect(d.inspetorNome).toBe("Bruno / Ana");
  });
});
