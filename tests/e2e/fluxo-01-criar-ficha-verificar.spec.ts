import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";

// Fluxo E2E nº 1 (seção 10 do PROMPT MESTRE): "Inspetor cria ficha → assina → aparece para
// Verificador." Depende do stack local do Supabase rodando com supabase/seed.sql aplicado
// (usuários e template de teste) — ver README para rodar localmente, ou o job "e2e" do CI.

test("inspetor cria e assina uma ficha, que aparece para o verificador", async ({ page }) => {
  await login(page, "inspetor.qualidade@dev.globopac.local", "globopac-dev-2026");

  await page.goto("/fichas/nova");
  await page.locator("#template").selectOption({ label: "Monitoramento de Temperatura — Linha DIF (v1)" });

  const temperatura = `${20 + Math.floor(Math.random() * 5)}`;
  await page.locator("#temperatura_celsius").fill(temperatura);

  await page.getByRole("button", { name: "Criar e assinar" }).click();
  await expect(page.getByText("Ficha criada e assinada com sucesso.")).toBeVisible({ timeout: 15_000 });

  await logout(page);

  await login(page, "verificador@dev.globopac.local", "globopac-dev-2026");
  await page.goto("/verificacao");

  await expect(page.getByText("Monitoramento de Temperatura")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(temperatura)).toBeVisible();
});
