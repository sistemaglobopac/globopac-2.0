// Edge Function: processar-fila-carimbo (seção 6.1 e 7.5 do PROMPT MESTRE).
//
// Worker da fila de carimbo de tempo RFC 3161. Invocado periodicamente via pg_cron + pg_net
// (ver scripts/configurar-worker-carimbo.mjs e docs/adr/0010-worker-carimbo-tempo.md), e
// também sob demanda pelo botão "Processar agora" do painel de pendências (ADMIN_MASTER).
//
// Nunca bloqueia a operação do usuário: quem assina uma ficha recebe a assinatura na hora
// (Fase 1); o carimbo em si é sempre assíncrono, processado aqui.
import { createClient } from "@supabase/supabase-js";
import { corsHeadersAutenticado } from "../_shared/cors.ts";
import { decodificarPayloadJwt } from "../_shared/jwt.ts";
import { processarItemCarimbo, type ItemFilaCarimbo } from "../_shared/carimbo-processador.ts";
import { lerPoliticaRetryCarimbo } from "../_shared/tsa-config.ts";

const TAMANHO_LOTE = 20;

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(
      JSON.stringify({ correlationId, funcao: "processar-fila-carimbo", nivel, evento, ...extra })
    );

  const cors = corsHeadersAutenticado(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const claims = decodificarPayloadJwt(req.headers.get("Authorization"));
  const chamadorConfiavel = claims?.role === "service_role" || claims?.perfil === "ADMIN_MASTER";
  if (!chamadorConfiavel) {
    return new Response(JSON.stringify({ erro: "não autorizado" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const politica = await lerPoliticaRetryCarimbo(adminClient);

  const { data: pendentes, error: erroPendentes } = await adminClient
    .from("fila_carimbo_tempo")
    .select("id, assinatura_id, tipo_assinatura, tentativas, tsa_tentadas")
    .eq("status", "pendente")
    .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${new Date().toISOString()}`)
    .order("criado_em", { ascending: true })
    .limit(TAMANHO_LOTE);

  if (erroPendentes) {
    log("error", "listar_pendentes_falhou", { erro: erroPendentes.message });
    return new Response(JSON.stringify({ erro: "falha ao listar fila" }), { status: 500 });
  }

  let processados = 0;
  let concluidos = 0;
  let falharam = 0;

  for (const item of pendentes ?? []) {
    processados++;
    const resultado = await processarItemCarimbo(adminClient, item as ItemFilaCarimbo, politica);
    if (resultado === "concluido") concluidos++;
    else if (resultado === "falhou") falharam++;
  }

  return new Response(
    JSON.stringify({ processados, concluidos, falharam, correlationId }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
  );
});
