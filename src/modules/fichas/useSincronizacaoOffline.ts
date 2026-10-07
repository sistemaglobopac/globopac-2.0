import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { listarFichasEnfileiradas } from "@/lib/offlineQueue";
import { sincronizarFilaOffline } from "./sincronizacaoOffline";

const INTERVALO_RETENTATIVA_MS = 10_000;

// Guarda por MÓDULO: o hook roda no AppShell (qualquer tela) e também no painel de "Nova ficha" — duas
// instâncias nunca sincronizam ao mesmo tempo.
let sincronizandoGlobal = false;

/** Dispara a sincronização da fila offline (ADR 0014) na montagem, quando a rede volta
 * (`online`), quando uma sessão válida é restaurada (reautenticação após
 * `falha_autenticacao`) e periodicamente como reforço — o evento `online` do navegador não é
 * garantia: existem transições de rede reais que não o disparam de forma confiável em todo
 * navegador/SO, e um item preso na fila indefinidamente por causa disso é justamente o tipo
 * de perda silenciosa que este sistema existe para eliminar. Expõe o estado atual da fila
 * para a UI. */
export function useSincronizacaoOffline() {
  const queryClient = useQueryClient();

  const { data: fila } = useQuery({
    queryKey: ["fila-offline"],
    queryFn: listarFichasEnfileiradas,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    async function tentarSincronizar() {
      if (sincronizandoGlobal) return;
      sincronizandoGlobal = true;
      try {
        await sincronizarFilaOffline();
      } finally {
        sincronizandoGlobal = false;
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
