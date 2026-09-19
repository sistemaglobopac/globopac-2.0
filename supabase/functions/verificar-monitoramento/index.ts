// Edge Function: verificar-monitoramento (seção 7.1 e 7.2 do PROMPT MESTRE).
//
// Aprova ou reprova um monitoramento. A UPDATE em si roda com o cliente do CHAMADOR (a RLS —
// monitoramentos_update_verificar — e o trigger de segregação de funções decidem se é
// permitido, não esta função). Se reprovado, abre uma RNC automaticamente. Em ambos os
// casos, assina o resultado como VERIFICADOR (reaproveitando _shared/assinar.ts — nunca uma
// segunda implementação de hash/gravação de assinatura).
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeadersAutenticado } from "../_shared/cors.ts";
import { assinarMonitoramento } from "../_shared/assinar.ts";

const requestSchema = z.discriminatedUnion("decisao", [
  z.object({ decisao: z.literal("aprovar"), monitoramento_id: z.string().uuid() }),
  z.object({
    decisao: z.literal("reprovar"),
    monitoramento_id: z.string().uuid(),
    severidade: z.enum(["CRITICA", "ALTA", "MEDIA", "BAIXA"]),
    descricao: z.string().min(1).max(2000).optional(),
  }),
]);

const SLA_PADRAO_HORAS: Record<string, number> = {
  CRITICA: 24,
  ALTA: 72,
  MEDIA: 168,
  BAIXA: 360,
};

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(
      JSON.stringify({ correlationId, funcao: "verificar-monitoramento", nivel, evento, ...extra })
    );

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

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "payload inválido", correlationId, cors, parsed.error.flatten());
    }
    const dados = parsed.data;

    // A UPDATE só afeta um registro ainda não verificado — evita reverificar em corrida.
    // Se a RLS negar (perfil/setor) ou o registro já estiver verificado, 0 linhas voltam.
    const { data: atualizado, error: updateError } = await callerClient
      .from("monitoramentos")
      .update({
        conformidade: dados.decisao === "aprovar",
        verificado_por: user.id,
        verificado_em: new Date().toISOString(),
      })
      .eq("id", dados.monitoramento_id)
      .is("verificado_por", null)
      .select("id, setor, conformidade, verificado_por")
      .single();

    if (updateError || !atualizado) {
      log("error", "update_falhou", { erro: updateError?.message });
      return jsonError(
        409,
        "monitoramento não encontrado, já verificado, ou sem permissão para verificar",
        correlationId,
        cors
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let rnc: { id: string } | null = null;
    if (dados.decisao === "reprovar") {
      const { data: config } = await callerClient
        .from("app_config")
        .select("valor")
        .eq("chave", "sla_rnc_horas_por_severidade")
        .single();
      const horasPorSeveridade = (config?.valor as Record<string, number> | undefined) ?? SLA_PADRAO_HORAS;
      const horas = horasPorSeveridade[dados.severidade] ?? SLA_PADRAO_HORAS[dados.severidade];
      const prazoSla = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();

      const { data: rncCriada, error: rncError } = await callerClient
        .from("rnc")
        .insert({
          monitoramento_id: dados.monitoramento_id,
          descricao:
            dados.descricao ??
            `RNC aberta automaticamente pela reprovação do monitoramento ${dados.monitoramento_id}.`,
          setor: atualizado.setor,
          severidade: dados.severidade,
          aberto_por: user.id,
          prazo_sla: prazoSla,
        })
        .select("id")
        .single();

      if (rncError || !rncCriada) {
        log("error", "criar_rnc_falhou", { erro: rncError?.message });
        return jsonError(500, "reprovação registrada, mas falhou ao abrir RNC", correlationId, cors);
      }
      rnc = rncCriada;
    }

    const assinatura = await assinarMonitoramento(callerClient, adminClient, {
      monitoramentoId: dados.monitoramento_id,
      tipo: "VERIFICADOR",
      userId: user.id,
    });

    if (!assinatura.ok) {
      log("error", "assinatura_falhou", { motivo: assinatura.mensagem });
      return jsonError(
        assinatura.status,
        `verificação registrada, mas falhou ao assinar: ${assinatura.mensagem}`,
        correlationId,
        cors
      );
    }

    log("info", "verificacao_concluida", {
      monitoramento_id: dados.monitoramento_id,
      decisao: dados.decisao,
      rncId: rnc?.id,
      assinaturaId: assinatura.id,
    });

    return new Response(
      JSON.stringify({ monitoramento: atualizado, rnc, assinatura_id: assinatura.id }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
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
