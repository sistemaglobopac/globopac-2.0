-- Encerramento automatico de turnos esquecidos abertos.
--   1o turno: comeca a partir das 04:00 (Manaus) e e encerrado as 22:00 do mesmo dia.
--   2o turno: comeca a partir das 17:00 (Manaus) e e encerrado as 04:00 do dia seguinte.
-- Um turno ja encerrado (manualmente pelo inspetor, verificador ou administrador) nao e tocado.
-- O `fim` gravado e o proprio horario-limite (22:00 / 04:00), nao o instante em que o job rodou,
-- para o relatorio de jornada refletir a regra mesmo que o job atrase.

alter table turnos_inspetores
  add column if not exists encerrado_automaticamente boolean not null default false;

comment on column turnos_inspetores.encerrado_automaticamente is
  'true quando o fim foi gravado pelo job de encerramento automatico (turno nao encerrado manualmente).';

create or replace function public.encerrar_turnos_automaticamente()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
begin
  with abertos as (
    select
      t.id,
      (t.inicio at time zone 'America/Manaus') as inicio_local
    from turnos_inspetores t
    where t.fim is null
  ),
  limites as (
    select
      a.id,
      (
        case
          -- 1o turno (04:00 a 16:59): encerra as 22:00 do mesmo dia
          when extract(hour from a.inicio_local) >= 4 and extract(hour from a.inicio_local) < 17
            then date_trunc('day', a.inicio_local) + interval '22 hours'
          -- 2o turno iniciado a partir das 17:00: encerra as 04:00 do dia seguinte
          when extract(hour from a.inicio_local) >= 17
            then date_trunc('day', a.inicio_local) + interval '1 day 4 hours'
          -- 2o turno em andamento apos a meia-noite (00:00 a 03:59): encerra as 04:00 do mesmo dia
          else date_trunc('day', a.inicio_local) + interval '4 hours'
        end
      ) at time zone 'America/Manaus' as limite
    from abertos a
  ),
  fechados as (
    update turnos_inspetores t
       set fim = l.limite,
           encerrado_automaticamente = true
      from limites l
     where t.id = l.id
       and t.fim is null
       and l.limite <= now()
    returning t.id
  )
  select count(*) into v_qtd from fechados;

  return v_qtd;
end;
$$;

comment on function public.encerrar_turnos_automaticamente() is
  'Fecha turnos abertos cujo horario-limite passou (1o turno: 22:00; 2o turno: 04:00 do dia seguinte, Manaus). '
  'Chamada a cada 5 minutos por pg_cron; idempotente.';

revoke all on function public.encerrar_turnos_automaticamente() from public, anon, authenticated;

-- Agendamento (idempotente: cron.schedule com o mesmo jobname substitui a definicao anterior).
-- Roda a cada 5 minutos para tolerar atrasos/reinicios; a funcao so age em turnos vencidos.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'encerrar-turnos-automaticamente',
      '*/5 * * * *',
      'select public.encerrar_turnos_automaticamente();'
    );
  else
    raise notice 'pg_cron nao instalado: agende public.encerrar_turnos_automaticamente() manualmente.';
  end if;
end;
$$;
