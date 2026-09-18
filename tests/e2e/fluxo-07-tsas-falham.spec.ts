import { test, expect } from "@playwright/test";
import { login, clienteAdminDeTeste } from "./helpers";

// Fluxo E2E nº 7 (seção 10 do PROMPT MESTRE): "Falha simulada de todos os TSAs → sistema
// marca carimbo como pendente e não trava a operação do usuário." Sobrescreve
// app_config.tsas_carimbo_tempo com endereços que falham de forma determinística — não
// depende da internet real (ver docs/adr/0010-worker-carimbo-tempo.md, Decisão 3).

const TSAS_QUE_FALHAM = [
  { nome: "Fake1", url: "http://127.0.0.1:1/inexistente" },
  { nome: "Fake2", url: "http://127.0.0.1:1/inexistente" },
  { nome: "Fake3", url: "http://127.0.0.1:1/inexistente" },
  { nome: "Fake4", url: "http://127.0.0.1:1/inexistente" },
];

test("falha simultânea de todas as TSAs marca o carimbo como pendente sem travar a criação da ficha", async ({
  page,
}) => {
  const admin = await clienteAdminDeTeste();

  const { data: configOriginal } = await admin
    .from("app_config")
    .select("valor")
    .eq("chave", "tsas_carimbo_tempo")
    .single();

  await admin.from("app_config").update({ valor: TSAS_QUE_FALHAM }).eq("chave", "tsas_carimbo_tempo");

  try {
    await login(page, "1001", "121072");
    await page.goto("/fichas/nova");
    await page.locator("#template").selectOption({ label: "Monitoramento de Temperatura — Linha DIF (v1)" });
    await page.locator("#temperatura_celsius").fill("25");

    const antesDaCriacao = new Date().toISOString();
    await page.getByRole("button", { name: "Criar e assinar" }).click();

    // A operação do usuário (criar + assinar) não trava nem falha por causa do TSA — a
    // mensagem de sucesso aparece normalmente, porque o carimbo em si é sempre assíncrono.
    await expect(page.getByText("Ficha criada e assinada com sucesso.")).toBeVisible({ timeout: 15_000 });

    const { data: itemFila } = await admin
      .from("fila_carimbo_tempo")
      .select("id, status, tentativas, ultimo_erro")
      .gte("criado_em", antesDaCriacao)
      .order("criado_em", { ascending: false })
      .limit(1)
      .single();
    expect(itemFila).toBeTruthy();
    expect(itemFila!.status).toBe("pendente");

    const { data: resultado, error } = await admin.functions.invoke("processar-fila-carimbo", { body: {} });
    expect(error).toBeFalsy();
    expect(resultado.processados).toBeGreaterThan(0);

    const { data: itemAposProcessar } = await admin
      .from("fila_carimbo_tempo")
      .select("status, tentativas, ultimo_erro")
      .eq("id", itemFila!.id)
      .single();

    // Ainda pendente (não concluído) — as 4 TSAs falharam, mas o item não vira
    // falhou_definitivo numa única rodada (carimbo_max_tentativas > 1).
    expect(itemAposProcessar!.status).toBe("pendente");
    expect(itemAposProcessar!.tentativas).toBeGreaterThanOrEqual(1);
    expect(itemAposProcessar!.ultimo_erro).toBeTruthy();
  } finally {
    if (configOriginal) {
      await admin.from("app_config").update({ valor: configOriginal.valor }).eq("chave", "tsas_carimbo_tempo");
    }
  }
});
