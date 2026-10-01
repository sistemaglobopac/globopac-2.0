-- Troca RAPIDA de setor e COBERTURA temporaria (almoco) do inspetor de qualidade (administrador e verificador).
-- Nos dois casos o inspetor fica SO com o setor novo e volta ao de origem no prazo (cobertura) ou no fim do turno.
--
-- O acesso do inspetor aos monitoramentos vem de perfis_usuarios.setores_permitidos (embutido no
-- JWT pelo Auth Hook e lido por meus_setores() na RLS). A troca SUBSTITUI esse array pelo setor
-- novo e guarda o original em setores_base; ao fim do turno (22:00 do 1o turno / 04:00 do 2o,
-- horario de Manaus — mesma regra do encerramento automatico de turnos) um job devolve o
-- setor de origem. Toda troca/retorno fica em trocas_setor_inspetor (auditoria).

alter table perfis_usuarios
  add column if not exists setores_base text[],
  add column if not exists troca_setor_expira_em timestamptz;

comment on column perfis_usuarios.setores_base is
  'Setores originais do inspetor enquanto ha uma troca temporaria ativa (setores_permitidos guarda o setor de hoje). NULL = sem troca.';
comment on column perfis_usuarios.troca_setor_expira_em is
  'Fim do turno em que a troca de setor volta sozinha ao setores_base.';

create table if not exists trocas_setor_inspetor (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references perfis_usuarios (id),
  de text[] not null,
  para text[] not null,
  tipo text not null check (tipo in ('troca', 'cobertura', 'retorno_manual', 'retorno_automatico')),
  feito_por uuid references perfis_usuarios (id),
  criado_em timestamptz not null default now()
);

comment on table trocas_setor_inspetor is
  'Auditoria das trocas temporarias de setor de inspetores (quem trocou, de qual setor para qual, quando). Escrita so pelas funcoes de troca.';

alter table trocas_setor_inspetor enable row level security;

