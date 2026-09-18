-- Fase 10 — Migração de dados legados e corte (seção 11 do PROMPT MESTRE).
--
-- id_legado: identificador do registro correspondente no sistema v1, preenchido SÓ pelo
-- script de migração (scripts/migrar-dados-legados.mjs) — nunca pelo fluxo normal da v2
-- (nulo em todo registro criado depois do corte). Duas razões para existir: (1) idempotência
-- do script — reexecutar a migração não duplica, porque cada registro é buscado por
-- id_legado antes de inserir; (2) rastreabilidade auditável — permite responder "qual
-- registro do v1 corresponde a este daqui" indefinidamente, mesmo anos depois do corte.
alter table monitoramentos add column id_legado text;
alter table rnc add column id_legado text;
alter table manutencao_os add column id_legado text;

comment on column monitoramentos.id_legado is
  'Identificador do registro correspondente no sistema v1 (Fase 10, migração de dados '
  'legados) — nulo em todo registro criado pelo fluxo normal da v2. Ver origem_versao.';
comment on column rnc.id_legado is
  'Identificador do registro correspondente no sistema v1 (Fase 10, migração de dados '
  'legados) — nulo em todo registro criado pelo fluxo normal da v2.';
comment on column manutencao_os.id_legado is
  'Identificador do registro correspondente no sistema v1 (Fase 10, migração de dados '
  'legados) — nulo em todo registro criado pelo fluxo normal da v2.';

create unique index idx_monitoramentos_id_legado on monitoramentos (id_legado) where id_legado is not null;
create unique index idx_rnc_id_legado on rnc (id_legado) where id_legado is not null;
create unique index idx_manutencao_os_id_legado on manutencao_os (id_legado) where id_legado is not null;
