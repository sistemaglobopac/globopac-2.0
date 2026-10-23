-- Reabrir o turno de um inspetor (ADMIN_MASTER e VERIFICADOR): o turno foi finalizado por engano
-- (ou cedo demais) e o inspetor precisa continuar monitorando.
--
-- turnos_inspetores só é legível/alterável pelo ADMIN_MASTER e pelo dono (RLS); o VERIFICADOR não lê
-- nem escreve nela. Por isso a listagem e a reabertura passam por funções SECURITY DEFINER que
-- conferem o perfil de quem chama, no mesmo padrão de turnos_para_resolucao().
--
-- Limite: o encerramento automático (encerrar_turnos_automaticamente) fecha de novo, em até 5 minutos,
-- qualquer turno aberto cujo horário-limite já passou (1º turno 22:00; 2º turno 04:00 do dia seguinte,
-- Manaus). Reabrir um turno nessa situação seria desfeito sozinho, então a função recusa com uma
-- mensagem clara em vez de reabrir e deixar o turno fechar logo em seguida.

alter table turnos_inspetores
  add column if not exists reaberto_por uuid references perfis_usuarios (id),
  add column if not exists reaberto_em timestamptz;

comment on column turnos_inspetores.reaberto_por is 'Quem reabriu o turno (ADMIN_MASTER/VERIFICADOR) pela última vez.';
comment on column turnos_inspetores.reaberto_em is 'Quando o turno foi reaberto pela última vez.';

-- Turnos que começaram no dia (calendário de Manaus), para a tela escolher qual reabrir.
create or replace function public.turnos_para_reabertura(p_dia date)
returns table (id uuid, user_id uuid, setor text, inicio timestamptz, fim timestamptz, encerrado_automaticamente boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.meu_perfil() is distinct from 'ADMIN_MASTER' and public.meu_perfil() is distinct from 'VERIFICADOR' then
    raise exception 'Apenas o administrador e o verificador podem consultar turnos para reabertura.' using errcode = '42501';
  end if;

  return query
    select t.id, t.user_id, t.setor, t.inicio, t.fim, t.encerrado_automaticamente
    from turnos_inspetores t
    where (t.inicio at time zone 'America/Manaus')::date = p_dia
    order by t.inicio;
end;
$$;

revoke all on function public.turnos_para_reabertura(date) from public, anon;
grant execute on function public.turnos_para_reabertura(date) to authenticated;

create or replace function public.reabrir_turno(p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_turno turnos_inspetores%rowtype;
  v_inicio_local timestamp;
  v_limite timestamptz;
begin
  if public.meu_perfil() is distinct from 'ADMIN_MASTER' and public.meu_perfil() is distinct from 'VERIFICADOR' then
    raise exception 'Apenas o administrador e o verificador podem reabrir um turno.' using errcode = '42501';
  end if;

  select * into v_turno from turnos_inspetores where id = p_turno_id for update;
  if not found then
    raise exception 'Turno não encontrado.' using errcode = 'P0002';
  end if;
  if v_turno.fim is null then
    raise exception 'Este turno já está aberto.' using errcode = 'P0001';
  end if;

  if exists (select 1 from turnos_inspetores o where o.user_id = v_turno.user_id and o.fim is null and o.id <> v_turno.id) then
    raise exception 'O inspetor já tem outro turno aberto. Encerre-o antes de reabrir este.' using errcode = 'P0001';
  end if;

  -- Mesmo horário-limite do encerramento automático.
  v_inicio_local := v_turno.inicio at time zone 'America/Manaus';
  v_limite := (
    case
      when extract(hour from v_inicio_local) >= 4 and extract(hour from v_inicio_local) < 17
        then date_trunc('day', v_inicio_local) + interval '22 hours'
      when extract(hour from v_inicio_local) >= 17
        then date_trunc('day', v_inicio_local) + interval '1 day 4 hours'
      else date_trunc('day', v_inicio_local) + interval '4 hours'
    end
  ) at time zone 'America/Manaus';
  if v_limite <= now() then
    raise exception 'Este turno passou do horário-limite de encerramento automático (%); reabrir não adianta, o sistema o fecharia de novo.',
      to_char(v_limite at time zone 'America/Manaus', 'DD/MM HH24:MI') using errcode = 'P0001';
  end if;

  update turnos_inspetores
     set fim = null,
         encerrado_automaticamente = false,
         reaberto_por = auth.uid(),
         reaberto_em = now()
   where id = v_turno.id;
end;
$$;

comment on function public.reabrir_turno(uuid) is
  'Reabre (fim = null) um turno finalizado. ADMIN_MASTER e VERIFICADOR. Recusa se o inspetor já tem outro turno aberto '
  'ou se o horário-limite do encerramento automático já passou.';

revoke all on function public.reabrir_turno(uuid) from public, anon;
grant execute on function public.reabrir_turno(uuid) to authenticated;
