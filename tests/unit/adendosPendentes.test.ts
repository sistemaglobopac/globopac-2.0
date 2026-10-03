import { describe, expect, it } from "vitest";
import { idsAdendosConcluidos, temAdendoPendente } from "@/modules/fichas/utils/adendosPendentes";

const original = { dados_dinamicos: { adendos: [{ id: "a1", status: "pending_monitor" }] } };

describe("adendos pendentes", () => {
  it("sem aditivo o adendo segue pendente", () => {
    expect(temAdendoPendente(original, idsAdendosConcluidos([original]))).toBe(true);
  });

  it("aditivo com o adendo concluído resolve a pendência do original", () => {
    const aditivo = { aditivo_de: "orig", dados_dinamicos: { adendos: [{ id: "a1", status: "completed" }] } };
    expect(temAdendoPendente(original, idsAdendosConcluidos([original, aditivo]))).toBe(false);
  });

  it("um segundo adendo aberto depois continua pendente", () => {
    const dois = { dados_dinamicos: { adendos: [{ id: "a1", status: "pending_monitor" }, { id: "a2", status: "pending_monitor" }] } };
    const aditivo = { aditivo_de: "orig", dados_dinamicos: { adendos: [{ id: "a1", status: "completed" }] } };
    expect(temAdendoPendente(dois, idsAdendosConcluidos([dois, aditivo]))).toBe(true);
  });

  it("registro sem adendos não tem pendência", () => {
    expect(temAdendoPendente({ dados_dinamicos: {} }, new Set())).toBe(false);
  });
});
