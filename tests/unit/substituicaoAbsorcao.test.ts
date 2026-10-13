import { describe, expect, it } from "vitest";
import { coincidenciaDePesos, itensDeAbsorcao, ordenarCandidatos } from "@/modules/fichas/fields/substituicaoAbsorcao";
import type { AmostraAbsorcaoAgua } from "@/modules/fichas/fields/tiposCompostos";

const item = (id: number, seal: string, initial: string, final = ""): AmostraAbsorcaoAgua => ({ id, seal, initial, final });
const dados = (itens: AmostraAbsorcaoAgua[]) => ({ campo_absorcao: { items: itens }, outro: { x: 1 }, texto: "a" });

describe("substituição de absorção em andamento", () => {
  it("acha os itens do teste em qualquer chave do dados_dinamicos", () => {
    expect(itensDeAbsorcao(dados([item(0, "A1", "2.5")]))).toHaveLength(1);
    expect(itensDeAbsorcao({ vazao: { cargas: [] }, nome: "x" })).toEqual([]);
    expect(itensDeAbsorcao(null)).toEqual([]);
  });

  it("conta os pesos iniciais do pendente que reaparecem no candidato, cada peso uma vez", () => {
    const pendente = [item(0, "750", "2747"), item(1, "783", "2721"), item(2, "712", "2200"), item(3, "719", "2200")];
    const candidato = [item(0, "7501", "2747"), item(1, "7830", "2721"), item(2, "7120", "2200"), item(3, "7190", "2220")];
    expect(coincidenciaDePesos(pendente, candidato)).toEqual({ iguais: 3, total: 4 });
  });

  it("ordena pelos candidatos mais parecidos e ignora quem não é absorção", () => {
    const pendente = dados([item(0, "750", "2747"), item(1, "783", "2721")]);
    const parecido = { id: "b", user_id: "u2", criado_em: "2026-10-13T10:42:00Z", hora_monitoramento: null, dados_dinamicos: dados([item(0, "7501", "2747"), item(1, "7830", "2721")]) };
    const diferente = { id: "c", user_id: "u3", criado_em: "2026-10-13T10:30:00Z", hora_monitoramento: null, dados_dinamicos: dados([item(0, "1", "1000")]) };
    const outraFicha = { id: "d", user_id: "u4", criado_em: "2026-10-13T10:31:00Z", hora_monitoramento: null, dados_dinamicos: { vazao: { cargas: [] } } };
    const r = ordenarCandidatos(pendente, [diferente, outraFicha, parecido]);
    expect(r.map((c) => c.id)).toEqual(["b", "c"]);
    expect(r[0]!.coincidencia).toEqual({ iguais: 2, total: 2 });
  });
});
