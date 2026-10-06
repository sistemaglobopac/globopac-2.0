import { describe, expect, it } from "vitest";
import { instanteDoRegistro } from "@/modules/fichas/utils/horaMonitoramento";
import { calcularOrdemDia, chaveDossie, groupFichaCards, type AppointmentDisplay, type MonitoramentoVerificacao } from "@/modules/fichas/utils/recordGrouping";
import { turnoDoRegistro } from "@/modules/fichas/utils/turnoUtils";

// Ontem (05/10), a vazão foi monitorada às 08:00, 10:00 e 15:30 (Manaus). Os monitoramentos que faltaram foram lançados
// HOJE (06/10, 07:10) como continuação, com a hora real em que foram realizados (16:45 de ontem).
const m = (id: string, criado: string, hora: string | null, user = "u1"): MonitoramentoVerificacao => ({
  id,
  ficha_template_id: "t1",
  user_id: user,
  setor: "PRÉ-RESFRIAMENTO 02",
  dados_dinamicos: hora ? { hora_monitoramento: hora } : {},
  conformidade: null,
  verificado_por: null,
  verificado_em: null,
  criado_em: criado,
  hora_monitoramento: hora,
  capturado_em: null,
});

const ontem1 = m("o1", "2026-10-05T12:00:00Z", null); // 08:00 Manaus (registro antigo: sem hora informada)
const ontem2 = m("o2", "2026-10-05T14:00:00Z", "2026-10-05T14:00:00Z");
const ontem3 = m("o3", "2026-10-05T19:32:00Z", "2026-10-05T19:32:00Z"); // 15:32
const continuacao = m("c1", "2026-10-06T11:10:00Z", "2026-10-05T20:45:00Z"); // gravada hoje 07:10, realizada ontem 16:45
const hoje1 = m("h1", "2026-10-06T10:00:00Z", "2026-10-06T10:00:00Z"); // primeiro de hoje, 06:00

const item = (appt: MonitoramentoVerificacao): AppointmentDisplay => ({ id: appt.id, status: "aguardando", appt, ordemDia: 1 });
const grupos = (lista: MonitoramentoVerificacao[]) =>
  groupFichaCards(lista.map(item), new Set(), new Map(), new Map([["t1", "PAC"]]), new Map([["t1", "RAC-001/006 V2"]]));

describe("continuação de um monitoramento de ontem fica no consolidado de ontem", () => {
  it("instanteDoRegistro: a hora informada vale; registro antigo cai em criado_em; vale também o que está no dado assinado", () => {
    expect(instanteDoRegistro(continuacao)).toBe("2026-10-05T20:45:00Z");
    expect(instanteDoRegistro(ontem1)).toBe("2026-10-05T12:00:00Z");
    expect(instanteDoRegistro({ criado_em: "2026-10-06T11:10:00Z", dados_dinamicos: { hora_monitoramento: "2026-10-05T20:45:00Z" } })).toBe("2026-10-05T20:45:00Z");
  });

  it("o dossiê de ontem recebe a continuação; hoje fica só com o primeiro de hoje", () => {
    const { dossies, avulsos } = grupos([ontem1, ontem2, ontem3, continuacao, hoje1]);
    expect(dossies).toHaveLength(1);
    expect(dossies[0]!.dia).toBe("2026-10-05");
    expect(dossies[0]!.ids).toEqual(["o1", "o2", "o3", "c1"]); // em ordem de hora de realização
    expect(avulsos.map((a) => a.id)).toEqual(["h1"]); // o primeiro de hoje não leva a continuação
  });

  it("a continuação não vira o 'primeiro monitoramento de hoje'", () => {
    // sem os de ontem na tela, a continuação continua sendo de ontem (um dossiê avulso de ontem, não de hoje)
    const { dossies, avulsos } = grupos([continuacao, hoje1]);
    expect(dossies).toHaveLength(0);
    const chaveC = chaveDossie(continuacao);
    const chaveH = chaveDossie(hoje1);
    expect(chaveC.startsWith("2026-10-05")).toBe(true);
    expect(chaveH.startsWith("2026-10-06")).toBe(true);
    expect(avulsos.map((a) => a.id).sort()).toEqual(["c1", "h1"]);
  });

  it("numeração 'Monitoramento nº' do dia segue a hora de realização", () => {
    const ordem = calcularOrdemDia([ontem1, ontem2, ontem3, continuacao, hoje1]);
    expect(ordem.get("o1")).toBe(1);
    expect(ordem.get("o3")).toBe(3);
    expect(ordem.get("c1")).toBe(4); // 4º de ontem, não o 2º de hoje
    expect(ordem.get("h1")).toBe(1); // o primeiro de hoje continua sendo o 1º
  });

  it("o turno da continuação é o do instante em que foi realizada (ontem à tarde = 1º turno)", () => {
    expect(turnoDoRegistro(continuacao, [])).toBe("1º Turno");
    // gravada às 07:10 de hoje (1º turno do relógio) mas realizada ontem às 19:30 Manaus (23:30Z): 2º turno
    expect(turnoDoRegistro(m("c2", "2026-10-06T11:10:00Z", "2026-10-06T03:30:00Z"), [])).toBe("2º Turno");
  });
});
