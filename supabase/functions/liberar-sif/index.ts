// Edge Function: liberar-sif (seções 7.3 e 6.2 do PROMPT MESTRE).
//
// Libera em LOTE (a Fase 2 tinha uma versão que liberava um por vez, sem hash agregador —
// substituída por esta: mesmo liberar um único documento passa pelo mesmo lote de 1, sempre
// com a camada extra de tamper-evidence do hash agregador). Cada documento liberado também
// recebe sua própria assinatura LIBERACAO_DIARIA (trilha individual, seção 7.5), além do
// hash agregador do lote em si (seção 6.2) — as duas coisas, não uma ou outra.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";
import { assinarMonitoramento } from "../_shared/assinar.ts";
import { canonicalizar, sha256Hex } from "../_shared/hash.ts";

const requestSchema = z.object({ monitoramento_ids: z.array(z.string().uuid()).min(1) });

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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1) Candidatos elegíveis: ainda não liberados, já verificados. Lido com o cliente do
    // chamador — se a RLS não deixasse o ADMIN_MASTER ver algum id, ele simplesmente não
    // apareceria aqui (nunca um erro que vaze existência).
    const { data: elegiveis, error: erroElegiveis } = await callerClient
      .from("monitoramentos")
      .select("id")
      .in("id", parsed.data.monitoramento_ids)
      .eq("liberado_sif", false)
      .not("verificado_por", "is", null);

    if (erroElegiveis) {
      log("error", "listar_elegiveis_falhou", { erro: erroElegiveis.message });
      return jsonError(500, "falha ao verificar elegibilidade", correlationId);
    }
    if (!elegiveis || elegiveis.length === 0) {
      return jsonError(409, "nenhum dos monitoramentos informados está elegível para liberação", correlationId);
    }

    const idsElegiveis = elegiveis.map((m) => m.id as string).sort();

    // 2) Hash da assinatura mais recente de cada um (a mais recente = o estado final
    // assinado, tipicamente a verificação).
    const { data: assinaturas, error: erroAssinaturas } = await adminClient
      .from("assinaturas_eletronicas")
      .select("monitoramento_id, hash_documento, criado_em")
      .in("monitoramento_id", idsElegiveis)
      .order("criado_em", { ascending: false });

    if (erroAssinaturas) {
      log("error", "listar_assinaturas_falhou", { erro: erroAssinaturas.message });
      return jsonError(500, "falha ao ler assinaturas", correlationId);
    }

    const hashPorMonitoramento = new Map<string, string>();
    for (const a of assinaturas ?? []) {
      const id = a.monitoramento_id as string;
      if (!hashPorMonitoramento.has(id)) hashPorMonitoramento.set(id, a.hash_documento as string);
    }

    const idsComHash = idsElegiveis.filter((id) => hashPorMonitoramento.has(id));
    if (idsComHash.length === 0) {
      return jsonError(
        409,
        "nenhum dos monitoramentos elegíveis tem assinatura registrada — não é possível calcular o hash agregador",
        correlationId
      );
    }

    // 3) Hash agregador do lote (seção 6.2) — ordem determinística (ids ordenados), sobre
    // pares {id, hash}, reaproveitando a mesma serialização canônica usada nas assinaturas
    // individuais (_shared/hash.ts), não uma segunda implementação de hashing.
    const hashAgregador = await sha256Hex(
      canonicalizar(idsComHash.map((id) => ({ id, hash: hashPorMonitoramento.get(id) })))
    );

    const dataReferencia = new Date().toISOString().slice(0, 10);

    const { data: lote, error: erroLote } = await adminClient
      .from("lote_liberacao_sif")
      .insert({
        data_referencia: dataReferencia,
        hash_agregador: hashAgregador,
        quantidade_documentos: idsComHash.length,
        liberado_por: user.id,
      })
      .select("id")
      .single();

    if (erroLote || !lote) {
      log("error", "criar_lote_falhou", { erro: erroLote?.message });
      return jsonError(500, "falha ao criar lote de liberação", correlationId);
    }

    // 4) Uma única UPDATE multi-linha (liberado_sif, liberado_em, lote_liberacao_id juntos —
    // depois disso o trigger de imutabilidade bloqueia qualquer novo UPDATE nestas linhas).
    const { data: atualizados, error: erroUpdate } = await callerClient
      .from("monitoramentos")
      .update({
        liberado_sif: true,
        liberado_em: new Date().toISOString(),
        lote_liberacao_id: lote.id,
      })
      .in("id", idsComHash)
      .eq("liberado_sif", false)
      .select("id");

    if (erroUpdate) {
      log("error", "liberar_falhou", { erro: erroUpdate.message, loteId: lote.id });
      return jsonError(500, "lote criado, mas falhou ao liberar os monitoramentos", correlationId);
    }

    // 5) Assinatura individual LIBERACAO_DIARIA por documento liberado.
    const assinaturaIds: string[] = [];
    for (const m of atualizados ?? []) {
      const resultado = await assinarMonitoramento(callerClient, adminClient, {
        monitoramentoId: m.id as string,
        tipo: "LIBERACAO_DIARIA",
        userId: user.id,
      });
      if (resultado.ok) assinaturaIds.push(resultado.id);
      else log("error", "assinatura_individual_falhou", { monitoramentoId: m.id, motivo: resultado.mensagem });
    }

    // 6) Enfileira o carimbo de tempo do LOTE (hash agregador) — mesma fila, mesmo worker.
    const { error: erroFila } = await adminClient.from("fila_carimbo_tempo").insert({
      assinatura_id: lote.id,
      tipo_assinatura: "lote",
      status: "pendente",
    });
    if (erroFila) log("error", "enfileirar_carimbo_lote_falhou", { erro: erroFila.message, loteId: lote.id });

    log("info", "lote_liberado", {
      loteId: lote.id,
      quantidade: atualizados?.length ?? 0,
      assinaturasIndividuais: assinaturaIds.length,
    });

    return new Response(
      JSON.stringify({
        lote_id: lote.id,
        quantidade_liberada: atualizados?.length ?? 0,
        hash_agregador: hashAgregador,
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
