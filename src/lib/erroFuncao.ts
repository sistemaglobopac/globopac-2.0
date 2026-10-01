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

/** Status HTTP da resposta de uma Edge Function com erro (undefined se não houver resposta). */
export function statusDeFuncao(error: unknown): number | undefined {
  const status = ((error as { context?: unknown } | null)?.context as { status?: unknown } | undefined)?.status;
  return typeof status === "number" ? status : undefined;
}

export const MENSAGEM_SESSAO_EXPIRADA = "Sua sessão expirou. Saia do sistema e entre novamente para continuar.";
