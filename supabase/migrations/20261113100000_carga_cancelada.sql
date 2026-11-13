-- Carga cancelada. Às vezes uma carga programada (GTA cadastrada) é cancelada e nunca chega ao abatedouro. O inspetor do
-- bem-estar animal / recepção de aves precisa poder indicar isso: a carga sai das listas de seleção (recepção, espera, peso por
-- caixa) e da base do DOA/SPR, e fica registrada — quem cancelou, quando e por quê — na conferência das cargas do dia.
--
-- O inspetor não edita cargas_aves (a programação é do Administrador/Verificador): cancelar e reativar passam por funções
-- SECURITY DEFINER, que gravam também uma trilha (cargas_aves_cancelamentos), sem política de escrita para ninguém.

alter table cargas_aves
  add column cancelada_em timestamptz,
  add column cancelada_por uuid references perfis_usuarios (id),
  add column motivo_cancelamento text,
  add constraint ck_cargas_aves_cancelamento_completo check (
    (cancelada_em is null and cancelada_por is null and motivo_cancelamento is null)
    or (cancelada_em is not null and cancelada_por is not null and length(btrim(motivo_cancelamento)) >= 5)
  );

comment on column cargas_aves.cancelada_em is 'Quando a carga foi marcada como cancelada (null = carga ativa).';
comment on column cargas_aves.cancelada_por is 'Quem marcou a carga como cancelada.';
comment on column cargas_aves.motivo_cancelamento is 'Motivo do cancelamento informado por quem cancelou (mínimo 5 caracteres).';

create table cargas_aves_cancelamentos (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references cargas_aves (id) on delete cascade,
  acao text not null check (acao in ('CANCELADA', 'REATIVADA')),
  motivo text,
  user_id uuid not null references perfis_usuarios (id),
  criado_em timestamptz not null default now()
);

create index idx_cargas_aves_cancelamentos_carga on cargas_aves_cancelamentos (carga_id, criado_em);

comment on table cargas_aves_cancelamentos is
  'Trilha de auditoria dos cancelamentos e reativações de carga (quem, quando e por quê). Só as funções cancelar_carga_aves e '
  'reativar_carga_aves gravam; não há política de escrita. Some só se a própria carga for excluída.';

alter table cargas_aves_cancelamentos enable row level security;

create policy cargas_aves_cancelamentos_select on cargas_aves_cancelamentos
  for select using (public.meu_perfil() is not null);

