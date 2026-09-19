import { test, expect } from "@playwright/test";
import { login, logout, clienteAdminDeTeste, selecionarTemplate, assinarComSenha } from "./helpers";

// Fluxo E2E nº 3 (seção 10 do PROMPT MESTRE), atualizado na Fase 11 (decisão do cliente: o
// VERIFICADOR atua como revisor de RNC — ver ASSUMPTIONS.md item 22):
// "Verificador reprova → RNC criada automaticamente → Gestor de Setor trata → Verificador
// revisa e fecha." Gestor de Setor não fecha mais a própria tratativa (segregação de funções
// reforçada por trg_segregacao_funcoes_rnc).
// DoD da Fase 4 também exige "SLA configurável funcional com alerta" — coberto pelo segundo
// teste abaixo, que força um prazo_sla vencido e confirma o badge "SLA VENCIDO".

test("verificador reprova, RNC é criada, gestor de setor trata e verificador revisa e fecha (fluxo 3)", async ({ page }) => {
  const marcador = `E2E-fluxo3-${Date.now()}`;
  const admin = await clienteAdminDeTeste();

  await login(page, "1001", "121072");
  await page.goto("/fichas/nova");
  await selecionarTemplate(page, "Monitoramento de Temperatura — Linha DIF (v1)");
  await page.locator("#temperatura_celsius").fill("35");
  await page.locator("#observacoes").fill(marcador);
  await page.getByRole("button", { name: "Criar e assinar" }).click();
  await assinarComSenha(page, "121072");
  await expect(page.getByText("Ficha criada e assinada com sucesso.")).toBeVisible({ timeout: 15_000 });
  await logout(page);

  await login(page, "1002", "121072");
  await page.goto("/verificacao");
  const cartaoVerificacao = page.locator('[data-testid="fila-pendente"] .rounded-lg.border').filter({ hasText: marcador });
  await expect(cartaoVerificacao).toBeVisible({ timeout: 15_000 });
  await cartaoVerificacao.getByRole("button", { name: "Ver" }).click();
  const dialogReprovacao = page.getByRole("dialog");
  await dialogReprovacao.getByRole("button", { name: "Reprovar" }).click();
  await dialogReprovacao.locator("select").selectOption("ALTA");
  await dialogReprovacao.locator("textarea").fill(marcador);
  await dialogReprovacao.getByRole("button", { name: "Confirmar reprovação (abre RNC)" }).click();
  // Reprovar também exige reautenticação por senha (mesmo mecanismo de "Aprovar e assinar",
  // já existente desde be0f61c) — nunca coberto aqui porque o CI nunca tinha chegado até este
  // teste antes (bloqueado por outras falhas anteriores no pipeline).
  await dialogReprovacao.getByLabel("Sua senha").fill("121072");
  await dialogReprovacao.getByRole("button", { name: "Confirmar e Assinar" }).click();
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

  await login(page, "1003", "121072");
  await page.goto("/rnc");
  const cartaoGestor = page.locator(".rounded-lg.border").filter({ hasText: marcador });
  await expect(cartaoGestor).toBeVisible({ timeout: 15_000 });

  await cartaoGestor.locator("textarea").fill(`Tratativa: ${marcador}`);
  await cartaoGestor.getByRole("button", { name: "Registrar tratativa" }).click();
  await expect(cartaoGestor.getByText("Tratada — aguardando revisão do Verificador")).toBeVisible({ timeout: 15_000 });
  // Gestor de Setor não tem mais o botão de fechamento — só o Verificador revisa.
  await expect(cartaoGestor.getByRole("button", { name: "Fechar RNC" })).toHaveCount(0);
  await logout(page);

  await login(page, "1002", "121072");
  await page.goto("/rnc");
  const cartaoVerificador = page.locator(".rounded-lg.border").filter({ hasText: marcador });
  await expect(cartaoVerificador).toBeVisible({ timeout: 15_000 });
  await expect(cartaoVerificador.getByText(`Tratativa: ${marcador}`)).toBeVisible();
  await cartaoVerificador.getByRole("button", { name: "Aprovar e Fechar RNC" }).click();
  await expect(cartaoVerificador).not.toBeVisible({ timeout: 15_000 });
  await logout(page);

  const { data: rncFechada } = await admin
    .from("rnc")
    .select("status, fechado_em, tratado_por, revisado_por")
    .eq("id", rncCriada!.id)
    .single();
  expect(rncFechada!.status).toBe("FECHADA");
  expect(rncFechada!.fechado_em).toBeTruthy();
  expect(rncFechada!.revisado_por).toBeTruthy();
  expect(rncFechada!.revisado_por).not.toBe(rncFechada!.tratado_por);
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

  await login(page, "1003", "121072");
  await page.goto("/rnc");
  const cartaoRnc = page.locator(".rounded-lg.border").filter({ hasText: marcador });
  await expect(cartaoRnc).toBeVisible({ timeout: 15_000 });
  await expect(cartaoRnc.getByText("SLA VENCIDO", { exact: true })).toBeVisible();
  await expect(page.getByText(/RNC\(s\) com SLA vencido/)).toBeVisible();
});
