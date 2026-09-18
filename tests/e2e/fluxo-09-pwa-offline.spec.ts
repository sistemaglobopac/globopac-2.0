import { test, expect } from "@playwright/test";
import { login, logout, clienteAdminDeTeste } from "./helpers";

// Fase 8 (PWA offline e sincronização, ADR 0002/0014) — sem número de fluxo na seção 10
// (feature adicionada além do roteiro original, ver ASSUMPTIONS.md). Cobre o caminho
// completo: sem rede → ficha enfileirada localmente → rede volta → sincroniza e assina
// automaticamente, sem nenhuma ação adicional do usuário.

test("ficha criada sem rede é enfileirada e sincronizada automaticamente quando a rede volta (Fase 8)", async ({
  page,
  context,
}) => {
  const marcador = `E2E-fluxo9-${Date.now()}`;
  const admin = await clienteAdminDeTeste();

  await login(page, "1001", "121072");
  await page.goto("/fichas/nova");
  await page.locator("#template").selectOption({ label: "Monitoramento de Temperatura — Linha DIF (v1)" });

  await context.setOffline(true);
  try {
    await page.locator("#temperatura_celsius").fill("19");
    await page.locator("#observacoes").fill(marcador);
    await page.getByRole("button", { name: "Criar e assinar" }).click();

    await expect(
      page.getByText("Sem conexão — ficha salva no dispositivo e será enviada e assinada automaticamente")
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/1 ficha\(s\) aguardando sincronização/)).toBeVisible();
    await expect(page.getByText("Pendente de sincronização")).toBeVisible();

    // Não afirma que nada foi persistido no servidor neste ponto: dependendo de reuso de
    // conexão do ambiente, o próprio INSERT pode escapar da emulação de offline do Playwright
    // mesmo com a assinatura abortando por timeout — o que importa (verificado depois) é que
    // o resultado final está correto de qualquer forma, nunca uma linha órfã sem assinatura.
  } finally {
    await context.setOffline(false);
  }

  await expect(page.getByText(/aguardando sincronização/)).not.toBeVisible({ timeout: 20_000 });

  const { data: registro } = await admin
    .from("monitoramentos")
    .select("id, capturado_em, criado_em")
    .eq("dados_dinamicos->>observacoes", marcador)
    .single();
  expect(registro).toBeTruthy();
  expect(registro!.capturado_em).toBeTruthy();

  const { data: assinatura } = await admin
    .from("assinaturas_eletronicas")
    .select("id, tipo")
    .eq("monitoramento_id", registro!.id)
    .eq("tipo", "INSPETOR")
    .maybeSingle();
  expect(assinatura).toBeTruthy();

  await logout(page);

  await login(page, "1002", "121072");
  await page.goto("/verificacao");
  const cartao = page.locator(".rounded-lg.border").filter({ hasText: marcador });
  await expect(cartao).toBeVisible({ timeout: 15_000 });
  await expect(cartao.getByText(/Capturado offline em/)).toBeVisible();
});
