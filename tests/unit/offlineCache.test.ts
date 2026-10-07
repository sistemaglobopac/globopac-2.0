import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { garantirCacheDoUsuario, gravarConsulta, hidratarConsultas, instalarPersistenciaOffline, lerConsultas, limparConsultas, limparConsultasDoUsuario } from "@/lib/offlineCache";
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

  it("cada usuário tem o próprio cache: o outro nunca vê os dados dele, e o dele volta ao reentrar", async () => {
    const qc = new QueryClient();
    expect(await garantirCacheDoUsuario("usuario-1", qc)).toBe(false);
    await gravarConsulta(["dados", "usuario-1"], { x: 1 });
    expect(await garantirCacheDoUsuario("usuario-1", qc)).toBe(false);
    expect((await lerConsultas()).length).toBe(1);

    qc.setQueryData(["dados", "usuario-1"], { x: 1 });
    expect(await garantirCacheDoUsuario("usuario-2", qc)).toBe(true);
    expect(await lerConsultas()).toHaveLength(0);
    expect(qc.getQueryData(["dados", "usuario-1"])).toBeUndefined();

    // o cache do usuário 1 continua guardado e volta quando ele entra de novo (offline inclusive)
    expect(await garantirCacheDoUsuario("usuario-1", qc)).toBe(true);
    expect(qc.getQueryData(["dados", "usuario-1"])).toEqual({ x: 1 });
  });

  it("apagar o cache de um usuário não mexe no dos outros", async () => {
    const qc = new QueryClient();
    await garantirCacheDoUsuario("usuario-1", qc);
    await gravarConsulta(["a"], 1);
    await garantirCacheDoUsuario("usuario-2", qc);
    await gravarConsulta(["b"], 2);

    await limparConsultasDoUsuario("usuario-1");
    expect(await lerConsultas("usuario-1")).toHaveLength(0);
    expect(await lerConsultas("usuario-2")).toHaveLength(1);
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
