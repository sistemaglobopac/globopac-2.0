/** `supabase.functions.invoke` devolve só "Edge Function returned a non-2xx status code" quando a
 * função responde erro; a mensagem real vem no corpo (`{ erro }`). Extrai esse texto para mostrar ao
 * usuário; sem corpo legível, devolve o erro original. */
export async function erroDeFuncao(error: unknown): Promise<Error> {
  const contexto = (error as { context?: unknown } | null)?.context;
  if (contexto && typeof (contexto as Response).json === "function") {
    try {
      const corpo = (await (contexto as Response).clone().json()) as { erro?: unknown } | null;
      if (corpo && typeof corpo.erro === "string" && corpo.erro.trim()) return new Error(corpo.erro);
    } catch {
      // corpo vazio ou não-JSON: cai no erro original
    }
  }
  if (error instanceof Error) return error;
  const mensagem = (error as { message?: unknown } | null)?.message;
  return new Error(typeof mensagem === "string" ? mensagem : String(error));
}
