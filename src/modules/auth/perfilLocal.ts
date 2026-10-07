// Perfil e "acesso offline" guardados no aparelho (localStorage), para o app reabrir sem internet.
// Só servem à interface: a autorização real é sempre a RLS no servidor (ver useAuthListener).
import type { PerfilSessao } from "@/store/session";

const CHAVE_PERFIL_LOCAL = "globopac:perfil";
const CHAVE_ACESSO_OFFLINE = "globopac:acesso-offline";

/** Entrada sem internet (ADR 0016): não há sessão no servidor até a rede voltar e o inspetor reconectar. */
export interface AcessoOffline {
  matricula: string;
  /** Fim da validade do acesso offline (ISO). */
  validoAte: string;
}

export function lerPerfilLocal(): PerfilSessao | null {
  try {
    const bruto = localStorage.getItem(CHAVE_PERFIL_LOCAL);
    return bruto ? (JSON.parse(bruto) as PerfilSessao) : null;
  } catch {
    return null;
  }
}

export function gravarPerfilLocal(perfil: PerfilSessao | null) {
  try {
    if (perfil) localStorage.setItem(CHAVE_PERFIL_LOCAL, JSON.stringify(perfil));
    else localStorage.removeItem(CHAVE_PERFIL_LOCAL);
  } catch {
    // armazenamento bloqueado: só perde a abertura offline, nunca quebra o login online.
  }
}

export function lerAcessoOffline(): AcessoOffline | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ACESSO_OFFLINE);
    return bruto ? (JSON.parse(bruto) as AcessoOffline) : null;
  } catch {
    return null;
  }
}

export function gravarAcessoOffline(acesso: AcessoOffline | null) {
  try {
    if (acesso) localStorage.setItem(CHAVE_ACESSO_OFFLINE, JSON.stringify(acesso));
    else localStorage.removeItem(CHAVE_ACESSO_OFFLINE);
  } catch {
    // idem gravarPerfilLocal
  }
}
