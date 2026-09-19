import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { usePresenceStore } from "./presenceStore";

const CANAL_PRESENCA = "presenca-usuarios";

/** Primeiro uso de Presence (não postgres_changes) neste projeto — ver comentário em
 * presenceStore.ts. Montado uma única vez em AppShell (todo usuário autenticado, qualquer
 * perfil, entra no mesmo canal enquanto tiver o app aberto), para que o KPI "Usuários Ativos"
 * do Painel de Gestão veja todo mundo, não só quem tem o próprio painel aberto. */
export function usePresenceTracking(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    const canal = supabase.channel(CANAL_PRESENCA, { config: { presence: { key: userId } } });

    canal.on("presence", { event: "sync" }, () => {
      usePresenceStore.getState().setOnlineIds(new Set(Object.keys(canal.presenceState())));
    });

    canal.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void canal.track({ online_desde: new Date().toISOString() });
      }
    });

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [userId]);
}
