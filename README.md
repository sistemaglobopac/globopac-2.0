# GloboPac 2.0

Sistema de controle de qualidade e auditoria para frigorífico sob inspeção federal (SIF/MAPA).
Reconstrução da v1 seguindo o PROMPT MESTRE (documentação completa do domínio, requisitos e
roteiro de fases está na conversa que originou este repositório — os pontos operacionais
relevantes estão replicados em `ASSUMPTIONS.md` e `docs/`).

## Estado atual: Fase 0 — Schema base, RLS, autenticação, RBAC

Concluído nesta fase:
- Schema completo versionado (`supabase/migrations/`): perfis, RBAC, fichas/monitoramentos,
  RNC, assinaturas (append-only), fila de carimbo de tempo, hash agregador de lote, log de
  acessos ao portal público, manutenção/OS, turnos.
- RLS habilitada e testada em todas as tabelas (deny by default), com matriz de permissões
  versionada em `permissoes_perfil` (ver `docs/permissions-matrix.md`).
- Segregação de funções e imutabilidade pós-liberação reforçadas por **trigger de banco**,
  não apenas RLS.
- `ASSUMPTIONS.md` criado com as premissas da seção 13 do PROMPT MESTRE, respondidas ou
  explicitamente marcadas como pendentes.
- ADRs iniciais em `docs/adr/`.

**Ainda não implementado** (fases seguintes do roteiro — não avançar sem terminar a Fase 0):
Edge Functions (assinatura, carimbo, liberação SIF, relatórios), frontend, PWA/offline,
testes E2E Playwright, migração de dados legados. Ver seção "Roteiro" abaixo.

⚠️ **Verificação pendente de confirmação nesta sessão:** as migrations e os testes pgTAP
foram escritos e revisados, mas **não puderam ser executados localmente** nesta sessão porque
o ambiente não tinha Docker Desktop instalado (pré-requisito do `supabase start`). Antes de
considerar a Fase 0 realmente concluída, rode:

```bash
npm install
npm run db:start
npm run db:reset   # aplica todas as migrations do zero + supabase/seed.sql
npm run db:test    # roda a suíte pgTAP (supabase/tests/database/*.sql)
```

Isso também roda automaticamente em CI (`.github/workflows/ci.yml`) a cada push/PR, em um
runner com Docker disponível — se você não conseguir rodar localmente, abra um PR e confira o
resultado do job `migrations-e-rls`.

## Pré-requisitos

- Node.js ≥ 20
- Docker Desktop (ou Docker Engine) rodando — necessário para o stack local do Supabase
- Supabase CLI é instalada como devDependency (`npm install`), não precisa instalar global

## Estrutura do repositório

```
globopac/
├── supabase/
│   ├── config.toml          # config do stack local + Auth Hook de RBAC
│   ├── migrations/*.sql      # schema versionado (Fase 0)
│   ├── seed.sql               # dados de DEV LOCAL apenas (usuários de teste, templates)
│   └── tests/database/*.sql  # testes pgTAP (RLS, segregação de funções, append-only)
├── docs/
│   ├── adr/                  # decisões arquiteturais
│   ├── permissions-matrix.md
│   └── runbooks/             # a partir da Fase 8
├── ASSUMPTIONS.md
└── .github/workflows/ci.yml
```

`src/`, `tests/unit`, `tests/component`, `tests/e2e` existem como esqueleto para a Fase 1 em
diante (frontend React + TS, Vitest, Testing Library, Playwright).

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
| 0 | Schema base, RLS, autenticação, RBAC | ✅ Implementada nesta sessão — **pendente de validação local/CI** (ver aviso acima) |
| 1 | CRUD de fichas e verificação | Não iniciada |
| 2 | Assinatura eletrônica + carimbo RFC 3161 | Não iniciada |
| 3 | Liberação SIF + portal público de verificação | Não iniciada |
| 4 | RNC e tratativas | Não iniciada |
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
  relação com o GLOBO SIGMA, TTL de JWT, e por que `condicao` não é interpretada
  genericamente).
