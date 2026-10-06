import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { garantirCacheDoUsuario, limparConsultas } from "@/lib/offlineCache";
import { useSessionStore, type PerfilSessao } from "@/store/session";
import type { NivelAcesso } from "@/lib/database.types";

interface PerfilUsuarioLinha {
  id: string;
  nome_completo: string;
  nivel_acesso: NivelAcesso;
  setores_permitidos: string[];
}

const CHAVE_PERFIL_LOCAL = "globopac:perfil";
const PRAZO_PERFIL_MS = 8_000;

function lerPerfilLocal(): PerfilSessao | null {
  try {
    const bruto = localStorage.getItem(CHAVE_PERFIL_LOCAL);
    return bruto ? (JSON.parse(bruto) as PerfilSessao) : null;
  } catch {
    return null;
  }
}

function gravarPerfilLocal(perfil: PerfilSessao | null) {
  try {
    if (perfil) localStorage.setItem(CHAVE_PERFIL_LOCAL, JSON.stringify(perfil));
    else localStorage.removeItem(CHAVE_PERFIL_LOCAL);
  } catch {
    // armazenamento bloqueado: só perde a abertura offline, nunca quebra o login online.
  }
}

/** Falha de REDE (sem resposta do servidor), diferente de uma resposta de erro do banco/RLS (que
 * traz `code`). Só a primeira justifica abrir com o perfil guardado no aparelho. */
export function ehFalhaDeRede(erro: { message?: string; code?: string; status?: number } | null | undefined): boolean {
  if (!erro) return false;
  if (erro.code) return false;
  return erro.status === 0 || /fetch|network|timeout|timed out|abort|offline|conex/i.test(erro.message ?? "");
}

/**
 * Mantém o perfil (session store) sincronizado com a sessão do Supabase Auth. Chamado uma
 * vez na raiz do app (App.tsx). Nunca confiar em nivel_acesso vindo de outro lugar — este é
 * o único ponto que popula useSessionStore a partir de uma leitura real de perfis_usuarios
 * (protegida por RLS: o usuário só lê a própria linha — ver perfis_usuarios_select).
 *
 * Sem internet o app precisa continuar abrindo para o inspetor preencher no setor: se a leitura do
 * perfil falha por REDE, vale o último perfil guardado no aparelho (só para a interface — a
 * autorização real é sempre a RLS no servidor, que volta a valer na primeira chamada com rede). O
 * perfil guardado é apagado ao sair (SIGNED_OUT).
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
        .abortSignal(AbortSignal.timeout(PRAZO_PERFIL_MS))
        .single()
        .overrideTypes<PerfilUsuarioLinha, { merge: false }>();

      if (!ativo) return;
      if (error || !data) {
        const local = lerPerfilLocal();
        if (ehFalhaDeRede(error) && local?.id === userId) {
          definirPerfil(local);
          return;
        }
        definirPerfil(null);
        return;
      }
      const perfil: PerfilSessao = {
        id: data.id,
        nomeCompleto: data.nome_completo,
        nivelAcesso: data.nivel_acesso,
        setoresPermitidos: data.setores_permitidos,
      };
      await garantirCacheDoUsuario(perfil.id, queryClient);
      if (!ativo) return;
      gravarPerfilLocal(perfil);
      definirPerfil(perfil);
    }

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (data.session?.user) {
        await carregarPerfil(data.session.user.id);
      } else if (!navigator.onLine || ehFalhaDeRede(error)) {
        // Sem rede o Supabase não consegue renovar um token vencido e devolve sessão vazia: o
        // inspetor continua com o perfil do aparelho (o envio dos registros espera a rede e a
        // reautenticação, já tratados pela fila offline).
        const local = lerPerfilLocal();
        if (ativo && local) definirPerfil(local);
      }
      if (ativo) definirCarregando(false);
    });

    const { data: assinatura } = supabase.auth.onAuthStateChange((evento, session) => {
      if (session?.user) {
        void carregarPerfil(session.user.id);
        return;
      }
      if (evento === "SIGNED_OUT") {
        gravarPerfilLocal(null);
        void limparConsultas();
        queryClient.clear();
        definirPerfil(null);
        return;
      }
      // Sessão vazia SEM saída explícita e sem rede (ex.: token vencido que não renova): não derruba
      // o perfil já carregado do aparelho.
      if (!navigator.onLine) return;
      definirPerfil(null);
    });

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, [definirPerfil, definirCarregando]);
}
