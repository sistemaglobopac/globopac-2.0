import { describe, expect, it } from "vitest";
import { CHAVE_CORRECOES_PROPAGADAS, mesmaLeitura, propagarLeituraNosSeguintes } from "@/modules/fichas/utils/propagacaoCorrecao";

const tanque = (prev: string, cur: string) => ({ prev, cur, ice: "" });
const dados = (prev: string, cur: string) => ({ campo_1: { tanques: { chiller1: tanque(prev, cur), chiller2: tanque("5", "6") } } });
const AGORA = "2026-10-14T12:00:00.000Z";

function rodar(seguintes: { id: string; dados: Record<string, unknown> }[], antigo: string, novo: string, prevDoOrigem = "90") {
  const correcoes = { "campo_1.tanques.chiller1.cur": { old: antigo, new: novo } };
  return propagarLeituraNosSeguintes({
    origemId: "origem",
    adendoId: "ad-1",
    dadosCorrigidos: dados(prevDoOrigem, novo),
    correcoes,
    seguintes,
    agora: AGORA,
  });
}

describe("propagarLeituraNosSeguintes", () => {
  it("acerta a leitura anterior do monitoramento seguinte e para no que leu o tanque", () => {
    const r = rodar([{ id: "9h", dados: dados("100", "110") }, { id: "10h", dados: dados("110", "120") }], "100", "104");
    expect(r.map((x) => x.id)).toEqual(["9h"]);
    expect((r[0]!.dados.campo_1 as ReturnType<typeof dados>["campo_1"]).tanques.chiller1.prev).toBe("104");
    expect((r[0]!.dados.campo_1 as ReturnType<typeof dados>["campo_1"]).tanques.chiller1.cur).toBe("110");
    expect(r[0]!.correcoes[0]).toMatchObject({ origemId: "origem", adendoId: "ad-1", caminho: "campo_1.tanques.chiller1.prev", de: "100", para: "104" });
  });

  it("continua pelos seguintes que não leram o tanque (herdam a anterior)", () => {
    const r = rodar([{ id: "9h", dados: dados("100", "") }, { id: "10h", dados: dados("100", "") }, { id: "11h", dados: dados("100", "130") }, { id: "12h", dados: dados("130", "140") }], "100", "104");
    expect(r.map((x) => x.id)).toEqual(["9h", "10h", "11h"]);
  });

  it("não mexe se a leitura anterior do seguinte não era a antiga herdada", () => {
    expect(rodar([{ id: "9h", dados: dados("77", "110") }], "100", "104")).toEqual([]);
  });

  it("leitura atual do origem vazia herda a anterior dele", () => {
    // origem tinha cur vazio (seguinte herdou prev=90) e o adendo preencheu 95
    const r = rodar([{ id: "9h", dados: dados("90", "110") }], "", "95", "90");
    expect(r[0]!.dados.campo_1).toMatchObject({ tanques: { chiller1: { prev: "95" } } });
  });

  it("ignora correção que não é leitura atual e correção sem efeito na herança", () => {
    const seguintes = [{ id: "9h", dados: dados("100", "110") }];
    expect(
      propagarLeituraNosSeguintes({
        origemId: "o", adendoId: "a", dadosCorrigidos: dados("90", "100"), seguintes, agora: AGORA,
        correcoes: { "campo_1.tanques.chiller1.ice": { old: "1", new: "2" } },
      })
    ).toEqual([]);
    expect(rodar(seguintes, "100", "100,0")).toEqual([]);
  });

  it("acumula o registro de propagações em correcoes_propagadas", () => {
    const base = { ...dados("100", "110"), [CHAVE_CORRECOES_PROPAGADAS]: [{ origemId: "x" }] };
    const r = rodar([{ id: "9h", dados: base }], "100", "104");
    expect((r[0]!.dados[CHAVE_CORRECOES_PROPAGADAS] as unknown[]).length).toBe(2);
  });
});

describe("mesmaLeitura", () => {
  it("compara números com vírgula e ignora zeros à direita", () => {
    expect(mesmaLeitura("100,50", "100.5")).toBe(true);
    expect(mesmaLeitura("", "")).toBe(true);
    expect(mesmaLeitura("", "0")).toBe(false);
  });
});
