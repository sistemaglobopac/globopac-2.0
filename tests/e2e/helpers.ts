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

/** Cliente com service_role — só para setup/asserts de teste (nunca usado pela aplicação em
 * si). Resolve URL/chave do ambiente (CI já exporta) ou de `supabase status` (uso local). */
export function clienteAdminDeTeste() {
  const url = semAspas(process.env.SUPABASE_URL) || semAspas(statusEnv("API_URL"));
  const serviceRoleKey =
    semAspas(process.env.SUPABASE_SERVICE_ROLE_KEY) || semAspas(statusEnv("SERVICE_ROLE_KEY"));
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY indisponíveis para o teste E2E.");
  }
  return createClient(url, serviceRoleKey);
}

export async function login(page: Page, email: string, senha: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
