-- Fase 0 — turnos_inspetores: pausas/turnos de inspetores (seção 7.7 — relatório de pausas).

create table turnos_inspetores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references perfis_usuarios (id),
  setor text,
  inicio timestamptz not null,
  fim timestamptz,
  criado_em timestamptz not null default now()
);

alter table turnos_inspetores enable row level security;

create index idx_turnos_user_inicio on turnos_inspetores (user_id, inicio desc);
