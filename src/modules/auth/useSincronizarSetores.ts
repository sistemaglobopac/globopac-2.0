import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";

const INTERVALO_MS = 30_000;

/** Chave comparável de uma lista de setores (ordem não importa). */
export function chaveSetores(setores: string[] | null | undefined): string {
  return [...(setores ?? [])].sort().join("|");
}

/** O administrador/verificador pode trocar o setor de um inspetor a qualquer momento (e o setor
 * volta sozinho ao fim do turno). O acesso do inspetor vem do token de login, então, quando o setor
 * dele muda no banco, este hook renova a sessão (o token novo traz o setor novo; o perfil do
 * store é recarregado pelo useAuthListener) e invalida os dados em cache — sem ele precisar sair
 * e entrar. Confere a cada 30 s e ao voltar para a aba. */
export function useSincronizarSetores() {
  const perfilId = useSessionStore((s) => s.perfil?.id);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!perfilId) return;
    let ativo = true;
    let emAndamento = false;

    async function conferir() {
      if (emAndamento || !navigator.onLine || document.visibilityState === "hidden") return;
      emAndamento = true;
      try {
        const { data } = await supabase.from("perfis_usuarios").select("setores_permitidos").eq("id", perfilId as string).maybeSingle();
        if (!ativo || !data) return;
        const atual = useSessionStore.getState().perfil;
        if (!atual || chaveSetores(data.setores_permitidos as string[]) === chaveSetores(atual.setoresPermitidos)) return;
        const { error } = await supabase.auth.refreshSession();
        if (error || !ativo) return;
        // useAuthListener recarrega o perfil na renovação; garante o store mesmo se o evento atrasar.
        useSessionStore.getState().definirPerfil({ ...atual, setoresPermitidos: data.setores_permitidos as string[] });
        await queryClient.invalidateQueries();
      } catch {
        // sem rede ou sessão em transição: tenta de novo no próximo ciclo
      } finally {
        emAndamento = false;
      }
    }

    const id = window.setInterval(() => void conferir(), INTERVALO_MS);
    const aoVoltar = () => void conferir();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      ativo = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [perfilId, queryClient]);
}
