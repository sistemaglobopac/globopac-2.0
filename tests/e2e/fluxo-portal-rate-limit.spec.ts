import { test, expect } from "@playwright/test";
import { chamarFuncaoCrua } from "./helpers";

// Rate limiting do portal público (seção 7.6, Definition of Done da Fase 3). O limite vem de
// app_config.portal_verificacao_limite_por_minuto (migration 20260919000001) — 10 por
// padrão. Chama a função diretamente via fetch (não pela UI) para conseguir ler o status
// HTTP exato de cada resposta.

test("portal público de verificação aplica rate limiting por IP", async () => {
  const idInexistente = "00000000-0000-0000-0000-000000000000";
  const status: number[] = [];

  for (let i = 0; i < 14; i++) {
    const resposta = await chamarFuncaoCrua("verificar-documento", { id: idInexistente });
    status.push(resposta.status);
  }

  // As primeiras (até o limite) devem ser 404 (não encontrado — id não existe de verdade);
  // a partir do limite configurado, a resposta muda para 429 (rate limited).
  expect(status.filter((s) => s === 429).length).toBeGreaterThan(0);
  expect(status.at(-1)).toBe(429);
});
