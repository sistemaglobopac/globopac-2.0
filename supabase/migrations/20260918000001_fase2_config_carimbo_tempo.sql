-- Fase 2 — configuração do worker de carimbo de tempo RFC 3161 (seção 7.5).
-- Extensões pg_net (chamadas HTTP a partir do Postgres, usadas pelo agendamento via
-- pg_cron) e supabase_vault (armazenar a service_role key fora de texto puro/migrations —
-- nunca commitar a chave real; ver scripts/configurar-worker-carimbo.mjs).

create extension if not exists pg_net;
create extension if not exists supabase_vault cascade;

-- Lista ordenada de TSAs a tentar, nesta ordem, a cada rodada de processamento — mantém a
-- lista da v1 (seção 7.5 do PROMPT MESTRE), validada manualmente contra as 4 (ver
-- supabase/functions/_shared/rfc3161.test.ts).
insert into app_config (chave, valor) values
  ('tsas_carimbo_tempo', '[
      {"nome": "FreeTSA", "url": "https://freetsa.org/tsr"},
      {"nome": "Sectigo", "url": "http://timestamp.sectigo.com"},
      {"nome": "Comodo", "url": "http://timestamp.comodoca.com"},
      {"nome": "Certum", "url": "http://time.certum.pl"}
    ]'::jsonb)
on conflict (chave) do nothing;

-- Retry exponencial: próxima tentativa em carimbo_backoff_base_segundos * 2^(tentativas-1),
-- até carimbo_max_tentativas rodadas (cada rodada já tenta as 4 TSAs antes de contar como
-- uma tentativa falha). Depois disso, falhou_definitivo — aparece no painel de pendências.
insert into app_config (chave, valor) values
  ('carimbo_max_tentativas', '5'::jsonb)
on conflict (chave) do nothing;

insert into app_config (chave, valor) values
  ('carimbo_backoff_base_segundos', '60'::jsonb)
on conflict (chave) do nothing;

-- Painel de pendências (seção 7.5, "Novo"): destaca carimbos pendentes há mais desse limiar.
insert into app_config (chave, valor) values
  ('carimbo_alerta_horas', '4'::jsonb)
on conflict (chave) do nothing;
