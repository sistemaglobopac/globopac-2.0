import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lerCienciaObservacoes, registrarCienciaObservacoes } from "@/modules/bpf/cienciaObservacoes";

beforeEach(() => {
  const memoria = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => void memoria.set(k, v),
    removeItem: (k: string) => void memoria.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("ciência das observações pelo PCM", () => {
  it("guarda por usuário e soma às já lidas, sem repetir", () => {
    registrarCienciaObservacoes("u1", ["a", "b"]);
    registrarCienciaObservacoes("u1", ["b", "c"]);
    registrarCienciaObservacoes("u2", ["z"]);
    expect([...lerCienciaObservacoes("u1")].sort()).toEqual(["a", "b", "c"]);
    expect([...lerCienciaObservacoes("u2")]).toEqual(["z"]);
    expect(lerCienciaObservacoes("outro").size).toBe(0);
  });
  it("mantém só as 500 mais recentes", () => {
    registrarCienciaObservacoes("u1", Array.from({ length: 600 }, (_, i) => `id-${i}`));
    const lidas = lerCienciaObservacoes("u1");
    expect(lidas.size).toBe(500);
    expect(lidas.has("id-599")).toBe(true);
    expect(lidas.has("id-0")).toBe(false);
  });
  it("conteúdo estragado no armazenamento vira lista vazia, sem erro", () => {
    localStorage.setItem("bpf-pcm-observacoes-cientes:u1", "{não é json");
    expect(lerCienciaObservacoes("u1").size).toBe(0);
    localStorage.setItem("bpf-pcm-observacoes-cientes:u1", JSON.stringify({ a: 1 }));
    expect(lerCienciaObservacoes("u1").size).toBe(0);
    localStorage.setItem("bpf-pcm-observacoes-cientes:u1", JSON.stringify(["ok", 3, null]));
    expect([...lerCienciaObservacoes("u1")]).toEqual(["ok"]);
  });
  it("sem armazenamento disponível não quebra", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(lerCienciaObservacoes("u1").size).toBe(0);
    expect(() => registrarCienciaObservacoes("u1", ["a"])).not.toThrow();
  });
});
