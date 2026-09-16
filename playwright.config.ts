import { defineConfig, devices } from "@playwright/test";

// E2E depende do stack local do Supabase rodando (supabase start) — ver README.
// webServer sobe o preview de produção do frontend; o backend precisa já estar de pé.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // "github" só anota o run inline; "html" gera o relatório navegável com trace/screenshot
  // que o job de CI publica como artifact em caso de falha — sem ele não há como investigar
  // uma falha de CI a não ser reproduzindo localmente.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
