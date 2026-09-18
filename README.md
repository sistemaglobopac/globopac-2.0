# GloboPac 2.0

Sistema de controle de qualidade e auditoria para frigorífico sob inspeção federal (SIF/MAPA).
Reconstrução da v1 seguindo o PROMPT MESTRE (documentação completa do domínio, requisitos e
roteiro de fases está na conversa que originou este repositório — os pontos operacionais
relevantes estão replicados em `ASSUMPTIONS.md` e `docs/`).

## Estado atual: Fase 7 — BI, dashboards e exportação de relatórios

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

### Fase 3 (concluída e validada em CI)
- **Liberação em lote** (`liberar-sif`, reescrita — a versão da Fase 2 liberava um por vez,
  sem hash agregador): recebe `monitoramento_ids[]`, calcula o hash agregador do lote
  (seção 6.2, reaproveitando a serialização canônica de `_shared/hash.ts`), grava
  `lote_liberacao_sif`, libera todos os documentos numa única UPDATE multi-linha, assina cada
  um individualmente como LIBERACAO_DIARIA, e enfileira o carimbo do hash agregador do lote.
- **Portal público** (`/verificar?id=<uuid>`, `verificar-documento`, `verify_jwt=false`):
  mostra trilha de assinaturas (tipo, nome, timestamp, badge RFC 3161) e badge de integridade
  (✓ IDÊNTICO / ≠ VERSÃO ANTERIOR, recalculando o hash no servidor). Roda inteiramente com
  `service_role` internamente — a RLS negaria tudo para um chamador anônimo por design (ver
  [ADR 0011](docs/adr/0011-portal-publico-verificacao.md)); "não encontrado" e "existe mas
  não liberado" retornam a mesma resposta, e documento sem nenhuma assinatura nunca fabrica
  um hash/selo (débito da v1).
- **Rate limiting** por IP (hash do IP, `log_acessos_verificacao`) via
  `app_config.portal_verificacao_limite_por_minuto`.
- Testes E2E dos fluxos nº 5 e 6 da seção 10, mais um teste dedicado de rate limiting.

✅ **Validado em CI** ([workflow run](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35192780590)):
os 4 jobs passam, incluindo os 7 testes E2E (fluxos 1, 2, 5, 6a, 6b, 7, e rate limiting).
Precisou de só 1 correção depois do push inicial — de novo, uma colisão de substring em
`getByText` (desta vez "INSPETOR" batendo em "Inspetor(a) de Qualidade (dev)", o nome do
usuário de teste), não um bug de produto. É a terceira vez que esse mesmo padrão de bug de
teste aparece nesta sessão — vale ter isso em mente ao escrever qualquer novo teste E2E que
use `getByText` sem `exact: true` num app com nomes/rótulos que podem conter substrings uns
dos outros.

### Fase 4 (concluída e validada em CI)
- **Tratativas de RNC** (`/rnc`, GESTOR_SETOR/ADMIN_MASTER): lista as RNCs não fechadas do
  próprio setor (RLS já restringia isso desde a Fase 0 — nenhuma migration nova foi
  necessária), com badge de severidade e badge "SLA VENCIDO" quando `prazo_sla` já passou.
  Ciclo de vida em dois passos explícitos: registrar tratativa (→ `TRATADA`) e depois fechar
  (→ `FECHADA`) — ver ASSUMPTIONS.md #20 sobre por que `EM_TRATATIVA` foi deixado sem uso.
