import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { idDoDispositivo } from "@/lib/confirmacaoOffline";
import { useSessionStore } from "@/store/session";

const INTERVALO_MS = 15 * 60_000;
const ESPACAMENTO_MIN_MS = 5 * 60_000;

let ultimoAviso = 0;

/** Avisa o servidor, com o app aberto e conectado, que ESTE aparelho está online (ADR 0016). É o que permite ao
 * servidor provar, depois, que o aparelho NÃO falou com ele durante uma queda de rede — base do prazo estendido
 * (72 h → 7 dias) das fichas confirmadas offline. Falhar aqui nunca atrapalha o app. */
export function useContatoServidor() {
  const perfil = useSessionStore((s) => s.perfil);
  const acessoOffline = useSessionStore((s) => s.acessoOffline);
  const ativo = !!perfil && !acessoOffline;

  useEffect(() => {
    if (!ativo) return;

    async function avisar() {
      if (!navigator.onLine || Date.now() - ultimoAviso < ESPACAMENTO_MIN_MS) return;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const { error } = await supabase.rpc("registrar_contato_dispositivo", { p_dispositivo_id: idDoDispositivo() });
        if (!error) ultimoAviso = Date.now();
      } catch {
        // sem rede de verdade: tenta de novo no próximo ciclo.
      }
    }

    void avisar();
    const intervalo = setInterval(() => void avisar(), INTERVALO_MS);
    const aoVoltar = () => void avisar();
    window.addEventListener("online", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener("online", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [ativo]);
}
