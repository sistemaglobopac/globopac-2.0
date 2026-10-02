-- Autocorrecao imediata: alternativa a RNC para monitoramentos com nao conformidade.
-- O inspetor registra a acao imediata executada como medida de autocontrole e isso restabelece a
-- conformidade do monitoramento (sem RNC). O registro e SEPARADO do monitoramento assinado
-- (o documento e o hash nao mudam) e append-only: uma autocorrecao por monitoramento, sem edicao.
-- Vale enquanto o monitoramento ainda nao foi verificado (decisao do verificador) e enquanto nao
-- existe RNC para ele (RNC e autocorrecao sao alternativas).

-- Mesma regra do front (temNaoConformidade): algum campo composto com conformidade=false ou status 'nao-conforme'.
create or replace function public.dados_tem_nao_conformidade(p_dados jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(exists (
    select 1
      from jsonb_each(coalesce(p_dados, '{}'::jsonb)) e
     where jsonb_typeof(e.value) = 'object'
       and (e.value ->> 'conformidade' = 'false' or e.value ->> 'status' = 'nao-conforme')
  ), false)
$$;

create table if not exists autocorrecoes_imediatas (
  id uuid primary key default gen_random_uuid(),
  monitoramento_id uuid not null unique references monitoramentos (id),
  user_id uuid not null references perfis_usuarios (id),
  descricao text not null check (char_length(btrim(descricao)) >= 10),
  executada_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

comment on table autocorrecoes_imediatas is
  'Autocorrecao imediata do inspetor (medida de autocontrole) para um monitoramento com nao conformidade: alternativa a RNC que restabelece a conformidade. Append-only, uma por monitoramento.';

alter table autocorrecoes_imediatas enable row level security;

-- Le quem ja enxerga o monitoramento (a RLS de monitoramentos vale dentro do subselect).
create policy autocorrecoes_select on autocorrecoes_imediatas
  for select
  using (exists (select 1 from monitoramentos m where m.id = monitoramento_id));

-- Registra o inspetor (ou o administrador): proprio user_id, monitoramento do seu setor, com nao
-- conformidade, ainda nao verificado e sem RNC.
create policy autocorrecoes_insert on autocorrecoes_imediatas
  for insert
  with check (
    user_id = auth.uid()
    and public.meu_perfil() in ('INSPETOR_QUALIDADE', 'ADMIN_MASTER')
    and exists (
      select 1
        from monitoramentos m
       where m.id = monitoramento_id
         and m.verificado_por is null
         and public.dados_tem_nao_conformidade(m.dados_dinamicos)
         and (m.setor = any (public.meus_setores()) or public.meu_perfil() = 'ADMIN_MASTER')
    )
    and not exists (select 1 from rnc r where r.monitoramento_id = autocorrecoes_imediatas.monitoramento_id)
  );

-- Sem policy de UPDATE/DELETE + trigger de append-only (mesma funcao generica das demais tabelas).
create trigger trg_autocorrecoes_append_only
  before update or delete on autocorrecoes_imediatas
  for each row execute function public.bloqueia_update_delete();

create index if not exists idx_autocorrecoes_user on autocorrecoes_imediatas (user_id, criado_em desc);
