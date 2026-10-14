import { beforeEach, describe, expect, it } from "vitest";
import {
  atualizarStatusFicha,
  enfileirarFicha,
  estaOffline,
  listarFichasEnfileiradas,
  removerFichaEnfileirada,
  tentativaAbandonada,
} from "@/lib/offlineQueue";

const RASCUNHO_BASE = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  fichaTemplateId: "11111111-1111-1111-1111-111111111111",
  versaoTemplate: 1,
  userId: "22222222-2222-2222-2222-222222222222",
  setor: "LINHA_DIF",
  dadosDinamicos: { temperatura_celsius: 5 },
  capturadoEm: "2026-01-01T10:00:00.000Z",
};

async function limparFila() {
  const itens = await listarFichasEnfileiradas();
  await Promise.all(itens.map((item) => removerFichaEnfileirada(item.id)));
}

describe("offlineQueue", () => {
  beforeEach(async () => {
    await limparFila();
  });

  it("enfileira uma ficha com o id informado e status inicial 'pendente'", async () => {
    const item = await enfileirarFicha(RASCUNHO_BASE);
    expect(item.id).toBe(RASCUNHO_BASE.id);
    expect(item.status).toBe("pendente");

    const fila = await listarFichasEnfileiradas();
    expect(fila).toHaveLength(1);
    expect(fila[0].id).toBe(item.id);
    expect(fila[0].setor).toBe("LINHA_DIF");
  });

  it("lista em ordem de enfileiramento (mais antiga primeiro)", async () => {
    const primeira = await enfileirarFicha({
      ...RASCUNHO_BASE,
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      capturadoEm: "2026-01-01T09:00:00.000Z",
    });
    await new Promise((r) => setTimeout(r, 2));
    const segunda = await enfileirarFicha({
      ...RASCUNHO_BASE,
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      capturadoEm: "2026-01-01T10:00:00.000Z",
    });

    const fila = await listarFichasEnfileiradas();
    expect(fila.map((f) => f.id)).toEqual([primeira.id, segunda.id]);
  });

  it("atualiza status e último erro, preservando os demais campos", async () => {
    const item = await enfileirarFicha(RASCUNHO_BASE);
    await atualizarStatusFicha(item.id, "falhou", "offline");

    const [atualizado] = await listarFichasEnfileiradas();
    expect(atualizado.status).toBe("falhou");
    expect(atualizado.ultimoErro).toBe("offline");
    expect(atualizado.setor).toBe("LINHA_DIF");
  });

  it("remove uma ficha da fila", async () => {
    const item = await enfileirarFicha(RASCUNHO_BASE);
    await removerFichaEnfileirada(item.id);
    expect(await listarFichasEnfileiradas()).toHaveLength(0);
  });
});

describe("estaOffline", () => {
  it("reconhece TypeError (erro típico de fetch sem rede) como offline", () => {
    expect(estaOffline(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("não trata um erro comum (ex.: validação/permissão) como offline", () => {
    expect(estaOffline(new Error("permissão negada"))).toBe(false);
  });

  it("reconhece o erro estruturado do postgrest-js quando o AbortSignal aborta a requisição", () => {
    expect(
      estaOffline({
        message: "AbortError: This operation was aborted",
        hint: "Request was aborted (timeout or manual cancellation)",
      })
    ).toBe(true);
  });

  it("reconhece FunctionsFetchError (functions.invoke abortado por timeout)", () => {
    expect(estaOffline({ name: "FunctionsFetchError", message: "Failed to send a request to the Edge Function" })).toBe(
      true
    );
  });

  it("reconhece o objeto plano do postgrest-js para uma falha de rede comum (não só abort)", () => {
    // Formato real devolvido por postgrest-js em qualquer rejeição de fetch (rede
    // indisponível ou requisição abortada por route.abort()/CDP) — nunca uma instância de
    // Error de verdade, sempre um objeto plano com essa mensagem.
    expect(estaOffline({ message: "TypeError: Failed to fetch", details: "", hint: "", code: "" })).toBe(true);
  });

  it("não trata um erro estruturado comum (sem hint/name de abort) como offline", () => {
    expect(estaOffline({ message: "duplicate key value violates unique constraint" })).toBe(false);
  });
});

describe("offlineQueue — tentativa abandonada", () => {
  const agora = Date.parse("2026-10-14T12:00:00Z");

  it("só 'sincronizando' pode estar abandonada; a recente é uma tentativa em curso", () => {
    expect(tentativaAbandonada({ status: "pendente" }, agora)).toBe(false);
    expect(tentativaAbandonada({ status: "falhou" }, agora)).toBe(false);
    expect(tentativaAbandonada({ status: "sincronizando", sincronizandoDesde: "2026-10-14T11:59:30Z" }, agora)).toBe(false);
  });

  it("'sincronizando' há mais de 1 minuto, ou sem marca de início (item antigo preso), é retomada", () => {
    expect(tentativaAbandonada({ status: "sincronizando", sincronizandoDesde: "2026-10-14T11:58:00Z" }, agora)).toBe(true);
    expect(tentativaAbandonada({ status: "sincronizando" }, agora)).toBe(true);
  });

  it("marcar 'sincronizando' grava o início; sair desse status o apaga", async () => {
    await limparFila();
    await enfileirarFicha(RASCUNHO_BASE);
    await atualizarStatusFicha(RASCUNHO_BASE.id, "sincronizando");
    expect((await listarFichasEnfileiradas())[0]!.sincronizandoDesde).toBeTruthy();
    await atualizarStatusFicha(RASCUNHO_BASE.id, "falhou", "x");
    expect((await listarFichasEnfileiradas())[0]!.sincronizandoDesde).toBeUndefined();
    await limparFila();
  });
});
