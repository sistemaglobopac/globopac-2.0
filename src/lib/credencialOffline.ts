// Credencial local do INSPETOR para trabalhar sem internet (ADR 0016). Depois de cada login online, o
// aparelho guarda um VERIFICADOR da senha (PBKDF2-SHA256 com salt — nunca a senha) e o perfil daquela
// matrícula. Sem rede, matrícula + senha são conferidos aqui e o app abre em "modo offline".
//
// Isto só libera a INTERFACE e o preenchimento: a autorização real continua sendo a RLS do servidor, e a
// assinatura eletrônica oficial (hash + carimbo) só existe quando a rede volta. Valem 7 dias a partir da
// última validação online (o servidor pode ter desativado o usuário nesse meio-tempo — por isso o prazo).
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PerfilSessao } from "@/store/session";

export const VALIDADE_LOGIN_OFFLINE_DIAS = 7;
/** PBKDF2-HMAC-SHA256: 600 mil iterações (recomendação OWASP) — conferido só no momento do login/assinatura. */
const ITERACOES = 600_000;
const MAX_FALHAS_SEGUIDAS = 5;
const BLOQUEIO_APOS_FALHAS_MIN = 5;
/** Só o perfil de chão de fábrica trabalha offline; gestor, verificador e admin dependem de estado do servidor. */
const NIVEL_OFFLINE = "INSPETOR_QUALIDADE";

export type MotivoRecusaOffline = "sem_credencial" | "senha_invalida" | "expirada" | "bloqueada" | "perfil_nao_permitido";

export type ResultadoCredencialOffline =
  | { ok: true; perfil: PerfilSessao; matricula: string; validoAte: string }
  | { ok: false; motivo: MotivoRecusaOffline; bloqueadoAte?: string };

interface RegistroCredencial {
  userId: string;
  /** Matrícula como digitada no login; "" enquanto só o perfil chegou (a credencial ainda não foi gravada). */
  matricula: string;
  /** Chave de busca: matrícula sem espaços e em minúsculas. */
  matriculaChave: string;
  salt?: string;
  hash?: string;
  iteracoes?: number;
  perfil?: PerfilSessao;
  /** Última vez que o servidor confirmou este usuário (login ou leitura do perfil com rede). */
  validadoEm?: string;
  falhas: number;
  bloqueadoAte?: string;
}

interface CredenciaisDB extends DBSchema {
  credenciais: { key: string; value: RegistroCredencial; indexes: { "por-matricula": string } };
}

let dbPromise: Promise<IDBPDatabase<CredenciaisDB>> | null = null;

function abrirDb() {
  dbPromise ??= openDB<CredenciaisDB>("globopac-credenciais-offline", 1, {
    upgrade(db) {
      const store = db.createObjectStore("credenciais", { keyPath: "userId" });
      store.createIndex("por-matricula", "matriculaChave");
    },
  });
  return dbPromise;
}

const chaveDaMatricula = (matricula: string) => matricula.trim().toLowerCase();

function paraBase64(bytes: Uint8Array): string {
  let texto = "";
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto);
}

function deBase64(texto: string): Uint8Array {
  const bruto = atob(texto);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

async function derivar(senha: string, salt: Uint8Array, iteracoes: number): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iteracoes }, material, 256);
  return paraBase64(new Uint8Array(bits));
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

function validoAte(registro: RegistroCredencial): Date | null {
  if (!registro.validadoEm) return null;
  return new Date(new Date(registro.validadoEm).getTime() + VALIDADE_LOGIN_OFFLINE_DIAS * 86_400_000);
}

/** Chamado logo depois de um login ONLINE bem-sucedido: guarda o verificador da senha deste aparelho. */
export async function registrarLoginOnline(entrada: { userId: string; matricula: string; senha: string }): Promise<void> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivar(entrada.senha, salt, ITERACOES);
    const db = await abrirDb();
    const tx = db.transaction("credenciais", "readwrite");
    const atual = await tx.store.get(entrada.userId);
    await tx.store.put({
      ...(atual ?? { userId: entrada.userId, falhas: 0 }),
      userId: entrada.userId,
      matricula: entrada.matricula.trim(),
      matriculaChave: chaveDaMatricula(entrada.matricula),
      salt: paraBase64(salt),
      hash,
      iteracoes: ITERACOES,
      falhas: 0,
      bloqueadoAte: undefined,
    });
    await tx.done;
  } catch {
    // Só perde o acesso offline deste aparelho: nunca quebra o login online.
  }
}

/** Chamado quando o perfil foi lido COM REDE (login, abertura do app, renovação do token): renova a validade
 * de 7 dias. Perfil que não é de inspetor não trabalha offline — a credencial dele é apagada. */
export async function atualizarPerfilOnline(perfil: PerfilSessao, agora: Date = new Date()): Promise<void> {
  try {
    const db = await abrirDb();
    if (perfil.nivelAcesso !== NIVEL_OFFLINE) {
      await db.delete("credenciais", perfil.id);
      return;
    }
    const tx = db.transaction("credenciais", "readwrite");
    const atual = await tx.store.get(perfil.id);
    await tx.store.put({
      ...(atual ?? { userId: perfil.id, matricula: "", matriculaChave: "", falhas: 0 }),
      perfil,
      validadoEm: agora.toISOString(),
    });
    await tx.done;
  } catch {
    // idem registrarLoginOnline
  }
}

