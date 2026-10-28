import { describe, expect, it } from "vitest";
import {
  comoReferenciaDeAtraso,
  diaDoTurno,
  erroDaJustificativa,
  fichaJustificavel,
  horarioLocalManaus,
  instanteDoHorarioLocal,
  justificativasDoRelatorio,
  justificativasVigentes,
  MOTIVO_OUTRO,
  type JustificativaHorario,
} from "@/modules/fichas/utils/justificativaHorario";
import { calcularFichasAtrasadas, type FichaAtivaResumo } from "@/modules/bordo/api";

const just = (horarioManaus: string, extra: Partial<JustificativaHorario> = {}): JustificativaHorario => ({
  ficha_codigo: "RAC 003/011",
  setor: "Pré-resfriamento",
  horario_devido: new Date(`${horarioManaus}:00-04:00`).toISOString(),
  motivo: "Processo parado",
  detalhes: null,
  registrado_por: "u1",
  registrado_em: "2026-10-28T20:00:00Z",
  ...extra,
});

describe("fichaJustificavel", () => {
  it("vale para as fichas do PAC 11, também quando a ficha atende mais de um PAC", () => {
    expect(fichaJustificavel({ pac_correspondente: "PAC 11" })).toBe(true);
    expect(fichaJustificavel({ pac_correspondente: "PAC 3, PAC 11" })).toBe(true);
    expect(fichaJustificavel({ pac_correspondente: "PAC 1" })).toBe(false);
    expect(fichaJustificavel({ pac_correspondente: "PAC 111" })).toBe(false);
    expect(fichaJustificavel({ pac_correspondente: null })).toBe(false);
  });
});

describe("horário local de Manaus", () => {
  it("lê e escreve o campo datetime-local como horário de Manaus", () => {
    const d = instanteDoHorarioLocal("2026-10-28T09:30")!;
    expect(d.toISOString()).toBe("2026-10-28T13:30:00.000Z");
    expect(horarioLocalManaus(d)).toBe("2026-10-28T09:30");
  });
  it("recusa texto fora do formato", () => {
    expect(instanteDoHorarioLocal("")).toBeNull();
    expect(instanteDoHorarioLocal("28/10/2026 09:30")).toBeNull();
  });
  it("meia-noite de Manaus não vira 24:00", () => {
    expect(horarioLocalManaus(new Date("2026-10-28T04:00:00Z"))).toBe("2026-10-28T00:00");
  });
});

describe("erroDaJustificativa", () => {
  const agora = new Date("2026-10-28T16:00:00Z"); // 12:00 em Manaus
  const ok = { horario: "2026-10-28T09:00", motivo: "Processo parado", detalhes: "" };

  it("aceita horário passado com motivo", () => {
    expect(erroDaJustificativa(ok, agora)).toBeNull();
  });
  it("aceita horário de horas atrás no turno e do dia anterior", () => {
    expect(erroDaJustificativa({ ...ok, horario: "2026-10-28T06:00" }, agora)).toBeNull();
    expect(erroDaJustificativa({ ...ok, horario: "2026-10-27T19:00" }, agora)).toBeNull();
  });
  it("exige o horário e recusa horário no futuro", () => {
    expect(erroDaJustificativa({ ...ok, horario: "" }, agora)).toMatch(/Informe o horário/);
    expect(erroDaJustificativa({ ...ok, horario: "2026-10-28T13:00" }, agora)).toMatch(/futuro/);
  });
  it("tolera 1 minuto de adiantamento do relógio do aparelho", () => {
    expect(erroDaJustificativa({ ...ok, horario: "2026-10-28T12:00" }, agora)).toBeNull();
  });
  it("exige o motivo e, em Outro, a descrição", () => {
    expect(erroDaJustificativa({ ...ok, motivo: "  " }, agora)).toMatch(/Escolha por que/);
    expect(erroDaJustificativa({ ...ok, motivo: MOTIVO_OUTRO, detalhes: "abc" }, agora)).toMatch(/Descreva o motivo/);
    expect(erroDaJustificativa({ ...ok, motivo: MOTIVO_OUTRO, detalhes: "Queda do gerador" }, agora)).toBeNull();
  });
});

describe("justificativasVigentes", () => {
  it("para o mesmo horário vale o registro mais recente, em ordem de horário", () => {
    const antiga = just("2026-10-28T10:00", { motivo: "Processo parado", registrado_em: "2026-10-28T15:00:00Z" });
    const nova = just("2026-10-28T10:00", { motivo: "Intervenção do SIF", registrado_em: "2026-10-28T16:00:00Z" });
    const outra = just("2026-10-28T08:00");
    const r = justificativasVigentes([antiga, nova, outra]);
    expect(r.map((j) => j.motivo)).toEqual(["Processo parado", "Intervenção do SIF"]);
    expect(r[1]).toBe(nova);
    expect(r[0]).toBe(outra);
  });
  it("fichas ou setores diferentes no mesmo horário não se anulam", () => {
    const r = justificativasVigentes([just("2026-10-28T10:00"), just("2026-10-28T10:00", { ficha_codigo: "RAC 004/011" }), just("2026-10-28T10:00", { setor: "Outro" })]);
    expect(r).toHaveLength(3);
  });
});

