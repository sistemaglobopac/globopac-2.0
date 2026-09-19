import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

let saidaStatusCache: string | undefined;
function statusEnv(chave: string): string | undefined {
  saidaStatusCache ??= execSync("supabase status -o env", { encoding: "utf8" });
  const linha = saidaStatusCache.split("\n").find((l) => l.startsWith(`${chave}=`));
  return linha?.slice(chave.length + 1);
}

function semAspas(valor: string | undefined): string | undefined {
  return valor?.trim().replace(/^"|"$/g, "");
}

/** Resolve URL/service_role key do ambiente (CI já exporta) ou de `supabase status` (uso
 * local) — sem criar nenhum cliente, para quem só precisa montar uma chamada HTTP crua. */
export function resolverCredenciaisDeTeste() {
  const url = semAspas(process.env.SUPABASE_URL) || semAspas(statusEnv("API_URL"));
  const serviceRoleKey =
    semAspas(process.env.SUPABASE_SERVICE_ROLE_KEY) || semAspas(statusEnv("SERVICE_ROLE_KEY"));
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY indisponíveis para o teste E2E.");
  }
  return { url, serviceRoleKey };
}

/** Cliente com service_role — só para setup/asserts de teste (nunca usado pela aplicação em
 * si). */
export async function clienteAdminDeTeste() {
  const { url, serviceRoleKey } = resolverCredenciaisDeTeste();
  // Playwright roda os testes em Node puro (não no browser) — mesmo problema já visto em
  // scripts/seed-dev-users.mjs: supabase-js sempre inicializa um RealtimeClient, que exige
  // WebSocket global, nativo só a partir do Node 22. CI usa Node 20.
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("ws");
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createClient(url, serviceRoleKey);
}

/** Chama uma Edge Function via fetch cru (sem supabase-js), para testes que precisam do
 * status HTTP exato da resposta (ex.: 429 de rate limiting). */
export async function chamarFuncaoCrua(nomeFuncao: string, corpo: unknown) {
  const { url, serviceRoleKey } = resolverCredenciaisDeTeste();
  return fetch(`${url}/functions/v1/${nomeFuncao}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(corpo),
  });
}

export async function login(page: Page, matricula: string, senha: string) {
  await page.goto("/login");
  await page.getByLabel("Matrícula").fill(matricula);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/** NovaFichaPage não usa mais um <select id="template"> (trocado por um grid de cards com
 * cronômetro de liberado/bloqueado/atrasado em be0f61c) — localiza o card pelo nome do
 * template e clica no botão dele (único por card, texto varia com o status: "Preencher
 * monitoramento"/"Preencher urgente"/"Aguarde o tempo"). */
export async function selecionarTemplate(page: Page, nomeTemplate: string) {
  await page
    .getByTestId("ficha-card")
    .filter({ hasText: nomeTemplate })
    .getByRole("button")
    .click();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
