-- Fase 0 — monitoramentos: registros de monitoramento PAC (seção 6 e 7.1).
-- Núcleo do sistema: segregação de funções e imutabilidade pós-liberação são reforçadas por
-- trigger de banco, não apenas por RLS/aplicação (seção 4.1 e 12 do PROMPT MESTRE).

create table monitoramentos (
  id uuid primary key default gen_random_uuid(),
  ficha_template_id uuid not null references fichas_templates (id),
  versao_template integer not null,
  user_id uuid not null references perfis_usuarios (id),
  setor text not null,
  dados_dinamicos jsonb not null,
  conformidade boolean,
  verificado_por uuid references perfis_usuarios (id),
  verificado_em timestamptz,
  liberado_sif boolean not null default false,
  liberado_em timestamptz,
  lote_liberacao_id uuid,
  origem_versao origem_registro not null default 'v2',
  aditivo_de uuid references monitoramentos (id),
  criado_em timestamptz not null default now()
);

comment on table monitoramentos is
  'Registros de monitoramento PAC. IMUTÁVEL após liberado_sif=true (trigger '
  'trg_bloqueia_edicao_liberado): uma correção necessária gera um NOVO registro com '
  'aditivo_de apontando para o original — nunca um UPDATE no registro liberado. '
  'origem_versao=''v1_legado'' identifica registros migrados (seção 11), cujo hash/carimbo '
  'originais nunca são recomputados sob as regras da v2.';

comment on column monitoramentos.lote_liberacao_id is
  'Preenchido no momento da liberação em lote, referenciando lote_liberacao_sif (FK '
  'adicionada em migration posterior, depois que aquela tabela existir).';

comment on column monitoramentos.aditivo_de is
  'Quando não nulo, este registro é um aditivo/adendo a um monitoramento já liberado ao SIF '
  '(seção 7.3) — preserva o histórico completo em vez de editar o original.';

alter table monitoramentos enable row level security;

create index idx_monitoramentos_liberado_criado on monitoramentos (liberado_sif, criado_em desc);
create index idx_monitoramentos_setor on monitoramentos (setor);
create index idx_monitoramentos_verificado_por on monitoramentos (verificado_por);
create index idx_monitoramentos_ficha_template on monitoramentos (ficha_template_id);

-- Segregação de funções (seção 4.1, não negociável): quem cria nunca pode verificar o
-- próprio registro, mesmo que acumule os dois perfis.
create or replace function public.checar_segregacao_funcoes()
returns trigger
language plpgsql
as $$
begin
  if new.verificado_por is not null and new.verificado_por = new.user_id then
    raise exception
      'Segregação de funções violada: o mesmo usuário não pode criar e verificar o mesmo registro (monitoramento %).',
      new.id;
  end if;
  return new;
end;
$$;

create trigger trg_segregacao_funcoes
  before insert or update on monitoramentos
  for each row execute function public.checar_segregacao_funcoes();

-- Imutabilidade após liberação ao SIF (seção 7.3): nunca UPDATE, apenas aditivo (nova linha).
create or replace function public.bloqueia_edicao_liberado()
returns trigger
language plpgsql
as $$
begin
  if old.liberado_sif is true then
    raise exception
      'Monitoramento % já foi liberado ao SIF e é imutável. Registre uma correção como aditivo (novo registro com aditivo_de = %), nunca como UPDATE.',
      old.id, old.id;
  end if;
  return new;
end;
$$;

create trigger trg_bloqueia_edicao_liberado
  before update on monitoramentos
  for each row execute function public.bloqueia_edicao_liberado();

-- monitoramentos é append-only mesmo antes da liberação: nenhum DELETE físico em nenhum
-- estágio. Decisão deliberadamente mais rígida que o mínimo exigido pelo PROMPT MESTRE —
-- ver ASSUMPTIONS.md item 12 sobre o motivo e o critério de reversão.
create or replace function public.bloqueia_delete_monitoramento()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'monitoramentos é append-only: DELETE nunca é permitido. Use um fluxo de cancelamento/status, não exclusão física.';
end;
$$;

create trigger trg_bloqueia_delete_monitoramento
  before delete on monitoramentos
  for each row execute function public.bloqueia_delete_monitoramento();
