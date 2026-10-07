/** Falha de REDE (sem resposta do servidor), diferente de uma resposta de erro do banco/RLS (que
 * traz `code`). Só a primeira justifica abrir com o perfil guardado no aparelho ou conferir a senha
 * localmente. */
export function ehFalhaDeRede(erro: { message?: string; code?: string; status?: number; name?: string } | null | undefined): boolean {
  if (!erro) return false;
  // supabase.functions.invoke sem resposta do servidor (offline, timeout, DNS): "Failed to send a request…".
  if (erro.name === "FunctionsFetchError") return true;
  if (erro.code) return false;
  return erro.status === 0 || /fetch|network|timeout|timed out|abort|offline|conex/i.test(erro.message ?? "");
}
