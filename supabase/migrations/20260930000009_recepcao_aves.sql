-- Recepção de aves / Bem-estar animal: programação de abate (cargas com GTA) e veículos de
-- transporte pré-cadastrados por placa. O monitoramento em si fica em monitoramentos.dados_dinamicos
-- (campo composto "recepcao_aves"); aqui só moram os cadastros que o inspetor seleciona.

create table cargas_aves (
  id uuid primary key default gen_random_uuid(),
  -- Dia previsto do abate: pode ser cadastrada com antecedência (programação de amanhã).
  data_abate date not null,
  integrado text not null check (length(btrim(integrado)) > 0),
  aviario text not null check (length(btrim(aviario)) > 0),
  nucleo text not null default '',
  gta text not null check (length(btrim(gta)) > 0),
  qtd_aves integer not null check (qtd_aves > 0),
  criado_por uuid references perfis_usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now()
);

comment on table cargas_aves is
  'Programação de abate: uma linha por carga/GTA (integrado, aviário, núcleo, nº da GTA e quantidade '
  'de aves). Cadastrada por ADMIN_MASTER/VERIFICADOR, inclusive na véspera; o inspetor do bem-estar '
  'animal seleciona a GTA ao monitorar a recepção.';

create unique index uq_cargas_aves_gta_dia on cargas_aves (data_abate, upper(btrim(gta)));
create index idx_cargas_aves_data on cargas_aves (data_abate);

create table veiculos_transporte (
  id uuid primary key default gen_random_uuid(),
  placa text not null check (placa = upper(placa) and length(btrim(placa)) >= 7),
  descricao text,
  ativo boolean not null default true,
  criado_por uuid references perfis_usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now()
);

comment on table veiculos_transporte is
  'Veículos de transporte de aves vivas, pré-cadastrados por placa para seleção no monitoramento '
  'de recepção de aves.';

create unique index uq_veiculos_placa on veiculos_transporte (placa);

alter table cargas_aves enable row level security;
alter table veiculos_transporte enable row level security;

-- Leitura: qualquer usuário com perfil ativo (o inspetor precisa listar as cargas e os veículos).
create policy cargas_aves_select on cargas_aves
  for select using (public.meu_perfil() is not null);

create policy cargas_aves_insert on cargas_aves
  for insert with check (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR'));

create policy cargas_aves_update on cargas_aves
  for update using (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR'))
  with check (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR'));

create policy cargas_aves_delete on cargas_aves
  for delete using (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR'));

create policy veiculos_select on veiculos_transporte
  for select using (public.meu_perfil() is not null);

-- O inspetor também pode cadastrar uma placa nova na hora (veículo que ainda não estava na lista).
create policy veiculos_insert on veiculos_transporte
  for insert with check (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR', 'INSPETOR_QUALIDADE'));

create policy veiculos_update on veiculos_transporte
  for update using (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR'))
  with check (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR'));

create policy veiculos_delete on veiculos_transporte
  for delete using (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR'));
