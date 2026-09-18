import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { listarFichasEnfileiradas } from "@/lib/offlineQueue";
import { sincronizarFilaOffline } from "./sincronizacaoOffline";

const INTERVALO_RETENTATIVA_MS = 10_000;

/** Dispara a sincronização da fila offline (ADR 0014) na montagem, quando a rede volta
 * (`online`), quando uma sessão válida é restaurada (reautenticação após
 * `falha_autenticacao`) e periodicamente como reforço — o evento `online` do navegador não é
 * garantia: existem transições de rede reais que não o disparam de forma confiável em todo
 * navegador/SO, e um item preso na fila indefinidamente por causa disso é justamente o tipo
 * de perda silenciosa que este sistema existe para eliminar. Expõe o estado atual da fila
 * para a UI. */
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
    const intervalo = setInterval(tentarSincronizar, INTERVALO_RETENTATIVA_MS);

    return () => {
      window.removeEventListener("online", tentarSincronizar);
      assinatura.subscription.unsubscribe();
      clearInterval(intervalo);
    };
  }, [queryClient]);

  return { fila: fila ?? [] };
}
