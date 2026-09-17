// Edge Function: processar-fila-carimbo (seção 6.1 e 7.5 do PROMPT MESTRE).
//
// Worker da fila de carimbo de tempo RFC 3161. Invocado periodicamente via pg_cron + pg_net
// (ver scripts/configurar-worker-carimbo.mjs e docs/adr/0010-worker-carimbo-tempo.md), e
// também sob demanda pelo botão "Processar agora" do painel de pendências (ADMIN_MASTER).
//
// Nunca bloqueia a operação do usuário: quem assina uma ficha recebe a assinatura na hora
// (Fase 1); o carimbo em si é sempre assíncrono, processado aqui.
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { decodificarPayloadJwt } from "../_shared/jwt.ts";
import { solicitarCarimboRFC3161 } from "../_shared/rfc3161.ts";
import { calcularProximaTentativa, lerPoliticaRetryCarimbo } from "../_shared/tsa-config.ts";

const TAMANHO_LOTE = 20;

const TABELA_POR_TIPO: Record<string, { tabela: string; colunaHash: string }> = {
  ficha: { tabela: "assinaturas_eletronicas", colunaHash: "hash_documento" },
  os: { tabela: "assinaturas_os_eletronicas", colunaHash: "hash_documento" },
  lote: { tabela: "lote_liberacao_sif", colunaHash: "hash_agregador" },
};

function bytesParaHexPostgres(bytes: Uint8Array): string {
  let hex = "\\x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(
      JSON.stringify({ correlationId, funcao: "processar-fila-carimbo", nivel, evento, ...extra })
    );

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    const destino = TABELA_POR_TIPO[item.tipo_assinatura];
    if (!destino) {
      log("error", "tipo_assinatura_desconhecido", { item });
      continue;
    }

    const { data: origem, error: erroOrigem } = await adminClient
      .from(destino.tabela)
      .select(destino.colunaHash)
      .eq("id", item.assinatura_id)
      .single();

    if (erroOrigem || !origem) {
      log("error", "registro_origem_nao_encontrado", { itemId: item.id, erro: erroOrigem?.message });
      continue;
    }
    const hashDocumento = (origem as unknown as Record<string, string>)[destino.colunaHash];

    const tentadasAntes: string[] = item.tsa_tentadas ?? [];
    let sucesso: { tsrBase64: string; genTime: Date; cadeiaCertificadosDer: Uint8Array; tsaNome: string } | null =
      null;
    const errosDesteRound: string[] = [];
    const novasTentadas = new Set(tentadasAntes);

    for (const tsa of politica.tsas) {
      const resultado = await solicitarCarimboRFC3161(tsa.url, hashDocumento);
      novasTentadas.add(tsa.nome);
      if (resultado.ok) {
        sucesso = { ...resultado, tsaNome: tsa.nome };
        break;
      }
      errosDesteRound.push(`${tsa.nome}: ${resultado.erro}`);
    }

    if (sucesso) {
      const { error: erroUpdate } = await adminClient
        .from(destino.tabela)
        .update({
          tsr_base64: sucesso.tsrBase64,
          tsa_emitido_em: sucesso.genTime.toISOString(),
          tsa_utilizada: sucesso.tsaNome,
          cadeia_certificados_tsa: bytesParaHexPostgres(sucesso.cadeiaCertificadosDer),
        })
        .eq("id", item.assinatura_id);

      if (erroUpdate) {
        log("error", "gravar_carimbo_falhou", { itemId: item.id, erro: erroUpdate.message });
        continue;
      }

      await adminClient
        .from("fila_carimbo_tempo")
        .update({ status: "concluido", tsa_tentadas: Array.from(novasTentadas) })
        .eq("id", item.id);

      concluidos++;
      log("info", "carimbo_concluido", { itemId: item.id, tsa: sucesso.tsaNome });
    } else {
      const tentativas = item.tentativas + 1;
      const definitivo = tentativas >= politica.maxTentativas;
      await adminClient
        .from("fila_carimbo_tempo")
        .update({
          status: definitivo ? "falhou_definitivo" : "pendente",
          tentativas,
          tsa_tentadas: Array.from(novasTentadas),
          ultimo_erro: errosDesteRound.join(" | "),
          proxima_tentativa_em: definitivo
            ? null
            : calcularProximaTentativa(tentativas, politica.backoffBaseSegundos).toISOString(),
        })
        .eq("id", item.id);

      falharam++;
      log(definitivo ? "error" : "info", "carimbo_falhou_rodada", {
        itemId: item.id,
        tentativas,
        definitivo,
        erros: errosDesteRound,
      });
    }
  }

  return new Response(
    JSON.stringify({ processados, concluidos, falharam, correlationId }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
