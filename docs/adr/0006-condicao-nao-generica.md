# ADR 0006 — `permissoes_perfil.condicao` não é interpretada genericamente

## Contexto
O PROMPT MESTRE sugere uma coluna `condicao JSONB` em `permissoes_perfil` para "restrições
adicionais (ex.: mesmo setor)". Uma leitura possível seria construir um interpretador
genérico que lê `condicao` e monta dinamicamente a cláusula `WHERE` de cada policy de RLS.

## Decisão
A Fase 0 **não** implementa esse interpretador. Cada restrição contextual (mesmo setor,
"somente liberado ao SIF" para INSPECAO_FEDERAL, autoria em INSERT) é escrita **explicitamente
na policy de RLS de cada tabela**, em SQL comum. A coluna `condicao` permanece na tabela,
usada apenas como metadado informativo para a UI (ex.: explicar ao usuário por que um botão
está desabilitado), sem papel de enforcement.

## Alternativas consideradas
- **Interpretador genérico de `condicao` (rejeitada para esta fase):** mais "elegante" em
  tese, mas troca policies de RLS auditáveis linha a linha por uma camada de indireção
  (JSONB → SQL dinâmico) que é mais difícil de testar exaustivamente com pgTAP e mais difícil
  de auditar em uma revisão de segurança — exatamente o tipo de superfície que o princípio de
  execução "na dúvida, priorize auditabilidade" (seção 1 do PROMPT MESTRE) pede para evitar.
  Bugs em um interpretador genérico de autorização tendem a ser sistêmicos (afetam todas as
  tabelas de uma vez), enquanto um erro em uma policy explícita fica contido a uma tabela.

## Consequências
- Adicionar uma nova restrição contextual (ex.: "GESTOR_SETOR só trata RNC com severidade
  igual ou abaixo de X") significa editar a policy de RLS da tabela correspondente
  diretamente, não configurar um JSON. Isso é uma escolha deliberada de simplicidade sobre
  flexibilidade de configuração em tempo de execução.
- Se, em uma fase futura, o número de regras contextuais crescer a ponto de a duplicação
  entre policies se tornar um problema real de manutenção, esta decisão deve ser revisitada —
  mas apenas com um plano de teste equivalente ou superior ao atual (cobertura por perfil via
  pgTAP), não como uma simplificação que reduza a auditabilidade.
