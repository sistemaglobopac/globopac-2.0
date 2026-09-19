-- Separado de 20260927000001_rnc_revisor_verificador.sql: adicionar um valor a um enum e usá-lo
-- (em policy/check) na MESMA transação é proibido pelo Postgres ("unsafe use of new value of
-- enum type", SQLSTATE 55P04) — supabase db reset/push aplica cada arquivo de migração como uma
-- única transação, então o ADD VALUE precisa commitar num arquivo anterior antes que outro possa
-- referenciar 'DEVOLVIDA'. IF NOT EXISTS torna isto seguro de reaplicar caso o valor já exista.
alter type status_rnc add value if not exists 'DEVOLVIDA';
