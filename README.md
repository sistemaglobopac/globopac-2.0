# GloboPac 2.0

Sistema de controle de qualidade e auditoria para frigorífico sob inspeção federal (SIF/MAPA).
Reconstrução da v1 seguindo o PROMPT MESTRE (documentação completa do domínio, requisitos e
roteiro de fases está na conversa que originou este repositório — os pontos operacionais
relevantes estão replicados em `ASSUMPTIONS.md` e `docs/`).

## Estado atual: Fase 2 — Assinatura eletrônica + carimbo de tempo RFC 3161

### Fase 0 (concluída e validada em CI)
Schema completo versionado (`supabase/migrations/`), RLS deny-by-default em todas as tabelas,
matriz de permissões (`permissoes_perfil`), segregação de funções e imutabilidade
pós-liberação reforçadas por trigger de banco, `ASSUMPTIONS.md`, ADRs iniciais.
[Workflow run](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35158128902):
migrations aplicam do zero + 21/21 testes pgTAP passam.

### Fase 1 (concluída e validada em CI)
- Frontend React 19 + Vite + TypeScript estrito, Tailwind + design system próprio no estilo
  shadcn/ui (`src/shared/ui/`), React Hook Form + Zod, TanStack Query, Zustand.
- **Fonte única de validação**: `supabase/functions/_shared/schema-campos.ts` gera o schema
  Zod de uma ficha a partir de `fichas_templates.schema_campos`, reaproveitado tanto no
  frontend (`src/shared/schema-campos.ts` reexporta o mesmo arquivo) quanto nas Edge
  Functions — nunca duas implementações de validação divergentes.
- **Builder de templates com preview ao vivo** (`/templates`, ADMIN_MASTER): edita
  `schema_campos` e vê o formulário real (mesma validação) se atualizar em tempo real.
- **Nova ficha** (`/fichas/nova`, INSPETOR_QUALIDADE): formulário gerado dinamicamente a
  partir do template escolhido; ao salvar, cria o `monitoramento` e chama a Edge Function
  `assinar-documento` (assina como INSPETOR) na mesma operação.
- **Verificação** (`/verificacao`, VERIFICADOR): lista pendentes (filtrados por RLS/setor);
  aprovar ou reprovar chama a Edge Function `verificar-monitoramento`, que atualiza o
  registro (via RLS do próprio chamador — não bypassa a policy `monitoramentos_update_verificar`),
  abre RNC automaticamente se reprovado, e assina como VERIFICADOR.
- **Edge Functions** (`supabase/functions/`): `assinar-documento` e `verificar-monitoramento`
  recalculam o hash SHA-256 sempre no servidor, a partir do registro já persistido — nunca
  aceitam hash do cliente (débito técnico da v1, seção 12). A escrita em
  `assinaturas_eletronicas`/`fila_carimbo_tempo` usa `service_role`; toda leitura/gravação
  sujeita a autorização de negócio usa o cliente do próprio chamador, herdando a RLS já
  testada na Fase 0 (ver [ADR 0008](docs/adr/0008-edge-functions-cliente-duplo.md)). O
  processamento real do carimbo RFC 3161 (worker da fila) é Fase 2 — aqui só a assinatura +
  enfileiramento acontecem.
- Testes: Vitest unitário (`tests/unit/schema-campos.test.ts` — cobertura ampla do gerador de
  validação, o módulo mais sensível depois da própria assinatura), Testing Library
  (`tests/component/DynamicField.test.tsx`), Playwright E2E do fluxo nº 1 da seção 10
  (`tests/e2e/fluxo-01-criar-ficha-verificar.spec.ts`: inspetor cria e assina → aparece para
  o verificador).
- CI estendido (`.github/workflows/ci.yml`): job `frontend` (lint, typecheck, testes
  unit/componente, build — sem depender de Docker) e job `e2e` (sobe o stack local completo e
  roda o Playwright contra ele).

✅ **Validado em CI** ([workflow run](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35168925465)):
os 4 jobs passam, incluindo o E2E completo do fluxo nº 1 (inspetor cria ficha → assina →
aparece para o verificador) contra o stack local real. Chegar até aqui levou 8 iterações de
CI, cada uma revelando um bug real e independente — vale registrar, porque nenhum deles
apareceria só de revisar o código:
1. `vite preview` sem `--host 127.0.0.1` — o healthcheck do Playwright nunca conectava.
2. Usuários de teste inseridos direto em `auth.users` via SQL não autenticam de verdade no
   GoTrue — precisam ser criados pela Admin API (`scripts/seed-dev-users.mjs`).
3. `$GITHUB_ENV` do Actions não remove as aspas que `supabase status -o env` coloca nos
   valores — `SUPABASE_URL` chegava como `"http://..."` (aspas incluídas na string).
4. `@supabase/supabase-js` sempre inicializa um `RealtimeClient`, que exige `WebSocket`
   global — inexistente em Node 20 puro (só nativo a partir do Node 22).
