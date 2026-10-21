import { describe, expect, it } from "vitest";
import { casaSomenteRotaExata } from "@/shared/menuRotas";

describe("casaSomenteRotaExata", () => {
  const menuAdmin = ["/gestao", "/painel", "/bpf/aprovacoes", "/bpf", "/bpf/pcm", "/bpf/relatorios", "/sif/liberar"];

  it("item pai de outras rotas do menu só casa na rota exata", () => {
    expect(casaSomenteRotaExata("/bpf", menuAdmin)).toBe(true);
  });

  it("itens sem subrotas no menu continuam casando por prefixo como antes", () => {
    expect(casaSomenteRotaExata("/bpf/pcm", menuAdmin)).toBe(false);
    expect(casaSomenteRotaExata("/gestao", menuAdmin)).toBe(false);
  });

  it("prefixo de texto que não é subrota não conta (/pcm não é pai de /pcmx)", () => {
    expect(casaSomenteRotaExata("/pcm", ["/pcm", "/pcmx"])).toBe(false);
  });
});
