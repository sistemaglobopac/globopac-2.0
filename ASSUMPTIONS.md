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
🟡 **Assumida (pendente de confirmação)** — a máquina usada nesta sessão não tinha Docker
disponível, então **as migrations não puderam ser validadas localmente** (`supabase db reset`)
nesta execução. A validação real de "migrations aplicam do zero" (Definition of Done da Fase 0)
foi delegada ao pipeline de CI (`.github/workflows/ci.yml`), que roda em runner do GitHub Actions
com Docker disponível. **Antes de confiar na Fase 0 como concluída, rode o CI (ou
`supabase start && supabase db reset && supabase test db` localmente, com Docker Desktop
instalado) e confirme que passou.**

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
