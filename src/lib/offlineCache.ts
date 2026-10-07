// Cache local (IndexedDB) das consultas necessárias para PREENCHER monitoramentos sem internet:
// fichas ativas, setores, leitura anterior, cargas do dia, turno etc. Só entram consultas marcadas
// com `meta: { offline: true }` no hook. O cache serve apenas para a interface abrir e aceitar
// entrada quando não há rede; com rede, a consulta de verdade sempre roda (ver ASSUMPTIONS.md,
// premissa 37: nunca tratar dado em cache como atual — a UI avisa "sem conexão").
//
// O cache é POR USUÁRIO (ADR 0016): vários inspetores podem revezar no mesmo aparelho e cada um precisa
// do próprio cache para entrar offline. Os dados de um nunca são mostrados ao outro: ao trocar de usuário o
// QueryClient é esvaziado e só as entradas do novo usuário são carregadas.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

interface EntradaConsulta {
  /** `${userId}|${queryKey em JSON}`. */
  chave: string;
  userId: string;
  queryKey: QueryKey;
  dados: unknown;
  atualizadoEm: number;
}

interface CacheDB extends DBSchema {
  consultas: { key: string; value: EntradaConsulta; indexes: { "por-usuario": string } };
  meta: { key: string; value: { chave: string; valor: string } };
}

/** Dono sem usuário identificado (testes e a janela antes do primeiro login). */
const SEM_DONO = "_";

let dbPromise: Promise<IDBPDatabase<CacheDB>> | null = null;
let usuarioAtivo: string | null = null;

function abrirDb() {
  dbPromise ??= openDB<CacheDB>("globopac-cache-consultas", 2, {
    upgrade(db, versaoAnterior) {
      // v1 guardava um cache único (de um só usuário): descartado — é reconstruído na próxima consulta com rede.
      if (versaoAnterior < 2 && db.objectStoreNames.contains("consultas" as never)) db.deleteObjectStore("consultas" as never);
      const consultas = db.createObjectStore("consultas", { keyPath: "chave" });
      consultas.createIndex("por-usuario", "userId");
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "chave" });
    },
  });
  return dbPromise;
}

async function donoAtual(): Promise<string> {
  if (usuarioAtivo) return usuarioAtivo;
  const db = await abrirDb();
  return (await db.get("meta", "usuario"))?.valor ?? SEM_DONO;
}

export async function gravarConsulta(queryKey: QueryKey, dados: unknown, atualizadoEm = Date.now()): Promise<void> {
  try {
    const db = await abrirDb();
    const userId = await donoAtual();
    await db.put("consultas", { chave: `${userId}|${JSON.stringify(queryKey)}`, userId, queryKey, dados, atualizadoEm });
  } catch {
    // cache é só conveniência offline: falha de gravação (cota, navegação privada) nunca quebra o app.
  }
}

/** Consultas guardadas do usuário (o ativo, se não for informado). */
export async function lerConsultas(userId?: string): Promise<EntradaConsulta[]> {
  try {
    const db = await abrirDb();
    return await db.getAllFromIndex("consultas", "por-usuario", userId ?? (await donoAtual()));
  } catch {
    return [];
  }
}

/** Apaga TODO o cache (todos os usuários) e esquece o usuário ativo. */
export async function limparConsultas(): Promise<void> {
  try {
    usuarioAtivo = null;
    const db = await abrirDb();
    await db.clear("consultas");
    await db.delete("meta", "usuario");
  } catch {
    // idem gravarConsulta
  }
}

/** Apaga só o cache de um usuário (ex.: quem não trabalha offline sai do aparelho). */
export async function limparConsultasDoUsuario(userId: string): Promise<void> {
  try {
    const db = await abrirDb();
    const chaves = await db.getAllKeysFromIndex("consultas", "por-usuario", userId);
    const tx = db.transaction("consultas", "readwrite");
    await Promise.all(chaves.map((c) => tx.store.delete(c)));
    await tx.done;
  } catch {
    // idem gravarConsulta
  }
}

/** Torna `userId` o dono do cache. Se mudou de usuário, a memória do QueryClient é esvaziada e só o cache
 * dele é carregado — dados de setor/turno do anterior nunca vazam. Devolve true se trocou de usuário. */
export async function garantirCacheDoUsuario(userId: string, queryClient: QueryClient): Promise<boolean> {
  try {
    const db = await abrirDb();
    const atual = usuarioAtivo ?? (await db.get("meta", "usuario"))?.valor ?? null;
    usuarioAtivo = userId;
    if (atual === userId) return false;
    await db.put("meta", { chave: "usuario", valor: userId });
    queryClient.clear();
    await hidratarConsultas(queryClient, userId);
    return atual !== null;
  } catch {
    // idem gravarConsulta
  }
  return false;
}

/** Carrega o cache salvo para dentro do QueryClient, antes de a UI renderizar. */
export async function hidratarConsultas(queryClient: QueryClient, userId?: string): Promise<void> {
  if (!userId) {
    const db = await abrirDb();
    userId = (await db.get("meta", "usuario"))?.valor ?? SEM_DONO;
    usuarioAtivo = userId === SEM_DONO ? null : userId;
  }
  const entradas = await lerConsultas(userId);
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
