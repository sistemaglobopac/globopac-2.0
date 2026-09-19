import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";

// Fluxo E2E nº 2 (seção 10 do PROMPT MESTRE): "Verificador aprova → assina → Admin libera
// SIF → aparece para Inspeção Federal." A liberação (Fase 3) é em lote, com hash agregador —
// aqui o lote tem 1 documento, só para exercitar o mecanismo ponta a ponta.
//
// As asserções da etapa de liberação são por CONTAGEM, não por identidade do registro: a
// tela de liberação/auditoria não expõe um marcador único por ficha (só setor/conformidade),
// e o banco não é resetado entre arquivos de teste na mesma execução de CI — não é possível
// nem necessário garantir que "o mesmo registro" percorra as três telas para validar que o
// mecanismo (verificar → liberar → aparece para a Inspeção Federal) funciona de ponta a ponta.

test("verificador aprova, admin libera ao SIF, e o registro aparece para a Inspeção Federal", async ({
  page,
}) => {
  const marcador = `E2E-fluxo2-${Date.now()}`;

  await login(page, "1001", "121072");
  await page.goto("/fichas/nova");
  await page.locator("#template").selectOption({ label: "Monitoramento de Temperatura — Linha DIF (v1)" });
  await page.locator("#temperatura_celsius").fill("22");
  await page.locator("#observacoes").fill(marcador);
  await page.getByRole("button", { name: "Criar e assinar" }).click();
  await expect(page.getByText("Ficha criada e assinada com sucesso.")).toBeVisible({ timeout: 15_000 });
  await logout(page);

  await login(page, "1002", "121072");
  await page.goto("/verificacao");
  const cartaoDoRegistro = page.locator('[data-testid="fila-pendente"] .rounded-lg.border').filter({ hasText: marcador });
  await expect(cartaoDoRegistro).toBeVisible({ timeout: 15_000 });
  await cartaoDoRegistro.getByRole("button", { name: "Ver" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Aprovar e assinar" }).click();
  await expect(cartaoDoRegistro).not.toBeVisible({ timeout: 15_000 });
  await logout(page);

  await login(page, "1004", "121072");
  await page.goto("/sif/liberar");
  const cartoesParaLiberar = page.locator(".rounded-lg.border");
  await expect(cartoesParaLiberar.first()).toBeVisible({ timeout: 15_000 });
  const totalAntes = await cartoesParaLiberar.count();

  await page.goto("/auditoria");
  const totalAuditoriaAntes = await page.locator(".rounded-lg.border").count();

  await page.goto("/sif/liberar");
  await page.locator(".rounded-lg.border").first().locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: /Liberar selecionados \(1\)/ }).click();
  await expect(page.getByText(/liberado: 1 documento/)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".rounded-lg.border")).toHaveCount(totalAntes - 1, { timeout: 15_000 });

  await page.goto("/auditoria");
  await expect(page.locator(".rounded-lg.border")).toHaveCount(totalAuditoriaAntes + 1, { timeout: 15_000 });
});
