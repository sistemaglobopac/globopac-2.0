import { describe, expect, it } from "vitest";
import { leituraHerdada } from "@/modules/fichas/fields/hidrometro";

describe("leituraHerdada", () => {
  it("usa a leitura atual do monitoramento anterior", () => {
    expect(leituraHerdada({ cur: "21480", prev: "21420" })).toBe("21480");
  });

  it("tanque não lido no anterior (atual vazia): herda a última leitura real (anterior)", () => {
    // Caso real: SPR Partes de 05/10 15:32 gravou cur "" e prev "21480".
    expect(leituraHerdada({ cur: "", prev: "21480" })).toBe("21480");
  });

  it("sem nenhuma leitura ou sem registro: vazio (1º monitoramento do dia)", () => {
    expect(leituraHerdada({ cur: "", prev: "" })).toBe("");
    expect(leituraHerdada(undefined)).toBe("");
    expect(leituraHerdada(null)).toBe("");
  });
});
