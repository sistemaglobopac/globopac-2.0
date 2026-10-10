import { supabase } from "@/lib/supabase";
import { atualizarPerfilOnline, conferirSenhaLocal, mensagemDaRecusaOffline, registrarLoginOnline } from "@/lib/credencialOffline";
import { ehFalhaDeRede } from "@/lib/rede";
import { useSessionStore } from "@/store/session";

/** Resultado da conferência da senha no momento de assinar/confirmar. */
export type ConfirmacaoSenha =
  | { ok: true; modo: "servidor" }
  /** Sem internet: a senha foi conferida contra o verificador guardado neste aparelho (ADR 0016). */
  | { ok: true; modo: "aparelho"; matricula: string }
  /** Sem internet e este aparelho ainda não tem o verificador da senha (a sessão é anterior ao acesso offline): a
   * ficha entra na fila SEM a confirmação com senha — melhor que travar o inspetor. Vale o prazo de 7 dias. */
  | { ok: true; modo: "sem_verificador" }
  | { ok: false; erro: string };

const ERRO_IDENTIFICAR = "Não foi possível identificar seu usuário. Faça login novamente.";
const ERRO_SENHA = "Senha incorreta. A assinatura eletrônica falhou.";
const ERRO_SEM_REDE = "Sem conexão: esta assinatura precisa de internet.";

async function conferirNoAparelho(senha: string): Promise<ConfirmacaoSenha> {
  const userId = useSessionStore.getState().perfil?.id;
  if (!userId) return { ok: false, erro: ERRO_IDENTIFICAR };
  const r = await conferirSenhaLocal(userId, senha);
  if (r.ok) return { ok: true, modo: "aparelho", matricula: r.matricula };
  if (r.motivo === "sem_credencial" && useSessionStore.getState().perfil?.nivelAcesso === "INSPETOR_QUALIDADE") return { ok: true, modo: "sem_verificador" };
  // Quem não trabalha offline (gestor, verificador…) precisa de internet para assinar.
  if (r.motivo === "sem_credencial" || r.motivo === "perfil_nao_permitido") return { ok: false, erro: ERRO_SEM_REDE };
  if (r.motivo === "senha_invalida") return { ok: false, erro: ERRO_SENHA };
  return { ok: false, erro: mensagemDaRecusaOffline(r) };
}

/** Reautenticação por senha no momento de assinar (Lei 14.063/2020, Art. 4º §2º — assinatura
 * eletrônica avançada). Com internet, o servidor confere a senha. Sem internet (ou com a rede caída de
 * fato), o INSPETOR confirma com a mesma senha conferida neste aparelho; a assinatura oficial só sai
 * quando a rede voltar. */
export async function conferirSenha(senha: string): Promise<ConfirmacaoSenha> {
  if (!navigator.onLine) return conferirNoAparelho(senha);

  const { data: userData, error: erroUser } = await supabase.auth.getUser();
  if (erroUser && ehFalhaDeRede(erroUser)) return conferirNoAparelho(senha);
  if (erroUser || !userData.user?.email) return { ok: false, erro: ERRO_IDENTIFICAR };

  const { error: erroAuth } = await supabase.auth.signInWithPassword({ email: userData.user.email, password: senha });
  if (erroAuth && ehFalhaDeRede(erroAuth)) return conferirNoAparelho(senha);
  if (erroAuth) return { ok: false, erro: ERRO_SENHA };
  // A senha acabou de ser conferida pelo servidor: aproveita para guardar o verificador neste aparelho (quem já estava logado
  // antes de o acesso offline existir ganha o acesso offline na primeira confirmação com internet, sem novo login).
  const perfil = useSessionStore.getState().perfil;
  if (perfil?.nivelAcesso === "INSPETOR_QUALIDADE" && perfil.matricula) {
    void registrarLoginOnline({ userId: perfil.id, matricula: perfil.matricula, senha }).then(() => atualizarPerfilOnline(perfil));
  }
  return { ok: true, modo: "servidor" };
}

/** Versão simples: devolve a mensagem de erro, ou `null` se a senha confere (online ou no aparelho). */
export async function reautenticar(senha: string): Promise<string | null> {
  const r = await conferirSenha(senha);
  return r.ok ? null : r.erro;
}
