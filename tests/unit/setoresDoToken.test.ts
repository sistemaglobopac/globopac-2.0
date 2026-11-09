import { describe, expect, it } from "vitest";
import { setoresDoToken } from "@/modules/auth/useSincronizarSetores";

/** Monta um JWT de teste (só o payload importa) com base64url e UTF-8, como o Supabase emite. */
function jwt(payload: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `cabecalho.${b64}.assinatura`;
}

describe("setores que vêm no token de acesso", () => {
  it("lê o claim setores_permitidos, com acentos", () => {
    expect(setoresDoToken(jwt({ setores_permitidos: ["MANUTENÇÕES DIVERSAS", "PRÉ-RESFRIAMENTO 01"] }))).toEqual(["MANUTENÇÕES DIVERSAS", "PRÉ-RESFRIAMENTO 01"]);
  });

  it("claim ausente vira lista vazia (token sem setor)", () => {
    expect(setoresDoToken(jwt({ sub: "x" }))).toEqual([]);
  });

  it("token ausente ou ilegível devolve null (não força renovação)", () => {
    expect(setoresDoToken(undefined)).toBeNull();
    expect(setoresDoToken("lixo")).toBeNull();
    expect(setoresDoToken("a.%%%.c")).toBeNull();
  });
});
