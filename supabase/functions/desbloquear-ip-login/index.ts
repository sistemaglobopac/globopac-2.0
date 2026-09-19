// Edge Function: desbloquear-ip-login (Painel de Gestão → aba "Segurança de Login").
//
// Só ADMIN_MASTER desbloqueia um IP travado por excesso de tentativas de login — pedido
// explícito do responsável do projeto ("Somente um administrador poderá liberar o login por
// aquele IP novamente"). Ver ADR 0015. Reseta o contador por completo (em vez de só trocar o
// status) para não deixar tentativas_falhas residual acima do limite de CAPTCHA — sem isso, a
// PRÓXIMA falha depois do desbloqueio reativaria o CAPTCHA imediatamente, como se o
// desbloqueio nunca tivesse acontecido.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeadersAutenticado } from "../_shared/cors.ts";

const requestSchema = z.object({ ip: z.string().min(1) });

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const cors = corsHeadersAutenticado(req);
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ correlationId, funcao: "desbloquear-ip-login", nivel, evento, ...extra }));

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError(401, "não autenticado", correlationId, cors);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();
    if (authError || !user) return jsonError(401, "não autenticado", correlationId, cors);

    const { data: perfilChamador } = await callerClient
      .from("perfis_usuarios")
      .select("nivel_acesso")
      .eq("id", user.id)
      .single();
    if (perfilChamador?.nivel_acesso !== "ADMIN_MASTER") {
      return jsonError(403, "só ADMIN_MASTER desbloqueia um IP", correlationId, cors);
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "payload inválido", correlationId, cors, parsed.error.flatten());
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const agora = new Date().toISOString();
    const { error: erroUpdate } = await adminClient
      .from("bloqueios_login_ip")
      .update({
        tentativas_falhas: 0,
        status: "normal",
        bloqueado_em: null,
        desbloqueado_por: user.id,
        desbloqueado_em: agora,
        atualizado_em: agora,
      })
      .eq("ip", parsed.data.ip);

    if (erroUpdate) {
      log("error", "desbloquear_falhou", { erro: erroUpdate.message, ip: parsed.data.ip });
      return jsonError(500, "falha ao desbloquear o IP", correlationId, cors);
    }

    log("info", "ip_desbloqueado", { ip: parsed.data.ip, adminId: user.id });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (erro) {
    log("error", "excecao_nao_tratada", { erro: erro instanceof Error ? erro.message : String(erro) });
    return jsonError(500, "erro interno", correlationId, cors);
  }
});

function jsonError(status: number, mensagem: string, correlationId: string, cors: HeadersInit, detalhes?: unknown) {
  return new Response(JSON.stringify({ erro: mensagem, correlationId, detalhes }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