describe("diaDoTurno", () => {
  it("a madrugada do 2º turno pertence ao dia anterior", () => {
    expect(diaDoTurno(new Date("2026-10-29T05:30:00Z"))).toBe("2026-10-28"); // 01:30 em Manaus
    expect(diaDoTurno(new Date("2026-10-29T08:00:00Z"))).toBe("2026-10-29"); // 04:00 em Manaus
    expect(diaDoTurno(new Date("2026-10-28T20:00:00Z"))).toBe("2026-10-28");
  });
});

describe("justificativasDoRelatorio", () => {
  const manha = [new Date("2026-10-28T12:00:00Z"), new Date("2026-10-28T17:00:00Z")]; // 08:00 e 13:00, 1º turno
  const contexto = { codigos: ["RAC 003/011"], setores: ["Pré-resfriamento"], instantesDosRegistros: manha };

  it("traz só a ficha, o dia e o turno do relatório", () => {
    const lista = [
      just("2026-10-28T09:00"),
      just("2026-10-28T19:00"), // 2º turno do mesmo dia
      just("2026-10-27T09:00"), // outro dia
      just("2026-10-28T10:00", { ficha_codigo: "RAC 004/011" }), // outra ficha
      just("2026-10-28T11:00", { setor: "Outro setor" }), // outro setor
      just("2026-10-28T12:00", { setor: null }), // sem setor vale para qualquer
    ];
    expect(justificativasDoRelatorio(lista, contexto).map((j) => horarioLocalManaus(new Date(j.horario_devido)))).toEqual(["2026-10-28T09:00", "2026-10-28T12:00"]);
  });
  it("relatório do 2º turno inclui a madrugada seguinte, e não a do dia anterior", () => {
    const noite = { codigos: ["RAC 003/011"], setores: [], instantesDosRegistros: [new Date("2026-10-29T00:00:00Z")] }; // 20:00 em Manaus
    const lista = [just("2026-10-28T22:00"), just("2026-10-29T01:00"), just("2026-10-28T02:00"), just("2026-10-29T10:00")];
    expect(justificativasDoRelatorio(lista, noite).map((j) => horarioLocalManaus(new Date(j.horario_devido)))).toEqual(["2026-10-28T22:00", "2026-10-29T01:00"]);
  });
  it("sem monitoramentos no relatório não há o que mostrar", () => {
    expect(justificativasDoRelatorio([just("2026-10-28T09:00")], { ...contexto, instantesDosRegistros: [] })).toEqual([]);
  });
});

describe("alarme de atraso com a justificativa", () => {
  const ficha = { id: "f1", codigo: "RAC 003/011", nome: "Absorção", tipo_apontamento: "Recorrente", tempo_entre_apontamentos_min: 60, locais_aplicacao: ["Pré-resfriamento"] } as FichaAtivaResumo;
  const ultimo = [{ ficha_template_id: "f1", criado_em: "2026-10-28T12:00:00Z" }]; // 08:00 em Manaus
  const agora = new Date("2026-10-28T15:00:00Z"); // 11:00: devido às 09:00, 2 h de atraso

  it("sem justificativa a ficha está atrasada", () => {
    expect(calcularFichasAtrasadas([ficha], ultimo, agora)).toHaveLength(1);
  });
  it("justificar o horário em atraso (09:00) dispensa o alarme até um intervalo depois", () => {
    const j = comoReferenciaDeAtraso([just("2026-10-28T10:00")]);
    expect(calcularFichasAtrasadas([ficha], ultimo, new Date("2026-10-28T15:00:00Z"), new Set(), j)).toHaveLength(0); // 11:00 < 11:00+10min
    expect(calcularFichasAtrasadas([ficha], ultimo, new Date("2026-10-28T15:20:00Z"), new Set(), j)).toHaveLength(1); // 11:20: voltou a cobrar
  });
  it("justificar um horário que já passou (anterior ao último monitoramento) não muda o alarme", () => {
    const j = comoReferenciaDeAtraso([just("2026-10-28T06:00")]);
    expect(calcularFichasAtrasadas([ficha], ultimo, agora, new Set(), j)).toHaveLength(1);
  });
  it("justificativa de outra ficha não vale", () => {
    const j = comoReferenciaDeAtraso([just("2026-10-28T10:00", { ficha_codigo: "RAC 004/011" })]);
    expect(calcularFichasAtrasadas([ficha], ultimo, agora, new Set(), j)).toHaveLength(1);
  });
});
