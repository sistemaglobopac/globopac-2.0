// Edge Function: assinar-documento (seção 7.5 do PROMPT MESTRE).
//
// Recebe apenas a REFERÊNCIA do documento (monitoramento_id) e o tipo de assinatura — nunca
// dados nem hash do cliente. O hash é sempre recalculado a partir do registro já persistido
// no banco (ver _shared/assinar.ts), o que impede um cliente malicioso de assinar um hash
// que não corresponde aos dados reais (débito técnico da v1, seção 12).
//
// O carimbo de tempo RFC 3161 em si NÃO é solicitado aqui de forma síncrona — esta função só
// enfileira o trabalho em fila_carimbo_tempo. O worker que consome essa fila com retry/
// fallback entre TSAs é escopo da Fase 2 (ver docs/adr/0001-fila-carimbo-tempo.md).
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeadersAutenticado } from "../_shared/cors.ts";
import { assinarMonitoramento, TIPO_PERMITIDO_POR_PERFIL } from "../_shared/assinar.ts";

const requestSchema = z.object({
  monitoramento_id: z.string().uuid(),
  tipo: z.enum(["INSPETOR", "VERIFICADOR", "GESTOR", "ADMIN", "LIBERACAO_DIARIA"]),
});

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(
      JSON.stringify({ correlationId, funcao: "assinar-documento", nivel, evento, ...extra })
    );

  const cors = corsHeadersAutenticado(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

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
    if (authError || !user) {
      log("error", "auth_falhou", { erro: authError?.message });
      return jsonError(401, "não autenticado", correlationId);
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "payload inválido", correlationId, parsed.error.flatten());
    }
    const { monitoramento_id, tipo } = parsed.data;

    const { data: perfil, error: perfilError } = await callerClient
      .from("perfis_usuarios")
      .select("nivel_acesso")
      .eq("id", user.id)
      .single();
    if (perfilError || !perfil) {
      return jsonError(403, "perfil não encontrado ou inativo", correlationId);
    }

    const tiposPermitidos = TIPO_PERMITIDO_POR_PERFIL[perfil.nivel_acesso] ?? [];
    if (!tiposPermitidos.includes(tipo)) {
      log("error", "tipo_nao_permitido", { perfil: perfil.nivel_acesso, tipo });
      return jsonError(
        403,
        `perfil ${perfil.nivel_acesso} não pode assinar como ${tipo}`,
        correlationId
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const resultado = await assinarMonitoramento(callerClient, adminClient, {
      monitoramentoId: monitoramento_id,
      tipo,
      userId: user.id,
    });

    if (!resultado.ok) {
      log("error", "assinatura_falhou", { motivo: resultado.mensagem });
      return jsonError(resultado.status, resultado.mensagem, correlationId);
    }

    log("info", "assinatura_criada", { assinaturaId: resultado.id, monitoramento_id, tipo });

    return new Response(
      JSON.stringify({
        id: resultado.id,
        hash_documento: resultado.hash_documento,
        criado_em: resultado.criado_em,
      }),
      { status: 201, headers: { ...cors, "Content-Type": "application/json" } }
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
