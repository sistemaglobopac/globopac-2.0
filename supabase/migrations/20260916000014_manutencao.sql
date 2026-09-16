-- Fase 0 — Portal PCM/OS: camada de assinatura/auditoria/liberação SIF do ciclo de OS
-- (seção 7.4). Planejamento de ativos e indicadores de PCM permanecem no GLOBO SIGMA —
-- ver ASSUMPTIONS.md item 1 e docs/adr/0004-relacao-globo-sigma.md. A máquina de estados
-- (transições válidas por status_os) é validada em Edge Function/backend na Fase 5, nunca
-- decidida pelo frontend.

create table manutencao_os (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  setor text not null,
  ativo_referencia text,
  status status_os not null default 'ABERTURA',
  aberto_por uuid not null references perfis_usuarios (id),
  autorizado_por uuid references perfis_usuarios (id),
  programado_por uuid references perfis_usuarios (id),
  executado_por uuid references perfis_usuarios (id),
  validado_por uuid references perfis_usuarios (id),
  sla_esperado_horas integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on column manutencao_os.ativo_referencia is
  'Identificador do ativo/equipamento. Placeholder de texto livre até que a integração com '
  'o GLOBO SIGMA (fonte de verdade do cadastro de ativos) esteja definida — ver '
  'ASSUMPTIONS.md item 1.';

alter table manutencao_os enable row level security;

create index idx_manutencao_os_status on manutencao_os (status);
create index idx_manutencao_os_setor on manutencao_os (setor);

create trigger trg_atualiza_timestamp_manutencao_os
  before update on manutencao_os
  for each row execute function public.atualiza_timestamp_atualizado_em();

alter table assinaturas_os_eletronicas
  add constraint fk_assinaturas_os_os_id
  foreign key (os_id) references manutencao_os (id);

create table manutencao_os_historico (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references manutencao_os (id),
  alteracao jsonb not null,
  user_id uuid not null references perfis_usuarios (id),
  criado_em timestamptz not null default now()
);

comment on table manutencao_os_historico is
  'Histórico append-only de transições de estado da OS. A transição válida é validada em '
  'Edge Function/backend (tabela/config de transições permitidas, não if/else disperso — '
  'seção 7.4), nunca decidida pelo frontend.';

alter table manutencao_os_historico enable row level security;
create index idx_manutencao_historico_os on manutencao_os_historico (os_id, criado_em);

create trigger trg_append_only_manutencao_historico
  before update or delete on manutencao_os_historico
  for each row execute function public.bloqueia_update_delete();

create table manutencao_relatorios_sif (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null unique,
  status text not null default 'pendente' check (status in ('pendente', 'liberado')),
  liberado_por uuid references perfis_usuarios (id),
  liberado_em timestamptz,
  criado_em timestamptz not null default now()
);

alter table manutencao_relatorios_sif enable row level security;
