import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";
import type { NivelAcesso } from "@/lib/database.types";

interface PerfilUsuarioLinha {
  id: string;
  nome_completo: string;
  nivel_acesso: NivelAcesso;
  setores_permitidos: string[];
}

/**
 * Mantém o perfil (session store) sincronizado com a sessão do Supabase Auth. Chamado uma
 * vez na raiz do app (App.tsx). Nunca confiar em nivel_acesso vindo de outro lugar — este é
 * o único ponto que popula useSessionStore a partir de uma leitura real de perfis_usuarios
 * (protegida por RLS: o usuário só lê a própria linha — ver perfis_usuarios_select).
 */
export function useAuthListener() {
  const definirPerfil = useSessionStore((s) => s.definirPerfil);
  const definirCarregando = useSessionStore((s) => s.definirCarregando);

  useEffect(() => {
    let ativo = true;

    async function carregarPerfil(userId: string) {
      const { data, error } = await supabase
        .from("perfis_usuarios")
        .select("id, nome_completo, nivel_acesso, setores_permitidos")
        .eq("id", userId)
        .single()
        .overrideTypes<PerfilUsuarioLinha, { merge: false }>();

      if (!ativo) return;
      if (error || !data) {
        definirPerfil(null);
        return;
      }
      definirPerfil({
        id: data.id,
        nomeCompleto: data.nome_completo,
        nivelAcesso: data.nivel_acesso,
        setoresPermitidos: data.setores_permitidos,
      });
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) await carregarPerfil(data.session.user.id);
      if (ativo) definirCarregando(false);
    });

    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (session?.user) void carregarPerfil(session.user.id);
      else definirPerfil(null);
    });

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, [definirPerfil, definirCarregando]);
}
