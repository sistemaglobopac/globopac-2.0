// Fila local de sincronização de fichas offline (ADR 0002, ADR 0014). IndexedDB via `idb` —
// sobrevive a fechar o app/navegador, ao contrário de um estado em memória. Cada item é um
// rascunho de monitoramento ainda não persistido no servidor; o `id` é gerado no CLIENTE no
// momento da criação (não no momento da sincronização), para que reenviar o mesmo item nunca
// duplique (idempotência via upsert com ignoreDuplicates — ver useSincronizacaoOffline.ts).
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type StatusFilaOffline = "pendente" | "sincronizando" | "falhou" | "falha_autenticacao";

export interface FichaEnfileirada {
  id: string;
  fichaTemplateId: string;
  versaoTemplate: number;
  userId: string;
  setor: string;
  dadosDinamicos: Record<string, unknown>;
  capturadoEm: string;
  enfileiradoEm: string;
  status: StatusFilaOffline;
  ultimoErro?: string;
}

interface FilaOfflineDB extends DBSchema {
  fichas_pendentes: {
    key: string;
    value: FichaEnfileirada;
  };
}

let dbPromise: Promise<IDBPDatabase<FilaOfflineDB>> | null = null;

function abrirDb() {
  dbPromise ??= openDB<FilaOfflineDB>("globopac-fila-offline", 1, {
    upgrade(db) {
      db.createObjectStore("fichas_pendentes", { keyPath: "id" });
    },
  });
  return dbPromise;
}

/** `id` é responsabilidade de quem chama (gerado uma única vez no início do fluxo de
 * criação, ADR 0002) — nunca gerado aqui dentro. Isso importa porque uma tentativa online
 * pode ter inserido o registro no servidor ANTES de falhar (ex.: o INSERT foi bem-sucedido,
 * só a assinatura que travou/abortou) — enfileirar com um id novo, diferente do que já foi
 * persistido, deixaria aquela linha órfã (sem assinatura, e sem nenhuma fila apontando para
 * ela) em vez de retomá-la na próxima sincronização. */
export async function enfileirarFicha(
  rascunho: Omit<FichaEnfileirada, "enfileiradoEm" | "status">
): Promise<FichaEnfileirada> {
  const db = await abrirDb();
  const item: FichaEnfileirada = {
    ...rascunho,
    enfileiradoEm: new Date().toISOString(),
    status: "pendente",
  };
  await db.put("fichas_pendentes", item);
  return item;
}

export async function listarFichasEnfileiradas(): Promise<FichaEnfileirada[]> {
  const db = await abrirDb();
  const itens = await db.getAll("fichas_pendentes");
  return itens.sort((a, b) => a.enfileiradoEm.localeCompare(b.enfileiradoEm));
}

export async function atualizarStatusFicha(id: string, status: StatusFilaOffline, ultimoErro?: string) {
  const db = await abrirDb();
  const item = await db.get("fichas_pendentes", id);
  if (!item) return;
  await db.put("fichas_pendentes", { ...item, status, ultimoErro });
}

export async function removerFichaEnfileirada(id: string) {
  const db = await abrirDb();
  await db.delete("fichas_pendentes", id);
}

/** Prazo para a tentativa online antes de cair para a fila offline (ver PRAZO_ONLINE_MS nos
 * call sites, via AbortSignal.timeout — mecanismo nativo do fetch, não um race manual em
 * cima da Promise: encontramos em CI que uma conexão "offline" emulada (Playwright
 * context.setOffline) podia deixar o fetch pendurado sem nunca rejeitar por conta própria —
 * supabase-js/postgrest-js e functions-js só resolvem com {data:null, error} quando o AbortController
 * embutido de fato aborta a requisição; sem um signal/timeout explícito, não há limite algum). */
export const PRAZO_ONLINE_MS = 8_000;

/** Heurística de "isto falhou por falta de rede (ou por ter estourado o prazo acima), não por
 * outro motivo" — um erro de validação/permissão real (400/403) nunca cai aqui. Cobre os três
 * formatos observados: sinal do navegador, fetch cru sem handler (TypeError), e os erros
 * estruturados que postgrest-js/functions-js devolvem quando o AbortSignal aborta a
 * requisição (nunca lançam um AbortError puro — sempre envolvem numa mensagem própria). */
export function estaOffline(erro?: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (erro instanceof TypeError) return true;
  if (erro instanceof Error && /^AbortError/.test(erro.message)) return true;
  if (erro && typeof erro === "object") {
    const objeto = erro as { name?: string; message?: string; hint?: string };
    if (objeto.name === "FunctionsFetchError") return true;
    if (typeof objeto.message === "string" && /^AbortError/.test(objeto.message)) return true;
    if (typeof objeto.hint === "string" && objeto.hint.includes("aborted")) return true;
  }
  return false;
}
