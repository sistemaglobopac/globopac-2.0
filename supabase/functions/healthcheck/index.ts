// Edge Function: healthcheck (Fase 9 — observabilidade).
//
// Endpoint público (verify_jwt=false, seção 7.6-style) para um monitor de uptime externo
// (ex.: UptimeRobot, Better Uptime) verificar que o sistema está de pé e sinalizar
// degradação operacional cedo — carimbos presos, RNCs com SLA vencido — antes que virem
// reclamação. Nunca devolve dado individual, só contagens agregadas (ver ADR 0011 sobre por
// que endpoints públicos nunca vazam mais do que o estritamente necessário).
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ correlationId, funcao: "healthcheck", nivel, evento, ...extra }));

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: configAlerta } = await adminClient
      .from("app_config")
      .select("valor")
      .eq("chave", "carimbo_alerta_horas")
      .single();
    const alertaHoras = (configAlerta?.valor as number | undefined) ?? 4;
    const limiteAlerta = new Date(Date.now() - alertaHoras * 60 * 60 * 1000).toISOString();

    const [
      { count: carimbosPendentesAntigos, error: erroCarimbos },
      { count: carimbosFalharam, error: erroFalharam },
      { count: rncsSlaVencido, error: erroRnc },
      { count: totalUsuarios, error: erroDb },
    ] = await Promise.all([
      adminClient
        .from("fila_carimbo_tempo")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente")
        .lte("criado_em", limiteAlerta),
      adminClient
        .from("fila_carimbo_tempo")
        .select("id", { count: "exact", head: true })
        .eq("status", "falhou_definitivo"),
      adminClient
        .from("rnc")
        .select("id", { count: "exact", head: true })
        .neq("status", "FECHADA")
        .lt("prazo_sla", new Date().toISOString()),
      // Também serve como teste de conectividade real ao Postgres (não só ao PostgREST).
      adminClient.from("perfis_usuarios").select("id", { count: "exact", head: true }),
    ]);

    const erroConectividade = erroCarimbos || erroFalharam || erroRnc || erroDb;
    if (erroConectividade) {
      log("error", "checagem_db_falhou", { erro: erroConectividade.message });
      return new Response(
        JSON.stringify({ status: "erro", correlationId, motivo: "falha ao consultar o banco" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const degradado = (carimbosPendentesAntigos ?? 0) > 0 || (rncsSlaVencido ?? 0) > 0;

    const corpo = {
      status: degradado ? "degradado" : "ok",
      timestamp: new Date().toISOString(),
      checks: {
        banco_de_dados: true,
        carimbos_pendentes_ha_mais_de_horas: alertaHoras,
        carimbos_pendentes_antigos: carimbosPendentesAntigos ?? 0,
        carimbos_falharam_definitivamente: carimbosFalharam ?? 0,
        rncs_com_sla_vencido: rncsSlaVencido ?? 0,
        usuarios_cadastrados: totalUsuarios ?? 0,
      },
    };

    log("info", "healthcheck_ok", { status: corpo.status });

    // 503 quando degradado — para o monitor de uptime já disparar alerta pelo próprio status
    // HTTP, sem precisar entender o corpo da resposta.
    return new Response(JSON.stringify(corpo), {
      status: degradado ? 503 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (erro) {
    log("error", "excecao_nao_tratada", { erro: erro instanceof Error ? erro.message : String(erro) });
    return new Response(JSON.stringify({ status: "erro", correlationId }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