5. `LoginPage` nunca navegava para fora de `/login` após autenticar com sucesso.
6. **O mais sério**: `custom_access_token_hook` sempre emitia `perfil: null` — RLS bloqueava
   a própria leitura de `perfis_usuarios` que o hook faz (mesma causa do ADR 0007, agora no
   hook de emissão do token; ver [ADR 0009](docs/adr/0009-custom-access-token-hook-security-definer.md)).
   Isso nunca apareceria nos testes pgTAP da Fase 0, que simulam o JWT diretamente sem passar
   pelo hook real — só um login de verdade em E2E expôs o problema.

### Fase 2 (concluída e validada em CI)
- **Cliente RFC 3161 real** (`supabase/functions/_shared/rfc3161.ts`), via
  `@peculiar/asn1-*` (não ASN.1 manual — ver [ADR 0010](docs/adr/0010-worker-carimbo-tempo.md)).
  **Validado com uma execução real contra as 4 TSAs do PROMPT MESTRE** (FreeTSA, Sectigo,
  Comodo, Certum) antes de qualquer código de produção existir — todas responderam
  `granted` com certificados e `genTime` extraídos corretamente
  (`supabase/functions/_shared/rfc3161.test.ts`, validação manual, não roda em CI).
- **Worker** (`processar-fila-carimbo`): processa `fila_carimbo_tempo`, tenta as TSAs em
  ordem com fallback, grava `tsr_base64`/`tsa_emitido_em`/`tsa_utilizada`/
  `cadeia_certificados_tsa` no sucesso, ou aplica retry exponencial (até
  `carimbo_max_tentativas`, depois `falhou_definitivo`) sem nunca bloquear quem assinou o
  documento — a assinatura em si já aconteceu na Fase 1, o carimbo é sempre assíncrono.
- **Agendamento**: `pg_cron` + `pg_net` chamam o worker a cada minuto; a `service_role` key
  fica no Supabase Vault, nunca em uma migration (`scripts/configurar-worker-carimbo.mjs`).
- **Painel de pendências** (`/carimbos`, ADMIN_MASTER): contagem por status, destaque para
  pendentes há mais de `carimbo_alerta_horas`, botão "Processar agora".
