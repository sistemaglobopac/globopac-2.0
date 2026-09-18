import { beforeEach, describe, expect, it } from "vitest";
import {
  atualizarStatusFicha,
  enfileirarFicha,
  estaOffline,
  listarFichasEnfileiradas,
  removerFichaEnfileirada,
} from "@/lib/offlineQueue";

const RASCUNHO_BASE = {
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

  it("enfileira uma ficha com id gerado no cliente e status inicial 'pendente'", async () => {
    const item = await enfileirarFicha(RASCUNHO_BASE);
    expect(item.id).toBeTruthy();
    expect(item.status).toBe("pendente");

    const fila = await listarFichasEnfileiradas();
    expect(fila).toHaveLength(1);
    expect(fila[0].id).toBe(item.id);
    expect(fila[0].setor).toBe("LINHA_DIF");
  });

  it("lista em ordem de enfileiramento (mais antiga primeiro)", async () => {
    const primeira = await enfileirarFicha({ ...RASCUNHO_BASE, capturadoEm: "2026-01-01T09:00:00.000Z" });
    await new Promise((r) => setTimeout(r, 2));
    const segunda = await enfileirarFicha({ ...RASCUNHO_BASE, capturadoEm: "2026-01-01T10:00:00.000Z" });

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
});
