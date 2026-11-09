import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";

const INTERVALO_MS = 30_000;

/** Chave comparável de uma lista de setores (ordem não importa). */
export function chaveSetores(setores: string[] | null | undefined): string {
  return [...(setores ?? [])].sort().join("|");
}

/** Setores que o token de acesso (JWT) carrega no claim `setores_permitidos` — é ele, e não o perfil lido da tabela, que a RLS do
 * servidor usa para aceitar um INSERT. null quando o token não existe ou não pode ser lido. */
export function setoresDoToken(accessToken: string | null | undefined): string[] | null {
  try {
    const payload = accessToken?.split(".")[1];
    if (!payload) return null;
    const binario = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)))) as { setores_permitidos?: unknown };
    return Array.isArray(json.setores_permitidos) ? json.setores_permitidos.map(String) : [];
  } catch {
    return null;
  }
}

/** O administrador/verificador pode trocar o setor de um inspetor a qualquer momento (e o setor
 * volta sozinho ao fim do turno). O acesso do inspetor vem do token de login, então, quando o setor
 * dele muda no banco, este hook renova a sessão (o token novo traz o setor novo; o perfil do
 * store é recarregado pelo useAuthListener) e invalida os dados em cache — sem ele precisar sair
 * e entrar. Confere a cada 30 s e ao voltar para a aba.
 *
 * A comparação é com o setor que está DENTRO DO TOKEN, não com o do store: o useAuthListener relê o perfil (e atualiza o store)
 * em qualquer evento de sessão, sem renovar o token. Comparar só com o store deixava o token com o setor antigo e a RLS
 * recusava todo registro novo ("Falha ao criar/assinar a ficha") até o token vencer ou o inspetor sair e entrar. */
export function useSincronizarSetores() {
  const perfilId = useSessionStore((s) => s.perfil?.id);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!perfilId) return;
    let ativo = true;
    let emAndamento = false;
    // Setores do servidor para os quais já renovamos o token: se o token continuar divergindo, não renova a cada 30 s.
    let jaRenovadoPara: string | null = null;

    async function conferir() {
      if (emAndamento || !navigator.onLine || document.visibilityState === "hidden") return;
      emAndamento = true;
      try {
        const { data } = await supabase.from("perfis_usuarios").select("setores_permitidos").eq("id", perfilId as string).maybeSingle();
        if (!ativo || !data) return;
        const atual = useSessionStore.getState().perfil;
        if (!atual) return;
        const chaveServidor = chaveSetores(data.setores_permitidos as string[]);
        const { data: sessao } = await supabase.auth.getSession();
        const doToken = setoresDoToken(sessao.session?.access_token);
        const tokenDesatualizado = doToken !== null && chaveSetores(doToken) !== chaveServidor;
        const storeDesatualizado = chaveServidor !== chaveSetores(atual.setoresPermitidos);
        if (!tokenDesatualizado && !storeDesatualizado) {
          jaRenovadoPara = null;
          return;
        }
        if (!storeDesatualizado && jaRenovadoPara === chaveServidor) return;
        const { error } = await supabase.auth.refreshSession();
        if (error || !ativo) return;
        jaRenovadoPara = chaveServidor;
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
