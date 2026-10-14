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

  it("só o aditivo mais recente da cadeia conta como concluído", () => {
    const dois = { dados_dinamicos: { adendos: [{ id: "a1", status: "pending_monitor" }, { id: "a2", status: "pending_monitor" }] } };
    const ad1 = { id: "x", aditivo_de: "orig", criado_em: "2026-10-13T10:29:53Z", dados_dinamicos: { adendos: [{ id: "a1", status: "completed" }, { id: "a2", status: "pending_monitor" }] } };
    const ad2 = { id: "y", aditivo_de: "orig", criado_em: "2026-10-13T10:30:01Z", dados_dinamicos: { adendos: [{ id: "a1", status: "pending_monitor" }, { id: "a2", status: "completed" }] } };
    expect([...idsAdendosConcluidos([ad1, ad2])]).toEqual(["a2"]);
    expect([...idsAdendosConcluidos([ad2, ad1])]).toEqual(["a2"]); // independe da ordem da lista
    expect(temAdendoPendente(ad2, idsAdendosConcluidos([ad2]))).toBe(true); // a1 ainda não está aplicado na versão vigente
    expect(temAdendoPendente(dois, idsAdendosConcluidos([ad1, ad2]))).toBe(true);
  });

  it("registro sem adendos não tem pendência", () => {
    expect(temAdendoPendente({ dados_dinamicos: {} }, new Set())).toBe(false);
  });
});
