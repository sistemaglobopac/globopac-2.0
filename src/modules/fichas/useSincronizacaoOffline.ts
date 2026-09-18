import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { listarFichasEnfileiradas } from "@/lib/offlineQueue";
import { sincronizarFilaOffline } from "./sincronizacaoOffline";

/** Dispara a sincronização da fila offline (ADR 0014) na montagem, quando a rede volta
 * (`online`) e quando uma sessão válida é restaurada (reautenticação após
 * `falha_autenticacao`) — e expõe o estado atual da fila para a UI. */
export function useSincronizacaoOffline() {
  const queryClient = useQueryClient();
  const sincronizando = useRef(false);

  const { data: fila } = useQuery({
    queryKey: ["fila-offline"],
    queryFn: listarFichasEnfileiradas,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    async function tentarSincronizar() {
      if (sincronizando.current) return;
      sincronizando.current = true;
      try {
        await sincronizarFilaOffline();
      } finally {
        sincronizando.current = false;
        void queryClient.invalidateQueries({ queryKey: ["fila-offline"] });
        void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
      }
    }

    void tentarSincronizar();
    window.addEventListener("online", tentarSincronizar);
    const { data: assinatura } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "TOKEN_REFRESHED") void tentarSincronizar();
    });

    return () => {
      window.removeEventListener("online", tentarSincronizar);
      assinatura.subscription.unsubscribe();
    };
  }, [queryClient]);

  return { fila: fila ?? [] };
}
