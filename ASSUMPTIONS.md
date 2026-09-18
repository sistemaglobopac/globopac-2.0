# ASSUMPTIONS.md — GloboPac 2.0

Registro vivo de premissas assumidas pela execução deste projeto. Nenhuma ambiguidade do
domínio de negócio ou dos requisitos não funcionais deve ser resolvida silenciosamente —
toda suposição adotada é documentada aqui, com o motivo e o status de confirmação.

Convenção de status:
- ✅ **Confirmada** — validada explicitamente pelo responsável do projeto.
- 🟡 **Assumida (pendente de confirmação)** — adotada para poder avançar, mas ainda não
  validada. Reversível sem custo alto se a resposta real for diferente.
- 🔴 **Assumida sob risco** — adotada para poder avançar, mas uma resposta diferente exigiria
  retrabalho estrutural (schema, arquitetura). Confirmar antes da fase indicada.

---

## Premissas do PROMPT MESTRE (seção 13)

### 1. Relação entre o módulo de PCM/OS e o GLOBO SIGMA
🔴 **Assumida sob risco** — Adotada a alternativa (b): GloboPac 2.0 e GLOBO SIGMA são
complementares. O GloboPac cobre apenas a camada de **assinatura, auditoria e liberação SIF**
das ordens de serviço (`manutencao_os`, `manutencao_os_historico`,
`manutencao_relatorios_sif`); planejamento de ativos, plano de manutenção preventiva e
indicadores de PCM permanecem no SIGMA. A interface de integração entre os dois sistemas
**não está definida** — `manutencao_os.ativo_referencia` é um campo texto livre (placeholder)
até que exista uma decisão sobre como referenciar um ativo do SIGMA (FK direta se os bancos
forem acessíveis entre si, ou um identificador externo sincronizado via webhook/API).
**Confirmar antes de iniciar a Fase 5** (Portal PCM/OS) — ver roteiro no README.
Ver [docs/adr/0004-relacao-globo-sigma.md](docs/adr/0004-relacao-globo-sigma.md).

**Atualização (Fase 5):** a Fase 5 foi autorizada e implementada sem que esta confirmação
tivesse chegado — mantida a alternativa (b) como estava, `ativo_referencia` continua texto
livre. Nada na Fase 5 pressupõe uma FK estruturada; se a integração real vier a exigir uma,
é uma migration isolada (trocar o tipo da coluna), sem impacto no restante do schema.

### 2. Escopo de unidade única vs. múltiplas unidades
✅ **Confirmada pelo próprio prompt mestre** — escopo v2 é a SIF 1606 isoladamente. O modelo
de dados não usa nenhuma tabela `unidades`/`plantas`, mas também não impede a adição futura
(bastaria uma coluna `unidade_id` nas tabelas operacionais). Nenhuma ação necessária agora.

### 3. Volumetria real (fichas/dia, usuários simultâneos)
🟡 **Assumida (pendente de confirmação)** — usados os valores de referência do PROMPT MESTRE
(150–400 fichas/dia, 15–40 usuários simultâneos) apenas para dimensionar índices (nenhum
particionamento de tabela foi implementado na Fase 0 — não é necessário nessa escala). Se a
volumetria real for uma ordem de grandeza maior, revisitar estratégia de paginação e considerar
particionamento de `monitoramentos` por mês antes da Fase 6 (BI/Dashboard).

### 4. Prazo de retenção mínimo dos registros assinados
🔴 **Assumida sob risco — requer validação jurídica antes do go-live** — nenhuma rotina de
expurgo foi implementada (nem está prevista). `monitoramentos`, `assinaturas_eletronicas`,
`assinaturas_os_eletronicas`, `lote_liberacao_sif` e `log_acessos_verificacao` são,
estruturalmente, append-only e sem qualquer mecanismo de exclusão física. Isso satisfaz "nunca
apagar fisicamente" independentemente de qual seja o prazo formal — mas uma eventual política
de **arquivamento em armazenamento frio** (não implementada) dependeria desse prazo. Confirmar
com a área de assuntos regulatórios/jurídico antes da Fase 9 (migração/corte).

