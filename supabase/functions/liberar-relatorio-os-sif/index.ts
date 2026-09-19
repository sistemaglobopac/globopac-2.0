// Edge Function: liberar-relatorio-os-sif (seções 7.4 e 6.2 do PROMPT MESTRE).
//
// Liberação diária ao SIF do ciclo de OS — análoga a liberar-sif (monitoramentos), mas
// agregada num relatório por data_referencia (manutencao_relatorios_sif, tabela já criada na
// Fase 0) em vez de um lote novo a cada chamada. Agrega todas as OS CONCLUIDA e ainda não
// liberadas cujo concluido_em cai no dia informado, calcula o hash agregador (mesma
// serialização canônica de _shared/hash.ts), libera cada uma e assina individualmente como
// LIBERACAO_DIARIA — ver ADR 0012.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeadersAutenticado } from "../_shared/cors.ts";
import { assinarLiberacaoOs } from "../_shared/assinar-os.ts";
import { canonicalizar, sha256Hex } from "../_shared/hash.ts";

const requestSchema = z.object({ data_referencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ correlationId, funcao: "liberar-relatorio-os-sif", nivel, evento, ...extra }));

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
    if (perfil?.nivel_acesso !== "ADMIN_MASTER" && perfil?.nivel_acesso !== "INSPETOR_PCM") {
      return jsonError(403, "só INSPETOR_PCM ou ADMIN_MASTER liberam o relatório ao SIF", correlationId);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const dataReferencia = parsed.data.data_referencia;

    // 1) OS elegíveis, lidas com o cliente do CHAMADOR — a RLS decide o que ele enxerga.
    const inicioDia = `${dataReferencia}T00:00:00.000Z`;
    const fimDia = `${dataReferencia}T23:59:59.999Z`;
    const { data: elegiveis, error: erroElegiveis } = await callerClient
      .from("manutencao_os")
      .select("id")
      .eq("status", "CONCLUIDA")
      .eq("liberado_sif", false)
      .gte("concluido_em", inicioDia)
      .lte("concluido_em", fimDia);

    if (erroElegiveis) {
      log("error", "listar_elegiveis_falhou", { erro: erroElegiveis.message });
      return jsonError(500, "falha ao verificar elegibilidade", correlationId);
    }
    if (!elegiveis || elegiveis.length === 0) {
      return jsonError(409, "nenhuma OS concluída e não liberada nessa data", correlationId);
    }

    const idsElegiveis = elegiveis.map((os) => os.id as string).sort();

    // 2) Hash da assinatura VALIDACAO de cada uma (o estado final assinado).
    const { data: assinaturas, error: erroAssinaturas } = await adminClient
      .from("assinaturas_os_eletronicas")
      .select("os_id, hash_documento")
      .in("os_id", idsElegiveis)
      .eq("tipo", "VALIDACAO");

    if (erroAssinaturas) {
      log("error", "listar_assinaturas_falhou", { erro: erroAssinaturas.message });
      return jsonError(500, "falha ao ler assinaturas", correlationId);
    }

    const hashPorOs = new Map<string, string>();
    for (const a of assinaturas ?? []) hashPorOs.set(a.os_id as string, a.hash_documento as string);

    const idsComHash = idsElegiveis.filter((id) => hashPorOs.has(id));
    if (idsComHash.length === 0) {
      return jsonError(
        409,
        "nenhuma OS elegível tem assinatura VALIDACAO registrada — não é possível calcular o hash agregador",
        correlationId
      );
    }

    // 3) Relatório do dia: upsert por data_referencia (pode já existir como 'pendente', ou já
    // 'liberado' de uma chamada anterior no mesmo dia — a liberação diária é CUMULATIVA, não
    // um evento único: novas OS concluídas mais tarde no mesmo dia entram no mesmo relatório,
    // com o hash agregador recalculado sobre o conjunto completo, nunca só o incremento. Isso
    // também torna a operação idempotente/segura para retry, em vez de travar num 409
    // permanente se chamada mais de uma vez no mesmo dia (ver ASSUMPTIONS.md Fase 5).
    const { data: relatorio, error: erroUpsert } = await adminClient
      .from("manutencao_relatorios_sif")
      .upsert({ data_referencia: dataReferencia }, { onConflict: "data_referencia", ignoreDuplicates: true })
      .select("id")
      .single();
    let relatorioId = relatorio?.id as string | undefined;
    if (erroUpsert || !relatorioId) {
      const { data: existente } = await adminClient
        .from("manutencao_relatorios_sif")
        .select("id")
        .eq("data_referencia", dataReferencia)
        .single();
      relatorioId = existente?.id;
    }
    if (!relatorioId) {
      log("error", "criar_relatorio_falhou", { erro: erroUpsert?.message });
      return jsonError(500, "falha ao criar/localizar o relatório do dia", correlationId);
    }

    // 4) Libera as OS recém-elegíveis (uma única UPDATE multi-linha) — depois disso o trigger
    // de imutabilidade bloqueia qualquer novo UPDATE nessas linhas.
    const { data: liberadas, error: erroLiberar } = await callerClient
      .from("manutencao_os")
      .update({ liberado_sif: true, liberado_em: new Date().toISOString(), relatorio_sif_id: relatorioId })
      .in("id", idsComHash)
      .eq("liberado_sif", false)
      .select(
        "id, descricao, setor, ativo_referencia, status, aberto_por, autorizado_por, programado_por, executado_por, validado_por, concluido_em, criado_em"
      );

    if (erroLiberar) {
      log("error", "liberar_os_falhou", { erro: erroLiberar.message, relatorioId });
      return jsonError(500, "relatório criado, mas falhou ao liberar as OS", correlationId);
    }

    // 4b) Hash agregador CUMULATIVO: recalcula sobre TODAS as OS já ligadas a este relatório
    // (as de chamadas anteriores no mesmo dia + as recém-liberadas agora), não só o incremento
    // — mantém o hash agregador como um retrato fiel de "todo o relatório do dia até agora".
    const { data: todasDoRelatorio, error: erroTodasDoRelatorio } = await adminClient
      .from("manutencao_os")
      .select("id")
      .eq("relatorio_sif_id", relatorioId);
    if (erroTodasDoRelatorio || !todasDoRelatorio) {
      log("error", "listar_todas_relatorio_falhou", { erro: erroTodasDoRelatorio?.message, relatorioId });
      return jsonError(500, "OS liberadas, mas falhou ao recalcular o hash agregador", correlationId);
    }

    const idsCumulativos = todasDoRelatorio.map((os) => os.id as string).sort();
    const { data: assinaturasCumulativas } = await adminClient
      .from("assinaturas_os_eletronicas")
      .select("os_id, hash_documento")
      .in("os_id", idsCumulativos)
      .eq("tipo", "VALIDACAO");
    const hashCumulativoPorOs = new Map<string, string>();
    for (const a of assinaturasCumulativas ?? []) hashCumulativoPorOs.set(a.os_id as string, a.hash_documento as string);

    const hashAgregador = await sha256Hex(
      canonicalizar(idsCumulativos.map((id) => ({ id, hash: hashCumulativoPorOs.get(id) })))
    );

    const { error: erroRelatorioUpdate } = await adminClient
      .from("manutencao_relatorios_sif")
      .update({
        status: "liberado",
        hash_agregador: hashAgregador,
        quantidade_os: idsCumulativos.length,
        liberado_por: user.id,
        liberado_em: new Date().toISOString(),
      })
      .eq("id", relatorioId);
    if (erroRelatorioUpdate) {
      log("error", "atualizar_relatorio_falhou", { erro: erroRelatorioUpdate.message });
      return jsonError(500, "falha ao gravar o hash agregador do relatório", correlationId);
    }

    // 5) Assinatura individual LIBERACAO_DIARIA só para as OS recém-liberadas nesta chamada —
    // as de chamadas anteriores no mesmo relatório já têm a sua.
    const assinaturaIds: string[] = [];
    for (const os of liberadas ?? []) {
      const resultado = await assinarLiberacaoOs(adminClient, {
        osId: os.id as string,
        userId: user.id,
        os: os as unknown as Parameters<typeof assinarLiberacaoOs>[1]["os"],
      });
      if (resultado.ok) assinaturaIds.push(resultado.id);
      else log("error", "assinatura_liberacao_falhou", { osId: os.id, motivo: resultado.mensagem });
    }

    // 6) Enfileira o carimbo do hash agregador do relatório.
    const { error: erroFila } = await adminClient.from("fila_carimbo_tempo").insert({
      assinatura_id: relatorioId,
      tipo_assinatura: "relatorio_os",
      status: "pendente",
    });
    if (erroFila) log("error", "enfileirar_carimbo_relatorio_falhou", { erro: erroFila.message, relatorioId });

    log("info", "relatorio_liberado", {
      relatorioId,
      quantidade: liberadas?.length ?? 0,
      assinaturasIndividuais: assinaturaIds.length,
    });

    return new Response(
      JSON.stringify({
        relatorio_id: relatorioId,
        quantidade_liberada: liberadas?.length ?? 0,
        hash_agregador: hashAgregador,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
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
