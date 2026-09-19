import { test, expect } from "@playwright/test";
import { login, logout, clienteAdminDeTeste } from "./helpers";

// Fluxos E2E nº 5 e 6 (seção 10 do PROMPT MESTRE):
// 5) "Acesso ao portal público /verificar com UUID de documento assinado → mostra trilha e
//    badge correto."
// 6) "Acesso ao portal público com UUID de documento sem assinatura → não mostra link de
//    verificação/hash falso (regressão do bug de 'UUID impresso como SHA-256' da v1)."

test("documento liberado aparece com trilha e badge corretos no portal público (fluxo 5)", async ({
  page,
}) => {
  const marcador = `E2E-fluxo5-${Date.now()}`;
  const admin = await clienteAdminDeTeste();

  await login(page, "1001", "121072");
  await page.goto("/fichas/nova");
  await page.locator("#template").selectOption({ label: "Monitoramento de Temperatura — Linha DIF (v1)" });
  await page.locator("#temperatura_celsius").fill("21");
  await page.locator("#observacoes").fill(marcador);
  await page.getByRole("button", { name: "Criar e assinar" }).click();
  await expect(page.getByText("Ficha criada e assinada com sucesso.")).toBeVisible({ timeout: 15_000 });
  await logout(page);

  await login(page, "1002", "121072");
  await page.goto("/verificacao");
  const cartaoVerificacao = page.locator('[data-testid="fila-pendente"] .rounded-lg.border').filter({ hasText: marcador });
  await expect(cartaoVerificacao).toBeVisible({ timeout: 15_000 });
  await cartaoVerificacao.getByRole("button", { name: "Ver" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Aprovar e assinar" }).click();
  await expect(cartaoVerificacao).not.toBeVisible({ timeout: 15_000 });
  await logout(page);

  // Libera TODOS os pendentes (não só o nosso) — mais simples e robusto do que garantir que
  // o nosso seja o único checkbox marcável; o teste só precisa que o NOSSO acabe liberado.
  await login(page, "1004", "121072");
  await page.goto("/sif/liberar");
  const checkboxes = page.locator('input[type="checkbox"]');
  // checkboxes.count() é um snapshot único, não uma asserção com auto-retry do Playwright —
  // chamado logo após a navegação, antes de useMonitoramentosParaLiberar() resolver (a sessão
  // ainda está sendo restaurada do localStorage pelo useAuthListener, e só depois disso a
  // query dispara), ele podia capturar 0 e travar o teste com um botão "(0)" permanentemente
  // desabilitado. Espera o primeiro checkbox realmente aparecer antes de contar.
  await expect(checkboxes.first()).toBeVisible({ timeout: 15_000 });
  const total = await checkboxes.count();
  for (let i = 0; i < total; i++) await checkboxes.nth(i).check();
  await page.getByRole("button", { name: new RegExp(`Liberar selecionados \\(${total}\\)`) }).click();
  await expect(page.getByText(/liberado:/)).toBeVisible({ timeout: 15_000 });
  await logout(page);

  const { data: registro } = await admin
    .from("monitoramentos")
    .select("id")
    .eq("dados_dinamicos->>observacoes", marcador)
    .single();
  expect(registro).toBeTruthy();

  await page.goto(`/verificar?id=${registro!.id}`);
  await expect(page.getByText("Trilha de assinaturas")).toBeVisible({ timeout: 15_000 });
  // exact:true — sem isso, getByText("INSPETOR") também casa com o nome do inspetor de
  // teste ("Inspetor(a) de Qualidade (dev)"), que contém a mesma substring.
  await expect(page.getByText("INSPETOR", { exact: true })).toBeVisible();
  await expect(page.getByText("VERIFICADOR", { exact: true })).toBeVisible();
  await expect(page.getByText("LIBERACAO_DIARIA", { exact: true })).toBeVisible();
  await expect(page.getByText(/IDÊNTICO ao original assinado/)).toBeVisible();
});

test("documento ainda não liberado não é encontrado no portal público (fluxo 6a)", async ({ page }) => {
  const marcador = `E2E-fluxo6a-${Date.now()}`;
  const admin = await clienteAdminDeTeste();

  await login(page, "1001", "121072");
  await page.goto("/fichas/nova");
  await page.locator("#template").selectOption({ label: "Monitoramento de Temperatura — Linha DIF (v1)" });
  await page.locator("#temperatura_celsius").fill("22");
  await page.locator("#observacoes").fill(marcador);
  await page.getByRole("button", { name: "Criar e assinar" }).click();
  await expect(page.getByText("Ficha criada e assinada com sucesso.")).toBeVisible({ timeout: 15_000 });
  await logout(page);

  const { data: registro } = await admin
    .from("monitoramentos")
    .select("id")
    .eq("dados_dinamicos->>observacoes", marcador)
    .single();
  expect(registro).toBeTruthy();

  await page.goto(`/verificar?id=${registro!.id}`);
  await expect(page.getByText("Documento não encontrado.")).toBeVisible({ timeout: 15_000 });
});

test("documento liberado sem nenhuma assinatura não fabrica hash/selo (fluxo 6b, defensivo)", async ({
  page,
}) => {
  const admin = await clienteAdminDeTeste();

  const { data: template } = await admin
    .from("fichas_templates")
    .select("id, versao")
    .eq("codigo", "TEMP-LINHA-DIF")
    .eq("ativo", true)
    .single();
  const { data: inspetor } = await admin
    .from("perfis_usuarios")
    .select("id")
    .eq("nome_usuario", "inspetor.qualidade")
    .single();
  expect(template).toBeTruthy();
  expect(inspetor).toBeTruthy();

  // Estado sintético (nunca produzido pelas Edge Functions reais, que sempre exigem uma
  // assinatura antes de liberar) — insere direto via service_role só para testar que o
  // portal, mesmo diante de um dado anômalo, nunca inventa um hash/selo.
  const { data: registro, error } = await admin
    .from("monitoramentos")
    .insert({
      ficha_template_id: template!.id,
      versao_template: template!.versao,
      user_id: inspetor!.id,
      setor: "LINHA_DIF",
      dados_dinamicos: { temperatura_celsius: 30, observacoes: "fluxo6b-sem-assinatura" },
      liberado_sif: true,
      liberado_em: new Date().toISOString(),
    })
    .select("id")
    .single();
  expect(error).toBeFalsy();

  await page.goto(`/verificar?id=${registro!.id}`);
  await expect(page.getByText("Trilha de assinaturas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/IDÊNTICO/)).not.toBeVisible();
  await expect(page.getByText(/VERSÃO ANTERIOR/)).not.toBeVisible();
});
