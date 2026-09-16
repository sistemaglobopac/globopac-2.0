-- Fase 0 — rnc: Relatório de Não Conformidade (seção 7.2).

create table rnc (
  id uuid primary key default gen_random_uuid(),
  monitoramento_id uuid references monitoramentos (id),
  descricao text not null,
  setor text not null,
  status status_rnc not null default 'ABERTA',
  severidade severidade_rnc not null,
  aberto_por uuid not null references perfis_usuarios (id),
  tratado_por uuid references perfis_usuarios (id),
  tratativa text,
  prazo_sla timestamptz not null,
  rnc_anterior_id uuid references rnc (id),
  fechado_em timestamptz,
  criado_em timestamptz not null default now()
);

comment on table rnc is
  'Relatório de Não Conformidade. Pode ser vinculada a um monitoramento reprovado ou aberta '
  'avulsa. prazo_sla é calculado no momento da criação a partir de app_config (SLA por '
  'severidade, seção 7.2 — implementado na Fase 4). Reabertura (status=REABERTA) cria uma '
  'NOVA linha com rnc_anterior_id apontando para a tratativa anterior, preservando o '
  'histórico em vez de sobrescrevê-lo.';

alter table rnc enable row level security;

create index idx_rnc_status_prazo on rnc (status, prazo_sla);
create index idx_rnc_setor on rnc (setor);
create index idx_rnc_monitoramento on rnc (monitoramento_id);
