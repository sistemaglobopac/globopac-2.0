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

export async function enfileirarFicha(
  rascunho: Omit<FichaEnfileirada, "id" | "enfileiradoEm" | "status">
): Promise<FichaEnfileirada> {
  const db = await abrirDb();
  const item: FichaEnfileirada = {
    ...rascunho,
    id: crypto.randomUUID(),
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

export const ERRO_TEMPO_ESGOTADO = "tempo-esgotado-offline";

/** Heurística de "isto falhou por falta de rede, não por outro motivo" — combina o sinal do
 * navegador (`navigator.onLine`), o formato típico de erro de fetch sem rede (`TypeError` no
 * browser) e um timeout explícito (ver `comTimeoutOffline`) para conexões degradadas que nem
 * chegam a rejeitar rápido (uma rede ruim, não necessariamente "desligada", pode deixar o
 * fetch pendurado por dezenas de segundos antes de qualquer erro nativo). Um erro de
 * validação/permissão real (400/403) nunca cai aqui. */
export function estaOffline(erro?: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (erro instanceof TypeError) return true;
  return erro instanceof Error && erro.message === ERRO_TEMPO_ESGOTADO;
}

/** Corrida entre a promessa real e um timeout — sem isso, uma conexão degradada (não
 * totalmente offline, só lenta/pendurada) deixaria o usuário esperando indefinidamente em vez
 * de cair na fila offline dentro de um tempo previsível. */
export function comTimeoutOffline<T>(promessa: PromiseLike<T>, ms = 8_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error(ERRO_TEMPO_ESGOTADO)), ms);
    promessa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(temporizador);
        reject(erro);
      }
    );
  });
}
