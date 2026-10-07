// Entrada e saída do "modo offline" do inspetor (ADR 0016). Sem internet, matrícula + senha são conferidas
// contra o verificador guardado no aparelho (credencialOffline.ts) e o app abre com o perfil local — sem sessão
// no servidor. Quando a rede volta, `reconectar` troca isso por uma sessão de verdade (e a fila sincroniza).
import { queryClient } from "@/lib/queryClient";
import { garantirCacheDoUsuario } from "@/lib/offlineCache";
import { registrarLoginOnline, type ResultadoCredencialOffline } from "@/lib/credencialOffline";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";
import { gravarAcessoOffline, gravarPerfilLocal, type AcessoOffline } from "./perfilLocal";
import { loginNoServidor } from "./loginServidor";

export async function abrirSessaoOffline(r: Extract<ResultadoCredencialOffline, { ok: true }>): Promise<void> {
  await garantirCacheDoUsuario(r.perfil.id, queryClient);
  const acesso: AcessoOffline = { matricula: r.matricula, validoAte: r.validoAte };
  gravarPerfilLocal(r.perfil);
  gravarAcessoOffline(acesso);
  const { definirAcessoOffline, definirPerfil } = useSessionStore.getState();
  definirAcessoOffline(acesso);
  definirPerfil(r.perfil);
}

/** Sai do modo offline SEM apagar a fila nem os rascunhos do aparelho (ficam guardados por usuário). */
export function encerrarAcessoOffline(): void {
  gravarPerfilLocal(null);
  gravarAcessoOffline(null);
  const { definirAcessoOffline, definirPerfil } = useSessionStore.getState();
  definirAcessoOffline(null);
  definirPerfil(null);
}

export type ResultadoReconexao =
  | { ok: true }
  | { ok: false; erro: string; /** O login pede CAPTCHA/está bloqueado: só a tela de login resolve. */ usarTelaDeLogin?: boolean };

/** Rede de volta: pede a senha e abre uma sessão de verdade no servidor. O `SIGNED_IN` resultante renova a
 * validade do acesso offline e dispara a sincronização da fila. */
export async function reconectar(matricula: string, senha: string): Promise<ResultadoReconexao> {
  const r = await loginNoServidor(matricula, senha, null);
  if (r.tipo === "sem_rede") return { ok: false, erro: "Ainda sem conexão com o servidor. Tente de novo em instantes." };
  if (r.tipo === "ip_bloqueado" || r.tipo === "captcha_necessario") {
    return { ok: false, erro: "O login pede uma verificação adicional. Entre pela tela de login (seus registros continuam salvos no aparelho).", usarTelaDeLogin: true };
  }
  if (r.tipo !== "ok") return { ok: false, erro: "Senha inválida." };

  const { data, error } = await supabase.auth.setSession({ access_token: r.accessToken, refresh_token: r.refreshToken });
  if (error || !data.session) return { ok: false, erro: "Não foi possível abrir a sessão. Tente de novo." };
  await registrarLoginOnline({ userId: data.session.user.id, matricula, senha });
  return { ok: true };
}

/** "Sair": encerra a sessão no servidor e, se o evento de saída não chegar (sem rede, ou entrou pelo acesso
 * offline e nunca houve sessão), encerra do mesmo jeito localmente. A credencial offline do inspetor permanece
 * no aparelho — é ela que permite entrar sem internet no próximo turno. */
export async function sair(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // sem rede: a saída local abaixo resolve.
  }
  if (useSessionStore.getState().perfil) encerrarAcessoOffline();
}
