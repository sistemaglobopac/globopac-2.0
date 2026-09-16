# ADR 0001 — Fila persistente para carimbo de tempo RFC 3161

## Contexto
Na v1, o carimbo de tempo era solicitado via `fetch(keepalive: true)` fire-and-forget no
navegador do cliente, logo após o cálculo do hash (também no cliente). Se a requisição
falhasse, nada era registrado — o carimbo simplesmente não existia, e ninguém era alertado.

## Decisão
O carimbo de tempo é desacoplado da resposta síncrona ao usuário. A Edge Function
`assinar-documento` (Fase 2) grava a assinatura em `assinaturas_eletronicas` e, na mesma
transação, insere um registro em `fila_carimbo_tempo` com `status = 'pendente'`. Um worker
(Edge Function agendada via `pg_cron`) processa a fila periodicamente: para cada item
pendente, tenta uma das 4 TSAs (FreeTSA, Sectigo, Comodo, Certum), registra
`tsa_tentadas`/`tentativas`/`ultimo_erro`, e aplica retry exponencial. Depois de N tentativas
sem sucesso em nenhuma TSA, o item passa a `falhou_definitivo` e aparece no painel
administrativo como alerta operacional.

## Alternativas consideradas
- **Manter fire-and-forget no cliente (rejeitada):** é exatamente o débito técnico que este
  projeto existe para corrigir (seção 12 do PROMPT MESTRE).
- **Fila externa dedicada (SQS/RabbitMQ) (rejeitada para a Fase 0-2):** adiciona um
  componente de infraestrutura extra sem necessidade na escala declarada (150–400
  fichas/dia). Uma tabela Postgres com índice parcial sobre `status` é suficiente e mantém
  tudo dentro do mesmo backup/RPO do restante dos dados.

## Consequências
- A resposta da Edge Function de assinatura não espera o carimbo — atende ao requisito de
  latência p95 < 800 ms (seção 3) mesmo que a TSA esteja lenta ou fora do ar.
- Existe uma janela de tempo entre "assinatura gravada" e "carimbo confirmado" em que o
  documento está formalmente assinado, mas ainda sem prova temporal externa. Isso é visível
  e monitorável (painel de pendências), não silencioso como na v1.
- Uma segunda camada de carimbo (o hash agregador do lote diário, `lote_liberacao_sif`) passa
  pela mesma fila (`tipo_assinatura = 'lote'`), reaproveitando a mesma infraestrutura.
