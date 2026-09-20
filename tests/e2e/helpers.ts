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
/** AuditRecordCard não mostra mais o conteúdo dos campos (temperatura, observações) no resumo
 * da fila de verificação — só metadados (código, inspetor, data, setor); o detalhe fica
 * atrás do botão "Verificar" (tela cheia com relatório consolidado). Sem o marcador visível
 * no card, localizar pelo texto (hasText) não funciona mais — busca o id real do registro
 * (o card tem data-testid={`registro-verificacao-${id}`}) via o marcador em observacoes. */
export async function idDoMonitoramentoPorMarcador(
  admin: Awaited<ReturnType<typeof clienteAdminDeTeste>>,
  marcador: string
): Promise<string> {
  const { data, error } = await admin
    .from("monitoramentos")
    .select("id")
    .eq("dados_dinamicos->>observacoes", marcador)
    .single();
  if (error || !data) throw new Error(`monitoramento com marcador ${marcador} não encontrado: ${error?.message}`);
  return data.id as string;
}

/** Fichas simples do mesmo inspetor/dia/turno/PAC/setor se agrupam visualmente num "dossiê"
 * colapsado (DossieVerificacaoCard) quando há 2+ — um item sozinho fica "avulso" (visível
 * direto), mas como os specs de E2E rodam em sequência sem resetar o banco (e alguns, como o
 * fluxo 1, deixam a própria ficha "aguardando" de propósito, sem verificá-la), um item pode
 * acabar dentro de um dossiê de uma execução posterior — o card individual só existe no DOM
 * depois de expandir "Apurações". Faz polling: procura o card, expande qualquer "Apurações"
 * visível, procura de novo. */
export async function localizarCartaoRegistro(page: Page, monitoramentoId: string) {
  const cartao = page.getByTestId(`registro-verificacao-${monitoramentoId}`);
  const prazo = Date.now() + 15_000;
  while (Date.now() < prazo) {
    if ((await cartao.count()) > 0) return cartao;
    const botoesApuracoes = page.getByRole("button", { name: "Apurações" });
    const total = await botoesApuracoes.count();
    for (let i = 0; i < total; i++) await botoesApuracoes.nth(i).click().catch(() => {});
    if ((await cartao.count()) > 0) return cartao;
    await page.waitForTimeout(500);
  }
  return cartao;
}

export async function selecionarTemplate(page: Page, nomeTemplate: string) {
  await page
    .getByTestId("ficha-card")
    .filter({ hasText: nomeTemplate })
    .getByRole("button")
    .click();
}

/** NovaFichaPage passou a exigir reautenticação por senha antes de gravar/assinar (Lei
 * 14.063/2020, Art. 4º §2º) — "Criar e assinar" não submete mais direto, troca o card pelo
 * passo de confirmação (inline, não é um dialog: ao contrário do fluxo do VERIFICADOR em
 * PainelVerificacao). Só roda quando online — offline pula esse passo e vai direto pra fila. */
export async function assinarComSenha(page: Page, senha: string) {
  await page.getByLabel("Sua senha").fill(senha);
  await page.getByRole("button", { name: "Confirmar e Assinar" }).click();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
