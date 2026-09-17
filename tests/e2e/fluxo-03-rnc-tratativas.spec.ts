import { test, expect } from "@playwright/test";
import { login, logout, clienteAdminDeTeste } from "./helpers";

// Fluxo E2E nº 3 (seção 10 do PROMPT MESTRE):
// "Verificador reprova → RNC criada automaticamente → Gestor de Setor trata → fecha."
// DoD da Fase 4 também exige "SLA configurável funcional com alerta" — coberto pelo segundo
// teste abaixo, que força um prazo_sla vencido e confirma o badge "SLA VENCIDO".

test("verificador reprova, RNC é criada, gestor de setor trata e fecha (fluxo 3)", async ({ page }) => {
  const marcador = `E2E-fluxo3-${Date.now()}`;
  const admin = await clienteAdminDeTeste();

  await login(page, "inspetor.qualidade@dev.globopac.local", "globopac-dev-2026");
  await page.goto("/fichas/nova");
  await page.locator("#template").selectOption({ label: "Monitoramento de Temperatura — Linha DIF (v1)" });
  await page.locator("#temperatura_celsius").fill("35");
  await page.locator("#observacoes").fill(marcador);
  await page.getByRole("button", { name: "Criar e assinar" }).click();
  await expect(page.getByText("Ficha criada e assinada com sucesso.")).toBeVisible({ timeout: 15_000 });
  await logout(page);

  await login(page, "verificador@dev.globopac.local", "globopac-dev-2026");
  await page.goto("/verificacao");
  const cartaoVerificacao = page.locator(".rounded-lg.border").filter({ hasText: marcador });
  await expect(cartaoVerificacao).toBeVisible({ timeout: 15_000 });
  await cartaoVerificacao.getByRole("button", { name: "Reprovar" }).click();
  await cartaoVerificacao.locator("select").selectOption("ALTA");
  await cartaoVerificacao.locator("textarea").fill(marcador);
  await cartaoVerificacao.getByRole("button", { name: "Confirmar reprovação (abre RNC)" }).click();
  await expect(cartaoVerificacao).not.toBeVisible({ timeout: 15_000 });
  await logout(page);

  const { data: rncCriada } = await admin
    .from("rnc")
    .select("id, status, severidade")
    .eq("descricao", marcador)
    .single();
  expect(rncCriada).toBeTruthy();
  expect(rncCriada!.status).toBe("ABERTA");
  expect(rncCriada!.severidade).toBe("ALTA");

  await login(page, "gestor.setor@dev.globopac.local", "globopac-dev-2026");
  await page.goto("/rnc");
  const cartaoRnc = page.locator(".rounded-lg.border").filter({ hasText: marcador });
  await expect(cartaoRnc).toBeVisible({ timeout: 15_000 });

  await cartaoRnc.locator("textarea").fill(`Tratativa: ${marcador}`);
  await cartaoRnc.getByRole("button", { name: "Registrar tratativa" }).click();
  await expect(cartaoRnc.getByText("Tratada — aguardando fechamento")).toBeVisible({ timeout: 15_000 });

  await cartaoRnc.getByRole("button", { name: "Fechar RNC" }).click();
  await expect(cartaoRnc).not.toBeVisible({ timeout: 15_000 });
  await logout(page);

  const { data: rncFechada } = await admin.from("rnc").select("status, fechado_em").eq("id", rncCriada!.id).single();
  expect(rncFechada!.status).toBe("FECHADA");
  expect(rncFechada!.fechado_em).toBeTruthy();
});

test("RNC com prazo_sla vencido exibe alerta de SLA (DoD: SLA configurável com alerta)", async ({ page }) => {
  const marcador = `E2E-fluxo3-sla-${Date.now()}`;
  const admin = await clienteAdminDeTeste();

  const { data: inspetor } = await admin
    .from("perfis_usuarios")
    .select("id")
    .eq("nome_usuario", "inspetor.qualidade")
    .single();
  expect(inspetor).toBeTruthy();

  // prazo_sla já vencido (1h no passado) — simula uma RNC que ultrapassou o SLA configurado
  // em app_config.sla_rnc_horas_por_severidade sem esperar o tempo real transcorrer.
  const { error } = await admin.from("rnc").insert({
    descricao: marcador,
    setor: "LINHA_DIF",
    status: "ABERTA",
    severidade: "CRITICA",
    aberto_por: inspetor!.id,
    prazo_sla: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  expect(error).toBeFalsy();

  await login(page, "gestor.setor@dev.globopac.local", "globopac-dev-2026");
  await page.goto("/rnc");
  const cartaoRnc = page.locator(".rounded-lg.border").filter({ hasText: marcador });
  await expect(cartaoRnc).toBeVisible({ timeout: 15_000 });
  await expect(cartaoRnc.getByText("SLA VENCIDO", { exact: true })).toBeVisible();
  await expect(page.getByText(/RNC\(s\) com SLA vencido/)).toBeVisible();
});
