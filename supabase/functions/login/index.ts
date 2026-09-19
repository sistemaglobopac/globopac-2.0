// Edge Function: login — ponto de entrada único de autenticação (pedido explícito do
// responsável do projeto: bloqueio de login por IP, fora do roteiro de fases). Ver ADR 0015.
//
// Substitui a chamada direta do LoginPage a supabase.auth.signInWithPassword: o gate de
// tentativas por IP (5 falhas -> exige CAPTCHA, 10 falhas -> bloqueia até um ADMIN_MASTER
// desbloquear) só pode ser aplicado no servidor — o cliente nunca é confiável para impor um
// limite contra ele mesmo. O login em si continua sendo feito pela Supabase Auth de verdade
// (signInWithPassword com a anon key, dentro desta função) — nunca reimplementa verificação
// de senha, só adiciona o gate de tentativas antes/depois de chamar a Auth real.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeadersAutenticado } from "../_shared/cors.ts";

// Tipo explícito (em vez de ReturnType<typeof createClient>): createClient é uma função com
// overloads genéricos que resolve para uma variante incompatível sem isso — mesmo problema já
// documentado em verificar-documento/index.ts.
type AdminClient = SupabaseClient<any, "public", any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const LIMITE_CAPTCHA = 5;
const LIMITE_BLOQUEIO = 10;
const ERRO_CREDENCIAIS = "Matrícula ou senha inválidos.";

type Flag = "captcha_necessario" | "ip_bloqueado";

const requestSchema = z.object({
  matricula: z.string().min(1),
  senha: z.string().min(1),
  captcha_token: z.string().nullish(),
});

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const cors = corsHeadersAutenticado(req);
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ correlationId, funcao: "login", nivel, evento, ...extra }));

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";

  try {
    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "payload inválido", correlationId, cors);

    const { data: bloqueio } = await adminClient
      .from("bloqueios_login_ip")
      .select("status")
      .eq("ip", ip)
      .maybeSingle();

    if (bloqueio?.status === "bloqueado") {
      log("error", "ip_bloqueado", { ip });
      return jsonError(
        403,
        "login bloqueado para este IP por excesso de tentativas — contate um administrador",
        correlationId,
        cors,
        "ip_bloqueado"
      );
    }

    if (bloqueio?.status === "aguardando_captcha") {
      const captchaOk = parsed.data.captcha_token
        ? await verificarHCaptcha(parsed.data.captcha_token, ip, log)
        : false;
      if (!captchaOk) {
        return jsonError(
          400,
          "confirme que você não é um robô para continuar",
          correlationId,
          cors,
          "captcha_necessario"
        );
      }
    }

    // Supabase Auth só autentica por e-mail/telefone — resolve matrícula -> e-mail via RPC
    // (mesma função já usada pelo LoginPage antes desta Edge Function existir).
    const { data: email, error: erroLookup } = await adminClient.rpc("email_por_matricula", {
      p_matricula: parsed.data.matricula,
    });

    if (erroLookup || !email) {
      const flag = await registrarFalha(adminClient, ip);
      log("error", "matricula_nao_encontrada", { ip });
      return jsonError(401, ERRO_CREDENCIAIS, correlationId, cors, flag);
    }

    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: sessao, error: erroLogin } = await anonClient.auth.signInWithPassword({
      email,
      password: parsed.data.senha,
    });

    if (erroLogin || !sessao.session) {
      const flag = await registrarFalha(adminClient, ip);
      log("error", "senha_incorreta", { ip });
      return jsonError(401, ERRO_CREDENCIAIS, correlationId, cors, flag);
    }

    // Sucesso zera o contador de falhas do IP (nunca cria uma linha nova — esta tabela só
    // registra estado de falha, uma origem que nunca falhou não precisa aparecer nela).
    await adminClient
      .from("bloqueios_login_ip")
      .update({
        tentativas_falhas: 0,
        status: "normal",
        primeira_falha_em: null,
        ultima_falha_em: null,
        bloqueado_em: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("ip", ip);

    log("info", "login_ok", { ip });
    return new Response(
      JSON.stringify({
        access_token: sessao.session.access_token,
        refresh_token: sessao.session.refresh_token,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (erro) {
    log("error", "excecao_nao_tratada", { erro: erro instanceof Error ? erro.message : String(erro) });
    return jsonError(500, "erro interno", correlationId, cors);
  }
});

/** Incrementa o contador de falhas do IP e recalcula o status. Lê-então-grava (não é atômico
 * sob concorrência extrema do MESMO IP no mesmo instante) — aceito deliberadamente: o pior
 * caso é subcontar uma falha ocasional, atrasando o gate em uma tentativa, nunca uma falha de
 * segurança (o oposto, contar demais, não é possível aqui). Volume esperado (ASSUMPTIONS.md
 * item 3) não justifica uma função SQL atômica só para este contador. */
async function registrarFalha(adminClient: AdminClient, ip: string): Promise<Flag | undefined> {
  const agora = new Date().toISOString();
  const { data: atual } = await adminClient
    .from("bloqueios_login_ip")
    .select("tentativas_falhas")
    .eq("ip", ip)
    .maybeSingle();

  const tentativas = ((atual?.tentativas_falhas as number | undefined) ?? 0) + 1;
  const status =
    tentativas >= LIMITE_BLOQUEIO ? "bloqueado" : tentativas >= LIMITE_CAPTCHA ? "aguardando_captcha" : "normal";

  await adminClient.from("bloqueios_login_ip").upsert(
    {
      ip,
      tentativas_falhas: tentativas,
      primeira_falha_em: atual ? undefined : agora,
      ultima_falha_em: agora,
      status,
      bloqueado_em: status === "bloqueado" ? agora : null,
      atualizado_em: agora,
    },
    { onConflict: "ip" }
  );

  if (status === "bloqueado") return "ip_bloqueado";
  if (status === "aguardando_captcha") return "captcha_necessario";
  return undefined;
}

/** hCaptcha, não Cloudflare Turnstile: a conta Turnstile usada apresentou erro persistente
 * "400020 invalid sitekey" em toda sitekey real (só a sitekey de teste funcionava) — problema
 * de conta do lado da Cloudflare, confirmado isolando com a sitekey de teste, não corrigível
 * por configuração deste projeto. Ver ADR 0015. */
type LogFn = (nivel: "info" | "error", evento: string, extra?: Record<string, unknown>) => void;

async function verificarHCaptcha(token: string, ip: string, log: LogFn): Promise<boolean> {
  const secret = Deno.env.get("HCAPTCHA_SECRET_KEY");
  // Fail-closed: sem secret configurado, nunca aceita o desafio como válido (nunca abre uma
  // brecha silenciosa por falta de configuração de ambiente).
  if (!secret) {
    log("error", "hcaptcha_secret_ausente");
    return false;
  }

  try {
    // Timeout explícito (mesmo princípio de _shared/rfc3161.ts): sem isso, uma rede degradada
    // ou travada entre a Edge Function e a API do hCaptcha prende a Promise indefinidamente,
    // sem lançar erro nem retornar.
    const resposta = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    });
    const resultado = await resposta.json();
    if (resultado?.success !== true) {
      log("error", "hcaptcha_siteverify_falhou", { resultado });
    }
    return resultado?.success === true;
  } catch (erro) {
    log("error", "hcaptcha_fetch_falhou", { erro: erro instanceof Error ? erro.message : String(erro) });
    return false;
  }
}

function jsonError(
  status: number,
  mensagem: string,
  correlationId: string,
  cors: HeadersInit,
  flag?: Flag
) {
  return new Response(JSON.stringify({ erro: mensagem, correlationId, flag }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
