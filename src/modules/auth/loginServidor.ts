import { supabase } from "@/lib/supabase";
import { ehFalhaDeRede } from "@/lib/rede";

/** Prazo para o servidor responder ao login. Sem ele, uma rede "conectada" mas sem saída para a internet
 * deixaria o botão "Entrando…" preso — e o inspetor não chegaria ao acesso offline. */
export const PRAZO_LOGIN_MS = 15_000;

interface RespostaLogin {
  access_token?: string;
  refresh_token?: string;
  erro?: string;
  flag?: "captcha_necessario" | "ip_bloqueado";
}

export type ResultadoLoginServidor =
  | { tipo: "ok"; accessToken: string; refreshToken: string }
  | { tipo: "ip_bloqueado" }
  | { tipo: "captcha_necessario" }
  | { tipo: "credenciais_invalidas" }
  /** Sem resposta do servidor (offline, timeout): o único caso em que vale tentar o acesso offline. */
  | { tipo: "sem_rede" };

async function lerCorpoErro(error: unknown): Promise<RespostaLogin | null> {
  const contexto = (error as { context?: Response } | null)?.context;
  if (!contexto) return null;
  try {
    return (await contexto.json()) as RespostaLogin;
  } catch {
    return null;
  }
}

/** Login pela Edge Function "login" (gate de tentativas por IP e CAPTCHA só podem existir no servidor — ADR 0015). */
export async function loginNoServidor(matricula: string, senha: string, captchaToken: string | null): Promise<ResultadoLoginServidor> {
  const { data, error } = await supabase.functions.invoke<RespostaLogin>("login", {
    body: { matricula, senha, captcha_token: captchaToken },
    timeout: PRAZO_LOGIN_MS,
  });

  const corpo = data ?? (await lerCorpoErro(error));
  if (corpo?.flag === "ip_bloqueado") return { tipo: "ip_bloqueado" };
  if (corpo?.flag === "captcha_necessario") return { tipo: "captcha_necessario" };
  if (!corpo && error && ehFalhaDeRede(error as { message?: string; name?: string })) return { tipo: "sem_rede" };
  if (error || !corpo?.access_token || !corpo.refresh_token) return { tipo: "credenciais_invalidas" };
  return { tipo: "ok", accessToken: corpo.access_token, refreshToken: corpo.refresh_token };
}
