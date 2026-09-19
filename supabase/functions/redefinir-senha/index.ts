// Edge Function: redefinir-senha (Painel de Gestão → botão "Redefinir Senha" da tabela de
// usuários). auth.admin.updateUserById só existe com service_role — precisa da mesma checagem
// de autorização (chamador autenticado e ADMIN_MASTER) que criar-usuario, mas sem tocar em
// perfis_usuarios (a senha vive só no Auth).
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeadersAutenticado } from "../_shared/cors.ts";

const requestSchema = z.object({
  user_id: z.string().uuid(),
  nova_senha: z.string().min(6),
});

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ correlationId, funcao: "redefinir-senha", nivel, evento, ...extra }));

  const cors = corsHeadersAutenticado(req);
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
      return jsonError(403, "só ADMIN_MASTER redefine senhas", correlationId, cors);
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "payload inválido", correlationId, cors, parsed.error.flatten());
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: erroUpdate } = await adminClient.auth.admin.updateUserById(parsed.data.user_id, {
      password: parsed.data.nova_senha,
    });
    if (erroUpdate) {
      log("error", "redefinir_falhou", { erro: erroUpdate.message, userId: parsed.data.user_id });
      return jsonError(500, "falha ao redefinir a senha", correlationId, cors);
    }

    log("info", "senha_redefinida", { userId: parsed.data.user_id });
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