### 5. Reaproveitamento do design system do GLOBO SIGMA (paleta Avenorte)
🟡 **Assumida (pendente de confirmação)** — nenhuma decisão de UI foi tomada na Fase 0 (não há
frontend ainda). Quando a Fase 1 iniciar, o design system (tokens shadcn/ui + Tailwind) será
inicialmente neutro, com uma camada de tokens de cor isolada em CSS variables para permitir
substituição pela paleta Avenorte sem refatoração, assim que confirmado.

**Atualização (Fase 6):** ✅ **Confirmada** — o usuário forneceu o design system GloboPac v1.0
(navy/lima, tipografia Inter/JetBrains Mono, tratamento glassmorphism). Aplicado inteiramente
via variáveis CSS/tokens Tailwind (`src/index.css`, `tailwind.config.ts`), exatamente pela
camada de indireção isolada que foi deixada pronta desde a Fase 1 para este momento — nenhum
componente precisou ser reescrito. Ver [ADR 0013](docs/adr/0013-login-por-matricula-e-design-system.md).

### 6. Canal de alerta operacional
🟡 **Assumida (pendente de confirmação)** — e-mail como canal mínimo padrão, conforme sugerido
no PROMPT MESTRE. Nenhuma integração foi implementada na Fase 0 (é escopo da Fase 8 —
observabilidade). Revisar se Slack/Teams interno é preferível antes daquela fase.

### 7. Política de re-carimbo de longo prazo (LTV)
🟡 **Assumida (pendente de confirmação)** — Fase 0 implementa apenas o mínimo estrutural: a
coluna `cadeia_certificados_tsa BYTEA` existe em `assinaturas_eletronicas` e
`assinaturas_os_eletronicas` para arquivar a cadeia de certificados da TSA no momento da
assinatura (Fase 2). A decisão sobre **implementar ou não** re-carimbo periódico automático
antes do vencimento dos certificados originais fica explicitamente para uma fase posterior —
ver [docs/adr/0003-recarimbo-longo-prazo-ltv.md](docs/adr/0003-recarimbo-longo-prazo-ltv.md).

---

## Premissas adicionais introduzidas durante a execução (Fase 0)

### 8. Projeto Supabase (hospedado) ainda não existe / credenciais não fornecidas
🔴 **Assumida sob risco** — como nenhum projeto Supabase hospedado foi indicado nesta sessão,
a Fase 0 foi construída para rodar contra o **stack local do Supabase CLI** (`supabase start`,
Postgres em Docker). Nenhuma chave real (`SUPABASE_URL`, `anon key`, `service_role key`) foi
solicitada ou usada — `.env.example` documenta apenas os nomes das variáveis esperadas.
**Ação necessária do responsável do projeto:** criar o projeto Supabase (região `sa-east-1` ou
equivalente compatível com LGPD — ver seção 3 do PROMPT MESTRE) e fornecer a URL/chaves via
secrets do GitHub Actions antes que o pipeline de CI/CD possa fazer deploy real de migrations e
Edge Functions (isso é necessário a partir da Fase 8).

