-- Fase 3 — configuração do portal público de verificação (seção 7.6).

insert into app_config (chave, valor) values
  ('portal_verificacao_limite_por_minuto', '10'::jsonb)
on conflict (chave) do nothing;

comment on table log_acessos_verificacao is
  'Log de acessos ao portal público /verificar. ip_hash é um hash do IP (minimização LGPD), '
  'nunca o IP em claro. resultado nunca é usado para diferenciar, na RESPOSTA ao cliente '
  'anônimo, "não encontrado" de "existe mas não autorizado" — essa distinção só existe aqui, '
  'internamente, para auditoria (seção 7.6, "Novo"). Também usado para rate limiting: a Edge '
  'Function verificar-documento conta tentativas por ip_hash no último minuto contra '
  'app_config.portal_verificacao_limite_por_minuto antes de processar qualquer requisição.';
