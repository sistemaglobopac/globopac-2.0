// Edge Function: excluir-colaborador (Painel de Gestão → Usuários do Sistema).
//
// Exclusão DEFINITIVA de um colaborador, só para quem nunca deixou histórico (cadastro errado,
// duplicado ou de teste). Quem já registrou/assinou qualquer coisa só pode ser DESLIGADO: o nome
// real precisa continuar nos relatórios e na cadeia de custódia (LGPD art. 7º, II). A regra de
// "tem histórico" vive no banco (excluir_colaborador_definitivo + FKs NO ACTION), não aqui.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeadersAutenticado } from "../_shared/cors.ts";

const requestSchema = z.object({ id: z.string().uuid() });

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ correlationId, funcao: "excluir-colaborador", nivel, evento, ...extra }));

  const cors = corsHeadersAutenticado(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError(401, "não autenticado", correlationId, cors);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();
    if (authError || !user) return jsonError(401, "não autenticado", correlationId, cors);

    const { data: perfilChamador } = await callerClient.from("perfis_usuarios").select("nivel_acesso").eq("id", user.id).single();
    if (perfilChamador?.nivel_acesso !== "ADMIN_MASTER") {
      return jsonError(403, "só ADMIN_MASTER exclui colaboradores", correlationId, cors);
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "payload inválido", correlationId, cors);
    const { id } = parsed.data;
    if (id === user.id) return jsonError(400, "Você não pode excluir o próprio usuário.", correlationId, cors);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: resultado, error: erroRpc } = await adminClient.rpc("excluir_colaborador_definitivo", { p_id: id });
    if (erroRpc) {
      log("error", "rpc_falhou", { erro: erroRpc.message });
      return jsonError(500, "Não foi possível excluir o colaborador.", correlationId, cors);
    }

    if (resultado === "tem_historico") {
      return jsonError(
        409,
        "Este colaborador já tem histórico (registros ou assinaturas) e não pode ser apagado: o nome dele precisa continuar nos relatórios. Use \"Desligar\" — se ele voltar, cadastrar o mesmo usuário reativa o cadastro.",
        correlationId,
        cors,
      );
    }
    if (resultado === "nao_encontrado") return jsonError(404, "Colaborador não encontrado.", correlationId, cors);

    // Perfil apagado: remove também o login do Auth (libera o e-mail/usuário para novo cadastro).
    const { error: erroAuth } = await adminClient.auth.admin.deleteUser(id);
    if (erroAuth) {
      log("error", "auth_delete_falhou", { userId: id, erro: erroAuth.message });
      return jsonError(500, "O perfil foi apagado, mas o login não pôde ser removido. Tente novamente.", correlationId, cors);
    }

    log("info", "colaborador_excluido", { userId: id, por: user.id });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (erro) {
    log("error", "excecao_nao_tratada", { erro: erro instanceof Error ? erro.message : String(erro) });
    return jsonError(500, "erro interno", correlationId, cors);
  }
});

function jsonError(status: number, mensagem: string, correlationId: string, cors: HeadersInit) {
  return new Response(JSON.stringify({ erro: mensagem, correlationId }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
