import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { garantirCacheDoUsuario, limparConsultasDoUsuario } from "@/lib/offlineCache";
import { atualizarPerfilOnline } from "@/lib/credencialOffline";
import { useSessionStore, type PerfilSessao } from "@/store/session";
import type { NivelAcesso } from "@/lib/database.types";
import { ehFalhaDeRede } from "@/lib/rede";
import { gravarAcessoOffline, gravarPerfilLocal, lerAcessoOffline, lerPerfilLocal } from "./perfilLocal";

interface PerfilUsuarioLinha {
  id: string;
  nome_completo: string;
  nivel_acesso: NivelAcesso;
  setores_permitidos: string[];
}

const PRAZO_PERFIL_MS = 8_000;

export { ehFalhaDeRede } from "@/lib/rede";

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
  const definirAcessoOffline = useSessionStore((s) => s.definirAcessoOffline);

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
      // Perfil lido COM REDE: o servidor confirmou este usuário — renova os 7 dias do acesso offline do
      // inspetor e encerra o "modo offline" (agora há sessão de verdade).
      void atualizarPerfilOnline(perfil);
      gravarAcessoOffline(null);
      definirAcessoOffline(null);
      definirPerfil(perfil);
    }

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (data.session?.user) {
        await carregarPerfil(data.session.user.id);
      } else {
        const acesso = lerAcessoOffline();
        const acessoVencido = !!acesso && new Date(acesso.validoAte).getTime() < Date.now();
        if (acessoVencido) {
          // O acesso offline (7 dias) venceu enquanto o app estava fechado: volta para o login.
          gravarAcessoOffline(null);
          gravarPerfilLocal(null);
        } else if (!navigator.onLine || ehFalhaDeRede(error) || acesso) {
          // Sem rede o Supabase não consegue renovar um token vencido e devolve sessão vazia: o
          // inspetor continua com o perfil do aparelho (o envio dos registros espera a rede e a
          // reautenticação, já tratados pela fila offline). Idem para quem entrou pelo acesso offline.
          const local = lerPerfilLocal();
          if (ativo && local) {
            await garantirCacheDoUsuario(local.id, queryClient);
            definirAcessoOffline(acesso);
            definirPerfil(local);
          }
        }
      }
      if (ativo) definirCarregando(false);
    });

    const { data: assinatura } = supabase.auth.onAuthStateChange((evento, session) => {
      if (session?.user) {
        void carregarPerfil(session.user.id);
        return;
      }
      if (evento === "SIGNED_OUT") {
        const saindo = useSessionStore.getState().perfil;
        gravarPerfilLocal(null);
        gravarAcessoOffline(null);
        definirAcessoOffline(null);
        // O cache do inspetor fica no aparelho (por usuário) para ele entrar offline no próximo turno; o de
        // quem não trabalha offline é apagado ao sair.
        if (saindo && saindo.nivelAcesso !== "INSPETOR_QUALIDADE") void limparConsultasDoUsuario(saindo.id);
        queryClient.clear();
        definirPerfil(null);
        return;
      }
      // Sessão vazia SEM saída explícita e sem rede (ex.: token vencido que não renova): não derruba
      // o perfil já carregado do aparelho.
      if (!navigator.onLine) return;
      // Entrou pelo acesso offline: ainda não há sessão no servidor — não derruba o perfil (o ReconectarModal cuida).
      if (useSessionStore.getState().acessoOffline) return;
      definirPerfil(null);
    });

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, [definirPerfil, definirCarregando, definirAcessoOffline]);
}
