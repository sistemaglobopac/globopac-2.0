import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { garantirCacheDoUsuario, gravarConsulta, hidratarConsultas, instalarPersistenciaOffline, lerConsultas, limparConsultas } from "@/lib/offlineCache";
import { ehFalhaDeRede } from "@/modules/auth/useAuthListener";

describe("cache local das consultas de preenchimento (offline)", () => {
  beforeEach(async () => {
    await limparConsultas();
  });

  it("grava e hidrata no QueryClient, inclusive Map e Set", async () => {
    await gravarConsulta(["fichas_templates", "ativos"], [{ id: "a", nome: "Ficha A" }], 1_000);
    await gravarConsulta(["ultimos", "setor"], { mapaUltimos: new Map([["COD", "2026-10-05T10:00:00Z"]]), fichasComDesvio: new Set(["COD"]) }, 2_000);

    const qc = new QueryClient();
    await hidratarConsultas(qc);

    expect(qc.getQueryData(["fichas_templates", "ativos"])).toEqual([{ id: "a", nome: "Ficha A" }]);
    const ultimos = qc.getQueryData<{ mapaUltimos: Map<string, string>; fichasComDesvio: Set<string> }>(["ultimos", "setor"]);
    expect(ultimos?.mapaUltimos.get("COD")).toBe("2026-10-05T10:00:00Z");
    expect(ultimos?.fichasComDesvio.has("COD")).toBe(true);
    // a hora do último acesso com rede é preservada (não vira "agora")
    expect(qc.getQueryState(["fichas_templates", "ativos"])?.dataUpdatedAt).toBe(1_000);
  });

  it("só persiste consultas marcadas com meta.offline", async () => {
    const qc = new QueryClient();
    const parar = instalarPersistenciaOffline(qc);
    await qc.fetchQuery({ queryKey: ["marcada"], queryFn: async () => ({ ok: 1 }), meta: { offline: true } });
    await qc.fetchQuery({ queryKey: ["nao-marcada"], queryFn: async () => ({ ok: 2 }) });
    parar();
    await new Promise((r) => setTimeout(r, 50));

    const chaves = (await lerConsultas()).map((e) => JSON.stringify(e.queryKey));
    expect(chaves).toEqual([JSON.stringify(["marcada"])]);
  });

  it("outro usuário no mesmo aparelho começa com o cache limpo", async () => {
    const qc = new QueryClient();
    await garantirCacheDoUsuario("usuario-1", qc);
    await gravarConsulta(["dados", "usuario-1"], { x: 1 });
    expect(await garantirCacheDoUsuario("usuario-1", qc)).toBe(false);
    expect((await lerConsultas()).length).toBe(1);

    expect(await garantirCacheDoUsuario("usuario-2", qc)).toBe(true);
    expect(await lerConsultas()).toHaveLength(0);
  });
});

describe("ehFalhaDeRede", () => {
  it("falha de rede sim; erro de banco/RLS (com code) ou ausência de erro não", () => {
    expect(ehFalhaDeRede({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(ehFalhaDeRede({ message: "signal timed out" })).toBe(true);
    expect(ehFalhaDeRede({ message: "x", status: 0 })).toBe(true);
    expect(ehFalhaDeRede({ message: "permission denied", code: "42501" })).toBe(false);
    expect(ehFalhaDeRede(null)).toBe(false);
  });
});
