// Edge Function: liberar-sif (seção 7.3 do PROMPT MESTRE).
//
// Versão MÍNIMA para a Fase 2: libera um monitoramento por vez (não em lote) e assina como
// LIBERACAO_DIARIA. A liberação em LOTE, com hash agregador (lote_liberacao_sif) e o portal
// público de verificação, é escopo da Fase 3 — ver ASSUMPTIONS.md e roteiro no README. Isso
// existe agora só o suficiente para o fluxo E2E nº 2 (seção 10) fechar ponta a ponta:
// "Verificador aprova → assina → Admin libera SIF → aparece para Inspeção Federal".
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";
import { assinarMonitoramento } from "../_shared/assinar.ts";

const requestSchema = z.object({ monitoramento_id: z.string().uuid() });

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ correlationId, funcao: "liberar-sif", nivel, evento, ...extra }));

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError(401, "não autenticado", correlationId);

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
    if (authError || !user) return jsonError(401, "não autenticado", correlationId);

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "payload inválido", correlationId, parsed.error.flatten());
    }

    const { data: perfil } = await callerClient
      .from("perfis_usuarios")
      .select("nivel_acesso")
      .eq("id", user.id)
      .single();
    if (perfil?.nivel_acesso !== "ADMIN_MASTER") {
      return jsonError(403, "só ADMIN_MASTER libera ao SIF", correlationId);
    }

    // A RLS (monitoramentos_update_liberar_sif) e o trigger de imutabilidade são a fonte
    // real de verdade sobre se isto é permitido — esta query, com o cliente do chamador,
    // apenas devolve 0 linhas se não for.
    const { data: atualizado, error: updateError } = await callerClient
      .from("monitoramentos")
      .update({ liberado_sif: true, liberado_em: new Date().toISOString() })
      .eq("id", parsed.data.monitoramento_id)
      .eq("liberado_sif", false)
      .not("verificado_por", "is", null)
      .select("id")
      .single();

    if (updateError || !atualizado) {
      log("error", "update_falhou", { erro: updateError?.message });
      return jsonError(
        409,
        "não encontrado, já liberado, ainda não verificado, ou sem permissão",
        correlationId
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const assinatura = await assinarMonitoramento(callerClient, adminClient, {
      monitoramentoId: parsed.data.monitoramento_id,
      tipo: "LIBERACAO_DIARIA",
      userId: user.id,
    });

    if (!assinatura.ok) {
      log("error", "assinatura_falhou", { motivo: assinatura.mensagem });
      return jsonError(
        assinatura.status,
        `liberado, mas falhou ao assinar: ${assinatura.mensagem}`,
        correlationId
      );
    }

    log("info", "liberado_ao_sif", { monitoramento_id: parsed.data.monitoramento_id, assinaturaId: assinatura.id });

    return new Response(JSON.stringify({ monitoramento_id: parsed.data.monitoramento_id, assinatura_id: assinatura.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (erro) {
    log("error", "excecao_nao_tratada", { erro: erro instanceof Error ? erro.message : String(erro) });
    return jsonError(500, "erro interno", correlationId);
  }
});

function jsonError(status: number, mensagem: string, correlationId: string, detalhes?: unknown) {
  return new Response(JSON.stringify({ erro: mensagem, correlationId, detalhes }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
