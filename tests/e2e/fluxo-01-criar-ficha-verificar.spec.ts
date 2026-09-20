import { test, expect } from "@playwright/test";
import { login, logout, selecionarTemplate, assinarComSenha, clienteAdminDeTeste, idDoMonitoramentoPorMarcador, localizarCartaoRegistro } from "./helpers";

// Fluxo E2E nº 1 (seção 10 do PROMPT MESTRE): "Inspetor cria ficha → assina → aparece para
// Verificador." Depende do stack local do Supabase rodando com supabase/seed.sql aplicado
// (usuários e template de teste) — ver README para rodar localmente, ou o job "e2e" do CI.
//
// Usa um marcador único (observacoes) e escopa a asserção ao card que o contém — o banco não
// é resetado entre arquivos de teste nem entre tentativas de retry na mesma execução de CI,
// então pode haver mais de um monitoramento pendente de verificação ao mesmo tempo (de outro
// arquivo, ou de uma tentativa anterior que falhou). Um bug real já apareceu aqui: getByText
// sem `exact` também colidia com o "20" dentro de "2026" na data renderizada no mesmo card.

test("inspetor cria e assina uma ficha, que aparece para o verificador", async ({ page }) => {
  const marcador = `E2E-fluxo1-${Date.now()}`;
  const admin = await clienteAdminDeTeste();

  await login(page, "1001", "121072");

  await page.goto("/fichas/nova");
  await selecionarTemplate(page, "Monitoramento de Temperatura — Linha DIF (v1)");

  const temperatura = `${20 + Math.floor(Math.random() * 5)}`;
  await page.locator("#temperatura_celsius").fill(temperatura);
  await page.locator("#observacoes").fill(marcador);

  await page.getByRole("button", { name: "Criar e assinar" }).click();
  await assinarComSenha(page, "121072");
  await expect(page.getByText("Ficha criada e assinada com sucesso.")).toBeVisible({ timeout: 15_000 });

  await logout(page);

  await login(page, "1002", "121072");
  await page.goto("/verificacao");

  // O card da fila não mostra mais o valor dos campos (temperatura/observações), só
  // metadados — localiza pelo id real do registro (via o marcador), não mais por texto.
  const registroId = await idDoMonitoramentoPorMarcador(admin, marcador);
  const cartaoDoRegistro = await localizarCartaoRegistro(page, registroId);
  await expect(cartaoDoRegistro).toBeVisible({ timeout: 15_000 });
  await expect(cartaoDoRegistro.getByText("Monitoramento de Temperatura")).toBeVisible();
});
