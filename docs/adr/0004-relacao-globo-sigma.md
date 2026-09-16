# ADR 0004 — Relação entre o módulo PCM/OS do GloboPac e o GLOBO SIGMA

## Contexto
Existe um sistema de PCM dedicado (GLOBO SIGMA) em desenvolvimento separado. O PROMPT MESTRE
(seção 13, premissa 1) lista três alternativas possíveis e pede confirmação antes da Fase 5.

## Decisão (assumida, não confirmada — ver ASSUMPTIONS.md item 1)
Alternativa (b): GloboPac 2.0 e GLOBO SIGMA são **complementares**. O GloboPac implementa
apenas a camada de **assinatura eletrônica, auditoria e liberação ao SIF** do ciclo de OS
(`manutencao_os`, `manutencao_os_historico`, `manutencao_relatorios_sif`,
`assinaturas_os_eletronicas`). Planejamento de ativos, plano de manutenção preventiva e
indicadores de PCM permanecem no SIGMA.

## Por que essa alternativa, e não as outras duas
- **(a) Unificar em uma única arquitetura:** rejeitada por ora — o SIGMA já está em
  desenvolvimento separado; unificar exigiria uma decisão de produto/organizacional que este
  projeto não tem mandato para tomar unilateralmente.
- **(c) Permanecerem completamente independentes:** rejeitada — deixaria a liberação ao SIF
  de OS de manutenção sem lastro em nenhum sistema de verificação de integridade/assinatura,
  o que contradiz o objetivo central do GloboPac (valor jurídico probatório).

## Consequência imediata no schema (Fase 0)
`manutencao_os.ativo_referencia` é um campo de **texto livre** (não uma FK para uma tabela de
ativos), porque essa tabela de ativos, se existir, vive no SIGMA — cujo esquema de dados este
projeto não tem acesso nesta fase. Isso é deliberado: manter um placeholder frouxo é mais
seguro do que modelar uma FK para um sistema externo cuja interface ainda não foi definida.

## Ação pendente antes da Fase 5
Confirmar esta decisão (ou substituí-la) com o responsável do projeto. Se a integração exigir
consumir dados do SIGMA em tempo real (ex.: para pré-preencher `ativo_referencia` a partir de
um cadastro real), o mecanismo (API síncrona, webhook, ou replicação periódica) precisa ser
especificado e provavelmente exigirá uma nova migration para transformar `ativo_referencia`
em uma referência estruturada.
