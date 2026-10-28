-- Justificativa de monitoramento NÃO REALIZADO em um horário (fichas do PAC 11: absorção de água pelas carcaças).
-- O inspetor registra por que o monitoramento de um horário — inclusive de horas que já passaram no turno — não foi feito. A
-- justificativa aparece no relatório da ficha e, quando é do horário em atraso, dispensa o alarme daquele período (o app trata
-- como o "processo parado": a próxima cobrança vem um intervalo depois). Diferente de monitoramentos_processo_parado, que só
-- cobre o período em atraso e só para fichas marcadas no Construtor, esta vale para qualquer horário e qualquer motivo.
-- Registro de auditoria: só se insere, nunca se edita nem se apaga. Corrigir um erro = registrar de novo o mesmo horário
-- (o relatório mostra a mais recente; a anterior continua gravada). Vale por CÓDIGO da ficha (reeditar a ficha cria um template
-- novo com o mesmo código). Idempotente: pode ser rodada de novo sem erro.

create table if not exists public.monitoramentos_nao_realizados (
  id uuid primary key default gen_random_uuid(),
  ficha_codigo text not null,
  setor text,
  -- Horário em que o monitoramento deveria ter sido feito (truncado ao minuto).
  horario_devido timestamptz not null,
  motivo text not null check (length(btrim(motivo)) > 0),
  detalhes text,
  registrado_por uuid not null default auth.uid() references public.perfis_usuarios (id),
  registrado_em timestamptz not null default now()
);

comment on table public.monitoramentos_nao_realizados is
  'Justificativa do inspetor para o monitoramento que não foi realizado em um horário. Append-only (auditoria).';

create index if not exists idx_nao_realizados_ficha on public.monitoramentos_nao_realizados (ficha_codigo, horario_devido desc);

alter table public.monitoramentos_nao_realizados enable row level security;

-- Horário no futuro não se justifica (o monitoramento ainda pode ser feito) e "Outro" exige a descrição do motivo.
create or replace function public.monitoramentos_nao_realizados_valida()
returns trigger
language plpgsql
as $$
begin
  new.horario_devido := date_trunc('minute', new.horario_devido);
  new.setor := nullif(btrim(coalesce(new.setor, '')), '');
  new.motivo := btrim(new.motivo);
  if new.horario_devido > now() + interval '1 minute' then
    raise exception 'O horário da justificativa não pode estar no futuro.';
  end if;
  if new.motivo = 'Outro' and length(btrim(coalesce(new.detalhes, ''))) < 5 then
    raise exception 'Descreva o motivo (mínimo de 5 caracteres) quando escolher "Outro".';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nao_realizados_valida on public.monitoramentos_nao_realizados;
create trigger trg_nao_realizados_valida
  before insert on public.monitoramentos_nao_realizados
  for each row execute function public.monitoramentos_nao_realizados_valida();

drop trigger if exists trg_nao_realizados_append_only on public.monitoramentos_nao_realizados;
create trigger trg_nao_realizados_append_only
  before update or delete on public.monitoramentos_nao_realizados
  for each row execute function public.bloqueia_update_delete();

-- A Inspeção Federal só vê a justificativa de uma ficha cujo monitoramento do mesmo dia de turno (o 2º turno vai até as 4h) já
-- foi liberado ao SIF: a justificativa é parte do relatório que ela audita. Função própria (SECURITY DEFINER) porque o auditor
-- não lê monitoramentos/fichas_templates diretamente além do que a RLS dele permite.
create or replace function public.nao_realizado_visivel_ao_auditor(p_ficha_codigo text, p_horario timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.monitoramentos m
      join public.fichas_templates t on t.id = m.ficha_template_id
     where t.codigo = p_ficha_codigo
       and m.liberado_sif
       and (((coalesce(m.hora_monitoramento, m.criado_em)) at time zone 'America/Manaus') - interval '4 hours')::date
         = ((p_horario at time zone 'America/Manaus') - interval '4 hours')::date
  )
$$;

revoke all on function public.nao_realizado_visivel_ao_auditor(text, timestamptz) from public, anon;
grant execute on function public.nao_realizado_visivel_ao_auditor(text, timestamptz) to authenticated;

drop policy if exists nao_realizados_select on public.monitoramentos_nao_realizados;
create policy nao_realizados_select on public.monitoramentos_nao_realizados
  for select to authenticated
  using (
    public.meu_perfil() in ('INSPETOR_QUALIDADE', 'VERIFICADOR', 'GESTOR_SETOR', 'ADMIN_MASTER')
    or (public.meu_perfil() = 'INSPECAO_FEDERAL' and public.nao_realizado_visivel_ao_auditor(ficha_codigo, horario_devido))
  );

drop policy if exists nao_realizados_insert on public.monitoramentos_nao_realizados;
create policy nao_realizados_insert on public.monitoramentos_nao_realizados
  for insert to authenticated
  with check (
    public.meu_perfil() in ('INSPETOR_QUALIDADE', 'ADMIN_MASTER')
    and registrado_por = auth.uid()
  );

revoke update, delete on public.monitoramentos_nao_realizados from anon, authenticated;