create policy trocas_setor_select on trocas_setor_inspetor
  for select
  using (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR'));

create index if not exists idx_trocas_setor_user on trocas_setor_inspetor (user_id, criado_em desc);

-- Fim do turno (Manaus) em que um instante cai: 04:00-16:59 -> 22:00 do mesmo dia; a partir das 17:00
-- -> 04:00 do dia seguinte; 00:00-03:59 -> 04:00 do mesmo dia.
create or replace function public.fim_do_turno(p_ref timestamptz)
returns timestamptz
language sql
stable
as $$
  select (
    case
      when x.h >= 4 and x.h < 17 then date_trunc('day', x.l) + interval '22 hours'
      when x.h >= 17 then date_trunc('day', x.l) + interval '1 day 4 hours'
      else date_trunc('day', x.l) + interval '4 hours'
    end
  ) at time zone 'America/Manaus'
  from (
    select (p_ref at time zone 'America/Manaus') as l,
           extract(hour from (p_ref at time zone 'America/Manaus')) as h
  ) x
$$;

-- ----------------------------------------------------------------------------------------------
-- Troca: administrador ou verificador, so para INSPETOR_QUALIDADE ativo, so para setor cadastrado.
-- ----------------------------------------------------------------------------------------------
create or replace function public.trocar_setor_inspetor(
  p_user uuid,
  p_setor text,
  p_ate timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alvo perfis_usuarios%rowtype;
  v_fim_turno timestamptz := public.fim_do_turno(now());
  v_expira timestamptz;
begin
  if public.meu_perfil() not in ('ADMIN_MASTER', 'VERIFICADOR') then
    raise exception 'Somente o administrador ou o verificador podem trocar o setor de um inspetor.' using errcode = '42501';
  end if;

  select * into v_alvo from perfis_usuarios where id = p_user for update;
  if not found or v_alvo.ativo is not true or v_alvo.nivel_acesso <> 'INSPETOR_QUALIDADE' then
    raise exception 'O colaborador não é um inspetor de qualidade ativo.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from app_config where chave = 'setores_cadastrados' and valor ? p_setor) then
    raise exception 'Setor "%" não está cadastrado.', p_setor using errcode = 'P0001';
  end if;

  if p_ate is not null and p_ate <= now() then
    raise exception 'O horário de término já passou.' using errcode = 'P0001';
  end if;

  -- Escolher o proprio setor de origem equivale a desfazer a troca.
  if v_alvo.setores_base is not null and v_alvo.setores_base = array[p_setor] then
    perform public.restaurar_setor_inspetor(p_user);
    return;
  end if;
  -- Ja esta so nesse setor (e sem troca ativa): nada a fazer.
  if v_alvo.setores_base is null and v_alvo.setores_permitidos = array[p_setor] then
    return;
  end if;

  -- A troca SEMPRE substitui: o inspetor passa a ter acesso SO ao setor novo (na cobertura de almoco,
  -- so ao setor coberto) e volta ao de origem em p_ate (prazo da cobertura) ou, sem prazo, no fim do turno.
  v_expira := least(coalesce(p_ate, v_fim_turno), v_fim_turno);

  update perfis_usuarios
     set setores_base = coalesce(v_alvo.setores_base, v_alvo.setores_permitidos),
         setores_permitidos = array[p_setor],
         troca_setor_expira_em = v_expira
   where id = p_user;

  insert into trocas_setor_inspetor (user_id, de, para, tipo, feito_por)
  values (p_user, v_alvo.setores_permitidos, array[p_setor], case when v_expira < v_fim_turno then 'cobertura' else 'troca' end, auth.uid());
end;
$$;

-- Volta agora ao setor de origem (manual).
create or replace function public.restaurar_setor_inspetor(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alvo perfis_usuarios%rowtype;
begin
  if public.meu_perfil() not in ('ADMIN_MASTER', 'VERIFICADOR') then
    raise exception 'Somente o administrador ou o verificador podem trocar o setor de um inspetor.' using errcode = '42501';
  end if;

  select * into v_alvo from perfis_usuarios where id = p_user for update;
  if not found or v_alvo.setores_base is null then
    return;
  end if;

  update perfis_usuarios
     set setores_permitidos = v_alvo.setores_base,
         setores_base = null,
         troca_setor_expira_em = null
   where id = p_user;

  insert into trocas_setor_inspetor (user_id, de, para, tipo, feito_por)
  values (p_user, v_alvo.setores_permitidos, v_alvo.setores_base, 'retorno_manual', auth.uid());
end;
$$;

-- Lista os inspetores ativos com a situacao de setor (o verificador nao le perfis_usuarios direto).
create or replace function public.listar_inspetores_troca_setor()
returns table (
  id uuid,
  nome_completo text,
  matricula text,
  setores_permitidos text[],
  setores_base text[],
  troca_setor_expira_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.meu_perfil() not in ('ADMIN_MASTER', 'VERIFICADOR') then
    raise exception 'Somente o administrador ou o verificador podem trocar o setor de um inspetor.' using errcode = '42501';
  end if;
  return query
    select p.id, p.nome_completo, p.matricula, p.setores_permitidos, p.setores_base, p.troca_setor_expira_em
      from perfis_usuarios p
     where p.nivel_acesso = 'INSPETOR_QUALIDADE' and p.ativo is true
     order by p.nome_completo;
end;
$$;

-- Retorno automatico ao fim do turno (chamado por pg_cron; nao exposto a usuarios).
create or replace function public.restaurar_setores_expirados()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
begin
  with alvo as (
    select id, setores_permitidos as de, setores_base as para
      from perfis_usuarios
     where setores_base is not null and troca_setor_expira_em <= now()
       for update
  ),
  atualizados as (
    update perfis_usuarios p
       set setores_permitidos = a.para, setores_base = null, troca_setor_expira_em = null
      from alvo a
     where p.id = a.id
    returning p.id
  )
  insert into trocas_setor_inspetor (user_id, de, para, tipo)
  select a.id, a.de, a.para, 'retorno_automatico' from alvo a join atualizados u on u.id = a.id;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke all on function public.trocar_setor_inspetor(uuid, text, timestamptz) from public, anon;
revoke all on function public.restaurar_setor_inspetor(uuid) from public, anon;
revoke all on function public.listar_inspetores_troca_setor() from public, anon;
revoke all on function public.restaurar_setores_expirados() from public, anon, authenticated;
grant execute on function public.trocar_setor_inspetor(uuid, text, timestamptz) to authenticated;
grant execute on function public.restaurar_setor_inspetor(uuid) to authenticated;
grant execute on function public.listar_inspetores_troca_setor() to authenticated;
grant execute on function public.fim_do_turno(timestamptz) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'restaurar-setores-expirados',
      '*/5 * * * *',
      'select public.restaurar_setores_expirados();'
    );
  else
    raise notice 'pg_cron nao instalado: agende public.restaurar_setores_expirados() manualmente.';
  end if;
end;
$$;
