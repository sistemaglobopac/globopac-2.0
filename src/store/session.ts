import { create } from "zustand";
import type { NivelAcesso } from "@/lib/database.types";
import type { AcessoOffline } from "@/modules/auth/perfilLocal";

// Zustand fica só para estado de UI/sessão local (seção 5): tema, sidebar, e o perfil do
// usuário já resolvido (id, nome, nivel_acesso, setores) para render síncrono na UI. O dado
// de servidor em si (fichas, RNCs, etc.) vive no cache do TanStack Query, nunca aqui.
export interface PerfilSessao {
  id: string;
  nomeCompleto: string;
  nivelAcesso: NivelAcesso;
  setoresPermitidos: string[];
}

interface SessionState {
  perfil: PerfilSessao | null;
  /** Preenchido quando o inspetor entrou SEM internet (ADR 0016): há perfil, mas ainda não há sessão no
   * servidor — ao voltar a rede ele reconecta com a senha para sincronizar. */
  acessoOffline: AcessoOffline | null;
  /** true até a primeira checagem de sessão (getSession) resolver — evita "piscar" a tela de
   * login antes de sabermos se já existe uma sessão válida. */
  carregando: boolean;
  sidebarAberta: boolean;
  tema: "light" | "dark";
  definirPerfil: (perfil: PerfilSessao | null) => void;
  definirAcessoOffline: (acesso: AcessoOffline | null) => void;
  definirCarregando: (carregando: boolean) => void;
  alternarSidebar: () => void;
  definirTema: (tema: "light" | "dark") => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  perfil: null,
  acessoOffline: null,
  carregando: true,
  sidebarAberta: true,
  tema: "light",
  definirPerfil: (perfil) => set({ perfil }),
  definirAcessoOffline: (acessoOffline) => set({ acessoOffline }),
  definirCarregando: (carregando) => set({ carregando }),
  alternarSidebar: () => set((s) => ({ sidebarAberta: !s.sidebarAberta })),
  definirTema: (tema) => set({ tema }),
}));
