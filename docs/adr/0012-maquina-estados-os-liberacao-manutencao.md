# ADR 0012 — Máquina de estados da OS de manutenção e liberação diária ao SIF

## Contexto
A Fase 0 já criou o schema completo do ciclo de OS (`manutencao_os`, `manutencao_os_historico`,
`manutencao_relatorios_sif`, `assinaturas_os_eletronicas`, os enums `status_os` e
`tipo_assinatura_os`) e a matriz de permissões (`INSPETOR_PCM`/`ADMIN_MASTER`: `manutencao_os`
ler/abrir/avancar_etapa), mas deixou a validação da máquina de estados para a Fase 5
explicitamente ("a transição válida é validada em Edge Function/backend... nunca decidida pelo
frontend" — comentário na migration 20260916000014).

## Decisão: tabela de transições, um passo = uma assinatura
```
ABERTURA    -> (assina AUTORIZACAO)  -> AUTORIZACAO   [autorizado_por]
AUTORIZACAO -> (assina PROGRAMACAO)  -> PROGRAMACAO   [programado_por]
PROGRAMACAO -> (assina EXECUCAO)     -> EXECUCAO      [executado_por]
EXECUCAO    -> (assina VALIDACAO)    -> CONCLUIDA     [validado_por, concluido_em]
```
A OS nasce em `ABERTURA` (via INSERT direto do cliente, RLS `manutencao_os_insert` — mesmo
padrão de `monitoramentos`), e o próprio criador assina o tipo `ABERTURA` logo em seguida
(sem UPDATE — só documenta que a abertura é legítima, análogo a `assinar-documento` chamado
logo após `useCriarMonitoramento`). As 4 transições seguintes são feitas por uma única Edge
Function (`avancar-etapa-os`) guiada por uma tabela de transições explícita (`TRANSICOES_OS`
em `_shared/assinar-os.ts`), nunca por `if/else` disperso — cada transição faz UPDATE
condicionado ao status atual (`.eq("status", deStatus)`, mesma técnica de guarda otimista já
usada em `verificar-monitoramento`) e grava a assinatura correspondente.

**Por que `VALIDACAO` pula direto para `CONCLUIDA`, e não existe um status intermediário
"VALIDACAO"**: o enum `tipo_assinatura_os` tem 5 valores (`ABERTURA`, `AUTORIZACAO`,
`PROGRAMACAO`, `EXECUCAO`, `VALIDACAO`) mas `status_os` tem 6 (os mesmos 5 + `CONCLUIDA`) —
isso só faz sentido se a assinatura de VALIDACAO for o próprio ato que conclui a OS, sem uma
ação humana adicional entre "validado" e "concluído". Interpretação alternativa (validar leva
a um status `VALIDACAO` que precisa de uma 6ª assinatura para concluir) exigiria um 6º valor
em `tipo_assinatura_os` que não existe — a tabela de transições respeita o schema como
projetado na Fase 0, em vez de inventar uma etapa que o enum não suporta.

## Decisão: sem segregação de funções entre etapas da OS
🔴 **Risco documentado, não resolvido** — ver ASSUMPTIONS.md, item da Fase 5. Diferente de
`monitoramentos` (trigger `trg_segregacao_funcoes` impede `verificado_por = user_id`), a
mesma pessoa (`INSPETOR_PCM`) pode assinar todas as 5 etapas de uma mesma OS, inclusive abrir
e concluir sozinha. Não existe, no vocabulário de `nivel_acesso` da Fase 0, um segundo perfil
de "supervisor de manutenção" para separar quem abre de quem autoriza/valida — inventar essa
segregação sem um perfil real para sustentá-la seria pior (bloquearia o único usuário PCM de
um turno pequeno) do que documentar o risco e esperar confirmação operacional.

## Decisão: liberação diária ao SIF é um relatório agregado, não uma liberação por OS
Réplica do padrão de `lote_liberacao_sif`, mas usando a tabela `manutencao_relatorios_sif` já
criada na Fase 0 (chave `data_referencia`, `unique`): a Edge Function `liberar-relatorio-os-sif`
agrega todas as OS com `status = 'CONCLUIDA' and liberado_sif = false` cuja `concluido_em` cai
no dia informado, calcula `hash_agregador` (SHA-256 determinístico por `os_id`, mesma
serialização canônica de `_shared/hash.ts`) sobre o hash da assinatura `VALIDACAO` de cada
uma, grava o relatório (`status = 'liberado'`), libera cada OS (`liberado_sif`, `liberado_em`,
`relatorio_sif_id`) e assina cada uma individualmente como `LIBERACAO_DIARIA` — exatamente os
mesmos dois níveis de tamper-evidence (individual + agregado) que `liberar-sif` já faz para
monitoramentos.

## Consequência: novo tipo na fila de carimbo genérica
`fila_carimbo_tempo.tipo_assinatura` ganha o valor `'relatorio_os'` (apontando para
`manutencao_relatorios_sif.hash_agregador`), ao lado de `'lote'` (que aponta para
`lote_liberacao_sif.hash_agregador`) — o worker (`processar-fila-carimbo`) já era genérico por
tabela (`TABELA_POR_TIPO`) desde a Fase 0/2, então a mudança é só uma linha nova nesse mapa,
não lógica nova.

## Consequência: portal público estendido para OS
`verificar-documento` (Fase 3, `ADR 0011`) tentava só `monitoramentos`. Agora tenta
`monitoramentos` primeiro e, se não encontrado, `manutencao_os` — mesmas regras de segurança
(404 uniforme, nunca fabrica hash sem assinatura real, rate limiting por IP já compartilhado).