- **Liberação ao SIF — versão mínima** (`/sif/liberar`, ADMIN_MASTER): libera um
  monitoramento verificado por vez, assina como LIBERACAO_DIARIA. A liberação em **lote**
  com hash agregador e o portal público de verificação são Fase 3 (ver ASSUMPTIONS.md #13).
- **Auditoria** (`/auditoria`, INSPECAO_FEDERAL/ADMIN_MASTER): lista só o que foi liberado.
- Testes E2E dos fluxos nº 2 e nº 7 da seção 10 (`tests/e2e/fluxo-02-*`,
  `tests/e2e/fluxo-07-*` — o nº 7 sobrescreve `app_config.tsas_carimbo_tempo` com endereços
  que falham de forma determinística, não depende da internet real).

✅ **Validado em CI** ([workflow run](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35174978757)):
os 4 jobs passam, incluindo os 3 fluxos E2E (1, 2 e 7) e o agendamento real do worker via
pg_cron/pg_net/Vault. Levou 4 iterações de CI depois do push inicial da fase — três delas
por um mesmo tipo de bug já visto na Fase 1 (falta do polyfill de `WebSocket` para
supabase-js em Node puro, desta vez em `tests/e2e/helpers.ts`) e uma por um bug de teste
genuíno: `getByText("20")` sem `exact: true` colidia com o "20" dentro de "2026" na data
renderizada no mesmo card — determinístico em qualquer execução no ano de 2026, não
flakiness. Nenhum bug de produto novo apareceu desta vez (diferente da Fase 1, que revelou 6).

**Ainda não implementado** (fases seguintes do roteiro): liberação em lote + hash agregador +
portal público de verificação (Fase 3), tratativa completa de RNC (SLA/notificação),
Portal PCM/OS, BI/dashboards, PWA offline, migração de dados legados.

## Pré-requisitos

- Node.js ≥ 20
- Docker Desktop (ou Docker Engine) rodando — necessário para o stack local do Supabase
  (`supabase start`) e para o job `e2e` do CI
- Supabase CLI é instalada como devDependency (`npm install`), não precisa instalar global

## Rodando localmente

```bash
npm install
cp .env.example .env.local     # preencha com a saída de `npm run db:start`
npm run db:start
npm run db:reset                # aplica migrations + supabase/seed.sql + cria usuários de teste (Admin API)
npm run db:test                 # suíte pgTAP (Fase 0)

npm run dev                     # frontend em http://localhost:5173
npm run test:unit               # Vitest (unit + componente)
npm run lint
npm run typecheck
npm run build

npm run test:e2e                # Playwright — precisa do stack local rodando (db:start)
```

## Estrutura do repositório

```
globopac/
├── supabase/
│   ├── config.toml               # config do stack local + Auth Hook de RBAC
│   ├── migrations/*.sql          # schema versionado
│   ├── seed.sql                  # dados de DEV LOCAL apenas (templates de teste, centros de custo)
│   ├── tests/database/*.sql      # testes pgTAP (RLS, segregação de funções, append-only)
│   └── functions/
│       ├── deno.json             # import map (zod, @supabase/supabase-js, @peculiar/asn1-*) para Deno
│       ├── _shared/              # hash, cors, schema-campos, rfc3161, tsa-config, jwt (fonte única com o frontend)
│       ├── assinar-documento/
│       ├── verificar-monitoramento/
│       ├── liberar-sif/          # versão mínima da Fase 2 — lote é Fase 3
│       └── processar-fila-carimbo/  # worker do carimbo RFC 3161 (pg_cron + pg_net)
├── src/
│   ├── modules/                  # auth, fichas, carimbos, sif — um diretório por módulo de negócio
│   ├── shared/                   # ui/ (design system), schema-campos.ts (reexport)
│   ├── store/                    # Zustand (sessão/UI)
│   └── lib/                      # supabase client, database.types, utils
├── tests/
│   ├── unit/                     # Vitest
│   ├── component/                # Testing Library
│   └── e2e/                      # Playwright
├── docs/
│   ├── adr/                      # decisões arquiteturais
│   ├── permissions-matrix.md
│   └── runbooks/                 # a partir da Fase 8
├── scripts/
│   ├── seed-dev-users.mjs        # usuários de teste via Admin API (não dá para inserir via SQL puro)
│   └── configurar-worker-carimbo.mjs  # agenda pg_cron/pg_net + grava credenciais no Vault
├── ASSUMPTIONS.md
└── .github/workflows/ci.yml
```

## Usuários de teste (ambiente local, criados por `scripts/seed-dev-users.mjs` via Admin API)

Rodam automaticamente como parte de `npm run db:reset` (não são criados por `seed.sql` — um
INSERT direto em `auth.users` não reproduz o que o GoTrue exige para autenticar um login de
verdade; ver o comentário no topo de `supabase/seed.sql`).

| Email | Perfil | Senha |
|---|---|---|
| inspetor.qualidade@dev.globopac.local | INSPETOR_QUALIDADE | globopac-dev-2026 |
| verificador@dev.globopac.local | VERIFICADOR | globopac-dev-2026 |
| gestor.setor@dev.globopac.local | GESTOR_SETOR | globopac-dev-2026 |
| admin.master@dev.globopac.local | ADMIN_MASTER | globopac-dev-2026 |
| inspecao.federal@dev.globopac.local | INSPECAO_FEDERAL | globopac-dev-2026 |
| inspetor.pcm@dev.globopac.local | INSPETOR_PCM | globopac-dev-2026 |

Nunca use esses usuários/senha fora do ambiente local — são recriados do zero a cada
`db:reset` e não existem em staging/produção.

## Roteiro de implementação (seção 14 do PROMPT MESTRE)

| Fase | Escopo | Status |
|---|---|---|
| 0 | Schema base, RLS, autenticação, RBAC | ✅ Concluída e validada em CI |
| 1 | CRUD de fichas e verificação | ✅ Concluída e validada em CI |
| 2 | Assinatura eletrônica + carimbo RFC 3161 | ✅ Concluída e validada em CI |
| 3 | Liberação SIF + portal público de verificação | Parcial (liberação individual existe desde a Fase 2; falta lote/hash agregador/portal público) |
| 4 | RNC e tratativas | Parcial (abertura automática ao reprovar existe; SLA/notificação/fechamento não) |
| 5 | Portal PCM/OS | Não iniciada — depende de confirmar ADR 0004 (relação com o GLOBO SIGMA) |
| 6 | BI, dashboards, exportação de relatórios | Não iniciada |
| 7 | PWA offline e sincronização | Não iniciada |
| 8 | Testes E2E completos, CI/CD, observabilidade | Não iniciada |
| 9 | Migração de dados legados e corte | Não iniciada |

Não avance para a fase seguinte sem satisfazer o *definition of done* da fase atual (seção 1
do PROMPT MESTRE — princípio de execução).

## Documentação relacionada

- [ASSUMPTIONS.md](ASSUMPTIONS.md) — premissas assumidas, o que está confirmado vs. pendente.
- [docs/permissions-matrix.md](docs/permissions-matrix.md) — matriz de RBAC completa.
- [docs/adr/](docs/adr/) — decisões arquiteturais (fila de carimbo, conflito offline, LTV,
  relação com o GLOBO SIGMA, TTL de JWT, `condicao` não-genérica, `tem_permissao()` e
  `custom_access_token_hook` como SECURITY DEFINER, Edge Functions com cliente duplo, worker
  de carimbo de tempo via pg_cron/pg_net/Vault).
