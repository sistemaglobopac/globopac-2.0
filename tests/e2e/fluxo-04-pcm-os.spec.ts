import { test, expect } from "@playwright/test";
import { login, logout, clienteAdminDeTeste } from "./helpers";

// Fluxo E2E nº 4 (seção 10 do PROMPT MESTRE): ciclo completo de uma OS de manutenção —
// PCM abre → autoriza → programa → executa → valida (conclui) → libera o relatório diário ao
// SIF → visível no portal público e para a Inspeção Federal (seção 7.4, ADR 0012).

test("ciclo completo de OS: abrir, avançar todas as etapas, liberar ao SIF, verificar publicamente (fluxo 4)", async ({
  page,
}) => {
  const marcador = `E2E-fluxo4-${Date.now()}`;
  const admin = await clienteAdminDeTeste();
  const hoje = new Date().toISOString().slice(0, 10);

  await login(page, "inspetor.pcm@dev.globopac.local", "globopac-dev-2026");

  await page.goto("/pcm/nova");
  await page.locator("#descricao").fill(marcador);
  await page.locator("#ativo_referencia").fill("ESTEIRA-03");
  await page.getByRole("button", { name: "Abrir e assinar" }).click();
  await expect(page.getByText("OS criada e assinada com sucesso.")).toBeVisible({ timeout: 15_000 });

  await page.goto("/pcm");
  const cartaoOs = page.locator(".rounded-lg.border").filter({ hasText: marcador });
  await expect(cartaoOs).toBeVisible({ timeout: 15_000 });

  const etapas: Array<{ botao: string; statusEsperado: string }> = [
    { botao: "Autorizar", statusEsperado: "Autorizada" },
    { botao: "Programar", statusEsperado: "Programada" },
    { botao: "Registrar execução", statusEsperado: "Em execução" },
    { botao: "Validar e concluir", statusEsperado: "Concluída" },
  ];

  for (const etapa of etapas) {
    await cartaoOs.getByRole("button", { name: etapa.botao }).click();
    await expect(cartaoOs.getByText(etapa.statusEsperado, { exact: true })).toBeVisible({ timeout: 15_000 });
  }

  const { data: osCriada } = await admin
    .from("manutencao_os")
    .select("id, status, concluido_em")
    .eq("descricao", marcador)
    .single();
  expect(osCriada).toBeTruthy();
  expect(osCriada!.status).toBe("CONCLUIDA");
  expect(osCriada!.concluido_em).toBeTruthy();

  await page.locator("#data_relatorio").fill(hoje);
  await page.getByRole("button", { name: "Liberar relatório do dia" }).click();
  await expect(page.getByText(/liberado:/)).toBeVisible({ timeout: 15_000 });
  await expect(cartaoOs).not.toBeVisible({ timeout: 15_000 });
  await logout(page);

  const { data: osLiberada } = await admin
    .from("manutencao_os")
    .select("liberado_sif, liberado_em")
    .eq("id", osCriada!.id)
    .single();
  expect(osLiberada!.liberado_sif).toBe(true);
  expect(osLiberada!.liberado_em).toBeTruthy();

  await page.goto(`/verificar?id=${osCriada!.id}`);
  await expect(page.getByText("Trilha de assinaturas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(marcador)).toBeVisible();
  await expect(page.getByText("ABERTURA", { exact: true })).toBeVisible();
  await expect(page.getByText("AUTORIZACAO", { exact: true })).toBeVisible();
  await expect(page.getByText("PROGRAMACAO", { exact: true })).toBeVisible();
  await expect(page.getByText("EXECUCAO", { exact: true })).toBeVisible();
  await expect(page.getByText("VALIDACAO", { exact: true })).toBeVisible();
  await expect(page.getByText("LIBERACAO_DIARIA", { exact: true })).toBeVisible();
  await expect(page.getByText(/IDÊNTICO ao original assinado/)).toBeVisible();

  await login(page, "inspecao.federal@dev.globopac.local", "globopac-dev-2026");
  await page.goto("/auditoria");
  await expect(page.getByText(marcador)).toBeVisible({ timeout: 15_000 });
});
