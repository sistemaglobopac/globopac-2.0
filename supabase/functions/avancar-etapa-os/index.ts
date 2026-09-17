// Edge Function: avancar-etapa-os (seção 7.4 do PROMPT MESTRE).
//
// Único ponto de entrada para toda transição de estado do ciclo de OS de manutenção —
// ABERTURA (assinatura da criação, já feita pelo INSERT direto do cliente) e as 4 transições
// seguintes (AUTORIZACAO, PROGRAMACAO, EXECUCAO, VALIDACAO). A tabela de transições
// (_shared/assinar-os.ts TRANSICOES_OS) decide o que é uma transição válida — nunca esta
// função com if/else disperso (ver ADR 0012). O UPDATE em si roda com o cliente do CHAMADOR
// (RLS manutencao_os_update decide setor/permissão), a assinatura é gravada com service_role.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";
import { assinarEtapaOs, TRANSICOES_OS } from "../_shared/assinar-os.ts";

const requestSchema = z.object({
  os_id: z.string().uuid(),
  tipo: z.enum(["ABERTURA", "AUTORIZACAO", "PROGRAMACAO", "EXECUCAO", "VALIDACAO"]),
});

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ correlationId, funcao: "avancar-etapa-os", nivel, evento, ...extra }));

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

    if (!TRANSICOES_OS[parsed.data.tipo]) {
      return jsonError(400, `tipo de etapa desconhecido: ${parsed.data.tipo}`, correlationId);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const resultado = await assinarEtapaOs(callerClient, adminClient, {
      osId: parsed.data.os_id,
      tipo: parsed.data.tipo,
      userId: user.id,
    });

    if (!resultado.ok) {
      log("error", "transicao_falhou", { motivo: resultado.mensagem, tipo: parsed.data.tipo });
      return jsonError(resultado.status, resultado.mensagem, correlationId);
    }

    log("info", "etapa_avancada", { osId: parsed.data.os_id, tipo: parsed.data.tipo, assinaturaId: resultado.id });

    return new Response(
      JSON.stringify({
        assinatura_id: resultado.id,
        hash_documento: resultado.hash_documento,
        os: resultado.os,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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