async function conferir(registro: RegistroCredencial | undefined, senha: string, agora: Date): Promise<ResultadoCredencialOffline> {
  if (!registro?.hash || !registro.salt || !registro.iteracoes || !registro.perfil || !registro.validadoEm) {
    return { ok: false, motivo: "sem_credencial" };
  }
  if (registro.perfil.nivelAcesso !== NIVEL_OFFLINE) return { ok: false, motivo: "perfil_nao_permitido" };
  const limite = validoAte(registro);
  if (!limite || agora.getTime() > limite.getTime()) return { ok: false, motivo: "expirada" };
  if (registro.bloqueadoAte && agora.getTime() < new Date(registro.bloqueadoAte).getTime()) {
    return { ok: false, motivo: "bloqueada", bloqueadoAte: registro.bloqueadoAte };
  }

  const confere = iguais(await derivar(senha, deBase64(registro.salt), registro.iteracoes), registro.hash);
  const db = await abrirDb();
  if (confere) {
    if (registro.falhas > 0 || registro.bloqueadoAte) await db.put("credenciais", { ...registro, falhas: 0, bloqueadoAte: undefined });
    return { ok: true, perfil: registro.perfil, matricula: registro.matricula, validoAte: limite.toISOString() };
  }
  const falhas = registro.falhas + 1;
  const bloquear = falhas >= MAX_FALHAS_SEGUIDAS;
  const bloqueadoAte = bloquear ? new Date(agora.getTime() + BLOQUEIO_APOS_FALHAS_MIN * 60_000).toISOString() : undefined;
  await db.put("credenciais", { ...registro, falhas: bloquear ? 0 : falhas, bloqueadoAte });
  return bloquear ? { ok: false, motivo: "bloqueada", bloqueadoAte } : { ok: false, motivo: "senha_invalida" };
}

/** Login sem internet: confere matrícula + senha contra o verificador guardado neste aparelho. */
export async function entrarOffline(matricula: string, senha: string, agora: Date = new Date()): Promise<ResultadoCredencialOffline> {
  try {
    const db = await abrirDb();
    const candidatos = await db.getAllFromIndex("credenciais", "por-matricula", chaveDaMatricula(matricula));
    return await conferir(candidatos[0], senha, agora);
  } catch {
    return { ok: false, motivo: "sem_credencial" };
  }
}

/** Confirmação com senha (no lugar da assinatura) sem internet: confere a senha do usuário já identificado. */
export async function conferirSenhaLocal(userId: string, senha: string, agora: Date = new Date()): Promise<ResultadoCredencialOffline> {
  try {
    const db = await abrirDb();
    return await conferir(await db.get("credenciais", userId), senha, agora);
  } catch {
    return { ok: false, motivo: "sem_credencial" };
  }
}

/** Fim da validade do acesso offline do usuário (ISO), ou null se ele não tem credencial neste aparelho. */
export async function validadeDoAcessoOffline(userId: string): Promise<string | null> {
  try {
    const db = await abrirDb();
    const registro = await db.get("credenciais", userId);
    return registro?.hash && registro.perfil ? (validoAte(registro)?.toISOString() ?? null) : null;
  } catch {
    return null;
  }
}

/** Este aparelho já guarda o verificador da senha do usuário (ele fez login ONLINE depois de o acesso offline existir)? */
export async function temVerificadorLocal(userId: string): Promise<boolean> {
  try {
    const db = await abrirDb();
    const registro = await db.get("credenciais", userId);
    return !!(registro?.hash && registro.salt);
  } catch {
    return false;
  }
}

/** Matrícula guardada para o usuário (para pedir só a senha ao reconectar). */
export async function matriculaDoUsuario(userId: string): Promise<string | null> {
  try {
    const db = await abrirDb();
    return (await db.get("credenciais", userId))?.matricula || null;
  } catch {
    return null;
  }
}

export async function removerCredencial(userId: string): Promise<void> {
  try {
    const db = await abrirDb();
    await db.delete("credenciais", userId);
  } catch {
    // idem registrarLoginOnline
  }
}

export async function limparCredenciais(): Promise<void> {
  try {
    const db = await abrirDb();
    await db.clear("credenciais");
  } catch {
    // idem registrarLoginOnline
  }
}

export function mensagemDaRecusaOffline(r: Extract<ResultadoCredencialOffline, { ok: false }>, agora: Date = new Date()): string {
  switch (r.motivo) {
    case "senha_invalida":
      return "Matrícula ou senha inválidos.";
    case "expirada":
      return `Acesso offline vencido (vale ${VALIDADE_LOGIN_OFFLINE_DIAS} dias após o último acesso com internet). Conecte-se à internet para entrar.`;
    case "bloqueada": {
      const minutos = r.bloqueadoAte ? Math.max(1, Math.ceil((new Date(r.bloqueadoAte).getTime() - agora.getTime()) / 60_000)) : BLOQUEIO_APOS_FALHAS_MIN;
      return `Muitas tentativas incorretas. Tente de novo em ${minutos} min.`;
    }
    case "perfil_nao_permitido":
      return "Este perfil precisa de internet para entrar.";
    default:
      return "Sem internet e sem acesso offline neste aparelho. Entre com internet pelo menos uma vez para liberar o modo offline.";
  }
}
