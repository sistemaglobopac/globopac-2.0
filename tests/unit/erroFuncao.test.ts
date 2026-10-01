import { describe, expect, it } from "vitest";
import { erroDeFuncao } from "@/lib/erroFuncao";

describe("erroDeFuncao", () => {
  it("usa a mensagem do corpo da Edge Function em vez do texto genérico", async () => {
    const resposta = new Response(JSON.stringify({ erro: 'O usuário "ana" já está cadastrado e ativo.' }), { status: 409 });
    const erro = await erroDeFuncao({ message: "Edge Function returned a non-2xx status code", context: resposta });
    expect(erro.message).toBe('O usuário "ana" já está cadastrado e ativo.');
  });

  it("sem corpo legível devolve o erro original", async () => {
    const original = new Error("falha de rede");
    expect(await erroDeFuncao(original)).toBe(original);
    const semJson = new Response("texto", { status: 500 });
    expect((await erroDeFuncao({ message: "x", context: semJson })).message).toBe("x");
  });
});

import { statusDeFuncao } from "@/lib/erroFuncao";

describe("statusDeFuncao", () => {
  it("lê o status HTTP da resposta da função", () => {
    expect(statusDeFuncao({ context: new Response("", { status: 401 }) })).toBe(401);
    expect(statusDeFuncao(new Error("x"))).toBeUndefined();
    expect(statusDeFuncao(null)).toBeUndefined();
  });
});
