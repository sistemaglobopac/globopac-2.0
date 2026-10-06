// Cache local (IndexedDB) das consultas necessárias para PREENCHER monitoramentos sem internet:
// fichas ativas, setores, leitura anterior, cargas do dia, turno etc. Só entram consultas marcadas
// com `meta: { offline: true }` no hook. O cache serve apenas para a interface abrir e aceitar
// entrada quando não há rede; com rede, a consulta de verdade sempre roda (ver ASSUMPTIONS.md,
// premissa 37: nunca tratar dado em cache como atual — a UI avisa "sem conexão").
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

interface EntradaConsulta {
  chave: string;
  queryKey: QueryKey;
  dados: unknown;
  atualizadoEm: number;
}

interface CacheDB extends DBSchema {
  consultas: { key: string; value: EntradaConsulta };
  meta: { key: string; value: { chave: string; valor: string } };
}

let dbPromise: Promise<IDBPDatabase<CacheDB>> | null = null;

function abrirDb() {
  dbPromise ??= openDB<CacheDB>("globopac-cache-consultas", 1, {
    upgrade(db) {
      db.createObjectStore("consultas", { keyPath: "chave" });
      db.createObjectStore("meta", { keyPath: "chave" });
    },
  });
  return dbPromise;
}

export async function gravarConsulta(queryKey: QueryKey, dados: unknown, atualizadoEm = Date.now()): Promise<void> {
  try {
    const db = await abrirDb();
    await db.put("consultas", { chave: JSON.stringify(queryKey), queryKey, dados, atualizadoEm });
  } catch {
    // cache é só conveniência offline: falha de gravação (cota, navegação privada) nunca quebra o app.
  }
}

export async function lerConsultas(): Promise<EntradaConsulta[]> {
  try {
    const db = await abrirDb();
    return await db.getAll("consultas");
  } catch {
    return [];
  }
}

export async function limparConsultas(): Promise<void> {
  try {
    const db = await abrirDb();
    await db.clear("consultas");
    await db.delete("meta", "usuario");
  } catch {
    // idem gravarConsulta
  }
}

/** Garante que o cache pertence a quem acabou de entrar: outro usuário no mesmo aparelho começa
 * limpo (dados de setor/turno do anterior nunca vazam). Devolve true se precisou limpar. */
export async function garantirCacheDoUsuario(userId: string, queryClient: QueryClient): Promise<boolean> {
  try {
    const db = await abrirDb();
    const atual = await db.get("meta", "usuario");
    if (atual && atual.valor !== userId) {
      await db.clear("consultas");
      queryClient.clear();
      await db.put("meta", { chave: "usuario", valor: userId });
      return true;
    }
    if (!atual) await db.put("meta", { chave: "usuario", valor: userId });
  } catch {
    // idem gravarConsulta
  }
  return false;
}

/** Carrega o cache salvo para dentro do QueryClient, antes de a UI renderizar. */
export async function hidratarConsultas(queryClient: QueryClient): Promise<void> {
  const entradas = await lerConsultas();
  for (const e of entradas) {
    queryClient.setQueryData(e.queryKey, e.dados, { updatedAt: e.atualizadoEm });
  }
}

/** Grava no cache local toda consulta marcada com meta.offline que termina com sucesso. */
export function instalarPersistenciaOffline(queryClient: QueryClient): () => void {
  return queryClient.getQueryCache().subscribe((evento) => {
    if (evento.type !== "updated" || evento.action.type !== "success") return;
    const { query } = evento;
    if (query.meta?.offline !== true || query.state.data === undefined) return;
    void gravarConsulta(query.queryKey, query.state.data, query.state.dataUpdatedAt);
  });
}