create or replace function public.cancelar_carga_aves(p_carga_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if coalesce(public.meu_perfil()::text, '') not in ('ADMIN_MASTER', 'VERIFICADOR', 'INSPETOR_QUALIDADE') then
    raise exception 'Sem permissão para cancelar a carga.' using errcode = '42501';
  end if;
  if length(v_motivo) < 5 then
    raise exception 'Informe o motivo do cancelamento (mínimo 5 caracteres).' using errcode = '22023';
  end if;
  -- Trava a linha: dois cancelamentos ao mesmo tempo gravam uma só trilha.
  perform 1 from cargas_aves where id = p_carga_id for update;
  if not found then
    raise exception 'Carga não encontrada.' using errcode = 'P0002';
  end if;
  if exists (select 1 from cargas_aves where id = p_carga_id and cancelada_em is not null) then
    raise exception 'Esta carga já está cancelada.' using errcode = '23505';
  end if;
  if p_carga_id in (select carga_id from public.cargas_ja_monitoradas('recepcao')) then
    raise exception 'Esta carga já teve a recepção monitorada: não é possível cancelá-la.' using errcode = '23514';
  end if;

  update cargas_aves
     set cancelada_em = now(), cancelada_por = auth.uid(), motivo_cancelamento = v_motivo
   where id = p_carga_id;
  insert into cargas_aves_cancelamentos (carga_id, acao, motivo, user_id) values (p_carga_id, 'CANCELADA', v_motivo, auth.uid());
end;
$$;

create or replace function public.reativar_carga_aves(p_carga_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.meu_perfil()::text, '') not in ('ADMIN_MASTER', 'VERIFICADOR', 'INSPETOR_QUALIDADE') then
    raise exception 'Sem permissão para reativar a carga.' using errcode = '42501';
  end if;
  perform 1 from cargas_aves where id = p_carga_id for update;
  if not found then
    raise exception 'Carga não encontrada.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from cargas_aves where id = p_carga_id and cancelada_em is not null) then
    raise exception 'Esta carga não está cancelada.' using errcode = '23505';
  end if;

  update cargas_aves set cancelada_em = null, cancelada_por = null, motivo_cancelamento = null where id = p_carga_id;
  insert into cargas_aves_cancelamentos (carga_id, acao, user_id) values (p_carga_id, 'REATIVADA', auth.uid());
end;
$$;

comment on function public.cancelar_carga_aves(uuid, text) is
  'Marca a carga como cancelada (motivo obrigatório) e grava a trilha. ADMIN_MASTER, VERIFICADOR e INSPETOR_QUALIDADE. Recusa carga '
  'já cancelada ou que já teve a recepção monitorada.';
comment on function public.reativar_carga_aves(uuid) is 'Desfaz o cancelamento da carga (cancelada por engano) e grava a trilha.';

revoke all on function public.cancelar_carga_aves(uuid, text) from public, anon;
revoke all on function public.reativar_carga_aves(uuid) from public, anon;
grant execute on function public.cancelar_carga_aves(uuid, text) to authenticated;
grant execute on function public.reativar_carga_aves(uuid) to authenticated;

-- Base do DOA e do SPR: carga cancelada não é monitorada, então não entra. Mesma assinatura e colunas de
-- 20261007100000_cargas_rastreabilidade_ultimo_valor_corrigido.sql; só acrescenta o filtro de cancelada.
create or replace function public.cargas_rastreabilidade_do_dia(p_dia date)
returns table (
  carga_id uuid,
  gta text,
  integrado text,
  aviario text,
  nucleo text,
  qtd_aves integer,
  placa text,
  pendura_inicio_em text,
  monitoramento_id uuid,
  peso_medio_kg text
)
language sql
stable
security definer
set search_path = public
as $$
  with cargas_dia as (
    select id from cargas_aves where data_abate = p_dia and cancelada_em is null
  ),
  fontes as (
    -- Recepção de aves: o valor do campo composto traz cargaId + penduraInicioEm (+ placa).
    select
      e.valor ->> 'cargaId' as carga_id,
      m.id as monitoramento_id,
      m.criado_em,
      true as da_recepcao,
      nullif(e.valor ->> 'placa', '') as placa,
      nullif(e.valor ->> 'penduraInicioEm', '') as pendura,
      null::text as peso
    from monitoramentos m
    cross join lateral jsonb_each(m.dados_dinamicos) as e (chave, valor)
    where jsonb_typeof(e.valor) = 'object'
      and e.valor ? 'penduraInicioEm'
      and e.valor ->> 'cargaId' in (select id::text from cargas_dia)
    union all
    -- Linhas de carga do DOA: guardam placa, pendura e peso médio (podem ter sido corrigidos por adendo).
    select
      x ->> 'cargaId', m.id, m.criado_em, false,
      nullif(x ->> 'placa', ''), nullif(x ->> 'penduraInicioEm', ''), nullif(x ->> 'pesoMedioKg', '')
    from monitoramentos m
    cross join lateral jsonb_path_query(m.dados_dinamicos, '$.*.cargas[*] ? (exists(@.avesMortas))') as x
    where x ->> 'cargaId' in (select id::text from cargas_dia)
    union all
    -- Peso por Caixa de transporte: peso médio das aves da carga.
    select
      x ->> 'cargaId', m.id, m.criado_em, false,
      null, null, nullif(x ->> 'pesoMedioKg', '')
    from monitoramentos m
    cross join lateral jsonb_path_query(m.dados_dinamicos, '$.*.cargas[*] ? (exists(@.avesPorCaixa))') as x
    where x ->> 'cargaId' in (select id::text from cargas_dia)
  )
  select
    c.id,
    c.gta,
    c.integrado,
    c.aviario,
    c.nucleo,
    c.qtd_aves,
    pl.placa,
    pe.pendura,
    rc.monitoramento_id,
    pw.peso
  from cargas_aves c
  left join lateral (
    select f.placa from fontes f where f.carga_id = c.id::text and f.placa is not null order by f.criado_em desc limit 1
  ) pl on true
  left join lateral (
    select f.pendura from fontes f where f.carga_id = c.id::text and f.pendura is not null order by f.criado_em desc limit 1
  ) pe on true
  left join lateral (
    select f.peso from fontes f where f.carga_id = c.id::text and f.peso is not null order by f.criado_em desc limit 1
  ) pw on true
  left join lateral (
    select f.monitoramento_id from fontes f where f.carga_id = c.id::text and f.da_recepcao order by f.criado_em desc limit 1
  ) rc on true
  where c.data_abate = p_dia
    and c.cancelada_em is null
    and public.meu_perfil() is not null
  order by pe.pendura nulls last, c.criado_em
$$;
