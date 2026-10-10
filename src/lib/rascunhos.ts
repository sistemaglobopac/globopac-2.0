// Rascunhos de monitoramento (IndexedDB, só neste aparelho): o inspetor preenche e salva NO LOCAL,
// mesmo sem internet, e assina todos de uma vez depois (em até 7 dias da hora do monitoramento: cobre fins de semana e feriados).
// Diferente da fila offline (offlineQueue.ts), que já está assinada/confirmada e só espera a rede:
// o rascunho ainda NÃO foi assinado nem enviado — pode ser descartado e não vale como registro.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { PRAZO_ASSINATURA_HORAS } from "@/modules/fichas/utils/horaMonitoramento";

export type StatusRascunho = "rascunho" | "assinando" | "falhou";

export interface Rascunho {
  /** id do futuro monitoramento (gerado no cliente, idempotente no envio). */
  id: string;
  fichaTemplateId: string;
  codigo: string;
  nomeFicha: string;
  versaoTemplate: number;
  userId: string;
  setor: string;
  /** Inclui hora_monitoramento (ISO) e, se for o caso, continuacao_de. */
  dadosDinamicos: Record<string, unknown>;
  /** Hora informada pelo inspetor (espelho de dadosDinamicos.hora_monitoramento). */
  horaMonitoramento: string;
  salvoEm: string;
  /** Monitoramento NÃO CONFORME: precisa ser assinado para emitir a RNC/ação corretiva imediata. */
  naoConforme: boolean;
  motivosNc: string[];
  /** EM_ANDAMENTO: ao assinar vira a etapa 1 de um monitoramento que aguarda o peso (peso por caixa). */
  statusFicha?: "EM_ANDAMENTO";
  status: StatusRascunho;
  ultimoErro?: string;
}

interface RascunhosDB extends DBSchema {
  rascunhos: { key: string; value: Rascunho };
}

let dbPromise: Promise<IDBPDatabase<RascunhosDB>> | null = null;

function abrirDb() {
  dbPromise ??= openDB<RascunhosDB>("globopac-rascunhos", 1, {
    upgrade(db) {
      db.createObjectStore("rascunhos", { keyPath: "id" });
    },
  });
  return dbPromise;
}

export async function salvarRascunho(r: Omit<Rascunho, "salvoEm" | "status">): Promise<Rascunho> {
  const db = await abrirDb();
  const item: Rascunho = { ...r, salvoEm: new Date().toISOString(), status: "rascunho" };
  await db.put("rascunhos", item);
  return item;
}

/** Rascunhos do usuário, mais antigos (pela hora do monitoramento) primeiro. */
export async function listarRascunhos(userId: string): Promise<Rascunho[]> {
  const db = await abrirDb();
  const todos = await db.getAll("rascunhos");
  return todos.filter((r) => r.userId === userId).sort((a, b) => (a.horaMonitoramento < b.horaMonitoramento ? -1 : 1));
}

export async function removerRascunho(id: string): Promise<void> {
  const db = await abrirDb();
  await db.delete("rascunhos", id);
}

export async function atualizarStatusRascunho(id: string, status: StatusRascunho, ultimoErro?: string): Promise<void> {
  const db = await abrirDb();
  const atual = await db.get("rascunhos", id);
  if (!atual) return;
  await db.put("rascunhos", { ...atual, status, ultimoErro });
}

/** Prazo para assinar: PRAZO_ASSINATURA_HORAS a partir da hora do monitoramento. */
export function prazoDoRascunho(r: Pick<Rascunho, "horaMonitoramento">, prazoHoras = PRAZO_ASSINATURA_HORAS): Date {
  return new Date(new Date(r.horaMonitoramento).getTime() + prazoHoras * 3_600_000);
}

export function rascunhoExpirado(r: Pick<Rascunho, "horaMonitoramento">, agora: Date, prazoHoras = PRAZO_ASSINATURA_HORAS): boolean {
  return agora.getTime() > prazoDoRascunho(r, prazoHoras).getTime();
}
