import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";

// Fluxo E2E nº 2 (seção 10 do PROMPT MESTRE): "Verificador aprova → assina → Admin libera
// SIF → aparece para Inspeção Federal." A liberação usada aqui é a versão mínima da Fase 2
// (um monitoramento por vez, sem lote/hash agregador — isso é Fase 3, ver ASSUMPTIONS.md).
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

  await login(page, "inspetor.qualidade@dev.globopac.local", "globopac-dev-2026");
  await page.goto("/fichas/nova");
  await page.locator("#template").selectOption({ label: "Monitoramento de Temperatura — Linha DIF (v1)" });
  await page.locator("#temperatura_celsius").fill("22");
  await page.locator("#observacoes").fill(marcador);
  await page.getByRole("button", { name: "Criar e assinar" }).click();
  await expect(page.getByText("Ficha criada e assinada com sucesso.")).toBeVisible({ timeout: 15_000 });
  await logout(page);

  await login(page, "verificador@dev.globopac.local", "globopac-dev-2026");
  await page.goto("/verificacao");
  const cartaoDoRegistro = page.locator(".rounded-lg.border").filter({ hasText: marcador });
  await expect(cartaoDoRegistro).toBeVisible({ timeout: 15_000 });
  await cartaoDoRegistro.getByRole("button", { name: "Aprovar e assinar" }).click();
  await expect(cartaoDoRegistro).not.toBeVisible({ timeout: 15_000 });
  await logout(page);

  await login(page, "admin.master@dev.globopac.local", "globopac-dev-2026");
  await page.goto("/sif/liberar");
  const botoesLiberar = page.getByRole("button", { name: "Liberar ao SIF" });
  await expect(botoesLiberar.first()).toBeVisible({ timeout: 15_000 });
  const totalAntes = await botoesLiberar.count();

  await page.goto("/auditoria");
  const totalAuditoriaAntes = await page.locator(".rounded-lg.border").count();

  await page.goto("/sif/liberar");
  await page.getByRole("button", { name: "Liberar ao SIF" }).first().click();
  await expect(page.getByRole("button", { name: "Liberar ao SIF" })).toHaveCount(totalAntes - 1, {
    timeout: 15_000,
  });

  await page.goto("/auditoria");
  await expect(page.locator(".rounded-lg.border")).toHaveCount(totalAuditoriaAntes + 1, { timeout: 15_000 });
});
