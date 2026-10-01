import { supabase } from "@/lib/supabase";

/** Reautenticação por senha no momento de assinar (Lei 14.063/2020, Art. 4º §2º — assinatura
 * eletrônica avançada). Devolve a mensagem de erro, ou `null` se a senha confere. */
export async function reautenticar(senha: string): Promise<string | null> {
  const { data: userData, error: erroUser } = await supabase.auth.getUser();
  if (erroUser || !userData.user?.email) return "Não foi possível identificar seu usuário. Faça login novamente.";
  const { error: erroAuth } = await supabase.auth.signInWithPassword({ email: userData.user.email, password: senha });
  if (erroAuth) return "Senha incorreta. A assinatura eletrônica falhou.";
  return null;
}
