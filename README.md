# GloboPac 2.0

Sistema de controle de qualidade e auditoria para frigorífico sob inspeção federal (SIF/MAPA).
Reconstrução da v1 seguindo o PROMPT MESTRE (documentação completa do domínio, requisitos e
roteiro de fases está na conversa que originou este repositório — os pontos operacionais
relevantes estão replicados em `ASSUMPTIONS.md` e `docs/`).

## Estado atual: Fase 1 — CRUD de fichas, verificação, builder de templates

### Fase 0 (concluída e validada em CI)
Schema completo versionado (`supabase/migrations/`), RLS deny-by-default em todas as tabelas,
matriz de permissões (`permissoes_perfil`), segregação de funções e imutabilidade
pós-liberação reforçadas por trigger de banco, `ASSUMPTIONS.md`, ADRs iniciais.
[Workflow run](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35158128902):
migrations aplicam do zero + 21/21 testes pgTAP passam.

### Fase 1 (implementada nesta sessão — validação em CI pendente de confirmação)
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

⚠️ **Ainda não confirmado por execução real nesta sessão**: diferente da Fase 0 (onde
iteramos até o CI ficar verde antes de declarar concluído), o código da Fase 1 foi escrito e
revisado, mas o CI deste push ainda não rodou/terminou no momento em que este texto foi
escrito. Trate a Fase 1 como "implementada, validação em andamento" até a confirmação
explícita do run de CI correspondente.

**Ainda não implementado** (fases seguintes do roteiro): worker de carimbo RFC 3161,
liberação SIF + portal público, tratativa completa de RNC (SLA/notificação), Portal PCM/OS,
BI/dashboards, PWA offline, migração de dados legados.

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
npm run db:reset                # aplica migrations + supabase/seed.sql (usuários/templates de teste)
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
│   ├── seed.sql                  # dados de DEV LOCAL apenas (usuários de teste, templates)
│   ├── tests/database/*.sql      # testes pgTAP (RLS, segregação de funções, append-only)
│   └── functions/
│       ├── deno.json             # import map (zod, @supabase/supabase-js) para Deno
│       ├── _shared/              # hash, cors, schema-campos (fonte única com o frontend)
│       ├── assinar-documento/
│       └── verificar-monitoramento/
├── src/
│   ├── modules/                  # auth, fichas — um diretório por módulo de negócio
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
├── ASSUMPTIONS.md
└── .github/workflows/ci.yml
```

## Usuários de teste (ambiente local, `supabase/seed.sql`)

| Email | Perfil | Senha |
|---|---|---|
| inspetor.qualidade@dev.globopac.local | INSPETOR_QUALIDADE | globopac-dev-2026 |
| verificador@dev.globopac.local | VERIFICADOR | globopac-dev-2026 |
| gestor.setor@dev.globopac.local | GESTOR_SETOR | globopac-dev-2026 |
| admin.master@dev.globopac.local | ADMIN_MASTER | globopac-dev-2026 |
| inspecao.federal@dev.globopac.local | INSPECAO_FEDERAL | globopac-dev-2026 |
| inspetor.pcm@dev.globopac.local | INSPETOR_PCM | globopac-dev-2026 |

Nunca use esses usuários/senha fora do ambiente local — `seed.sql` não é aplicado em
staging/produção.

## Roteiro de implementação (seção 14 do PROMPT MESTRE)

| Fase | Escopo | Status |
|---|---|---|
| 0 | Schema base, RLS, autenticação, RBAC | ✅ Concluída e validada em CI |
| 1 | CRUD de fichas e verificação | 🟡 Implementada — validação em CI em andamento |
| 2 | Assinatura eletrônica + carimbo RFC 3161 | Não iniciada (assinatura em si já existe desde a Fase 1; falta o worker de carimbo) |
| 3 | Liberação SIF + portal público de verificação | Não iniciada |
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
  relação com o GLOBO SIGMA, TTL de JWT, `condicao` não-genérica, `tem_permissao()` como
  SECURITY DEFINER, Edge Functions com cliente duplo).
