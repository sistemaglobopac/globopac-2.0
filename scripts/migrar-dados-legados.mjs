// Migração de dados legados (Fase 10, seção 11 do PROMPT MESTRE) — importa registros já
// fechados/concluídos do sistema v1 (monitoramentos/PAC, RNC, OS de manutenção) preservando
// hash/timestamps originais como fato histórico, nunca recomputados sob as regras da v2
// (origem_versao='v1_legado' — ver comentário em 20260916000001_extensoes_e_enums.sql).
//
// Contrato de entrada: um único arquivo JSON com até três chaves de nível superior
// (monitoramentos, rnc, manutencao_os), cada uma uma lista de objetos — ver
// docs/migracao-dados-legados.md para o formato completo e um exemplo.
//
// Idempotente: cada registro é buscado por `id_legado` antes de inserir — reexecutar o script
// com o mesmo arquivo nunca duplica, só relata "já existia" para o que já foi migrado antes.
//
// Uso:
//   node scripts/migrar-dados-legados.mjs caminho/para/export.json --dry-run   # só valida
//   node scripts/migrar-dados-legados.mjs caminho/para/export.json            # importa de verdade
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (typeof globalThis.WebSocket === "undefined") {
  const { WebSocket } = await import("ws");
  globalThis.WebSocket = WebSocket;
}

let saidaStatusCache;
function statusEnv(chave) {
  saidaStatusCache ??= execSync("supabase status -o env", { encoding: "utf8" });
  const linha = saidaStatusCache.split("\n").find((l) => l.startsWith(`${chave}=`));
  return linha?.slice(chave.length + 1).replace(/^"|"$/g, "");
}

const url = process.env.SUPABASE_URL || statusEnv("API_URL");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || statusEnv("SERVICE_ROLE_KEY");
if (!url || !serviceRoleKey) {
  console.error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY indisponíveis (nem via `supabase status`).");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const args = process.argv.slice(2);
const modoSimulacao = args.includes("--dry-run");
const caminhoArquivo = args.find((a) => !a.startsWith("--"));
if (!caminhoArquivo) {
  console.error("Uso: node scripts/migrar-dados-legados.mjs <arquivo.json> [--dry-run]");
  process.exit(1);
}

const dados = JSON.parse(readFileSync(caminhoArquivo, "utf8"));

const relatorio = { tentados: 0, importados: 0, ja_existiam: 0, erros: [] };

const cacheUsuarios = new Map();
async function resolverUsuario(matricula) {
  if (cacheUsuarios.has(matricula)) return cacheUsuarios.get(matricula);
  const { data, error } = await admin.from("perfis_usuarios").select("id").eq("matricula", matricula).maybeSingle();
  if (error || !data) {
    throw new Error(
      `Matrícula '${matricula}' não encontrada em perfis_usuarios — cadastre o usuário na v2 antes de migrar dados que o referenciam.`
    );
  }
  cacheUsuarios.set(matricula, data.id);
  return data.id;
}

const cacheTemplates = new Map();
async function resolverTemplate(codigo) {
  if (cacheTemplates.has(codigo)) return cacheTemplates.get(codigo);
  const { data, error } = await admin
    .from("fichas_templates")
    .select("id, versao")
    .eq("codigo", codigo)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      `Template '${codigo}' não encontrado em fichas_templates — cadastre-o na v2 (mesmo que só para arquivar o histórico) antes de migrar fichas que o referenciam.`
    );
  }
  cacheTemplates.set(codigo, data);
  return data;
}

async function jaExiste(tabela, idLegado) {
  const { data } = await admin.from(tabela).select("id").eq("id_legado", idLegado).maybeSingle();
  return Boolean(data);
}

async function migrarMonitoramentos(lista) {
  for (const [indice, item] of (lista ?? []).entries()) {
    relatorio.tentados++;
    try {
      if (await jaExiste("monitoramentos", item.id_legado)) {
        relatorio.ja_existiam++;
        continue;
      }
      const template = await resolverTemplate(item.ficha_template_codigo);
      const userId = await resolverUsuario(item.criado_por_matricula);
      const verificadoPor = item.verificado_por_matricula ? await resolverUsuario(item.verificado_por_matricula) : null;

      if (modoSimulacao) {
        relatorio.importados++;
        continue;
      }

      const { data: monitoramento, error } = await admin
        .from("monitoramentos")
        .insert({
          id_legado: item.id_legado,
          ficha_template_id: template.id,
          versao_template: template.versao,
          user_id: userId,
          setor: item.setor,
          dados_dinamicos: item.dados_dinamicos,
          conformidade: item.conformidade ?? null,
          verificado_por: verificadoPor,
          verificado_em: item.verificado_em ?? null,
          liberado_sif: Boolean(item.liberado_sif),
          liberado_em: item.liberado_em ?? null,
          origem_versao: "v1_legado",
          criado_em: item.criado_em,
        })
        .select("id")
        .single();
      if (error) throw error;

      for (const assinatura of item.assinaturas ?? []) {
        const assinaUserId = await resolverUsuario(assinatura.user_matricula);
        const { error: erroAssinatura } = await admin.from("assinaturas_eletronicas").insert({
          monitoramento_id: monitoramento.id,
          user_id: assinaUserId,
          tipo: assinatura.tipo,
          hash_documento: assinatura.hash_documento,
          algoritmo: assinatura.algoritmo ?? "SHA-256",
          criado_em: assinatura.criado_em,
        });
        if (erroAssinatura) throw erroAssinatura;
      }

      relatorio.importados++;
    } catch (erro) {
      relatorio.erros.push({ tabela: "monitoramentos", indice, id_legado: item.id_legado, motivo: erro.message });
    }
  }
}

