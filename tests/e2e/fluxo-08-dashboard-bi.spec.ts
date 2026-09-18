import { test, expect } from "@playwright/test";
import { login, logout, clienteAdminDeTeste } from "./helpers";

// Fase 7 (BI/dashboards/exportação de relatórios, seção 7.7) — painel gerencial com KPIs,
// gráficos agregados e exportação CSV, sobre os mesmos dados que RLS já permite ao usuário ver
// em outras telas. Sem número de fluxo na seção 10 (feature adicionada além do roteiro
// original) — ver ASSUMPTIONS.md.

test("painel gerencial mostra KPIs e permite exportar CSV de monitoramentos (Fase 7)", async ({ page }) => {
  const marcador = `E2E-fluxo8-${Date.now()}`;
  const admin = await clienteAdminDeTeste();

  await login(page, "1001", "121072");
  await page.goto("/fichas/nova");
  await page.locator("#template").selectOption({ label: "Monitoramento de Temperatura — Linha DIF (v1)" });
  await page.locator("#temperatura_celsius").fill("23");
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

  await login(page, "1004", "121072");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Painel gerencial" })).toBeVisible();
  // Espera os KPIs carregarem de verdade (não um snapshot prematuro) antes de qualquer asserção.
  await expect(page.getByText("Carregando…")).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Monitoramentos (30 dias)")).toBeVisible();
  await expect(page.getByText("RNC — por severidade")).toBeVisible();
  await expect(page.getByText("Ordens de Serviço — por status")).toBeVisible();

  // "Exportar CSV" de Monitoramentos é o primeiro dos três (Monitoramentos, RNC, OS, nessa
  // ordem no layout) — mais direto e menos frágil do que escopar por div ancestral com texto.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar CSV" }).first().click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^monitoramentos-\d{4}-\d{2}-\d{2}\.csv$/);
  const caminho = await download.path();
  expect(caminho).toBeTruthy();
  const fs = await import("node:fs/promises");
  const conteudo = await fs.readFile(caminho!, "utf-8");
  expect(conteudo).toContain("ID,Setor,Conforme,Criado em,Verificado em,Liberado ao SIF,Liberado em");
  expect(conteudo).toContain(registro!.id);
});
