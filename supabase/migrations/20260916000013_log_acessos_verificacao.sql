-- Fase 0 — log_acessos_verificacao: log de acessos ao portal público /verificar (seção 6.3
-- e 7.6). Base para rate limiting e detecção de scraping/enumeração de UUIDs.

create table log_acessos_verificacao (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid,
  ip_hash text not null,
  resultado text not null check (resultado in ('encontrado', 'nao_encontrado', 'nao_autorizado', 'rate_limited')),
  criado_em timestamptz not null default now()
);

comment on table log_acessos_verificacao is
  'Log de acessos ao portal público /verificar. ip_hash é um hash do IP (minimização LGPD), '
  'nunca o IP em claro. resultado nunca é usado para diferenciar, na RESPOSTA ao cliente '
  'anônimo, "não encontrado" de "existe mas não autorizado" — essa distinção só existe aqui, '
  'internamente, para auditoria (seção 7.6, "Novo").';

alter table log_acessos_verificacao enable row level security;

create index idx_log_acessos_ip_criado on log_acessos_verificacao (ip_hash, criado_em desc);

create trigger trg_append_only_log_acessos_verificacao
  before update or delete on log_acessos_verificacao
  for each row execute function public.bloqueia_update_delete();
