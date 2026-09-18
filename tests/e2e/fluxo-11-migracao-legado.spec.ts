import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { clienteAdminDeTeste, resolverCredenciaisDeTeste } from "./helpers";

// Fase 10 (migração de dados legados) — sem número de fluxo na seção 10 (feature adicionada
// além do roteiro original, ver ASSUMPTIONS.md). Roda o script real
// (scripts/migrar-dados-legados.mjs) como um subprocesso, contra o stack local do Supabase
// que o job de E2E já sobe — a única forma de validar de verdade um script de migração é
// rodando-o, não só lendo o código.

test("migrar-dados-legados importa fichas/RNC/OS legados e é idempotente ao rerodar (Fase 10)", async () => {
  const idLegadoMonitoramento = `E2E-legado-mon-${Date.now()}`;
  const idLegadoRnc = `E2E-legado-rnc-${Date.now()}`;
  const idLegadoOs = `E2E-legado-os-${Date.now()}`;

  const exportacao = {
    monitoramentos: [
      {
        id_legado: idLegadoMonitoramento,
        ficha_template_codigo: "TEMP-LINHA-DIF",
        setor: "LINHA_DIF",
        dados_dinamicos: { temperatura_celsius: 3.5, observacoes: "importado do v1" },
        conformidade: true,
        criado_em: "2024-01-10T10:00:00Z",
        criado_por_matricula: "1001",
        verificado_em: "2024-01-10T14:00:00Z",
        verificado_por_matricula: "1002",
        liberado_sif: true,
        liberado_em: "2024-01-11T08:00:00Z",
        assinaturas: [
          { tipo: "INSPETOR", hash_documento: "a".repeat(64), user_matricula: "1001", criado_em: "2024-01-10T10:00:05Z" },
          { tipo: "VERIFICADOR", hash_documento: "b".repeat(64), user_matricula: "1002", criado_em: "2024-01-10T14:00:05Z" },
        ],
      },
    ],
    rnc: [
      {
        id_legado: idLegadoRnc,
        descricao: "RNC importada do v1",
        setor: "LINHA_DIF",
        status: "FECHADA",
        severidade: "MEDIA",
        aberto_por_matricula: "1002",
        tratado_por_matricula: "1003",
        tratativa: "Corrigido no v1.",
        prazo_sla: "2024-01-15T00:00:00Z",
        fechado_em: "2024-01-14T00:00:00Z",
        criado_em: "2024-01-10T14:10:00Z",
      },
    ],
    manutencao_os: [
      {
        id_legado: idLegadoOs,
        descricao: "OS importada do v1",
        setor: "MANUTENCAO",
        ativo_referencia: "ESTEIRA-01",
        status: "CONCLUIDA",
        aberto_por_matricula: "1006",
        validado_por_matricula: "1006",
        concluido_em: "2024-01-12T16:00:00Z",
        liberado_sif: true,
        liberado_em: "2024-01-13T08:00:00Z",
        criado_em: "2024-01-12T09:00:00Z",
        assinaturas: [
          { tipo: "ABERTURA", hash_documento: "c".repeat(64), user_matricula: "1006", criado_em: "2024-01-12T09:00:05Z" },
          { tipo: "VALIDACAO", hash_documento: "d".repeat(64), user_matricula: "1006", criado_em: "2024-01-12T16:00:05Z" },
        ],
      },
    ],
  };

  const pastaTemporaria = mkdtempSync(path.join(tmpdir(), "globopac-migracao-"));
  const caminhoArquivo = path.join(pastaTemporaria, "export-teste.json");
  writeFileSync(caminhoArquivo, JSON.stringify(exportacao));

  const { url, serviceRoleKey } = resolverCredenciaisDeTeste();
  const env = { ...process.env, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey };

  function rodarScript(args: string[]) {
    return execFileSync("node", ["scripts/migrar-dados-legados.mjs", ...args], {
      encoding: "utf8",
      env,
    });
  }

  const saidaDryRun = rodarScript([caminhoArquivo, "--dry-run"]);
  expect(saidaDryRun).toContain("Tentados:     3");
  expect(saidaDryRun).toContain("Importados:   3");
  expect(saidaDryRun).toContain("Erros:        0");

  const admin = await clienteAdminDeTeste();
  const { data: aindaNaoExiste } = await admin
    .from("monitoramentos")
    .select("id")
    .eq("id_legado", idLegadoMonitoramento)
    .maybeSingle();
  expect(aindaNaoExiste).toBeNull();

  const saidaImportacao = rodarScript([caminhoArquivo]);
  expect(saidaImportacao).toContain("Importados:   3");
  expect(saidaImportacao).toContain("Erros:        0");

  const { data: monitoramento } = await admin
    .from("monitoramentos")
    .select("id, origem_versao, conformidade, liberado_sif, criado_em")
    .eq("id_legado", idLegadoMonitoramento)
    .single();
  expect(monitoramento).toBeTruthy();
  expect(monitoramento!.origem_versao).toBe("v1_legado");
  expect(monitoramento!.conformidade).toBe(true);
  expect(monitoramento!.liberado_sif).toBe(true);
  expect(new Date(monitoramento!.criado_em).toISOString()).toBe("2024-01-10T10:00:00.000Z");

  const { data: assinaturas } = await admin
    .from("assinaturas_eletronicas")
    .select("tipo, hash_documento")
    .eq("monitoramento_id", monitoramento!.id)
    .order("tipo");
  expect(assinaturas).toHaveLength(2);
  // O hash é copiado literalmente do "v1" — nunca recalculado sob as regras da v2.
  expect(assinaturas!.find((a) => a.tipo === "INSPETOR")?.hash_documento).toBe("a".repeat(64));
  expect(assinaturas!.find((a) => a.tipo === "VERIFICADOR")?.hash_documento).toBe("b".repeat(64));

  const { data: rnc } = await admin.from("rnc").select("status, id_legado").eq("id_legado", idLegadoRnc).single();
  expect(rnc!.status).toBe("FECHADA");

  const { data: os } = await admin
    .from("manutencao_os")
    .select("status, liberado_sif")
    .eq("id_legado", idLegadoOs)
    .single();
  expect(os!.status).toBe("CONCLUIDA");
  expect(os!.liberado_sif).toBe(true);

  // Idempotência: rerodar o mesmo arquivo não duplica nada.
  const saidaRerodada = rodarScript([caminhoArquivo]);
  expect(saidaRerodada).toContain("Já existiam:  3");
  expect(saidaRerodada).toContain("Importados:   0");

  const { count: totalComEsseIdLegado } = await admin
    .from("monitoramentos")
    .select("id", { count: "exact", head: true })
    .eq("id_legado", idLegadoMonitoramento);
  expect(totalComEsseIdLegado).toBe(1);
});
