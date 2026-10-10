-- Monitoramento de pragas obrigatório pelo menos uma vez por dia: o INSPETOR não consegue finalizar o PRÓPRIO turno
-- enquanto houver ficha de pragas do(s) setor(es) dele sem monitoramento hoje. A regra já existia na tela (Painel de
-- Bordo); aqui ela vale também para quem chamar a API direto.
--
-- "Ficha de pragas" = ficha ATIVA com o campo `ocorrencia_pragas` em schema_campos, aplicável a algum setor do inspetor.
-- "Hoje" = o dia corrente em America/Manaus ou, se o turno começou antes da meia-noite (2º turno, 17h às 04h), o turno todo.
-- Vale o monitoramento de QUALQUER inspetor nos setores dele (quem cobre o almoço também cumpre) e de qualquer versão da
-- ficha (reeditar cria outro template com o mesmo código). Rascunho local não conta: só o que foi assinado e gravado.
--
-- Fica de FORA de propósito: o encerramento automático (pg_cron, sem usuário) e o encerramento por ADMIN_MASTER/outro
-- perfil — existem justamente para destravar turno esquecido aberto, e barrá-los deixaria turno aberto para sempre.

create or replace function public.pragas_pendentes_do_turno(p_inicio timestamptz, p_setores text[])
returns table (codigo text, nome text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.codigo, f.nome
  from public.fichas_templates f
  where f.ativo
    and jsonb_typeof(f.schema_campos) = 'array'
    and exists (select 1 from jsonb_array_elements(f.schema_campos) c where c ->> 'tipo' = 'ocorrencia_pragas')
    and jsonb_typeof(f.locais_aplicacao) = 'array'
    and exists (select 1 from jsonb_array_elements_text(f.locais_aplicacao) l where l = any (p_setores))
    and not exists (
      select 1
      from public.monitoramentos m
      join public.fichas_templates v on v.id = m.ficha_template_id
      where v.codigo = f.codigo
        and m.setor = any (p_setores)
        and coalesce(m.hora_monitoramento, m.criado_em)
            >= least((date_trunc('day', now() at time zone 'America/Manaus') at time zone 'America/Manaus'), p_inicio)
    );
$$;

comment on function public.pragas_pendentes_do_turno is
  'Fichas de pragas (ativas, aplicáveis aos setores informados) sem nenhum monitoramento no dia/turno. '
  'Espelha pragasPendentes (src/modules/bordo/api.ts), sem os rascunhos locais.';

revoke all on function public.pragas_pendentes_do_turno(timestamptz, text[]) from public, anon, authenticated;

create or replace function public.exigir_pragas_ao_finalizar_turno()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_faltam text;
begin
  -- Só a transição "aberto → finalizado".
  if old.fim is not null or new.fim is null then
    return new;
  end if;
  -- Só o próprio inspetor, pela API. Job de encerramento automático (sem usuário) e administração não são barrados.
  if auth.uid() is distinct from old.user_id or public.meu_perfil() is distinct from 'INSPETOR_QUALIDADE' then
    return new;
  end if;

  select string_agg(p.codigo || ' — ' || p.nome, '; ')
    into v_faltam
    from public.pragas_pendentes_do_turno(old.inicio, public.meus_setores()) p;

  if v_faltam is not null then
    raise exception 'Monitoramento de pragas obrigatório: faça o monitoramento de pragas de hoje antes de finalizar o turno (%).', v_faltam
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function public.exigir_pragas_ao_finalizar_turno is
  'Barra o inspetor de finalizar o próprio turno sem o monitoramento de pragas do dia. Não barra o job automático nem a administração.';

revoke all on function public.exigir_pragas_ao_finalizar_turno() from public, anon, authenticated;

drop trigger if exists trg_exigir_pragas_ao_finalizar_turno on public.turnos_inspetores;
create trigger trg_exigir_pragas_ao_finalizar_turno
  before update of fim on public.turnos_inspetores
  for each row
  execute function public.exigir_pragas_ao_finalizar_turno();
