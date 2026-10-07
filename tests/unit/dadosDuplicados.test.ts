import { describe, expect, it } from "vitest";
import { assinaturaDosDados, dadosJaRegistrados } from "@/modules/fichas/utils/dadosDuplicados";

const base = { campo_1: "12,5", campo_2: { itens: [{ a: 1, b: "x" }] }, hora_monitoramento: "2026-10-07T13:00:00.000Z" };

describe("trava de dados repetidos", () => {
  it("ignora a hora do monitoramento e a ordem das chaves", () => {
    const outro = { campo_2: { itens: [{ b: "x", a: 1 }] }, hora_monitoramento: "2026-10-07T15:00:00.000Z", campo_1: "12,5" };
    expect(dadosJaRegistrados(outro, [base])).toBe(true);
  });

  it("um único dado diferente já libera o registro", () => {
    expect(dadosJaRegistrados({ ...base, campo_1: "12,6" }, [base])).toBe(false);
    expect(dadosJaRegistrados({ ...base, campo_2: { itens: [{ a: 2, b: "x" }] } }, [base])).toBe(false);
  });

  it("ignora marcas de controle (adendos, continuação, aguardando peso)", () => {
    const registrado = { ...base, adendos: [{ id: "a1" }], continuacao_de: { registroId: "r" }, aguardando_peso: true };
    expect(dadosJaRegistrados(base, [registrado])).toBe(true);
  });

  it("campos indefinidos não contam como dado", () => {
    expect(assinaturaDosDados({ campo_1: "1", campo_3: undefined })).toBe(assinaturaDosDados({ campo_1: "1" }));
  });

  it("sem registros ou sem dados medidos não há repetição", () => {
    expect(dadosJaRegistrados(base, [])).toBe(false);
    expect(dadosJaRegistrados({ hora_monitoramento: "x" }, [{ hora_monitoramento: "y" }])).toBe(false);
    expect(dadosJaRegistrados(base, [null, undefined])).toBe(false);
  });
});