async function migrarRnc(lista) {
  for (const [indice, item] of (lista ?? []).entries()) {
    relatorio.tentados++;
    try {
      if (await jaExiste("rnc", item.id_legado)) {
        relatorio.ja_existiam++;
        continue;
      }
      const abertoPor = await resolverUsuario(item.aberto_por_matricula);
      const tratadoPor = item.tratado_por_matricula ? await resolverUsuario(item.tratado_por_matricula) : null;

      if (modoSimulacao) {
        relatorio.importados++;
        continue;
      }

      const { error } = await admin.from("rnc").insert({
        id_legado: item.id_legado,
        descricao: item.descricao,
        setor: item.setor,
        status: item.status,
        severidade: item.severidade,
        aberto_por: abertoPor,
        tratado_por: tratadoPor,
        tratativa: item.tratativa ?? null,
        prazo_sla: item.prazo_sla,
        fechado_em: item.fechado_em ?? null,
        criado_em: item.criado_em,
      });
      if (error) throw error;

      relatorio.importados++;
    } catch (erro) {
      relatorio.erros.push({ tabela: "rnc", indice, id_legado: item.id_legado, motivo: erro.message });
    }
  }
}

async function migrarOs(lista) {
  for (const [indice, item] of (lista ?? []).entries()) {
    relatorio.tentados++;
    try {
      if (await jaExiste("manutencao_os", item.id_legado)) {
        relatorio.ja_existiam++;
        continue;
      }
      const abertoPor = await resolverUsuario(item.aberto_por_matricula);
      const autorizadoPor = item.autorizado_por_matricula ? await resolverUsuario(item.autorizado_por_matricula) : null;
      const programadoPor = item.programado_por_matricula ? await resolverUsuario(item.programado_por_matricula) : null;
      const executadoPor = item.executado_por_matricula ? await resolverUsuario(item.executado_por_matricula) : null;
      const validadoPor = item.validado_por_matricula ? await resolverUsuario(item.validado_por_matricula) : null;

      if (modoSimulacao) {
        relatorio.importados++;
        continue;
      }

      const { data: os, error } = await admin
        .from("manutencao_os")
        .insert({
          id_legado: item.id_legado,
          descricao: item.descricao,
          setor: item.setor,
          ativo_referencia: item.ativo_referencia ?? null,
          status: item.status,
          aberto_por: abertoPor,
          autorizado_por: autorizadoPor,
          programado_por: programadoPor,
          executado_por: executadoPor,
          validado_por: validadoPor,
          sla_esperado_horas: item.sla_esperado_horas ?? null,
          concluido_em: item.concluido_em ?? null,
          liberado_sif: Boolean(item.liberado_sif),
          liberado_em: item.liberado_em ?? null,
          criado_em: item.criado_em,
        })
        .select("id")
        .single();
      if (error) throw error;

      for (const assinatura of item.assinaturas ?? []) {
        const assinaUserId = await resolverUsuario(assinatura.user_matricula);
        const { error: erroAssinatura } = await admin.from("assinaturas_os_eletronicas").insert({
          os_id: os.id,
          user_id: assinaUserId,
          tipo: assinatura.tipo,
          hash_documento: assinatura.hash_documento,
          algoritmo: assinatura.algoritmo ?? "SHA-256",
          criado_em: assinatura.criado_em,
        });
        if (erroAssinatura) throw erroAssinatura;
      }

      relatorio.importados++;
    } catch (erro) {
      relatorio.erros.push({ tabela: "manutencao_os", indice, id_legado: item.id_legado, motivo: erro.message });
    }
  }
}

await migrarMonitoramentos(dados.monitoramentos);
await migrarRnc(dados.rnc);
await migrarOs(dados.manutencao_os);

console.log(`${modoSimulacao ? "[DRY RUN] " : ""}Relatório de migração:`);
console.log(`  Tentados:     ${relatorio.tentados}`);
console.log(`  Importados:   ${relatorio.importados}`);
console.log(`  Já existiam:  ${relatorio.ja_existiam}`);
console.log(`  Erros:        ${relatorio.erros.length}`);
if (relatorio.erros.length > 0) {
  console.log("\nDetalhes dos erros:");
  for (const erro of relatorio.erros) {
    console.log(`  [${erro.tabela}#${erro.indice} id_legado=${erro.id_legado}] ${erro.motivo}`);
  }
  process.exitCode = 1;
}