### 9. Ambiente de execução local sem Docker Desktop
✅ **Resolvida via CI** — a máquina usada para desenvolver a Fase 0 não tinha Docker
disponível, então as migrations não puderam ser validadas localmente (`supabase db reset`)
durante a escrita. A validação real de "migrations aplicam do zero" + "testes de RLS por
perfil passam" (Definition of Done da Fase 0) foi feita via CI
(`.github/workflows/ci.yml`, runner do GitHub Actions com Docker) —
[run 35158128902](https://github.com/sistemaglobopac/globopac-2.0/actions/runs/35158128902):
ambos os jobs verdes, 21/21 testes pgTAP passando. Duas iterações de CI foram necessárias
para chegar aqui; os bugs reais encontrados (recursão de RLS, teste com expectativa
desatualizada) foram corrigidos e documentados nos commits subsequentes e no
[ADR 0007](docs/adr/0007-tem-permissao-security-definer.md). Continua recomendado instalar
Docker Desktop localmente antes da Fase 1, para poder iterar sem depender de round-trips de
CI a cada mudança de schema.

### 10. Ordem/nomenclatura das ações em `permissoes_perfil`
🟡 **Assumida (pendente de confirmação)** — os nomes de `acao` usados nas policies de RLS
(`ler`, `criar`, `verificar`, `liberar_sif`, `tratar`, `abrir`, `avancar_etapa`, `gerenciar`,
`atualizar`) são um vocabulário mínimo inventado para a Fase 0, documentado em
[docs/permissions-matrix.md](docs/permissions-matrix.md). Não há problema em renomear/expandir
esse vocabulário nas fases seguintes — o importante é que ele viva **apenas** em
`permissoes_perfil` e nas policies de RLS que o consultam via `tem_permissao()`, nunca em
condicionais soltos no frontend.

### 11. Interpretação da coluna `condicao` (JSONB) de `permissoes_perfil`
🟡 **Assumida (pendente de confirmação)** — a Fase 0 **não** implementa um interpretador
genérico de `condicao`. Restrições contextuais (ex.: "mesmo setor", "somente liberado ao SIF")
foram escritas diretamente nas policies de RLS de cada tabela (explícitas, testáveis por pgTAP),
e a coluna `condicao` é, por ora, apenas informativa para o frontend (para exibir ao usuário por
que uma ação está indisponível). Ver ADR sobre o motivo dessa escolha:
[docs/adr/0006-condicao-nao-generica.md](docs/adr/0006-condicao-nao-generica.md).

### 12. `monitoramentos` é append-only mesmo antes da verificação/liberação
🔴 **Assumida sob risco — validar com o time de operação** — o PROMPT MESTRE exige
imutabilidade **após liberação ao SIF** (seção 7.3) explicitamente. A Fase 0 foi além disso e
bloqueou `DELETE` em `monitoramentos` **em qualquer estágio**, inclusive antes da verificação
(trigger `trg_bloqueia_delete_monitoramento`), sob o princípio do prompt mestre de "na dúvida,
priorize auditabilidade sobre conveniência". **Risco:** se, na prática, inspetores
frequentemente cometem erros de digitação antes da verificação e esperam poder excluir um
rascunho, essa regra será operacionalmente rígida demais. Se confirmado como problema real,
a correção é local (trocar o trigger de bloqueio por uma condição `WHERE conformidade IS NULL
AND verificado_por IS NULL`) e não tem impacto em nenhum dado já gravado, pois nenhum dado
assinado é afetado por essa mudança.

## Premissas da Fase 2 (carimbo de tempo RFC 3161)

### 13. "Liberar ao SIF" na Fase 2 é uma versão mínima, não a liberação em lote
🔴 **Assumida sob risco — a liberação em lote é explicitamente Fase 3** — o fluxo E2E nº 2
(seção 10: "Verificador aprova → assina → Admin libera SIF → aparece para Inspeção Federal")
exige que ALGUMA forma de liberação ao SIF exista para a Fase 2 fechar ponta a ponta, mas a
liberação em LOTE com hash agregador (`lote_liberacao_sif`, seção 6.2) e o portal público de
verificação são escopo declarado da Fase 3 (seção 14 do PROMPT MESTRE). Implementado agora:
a Edge Function `liberar-sif` libera **um monitoramento por vez**, assina como
LIBERACAO_DIARIA, e a Inspeção Federal já enxerga o resultado (a RLS de `monitoramentos`
já existia desde a Fase 0). O que falta para a Fase 3 completar isto: seleção em lote na UI,
cálculo do hash agregador do lote, e o portal público `/verificar?id=`.

### 14. Lista de 4 TSAs do PROMPT MESTRE mantida sem substituição — todas validadas ao vivo
✅ **Confirmada por execução real** — diferente do que a pesquisa inicial de conectividade
sugeria (URLs antigas retornando 404 a um POST vazio), uma requisição RFC 3161 real e bem
formada foi enviada a FreeTSA, Sectigo (`timestamp.sectigo.com`), Comodo
(`timestamp.comodoca.com`) e Certum (`time.certum.pl`) a partir deste ambiente de
desenvolvimento, e as 4 responderam `granted` com corrente de certificados e `genTime`
extraíveis (`supabase/functions/_shared/rfc3161.test.ts`). Nenhuma substituição foi
necessária. Isso pode mudar no futuro se algum desses serviços públicos gratuitos for
descontinuado — o sintoma seria esse TSA específico sempre falhando no painel de pendências.

### 15. Testes automatizados (CI) não dependem da disponibilidade real das 4 TSAs
✅ **Confirmada, decisão deliberada** — ver
[ADR 0010](docs/adr/0010-worker-carimbo-tempo.md), Decisão 3. O teste E2E do fluxo nº 7
(falha de todas as TSAs) sobrescreve `app_config.tsas_carimbo_tempo` com endereços que falham
de forma determinística, em vez de depender de conseguir fazer 4 serviços públicos externos
falharem sob demanda (o que não é possível de forma confiável) ou de sua disponibilidade real
sob demanda no fluxo de sucesso.

## Premissas da Fase 3 (liberação em lote + portal público)

### 16. Portal público (`verificar-documento`) cobre só monitoramentos, não OS
🔴 **Assumida sob risco — depende da Fase 5** — `manutencao_os` não tem um mecanismo de
"liberação" definido ainda (isso é `manutencao_relatorios_sif`, um relatório diário separado,
não um flag por OS). Implementar a busca de OS no portal agora seria adivinhar um design que
a Fase 5 ainda vai desenhar de verdade. Qualquer `id` que não seja um `monitoramentos.id`
retorna "não encontrado" — ver [ADR 0011](docs/adr/0011-portal-publico-verificacao.md).

### 17. CAPTCHA após N falhas não foi implementado
🟡 **Assumida (pendente de confirmação)** — a seção 7.6 sugere, como reforço adicional
opcional ("considerar exigir"), um CAPTCHA depois de várias consultas malsucedidas do mesmo
IP. Implementado nesta fase: rate limiting simples por IP/minuto
(`app_config.portal_verificacao_limite_por_minuto`), testado em CI. CAPTCHA fica para uma
fase posterior, se a operação real mostrar que o rate limiting sozinho não é suficiente.

### 18. Teste do "documento sem assinatura" usa um estado sintético, inserido diretamente
✅ **Confirmada, decisão deliberada** — no fluxo real (Fase 1 em diante), todo monitoramento
é assinado como INSPETOR no momento da criação, e `liberar-sif` exige uma assinatura
registrada antes de incluir um documento no lote — ou seja, "liberado E sem nenhuma
assinatura" não é um estado que as Edge Functions produzem normalmente. O teste E2E do fluxo
6b insere esse estado diretamente via `service_role` (fora de qualquer Edge Function),
só para validar que o código DEFENSIVO do portal (nunca fabricar um hash/selo) funciona,
mesmo que a situação real que ele previne não aconteça pelo caminho normal do sistema.

### 19. Liberação individual da Fase 2 substituída por liberação em lote (mesmo lote de 1)
✅ **Confirmada, decisão deliberada** — a Edge Function `liberar-sif` da Fase 2 liberava um
monitoramento por vez, sem hash agregador. Na Fase 3 ela foi reescrita para sempre operar em
lote (`monitoramento_ids: string[]`, mínimo 1) — liberar um único documento agora é só um
lote de tamanho 1, ganhando de graça a camada extra de tamper-evidence do hash agregador que
a versão da Fase 2 não tinha. Não existem mais duas implementações de liberação para manter.

## Premissas da Fase 4 (RNC e tratativas)

### 20. Estado `EM_TRATATIVA` do enum `status_rnc` fica disponível no schema, mas não é usado
🟡 **Assumida (pendente de confirmação)** — o ciclo de vida implementado nesta fase é
`ABERTA`/`REABERTA` → `TRATADA` (gestor registra a tratativa) → `FECHADA` (gestor fecha), em
dois passos explícitos e auditáveis. O PROMPT MESTRE não detalha o que distingue
`EM_TRATATIVA` de `ABERTA` na prática (ex.: precisaria de um terceiro botão "iniciar
tratativa" sem side-effect nenhum além de marcar "alguém está olhando isso"?) — nenhuma
suposição foi inventada para preencher essa lacuna. O valor do enum foi mantido (não é
destrutivo remover depois) para não forçar uma migration se a distinção vier a ser
especificada.

### 21. Reabertura de RNC restrita a `ADMIN_MASTER`, implementada como novo registro (nunca UPDATE)
✅ **Confirmada, decisão deliberada** — não existe, em nenhuma fase do PROMPT MESTRE, um
perfil de "revisor de RNC" distinto de quem a trata. Diante disso, a reabertura foi
restrita ao único perfil com visão irrestrita (`ADMIN_MASTER`), via RLS existente
(`rnc_insert`: `tem_permissao('rnc','criar') and aberto_por = auth.uid()` — sem alteração de
schema/policy nesta fase). A reabertura sempre insere uma **nova linha** com
`rnc_anterior_id` apontando para a fechada, recalculando `prazo_sla` a partir de
`app_config.sla_rnc_horas_por_severidade` — a RNC original fechada nunca é sobrescrita,
preservando a trilha de quem tratou o quê e quando (mesmo princípio de apend-only já usado
em `assinaturas_eletronicas`, embora aqui seja convenção de aplicação, não trigger de banco,
já que `rnc` não carrega valor jurídico de assinatura eletrônica — só rastreabilidade
operacional).

### 22. Nenhuma Edge Function nova para tratar/fechar/reabrir RNC
✅ **Confirmada, decisão deliberada** — ao contrário de `assinar-documento` ou
`liberar-sif`, a tratativa de RNC não envolve hash recomputado, assinatura eletrônica ou
carimbo de tempo (RNC não é, em si, um documento assinado pelo PROMPT MESTRE — é o registro
de tratamento de uma não conformidade). As policies de RLS já existentes desde a Fase 0
(`rnc_update`: `tem_permissao('rnc','tratar') and setor = any(meus_setores())`) e a de
`rnc_insert` já bastam para gatar tanto a tratativa/fechamento quanto a reabertura
diretamente do cliente Supabase, sem precisar de um `SECURITY DEFINER` server-side. Nenhuma
migration de `permissoes_perfil` foi necessária: `GESTOR_SETOR` e `ADMIN_MASTER` já tinham
`rnc: ler/criar/tratar` desde a seed da Fase 0.

## Premissas da Fase 5 (Portal PCM/OS)

### 23. Duas lacunas de RLS de `manutencao_os` corrigidas antes de construir a Fase 5
✅ **Confirmada, correção necessária** — ao revisar o schema da Fase 0 para implementar a
Edge Function de transição de etapa, `manutencao_os_update` não tinha escopo de setor
(qualquer `INSPETOR_PCM` podia avançar a etapa de uma OS de outro setor) e
`manutencao_os_select` deixava `INSPECAO_FEDERAL` ver OS ainda em andamento, não só as já
liberadas ao SIF — inconsistente com o que `docs/permissions-matrix.md` já documentava e com
a mesma regra aplicada em `monitoramentos_select`. As duas foram corrigidas na migration
20260920000001, com teste pgTAP de regressão (`0004_rls_manutencao_os.sql`).

### 24. Máquina de estados da OS: um único perfil (`INSPETOR_PCM`) conduz todas as 5 etapas
🔴 **Assumida sob risco — confirmar operacionalmente** — não existe segregação de funções
entre abrir/autorizar/programar/executar/validar uma OS (ao contrário de `monitoramentos`,
onde `verificado_por ≠ user_id` é reforçado por trigger). Não há, no vocabulário de
`nivel_acesso` da Fase 0, um segundo perfil de supervisor de manutenção para sustentar essa
segregação — ver [ADR 0012](docs/adr/0012-maquina-estados-os-liberacao-manutencao.md).
Risco: se a operação real exigir que autorização/validação venham de alguém diferente de
quem executa, será necessário um novo perfil em `nivel_acesso` (migration + RBAC), não uma
mudança trivial.

### 25. Assinatura `VALIDACAO` conclui a OS diretamente (sem um status `VALIDACAO` intermediário)
✅ **Confirmada, decisão deliberada** — `tipo_assinatura_os` tem 5 valores mas `status_os` tem
6; a única leitura consistente do schema da Fase 0 é que validar É concluir, sem uma 6ª
assinatura para uma transição `VALIDACAO → CONCLUIDA` que o enum não modela. Ver ADR 0012.

### 26. Liberação diária ao SIF de OS é cumulativa por dia, não um evento único
✅ **Confirmada, decisão deliberada** — `manutencao_relatorios_sif.data_referencia` é
`unique` desde a Fase 0 (diferente de `lote_liberacao_sif`, que permite múltiplos lotes por
dia). Uma segunda chamada de `liberar-relatorio-os-sif` no mesmo dia não é rejeitada: ela
libera as OS recém-concluídas e recalcula o hash agregador sobre TODAS as OS já ligadas ao
relatório daquele dia (antigas + novas), reenfileirando um novo carimbo de tempo para o hash
atualizado. Isso também torna a operação segura para retry (uma segunda tentativa após falha
de rede não trava num 409 permanente).

### 27. Reuso da ação `manutencao_os.avancar_etapa` para autorizar a liberação ao SIF
✅ **Confirmada, decisão deliberada** — a Fase 0 não previu uma ação dedicada tipo
`liberar_sif` para `manutencao_os` (só para `manutencao_relatorios_sif`, que tem `liberar`).
Em vez de uma migration nova só para isso, a Edge Function de liberação reaproveita
`manutencao_os_update` (gated por `avancar_etapa` + setor) para o UPDATE que marca
`liberado_sif=true` — semanticamente aceitável (é o último passo administrativo do ciclo da
OS) e sem abrir nenhum acesso que `INSPETOR_PCM`/`ADMIN_MASTER` já não tivessem.

### 28. Portal público estendido para OS reaproveita a resposta genérica de `verificar-documento`
✅ **Confirmada, decisão deliberada** — a Fase 3 (ADR 0011) deixou a busca de OS de fora
deliberadamente, por falta de um mecanismo de liberação definido. Agora que existe
(`manutencao_os.liberado_sif`), o portal tenta `monitoramentos` e, se não encontrado, tenta
`manutencao_os` — mesmo formato de resposta (`trilha`/`integridade`), com um campo `descricao`
opcional só para OS. Nenhuma mudança de contrato para quem já consome o portal para
monitoramentos.

## Premissas da Fase 6 (login por matrícula + design system)

### 29. Login por matrícula é uma camada de resolução sobre o e-mail, não um mecanismo de auth novo
✅ **Confirmada, decisão deliberada** — a Supabase Auth só autentica por e-mail/telefone.
`perfis_usuarios.matricula` (nova coluna, distinta de `nome_usuario`) mais a função
`public.email_por_matricula()` (SECURITY DEFINER, chamada antes de existir sessão) resolvem
matrícula → e-mail no `LoginPage`, que então chama `signInWithPassword` normalmente — nenhuma
mudança em RLS, no hook de claims, ou em qualquer policy existente. Ver
[ADR 0013](docs/adr/0013-login-por-matricula-e-design-system.md).

### 30. Senha de desenvolvimento trocada para `121072`
✅ **Confirmada, decisão deliberada** — escolha arbitrária do usuário ao atualizar
`scripts/seed-dev-users.mjs`; todos os testes E2E e a tabela de usuários de teste do README
foram atualizados para o novo valor. Nunca usado fora do ambiente local.

### 31. `matricula` não entra nas claims do JWT
✅ **Confirmada, decisão deliberada** — `custom_access_token_hook` continua embutindo só
`perfil`/`setores_permitidos` (o vocabulário de autorização). `matricula` é usada uma única
vez, no momento do login, antes de qualquer sessão existir — depois disso não tem nenhum papel
em RLS/RBAC, então não precisa viajar no token.

### 32. Aviso de nova versão (`UpdateNotifier`) nunca recarrega sozinho
✅ **Confirmada, decisão deliberada** — o polling de `build-meta.json` só troca um `boolean`
de estado para mostrar um aviso; o `window.location.reload()` só acontece no clique explícito
do botão "Atualizar". Isso é deliberado dado o domínio: um recarregamento automático em
qualquer momento poderia descartar dados de um formulário em andamento (ex.: uma OS ou ficha
sendo preenchida) — o mesmo princípio de nunca perder trabalho do usuário silenciosamente que
já rege o resto do sistema (ex.: nunca sobrescrever uma RNC/OS já fechada, sempre aditivo).
