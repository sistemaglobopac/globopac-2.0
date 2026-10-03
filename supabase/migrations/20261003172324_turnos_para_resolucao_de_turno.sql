-- Turno de um monitoramento = turno em que o turno do inspetor foi ABERTO (não o relógio na hora do
-- registro): quem continua os monitoramentos de um colega depois das 17h (ex.: o admin) entra no
-- mesmo consolidado do 1º turno. Para agrupar, VERIFICADOR e INSPECAO_FEDERAL precisam enxergar
-- quando os turnos começaram/terminaram, mas turnos_inspetores só é legível pelo ADMIN_MASTER e pelo
-- próprio dono. Esta função expõe apenas user_id/setor/inicio/fim (nada sensível), como
-- nomes_usuarios() faz com os nomes.

create or replace function public.turnos_para_resolucao(p_desde timestamptz default now() - interval '90 days')
returns table (user_id uuid, setor text, inicio timestamptz, fim timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.user_id, t.setor, t.inicio, t.fim
  from turnos_inspetores t
  where auth.uid() is not null
    and t.inicio >= p_desde;
$$;

revoke all on function public.turnos_para_resolucao(timestamptz) from public;
grant execute on function public.turnos_para_resolucao(timestamptz) to authenticated;
