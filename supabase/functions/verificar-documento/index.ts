// Edge Function: verificar-documento (seção 7.6 do PROMPT MESTRE) — portal público
// /verificar?id=<uuid>. Sem login (verify_jwt = false em supabase/config.toml).
//
// A partir da Fase 5, cobre também Ordens de Serviço (manutencao_os.liberado_sif, ver ADR
// 0012) — tenta monitoramentos primeiro e, se não encontrado, tenta OS. Mesmas regras de
// segurança para os dois tipos de documento.
//
// Regras de segurança (seção 7.6):
// - "não encontrado" e "existe mas não liberado" retornam a MESMA resposta ao cliente —
//   nunca revelar a um anônimo se um UUID existe.
// - Documento sem nenhuma assinatura nunca mostra um hash/selo fabricado (débito da v1:
//   "fallback de hash mostrando prefixo de UUID como se fosse SHA-256").
// - Rate limiting por IP (hash do IP, nunca em claro) usando log_acessos_verificacao.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";
import { conteudoAssinavelMonitoramento, conteudoAssinavelOs, sha256Hex } from "../_shared/hash.ts";

// Tipo explícito (em vez de ReturnType<typeof createClient>): createClient é uma função com
// overloads genéricos, e ReturnType sozinho resolve para uma variante incompatível com o que
// `createClient(url, key)` (sem generic) realmente retorna nas chamadas abaixo.
type AdminClient = SupabaseClient<any, "public", any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface MonitoramentoParaHash {
  id: string;
  ficha_template_id: string;
  versao_template: number;
  user_id: string;
  setor: string;
  dados_dinamicos: unknown;
  conformidade: boolean | null;
  verificado_por: string | null;
  criado_em: string;
  liberado_sif: boolean;
}

const requestSchema = z.object({ id: z.string().uuid() });