- **Reabertura** (ADMIN_MASTER, em RNCs já fechadas): insere uma nova linha referenciando a
  fechada via `rnc_anterior_id`, recalculando `prazo_sla` a partir de
  `app_config.sla_rnc_horas_por_severidade` — nunca sobrescreve a tratativa original (ver
  ASSUMPTIONS.md #21).
- **Nenhuma Edge Function nova**: ao contrário da assinatura/carimbo, tratar/fechar/reabrir
  uma RNC não envolve hash nem assinatura eletrônica — as policies de RLS já existentes
  (`rnc_update`, `rnc_insert`) bastam para gatar essas operações direto do cliente (ver
  ASSUMPTIONS.md #22).
- Teste E2E do fluxo nº 3 da seção 10 (`tests/e2e/fluxo-03-rnc-tratativas.spec.ts`):
  verificador reprova → RNC criada automaticamente → gestor de setor trata → fecha; mais um
  segundo teste dedicado ao DoD "SLA configurável funcional com alerta" (força um
  `prazo_sla` vencido via `service_role` e confirma o badge de alerta).

✅ **Validado em CI** ([workflow run](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35214644851)):
os 4 jobs passam de primeira, incluindo os 9 testes E2E (fluxos 1, 2, 3, 5, 6a, 6b, 7, SLA de
RNC, e rate limiting do portal) — nenhuma correção de produto foi necessária nesta fase.
Único evento digno de nota: `fluxo-05-06-portal-publico.spec.ts` (fluxo 5, não tocado por
esta fase) apresentou 1 flake — o botão "Liberar selecionados" ficou momentaneamente com
contagem `(0)` antes do checkbox do documento recém-verificado aparecer na lista de
pendentes, provavelmente uma corrida entre o refetch do TanStack Query e a navegação. Passou
de forma determinística no retry automático do Playwright (`retries: 1` em CI) — mantido como
observação, não como correção, já que não é causado por nem afeta o código desta fase.

### Fase 5 (concluída e validada em CI)
- **Ciclo completo da OS de manutenção** (`/pcm/nova`, `/pcm`, INSPETOR_PCM/ADMIN_MASTER):
  máquina de estados ABERTURA → AUTORIZACAO → PROGRAMACAO → EXECUCAO → VALIDACAO → CONCLUIDA,
  uma assinatura eletrônica própria por etapa (`avancar-etapa-os`, tabela de transições
  explícita, nunca if/else — ver [ADR 0012](docs/adr/0012-maquina-estados-os-liberacao-manutencao.md)).
  Validar conclui a OS diretamente (ASSUMPTIONS.md #25).
- **Liberação diária ao SIF** (`liberar-relatorio-os-sif`): agrega no relatório do dia
  (`manutencao_relatorios_sif`) todas as OS concluídas e ainda não liberadas, com hash
  agregador cumulativo (múltiplas chamadas no mesmo dia se somam, nunca travam num 409 —
  ASSUMPTIONS.md #26) e assinatura individual LIBERACAO_DIARIA por OS.
- **Duas correções de RLS na Fase 0** encontradas ao construir esta fase: `manutencao_os`
  não restringia UPDATE por setor, e deixava INSPECAO_FEDERAL ver OS em andamento (não só as
  liberadas) — ambas corrigidas com teste pgTAP de regressão (ASSUMPTIONS.md #23).
- **Portal público estendido** (`/verificar?id=`): tenta `monitoramentos` e, se não
  encontrado, tenta OS — mesma trilha/integridade, mesmas regras de segurança da Fase 3.
- **Auditoria** (INSPECAO_FEDERAL): agora também lista OS liberadas ao SIF.
- Teste E2E do fluxo nº 4 da seção 10 (`tests/e2e/fluxo-04-pcm-os.spec.ts`): ciclo completo —
  abrir, avançar as 4 etapas, liberar o relatório do dia, verificar no portal público, e
  conferir visibilidade na auditoria da Inspeção Federal.
- **Risco documentado, não resolvido**: nenhuma segregação de funções entre as 5 etapas da OS
  — um único perfil (`INSPETOR_PCM`) pode assiná-las todas (ASSUMPTIONS.md #24).

✅ **Validado em CI** ([workflow run](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35219627374)):
4/4 jobs, incluindo os 10 testes E2E (fluxos 1, 2, 3, 4, 5, 6a, 6b, 7, SLA de RNC, rate
limiting do portal). Uma iteração de CI foi necessária: o teste pgTAP novo
(`0004_rls_manutencao_os.sql`) tinha dois bugs próprios — faltavam linhas em `auth.users`
para os perfis ADMIN_MASTER/INSPECAO_FEDERAL usados mais adiante no arquivo (violava a FK de
`perfis_usuarios`), e a verificação do primeiro caso (UPDATE bloqueado) lia o resultado usando
a MESMA role restrita que a RLS de SELECT também bloqueia, confundindo "não vejo a linha" com
"a linha não mudou". Nenhum bug de produto — só do próprio teste. Depois disso, 4/4 de
primeira; único evento residual foi 1 flake pré-existente e não relacionado em
`fluxo-07-tsas-falham.spec.ts` (uma corrida de timing entre o worker do cron e a asserção do
teste), resolvido pelo retry automático do Playwright.

**Ainda não implementado** (fases seguintes do roteiro): notificação ativa de SLA vencido
(e-mail/push — hoje o alerta é só visual no painel), integração estruturada com o GLOBO SIGMA
para `ativo_referencia` (segue texto livre — ASSUMPTIONS.md #1), segregação de funções entre
etapas da OS, BI/dashboards, PWA offline, migração de dados legados.

### Fase 6 (concluída e validada em CI)
- **Login por matrícula** (`LoginPage`, `public.email_por_matricula()`): a Supabase Auth só
  autentica por e-mail — uma nova coluna `perfis_usuarios.matricula` e uma função
  `SECURITY DEFINER` resolvem matrícula → e-mail antes de `signInWithPassword`, sem alterar
  RLS/hook de claims. Ver [ADR 0013](docs/adr/0013-login-por-matricula-e-design-system.md).
- **Design system GloboPac v1.0** (navy `#002060` + lima `#c2ef4e`, Inter/JetBrains Mono,
  tratamento glassmorphism): aplicado inteiramente via variáveis CSS/tokens Tailwind
  (`src/index.css`, `tailwind.config.ts`) — nenhum componente precisou ser reescrito, graças à
  camada de indireção de cor deixada pronta desde a Fase 1 (ASSUMPTIONS.md #5).
- Toda a suíte E2E ajustada mecanicamente para `login(page, matricula, senha)` em vez de
  e-mail; senha de desenvolvimento trocada para `121072`.
- Novo teste pgTAP (`0005_login_por_matricula.sql`): resolução correta para perfil ativo,
  `NULL` uniforme para matrícula inexistente ou perfil inativo (nunca revela qual dos dois),
  e que só `anon` tem `EXECUTE` na função (não `authenticated`).
- **Aviso de nova versão disponível** (`UpdateNotifier`, seção 8/observabilidade adiantada):
  o build embute um `__APP_BUILD_ID__` e emite `dist/build-meta.json` com o mesmo valor
  (plugin Vite `build-meta`); o cliente já carregado consulta esse arquivo a cada 60s e, se o
  `buildId` do servidor mudar (novo deploy publicado), mostra um aviso discreto com um botão
  "Atualizar" — nunca recarrega sozinho, então nunca descarta um formulário em andamento sem
  o usuário pedir. Testado com Vitest (`tests/component/UpdateNotifier.test.tsx`: sem aviso
  quando as versões batem, aviso quando divergem, falha de rede ignorada silenciosamente).

✅ **Validado em CI** (Login por matrícula, [workflow run](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35294246230)):
4/4 jobs, incluindo os 10 testes E2E, todos já usando login por matrícula. Duas correções
foram necessárias depois do push inicial: (1) a migration nova tornou
`perfis_usuarios.matricula` `NOT NULL`, mas os 4 arquivos de pgTAP pré-existentes
(`0001`-`0004`) inseriam `perfis_usuarios` sem essa coluna — quebrava o `supabase db reset`
inteiro em CI; e (2) a senha de desenvolvimento tinha sido trocada para `121072` no seed, mas
todos os `login()` dos testes E2E ainda passavam a senha antiga. Nenhuma das duas é um bug de
produto — ambas eram descompassos entre partes do próprio código que precisam ficar em
sincronia manualmente (seed vs. testes; schema vs. fixtures).

✅ **Validado em CI** (UpdateNotifier, [workflow run](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35297785640)):
4/4 jobs. Nesta rodada, `fluxo-05-06-portal-publico.spec.ts` (fluxo 5) falhou até no retry
automático do Playwright — a mesma corrida que já vinha sendo "resolvida" por sorte no retry
desde a Fase 3 (documentada em toda validação de Fase desde então). Desta vez foi corrigida de
verdade: `checkboxes.count()` era um snapshot único (não uma asserção com auto-retry),
chamado logo após `page.goto("/sif/liberar")`, antes de `useMonitoramentosParaLiberar()`
resolver — podia capturar `0` e travar num botão "(0)" permanentemente desabilitado.
`fluxo-02` já usava o padrão certo (esperar o primeiro elemento aparecer antes de contar);
`fluxo-05` só não tinha essa espera. Depois do fix, 4/4 de primeira; único evento residual foi
um flake diferente e já documentado em `fluxo-07-tsas-falham.spec.ts` (corrida de timing entre
o worker do cron e a asserção do teste), resolvido pelo retry automático do Playwright.

**Ainda não implementado** (fases seguintes do roteiro): PWA offline, observabilidade,
migração de dados legados.

### Fase 7 (concluída e validada em CI)
- **Painel gerencial** (`/dashboard`, ADMIN_MASTER/GESTOR_SETOR/INSPETOR_PCM): KPIs e
  gráficos (recharts) agregados sobre `monitoramentos` (últimos 30 dias), `rnc` e
  `manutencao_os` — cada perfil só vê o que a RLS de cada tabela já permitiria em qualquer
  outra tela (GESTOR_SETOR só o próprio setor, INSPETOR_PCM só OS, ADMIN_MASTER tudo).
  Agregação client-side (ASSUMPTIONS.md #33 — ressalva de escala documentada, não resolvida).
- **Exportação CSV** (`src/lib/csv.ts`): um botão por seção (Monitoramentos/RNC/OS) baixa
  exatamente os dados já buscados, com BOM UTF-8 (acentuação correta no Excel) e escape
  RFC 4180 de vírgula/aspas/quebra de linha. Nenhuma ação de RBAC nova — exportar não abre
  acesso além do que a tela já mostra (ASSUMPTIONS.md #34).
- Testado com Vitest (`tests/unit/csv.test.ts`: escape de campos, `null`/`undefined` → vazio)
  e E2E (`tests/e2e/fluxo-08-dashboard-bi.spec.ts`: KPIs carregam, exportação de
  monitoramentos baixa um CSV com cabeçalho e o registro esperado).

✅ **Validado em CI** ([workflow run](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35299592872)):
4/4 jobs de primeira, incluindo os 10 testes E2E (fluxo 8 novo: KPIs carregam, exportação de
monitoramentos baixa um CSV com o registro esperado). Único evento residual foi o mesmo flake
já documentado em `fluxo-07-tsas-falham.spec.ts`, resolvido pelo retry automático do Playwright.

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
│       ├── liberar-sif/          # liberação em LOTE + hash agregador (seção 6.2)
│       ├── processar-fila-carimbo/  # worker do carimbo RFC 3161 (pg_cron + pg_net)
│       └── verificar-documento/  # portal público /verificar — verify_jwt=false
├── src/
│   ├── modules/                  # auth, fichas, carimbos, sif, verificacao-publica
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

A partir da Fase 6, o login é por **matrícula** (não e-mail — ver ASSUMPTIONS.md #29): a
Supabase Auth continua autenticando por e-mail internamente, mas o front-end resolve
matrícula → e-mail via a RPC `email_por_matricula` antes de chamar `signInWithPassword`.

| Matrícula | E-mail (interno, não usado no login) | Perfil | Senha |
|---|---|---|---|
| 1001 | inspetor.qualidade@dev.globopac.local | INSPETOR_QUALIDADE | 121072 |
| 1002 | verificador@dev.globopac.local | VERIFICADOR | 121072 |
| 1003 | gestor.setor@dev.globopac.local | GESTOR_SETOR | 121072 |
| 1004 | admin.master@dev.globopac.local | ADMIN_MASTER | 121072 |
| 1005 | inspecao.federal@dev.globopac.local | INSPECAO_FEDERAL | 121072 |
| 1006 | inspetor.pcm@dev.globopac.local | INSPETOR_PCM | 121072 |

Nunca use esses usuários/senha fora do ambiente local — são recriados do zero a cada
`db:reset` e não existem em staging/produção.

## Roteiro de implementação (seção 14 do PROMPT MESTRE)

| Fase | Escopo | Status |
|---|---|---|
| 0 | Schema base, RLS, autenticação, RBAC | ✅ Concluída e validada em CI |
| 1 | CRUD de fichas e verificação | ✅ Concluída e validada em CI |
| 2 | Assinatura eletrônica + carimbo RFC 3161 | ✅ Concluída e validada em CI |
| 3 | Liberação SIF + portal público de verificação | ✅ Concluída e validada em CI |
| 4 | RNC e tratativas | ✅ Concluída e validada em CI |
| 5 | Portal PCM/OS | ✅ Concluída e validada em CI |
| 6 | Login por matrícula + design system (rebrand) | ✅ Concluída e validada em CI |
| 7 | BI, dashboards, exportação de relatórios | ✅ Concluída e validada em CI |
| 8 | PWA offline e sincronização | Não iniciada |
| 9 | Testes E2E completos, CI/CD, observabilidade | Não iniciada |
| 10 | Migração de dados legados e corte | Não iniciada |

> Nota: esta tabela é uma reconstrução de acompanhamento mantida por quem implementa, não uma
> cópia literal da seção 14 do PROMPT MESTRE (que não está neste repositório). O escopo real de
> cada fase é o que for autorizado no momento ("pode seguir para a Fase N") — a Fase 6 real
> acabou sendo login por matrícula + rebrand visual, não o que a tabela previa antes dela
> começar; o número de fases subsequentes foi ajustado (+1) para acomodar isso sem descartar o
> que já estava planejado.

Não avance para a fase seguinte sem satisfazer o *definition of done* da fase atual (seção 1
do PROMPT MESTRE — princípio de execução).

## Documentação relacionada

- [ASSUMPTIONS.md](ASSUMPTIONS.md) — premissas assumidas, o que está confirmado vs. pendente.
- [docs/permissions-matrix.md](docs/permissions-matrix.md) — matriz de RBAC completa.
- [docs/adr/](docs/adr/) — decisões arquiteturais (fila de carimbo, conflito offline, LTV,
  relação com o GLOBO SIGMA, TTL de JWT, `condicao` não-genérica, `tem_permissao()` e
  `custom_access_token_hook` como SECURITY DEFINER, Edge Functions com cliente duplo, worker
  de carimbo de tempo via pg_cron/pg_net/Vault, portal público de verificação, máquina de
  estados da OS de manutenção e liberação diária ao SIF, login por matrícula e adoção do
  design system).
