import { create } from "zustand";

/** Estado efêmero de presença — populado só por usePresenceTracking (ver mesmo diretório).
 * Nenhuma tabela/coluna "online" existe no banco: quem está ou não online é inteiramente do
 * mecanismo de Presence do Supabase Realtime, reconstituído aqui a cada evento "sync" do
 * canal. Fica em zustand (não em TanStack Query) porque não é dado de servidor buscável por
 * query — é o estado local de um canal ao vivo. */
interface PresenceState {
  onlineIds: Set<string>;
  setOnlineIds: (ids: Set<string>) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineIds: new Set(),
  setOnlineIds: (onlineIds) => set({ onlineIds }),
}));