interface ItemTrilha {
  tipo: string;
  nome: string;
  criado_em: string;
  carimbo: { emitido_em: string | null; tsa: string | null } | null;
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ correlationId, funcao: "verificar-documento", nivel, evento, ...extra }));

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // service_role deliberado: um chamador anônimo não tem NENHUM claim de perfil, então a RLS
  // de monitoramentos negaria tudo sempre — esta função decide, em código, o que é seguro
  // revelar (só liberado_sif = true), em vez de depender da RLS para essa decisão específica.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
  const ipHash = await sha256Hex(ip);

  try {
    const { data: configLimite } = await adminClient
      .from("app_config")
      .select("valor")
      .eq("chave", "portal_verificacao_limite_por_minuto")
      .single();
    const limite = (configLimite?.valor as number | undefined) ?? 10;

    const umMinutoAtras = new Date(Date.now() - 60_000).toISOString();
    const { count } = await adminClient
      .from("log_acessos_verificacao")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("criado_em", umMinutoAtras);

    if ((count ?? 0) >= limite) {
      await registrarAcesso(adminClient, null, "rate_limited", ipHash);
      return jsonError(429, "muitas tentativas — tente novamente em alguns instantes", correlationId);
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      await registrarAcesso(adminClient, null, "nao_encontrado", ipHash);
      return respostaNaoEncontrado(correlationId);
    }

    const resultado =
      (await buscarMonitoramentoParaVerificacao(adminClient, parsed.data.id)) ??
      (await buscarOsParaVerificacao(adminClient, parsed.data.id));

    if (!resultado || !resultado.liberado) {
      await registrarAcesso(adminClient, parsed.data.id, resultado ? "nao_autorizado" : "nao_encontrado", ipHash);
      return respostaNaoEncontrado(correlationId);
    }

    await registrarAcesso(adminClient, parsed.data.id, "encontrado", ipHash);
    log("info", "documento_verificado", { id: parsed.data.id });

    return new Response(
      JSON.stringify({
        tipo: resultado.tipo,
        descricao: "descricao" in resultado ? resultado.descricao : undefined,
        trilha: resultado.trilha,
        integridade: resultado.integridade,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (erro) {
    log("error", "excecao_nao_tratada", { erro: erro instanceof Error ? erro.message : String(erro) });
    return respostaNaoEncontrado(correlationId);
  }
});

async function buscarMonitoramentoParaVerificacao(
  adminClient: AdminClient,
  id: string
): Promise<{
  tipo: "monitoramento";
  liberado: boolean;
  trilha: ItemTrilha[];
  integridade: "IDENTICO" | "VERSAO_ANTERIOR" | null;
} | null> {
  // Nota: sem .overrideTypes() aqui — a versão do postgrest-js resolvida pelo Deno para
  // @supabase/supabase-js@2.45.4 (pinada) é mais antiga que a que o frontend resolve via npm
  // e não tem esse método. Cast explícito abaixo em vez disso.
  const { data: linha } = await adminClient
    .from("monitoramentos")
    .select(
      "id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, conformidade, verificado_por, criado_em, liberado_sif"
    )
    .eq("id", id)
    .maybeSingle();
  const m = linha as unknown as MonitoramentoParaHash | null;

  if (!m) return null;

  const { data: assinaturas } = await adminClient
    .from("assinaturas_eletronicas")
    .select("user_id, tipo, hash_documento, tsr_base64, tsa_emitido_em, tsa_utilizada, criado_em")
    .eq("monitoramento_id", id)
    .order("criado_em", { ascending: true });

  const idsUsuarios = Array.from(new Set((assinaturas ?? []).map((a) => a.user_id as string)));
  const { data: perfis } = idsUsuarios.length
    ? await adminClient.from("perfis_usuarios").select("id, nome_completo").in("id", idsUsuarios)
    : { data: [] as { id: string; nome_completo: string }[] };
  const nomePorId = new Map((perfis ?? []).map((p) => [p.id as string, p.nome_completo as string]));

  const trilha: ItemTrilha[] = (assinaturas ?? []).map((a) => ({
    tipo: a.tipo as string,
    nome: nomePorId.get(a.user_id as string) ?? "Desconhecido",
    criado_em: a.criado_em as string,
    carimbo: a.tsr_base64
      ? { emitido_em: a.tsa_emitido_em as string | null, tsa: a.tsa_utilizada as string | null }
      : null,
  }));

  // Nunca fabrica um selo/hash quando não há nenhuma assinatura real (débito da v1: "hash
  // falso" a partir de um prefixo de UUID) — sem assinatura, integridade fica null.
  let integridade: "IDENTICO" | "VERSAO_ANTERIOR" | null = null;
  if (assinaturas && assinaturas.length > 0) {
    const ultima = assinaturas[assinaturas.length - 1];
    const hashRecalculado = await sha256Hex(conteudoAssinavelMonitoramento(m));
    integridade = ultima.hash_documento === hashRecalculado ? "IDENTICO" : "VERSAO_ANTERIOR";
  }

  return { tipo: "monitoramento", liberado: m.liberado_sif as boolean, trilha, integridade };
}

interface OsParaHash {
  id: string;
  descricao: string;
  setor: string;
  ativo_referencia: string | null;
  status: string;
  aberto_por: string;
  autorizado_por: string | null;
  programado_por: string | null;
  executado_por: string | null;
  validado_por: string | null;
  criado_em: string;
  liberado_sif: boolean;
}

async function buscarOsParaVerificacao(
  adminClient: AdminClient,
  id: string
): Promise<{
  tipo: "os";
  liberado: boolean;
  descricao: string;
  trilha: ItemTrilha[];
  integridade: "IDENTICO" | "VERSAO_ANTERIOR" | null;
} | null> {
  const { data: linha } = await adminClient
    .from("manutencao_os")
    .select(
      "id, descricao, setor, ativo_referencia, status, aberto_por, autorizado_por, programado_por, executado_por, validado_por, criado_em, liberado_sif"
    )
    .eq("id", id)
    .maybeSingle();
  const os = linha as unknown as OsParaHash | null;

  if (!os) return null;

  const { data: assinaturas } = await adminClient
    .from("assinaturas_os_eletronicas")
    .select("user_id, tipo, hash_documento, tsr_base64, tsa_emitido_em, tsa_utilizada, criado_em")
    .eq("os_id", id)
    .order("criado_em", { ascending: true });

  const idsUsuarios = Array.from(new Set((assinaturas ?? []).map((a) => a.user_id as string)));
  const { data: perfis } = idsUsuarios.length
    ? await adminClient.from("perfis_usuarios").select("id, nome_completo").in("id", idsUsuarios)
    : { data: [] as { id: string; nome_completo: string }[] };
  const nomePorId = new Map((perfis ?? []).map((p) => [p.id as string, p.nome_completo as string]));

  const trilha: ItemTrilha[] = (assinaturas ?? []).map((a) => ({
    tipo: a.tipo as string,
    nome: nomePorId.get(a.user_id as string) ?? "Desconhecido",
    criado_em: a.criado_em as string,
    carimbo: a.tsr_base64
      ? { emitido_em: a.tsa_emitido_em as string | null, tsa: a.tsa_utilizada as string | null }
      : null,
  }));

  let integridade: "IDENTICO" | "VERSAO_ANTERIOR" | null = null;
  if (assinaturas && assinaturas.length > 0) {
    const ultima = assinaturas[assinaturas.length - 1];
    const hashRecalculado = await sha256Hex(conteudoAssinavelOs(os));
    integridade = ultima.hash_documento === hashRecalculado ? "IDENTICO" : "VERSAO_ANTERIOR";
  }

  return {
    tipo: "os",
    liberado: os.liberado_sif as boolean,
    descricao: os.descricao,
    trilha,
    integridade,
  };
}

async function registrarAcesso(
  adminClient: AdminClient,
  documentoId: string | null,
  resultado: "encontrado" | "nao_encontrado" | "nao_autorizado" | "rate_limited",
  ipHash: string
) {
  await adminClient
    .from("log_acessos_verificacao")
    .insert({ documento_id: documentoId, resultado, ip_hash: ipHash });
}

function respostaNaoEncontrado(correlationId: string) {
  // Mesma resposta para "não existe" e "existe mas não autorizado" — nunca vaza existência.
  return new Response(JSON.stringify({ erro: "documento não encontrado", correlationId }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, mensagem: string, correlationId: string) {
  return new Response(JSON.stringify({ erro: mensagem, correlationId }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
