// CORS para as Edge Functions PÚBLICAS (verificar-documento, healthcheck): aceitam chamadas de
// qualquer origem de propósito (portal de verificação embutível, monitor de uptime externo) —
// nunca usar isto em funções autenticadas.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Origens de desenvolvimento local (vite dev + o preview de produção usado pelos testes E2E,
// ver playwright.config.ts) — usadas só quando ALLOWED_ORIGINS não está configurada. Produção
// SEMPRE precisa definir ALLOWED_ORIGINS via `supabase secrets set` (ver ADR 0015); sem isso,
// só as origens locais funcionam com as Edge Functions autenticadas — fail-closed, nunca "*".
const ORIGENS_DEV_PADRAO = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
];

function origensPermitidas(): string[] {
  const configuradas = Deno.env.get("ALLOWED_ORIGINS");
  if (!configuradas) return ORIGENS_DEV_PADRAO;
  return configuradas
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/** CORS para Edge Functions AUTENTICADAS (tudo, exceto verificar-documento/healthcheck).
 * Diferente de `corsHeaders` (wildcard): só reflete a origem da requisição se ela estiver na
 * allowlist (ALLOWED_ORIGINS) — nunca "*". Item do checklist de segurança (endurecer CORS nas
 * funções que carregam Authorization/JWT de usuário real, ou que são o próprio portão de
 * login). Origem fora da lista não recebe o header — o navegador bloqueia a leitura da
 * resposta no lado do cliente (fail-closed). */
export function corsHeadersAutenticado(req: Request): HeadersInit {
  const origem = req.headers.get("origin") ?? "";
  const permitidas = origensPermitidas();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  if (permitidas.includes(origem)) {
    headers["Access-Control-Allow-Origin"] = origem;
  }
  return headers;
}
