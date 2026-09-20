import { test, expect } from "@playwright/test";
import { login, logout, clienteAdminDeTeste, selecionarTemplate, assinarComSenha } from "./helpers";

// Fase 8 (PWA offline e sincronização, ADR 0002/0014) — sem número de fluxo na seção 10
// (feature adicionada além do roteiro original, ver ASSUMPTIONS.md). Cobre o caminho
// completo: sem rede → ficha enfileirada localmente → rede volta → sincroniza e assina
// automaticamente, sem nenhuma ação adicional do usuário.
//
// Simula "sem rede" com page.route(...).abort() nas chamadas de escrita (monitoramentos e
// Edge Functions), em vez de context.setOffline(true): confirmado em CI (3 tentativas, dois
// mecanismos de timeout diferentes no app) que setOffline deixa requisições já em voo
// penduradas indefinidamente neste ambiente, sem nunca entregar erro/abort ao JS da página —
// nem um AbortSignal.timeout(...) genuíno consegue resgatar isso, então nenhuma correção no
// app teria efeito num teste que dependesse disso. route.abort() rejeita a requisição de
// forma real e imediata, exercitando o fallback de "falha de rede" do app sem depender desse
// comportamento específico do CDP.

test("ficha criada sem rede é enfileirada e sincronizada automaticamente quando a rede volta (Fase 8)", async ({
  page,
}) => {
  const marcador = `E2E-fluxo9-${Date.now()}`;
  const admin = await clienteAdminDeTeste();

  await login(page, "1001", "121072");
  await page.goto("/fichas/nova");
  await selecionarTemplate(page, "Monitoramento de Temperatura — Linha DIF (v1)");

  await page.route("**/rest/v1/monitoramentos**", (route) => route.abort("internetdisconnected"));
  await page.route("**/functions/v1/assinar-documento**", (route) => route.abort("internetdisconnected"));
  try {
    await page.locator("#temperatura_celsius").fill("19");
    await page.locator("#observacoes").fill(marcador);
    await page.getByRole("button", { name: "Criar e assinar" }).click();
    // signInWithPassword (reautenticação da assinatura) bate em /auth/v1/token, rota diferente
    // das interceptadas acima (rest/v1/monitoramentos, functions/v1/assinar-documento) —
    // continua alcançável, então o passo de senha roda normalmente antes da falha simulada.
    await assinarComSenha(page, "121072");

    await expect(
      page.getByText("Sem conexão — ficha salva no dispositivo e será enviada e assinada automaticamente")
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/1 ficha\(s\) aguardando sincronização/)).toBeVisible();
    // "Pendente" ou "Falha ao sincronizar": salvar() volta pra lista de fichas (onVoltar),
    // remontando FilaOfflinePainel — o efeito de montagem tenta sincronizar na hora, e como a
    // rede simulada ainda está cortada aqui, o item pode já ter passado de pendente pra
    // falhou antes desta asserção rodar. Os dois estados confirmam igualmente que o item
    // continua enfileirado (não sincronizou de verdade ainda).
    await expect(page.getByText(/Pendente de sincronização|Falha ao sincronizar/)).toBeVisible();

    // Nada foi persistido no servidor: o INSERT em si foi abortado (não só a assinatura).
    const { data: aindaNaoExiste } = await admin
      .from("monitoramentos")
      .select("id")
      .eq("dados_dinamicos->>observacoes", marcador)
      .maybeSingle();
    expect(aindaNaoExiste).toBeNull();
  } finally {
    await page.unroute("**/rest/v1/monitoramentos**");
    await page.unroute("**/functions/v1/assinar-documento**");
  }

  // page.unroute() não dispara o evento "online" do navegador (ao contrário de uma
  // reconexão de rede real) — a sincronização aqui depende do reforço periódico de
  // useSincronizacaoOffline (a cada 10s), não do evento; margem generosa para isso.
  await expect(page.getByText(/aguardando sincronização/)).not.toBeVisible({ timeout: 30_000 });

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
  // registro.id já veio da consulta acima — evita repetir a busca por marcador.
  const cartao = page.getByTestId(`registro-verificacao-${registro!.id}`);
  await expect(cartao).toBeVisible({ timeout: 15_000 });
  await expect(cartao.getByText(/Capturado offline em/)).toBeVisible();
});
