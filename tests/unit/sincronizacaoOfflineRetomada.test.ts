import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => {
      if (tabela === "monitoramentos") return { upsert: (...a: unknown[]) => ({ abortSignal: () => upsert(...a) }) };
      // assinaturas_eletronicas: ainda não assinado
      const cadeia: Record<string, unknown> = {};
      for (const m of ["select", "eq", "limit"]) cadeia[m] = () => cadeia;
      cadeia.abortSignal = () => Promise.resolve({ data: [], error: null });
      return cadeia;
    },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

import { atualizarStatusFicha, enfileirarFicha, listarFichasEnfileiradas, removerFichaEnfileirada } from "@/lib/offlineQueue";
import { sincronizarFilaOffline } from "@/modules/fichas/sincronizacaoOffline";

const BASE = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  fichaTemplateId: "11111111-1111-1111-1111-111111111111",
  versaoTemplate: 1,
  userId: "22222222-2222-2222-2222-222222222222",
  setor: "LINHA_DIF",
  dadosDinamicos: {},
  capturadoEm: "2026-10-13T12:00:00.000Z",
};

describe("sincronização da fila — retomada do item preso em 'sincronizando'", () => {
  beforeEach(async () => {
    upsert.mockReset().mockResolvedValue({ error: null });
    invoke.mockReset().mockResolvedValue({ error: null });
    await Promise.all((await listarFichasEnfileiradas()).map((i) => removerFichaEnfileirada(i.id)));
  });

  it("item que ficou 'sincronizando' (app fechado no meio) é retomado, assinado e sai da fila", async () => {
    await enfileirarFicha(BASE);
    await atualizarStatusFicha(BASE.id, "sincronizando");
    // simula o estado antigo preso: sem marca de início
    const db = await listarFichasEnfileiradas();
    expect(db[0]!.status).toBe("sincronizando");
    const { openDB } = await import("idb");
    const conexao = await openDB("globopac-fila-offline", 1);
    const item = await conexao.get("fichas_pendentes", BASE.id);
    delete item.sincronizandoDesde;
    await conexao.put("fichas_pendentes", item);

    const r = await sincronizarFilaOffline();
    expect(r.sincronizadas).toEqual([BASE.id]);
    expect(invoke).toHaveBeenCalledWith("assinar-documento", expect.objectContaining({ body: { monitoramento_id: BASE.id, tipo: "INSPETOR" } }));
    expect(await listarFichasEnfileiradas()).toHaveLength(0);
  });

  it("tentativa 'sincronizando' recente (em curso em outra aba) não é pisada", async () => {
    await enfileirarFicha(BASE);
    await atualizarStatusFicha(BASE.id, "sincronizando");
    const r = await sincronizarFilaOffline();
    expect(r.sincronizadas).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
    expect(await listarFichasEnfileiradas()).toHaveLength(1);
  });
});
