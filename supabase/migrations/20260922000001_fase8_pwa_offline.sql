-- Fase 8 — PWA offline e sincronização (ver ADR 0002, seção 7 do PROMPT MESTRE).
--
-- monitoramentos.capturado_em: quando o INSPETOR realmente fez a leitura, informado pelo
-- próprio dispositivo (relógio do cliente) — nulo para o fluxo normal (online), preenchido só
-- quando o registro veio da fila de sincronização offline. Deliberadamente DISTINTO de
-- criado_em (sempre o momento real do INSERT no servidor, `default now()`, nunca confiável a
-- partir do cliente) e NUNCA incluído no hash assinável (_shared/hash.ts
-- conteudoAssinavelMonitoramento) — é metadado de transparência operacional ("por que isso
-- foi sincronizado com atraso"), não um fato assinado. Um cliente mal-intencionado pode
-- mentir sobre capturado_em; não pode mentir sobre criado_em nem sobre o hash.
alter table monitoramentos add column capturado_em timestamptz;

comment on column monitoramentos.capturado_em is
  'Timestamp informado pelo dispositivo do inspetor (relógio do cliente) de quando a leitura '
  'foi feita de verdade — só preenchido em registros que passaram pela fila de sincronização '
  'offline (PWA, Fase 8). NULO no fluxo normal (online). Nunca faz parte do hash assinável '
  '(não é um fato verificado pelo servidor) — puramente informativo/operacional.';
