-- Rascunhos de monitoramento na nuvem + pendências de assinatura.
--
-- Até aqui o rascunho (monitoramento preenchido e ainda não assinado) existia só no aparelho onde foi feito: o inspetor não
-- conseguia assinar de outro aparelho e o gestor não tinha como saber quem deixou de assinar. Agora cada rascunho tem uma
-- CÓPIA aqui. O aparelho continua sendo a fonte enquanto não há rede (funciona offline); quando há rede, ele envia o rascunho e
-- qualquer outro aparelho em que o inspetor entrar traz a cópia para a lista local — a assinatura segue o fluxo de sempre.
--
-- O rascunho NÃO é registro: não tem valor de monitoramento, não vai à verificação e vence 7 dias depois da hora do
-- monitoramento (a regra do prazo continua sendo a do servidor ao gravar o monitoramento).

create table if not exists public.rascunhos_monitoramento (
  id uuid primary key,
  user_id uuid not null references public.perfis_usuarios (id),
  setor text not null,
  ficha_template_id uuid not null,
  hora_monitoramento timestamptz not null,
  -- O rascunho inteiro como o aparelho o guarda (ficha, dados, hora, não conformidade…).
  conteudo jsonb not null,
  -- pendente = aguardando assinatura; assinado = virou monitoramento; descartado = o inspetor desistiu (fica de marca para
  -- que outro aparelho não o ressuscite).
  status text not null default 'pendente' check (status in ('pendente', 'assinado', 'descartado')),
  salvo_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.rascunhos_monitoramento is
  'Cópia na nuvem dos rascunhos de monitoramento (ainda não assinados) do inspetor: permite assinar de qualquer aparelho e dá ao gestor a lista de pendências de assinatura.';

create index if not exists idx_rascunhos_monitoramento_user on public.rascunhos_monitoramento (user_id, status);
create index if not exists idx_rascunhos_monitoramento_pendentes on public.rascunhos_monitoramento (hora_monitoramento) where status = 'pendente';

create or replace function public.rascunhos_monitoramento_atualizado()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_rascunhos_monitoramento_atualizado on public.rascunhos_monitoramento;
create trigger trg_rascunhos_monitoramento_atualizado
  before update on public.rascunhos_monitoramento
  for each row execute function public.rascunhos_monitoramento_atualizado();

alter table public.rascunhos_monitoramento enable row level security;

-- Cada inspetor lê e mexe só nos próprios; o administrador e o verificador só LEEM (para a tela de pendências).
drop policy if exists rascunhos_monitoramento_select on public.rascunhos_monitoramento;
create policy rascunhos_monitoramento_select on public.rascunhos_monitoramento
  for select to authenticated
  using (user_id = auth.uid() or public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR'));

drop policy if exists rascunhos_monitoramento_insert on public.rascunhos_monitoramento;
create policy rascunhos_monitoramento_insert on public.rascunhos_monitoramento
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pendente');

drop policy if exists rascunhos_monitoramento_update on public.rascunhos_monitoramento;
create policy rascunhos_monitoramento_update on public.rascunhos_monitoramento
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.rascunhos_monitoramento from public, anon, authenticated;
grant select, insert, update on public.rascunhos_monitoramento to authenticated;

-- Monitoramentos já gravados (finalizados) que não têm a assinatura do inspetor. O sistema não tem como assinar depois um registro
-- já gravado: esta lista serve para o gestor saber o que ficou sem assinatura. Correções por adendo (aditivo_de) não entram: o
-- adendo é assinado na sessão do inspetor, não por esta assinatura. Só administrador e verificador.
create or replace function public.monitoramentos_sem_assinatura_inspetor()
returns table (id uuid, user_id uuid, setor text, ficha text, realizado_em timestamptz, verificado boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.user_id, m.setor, t.nome as ficha, coalesce(m.hora_monitoramento, m.criado_em) as realizado_em, (m.verificado_por is not null) as verificado
  from monitoramentos m
  join fichas_templates t on t.id = m.ficha_template_id
  where public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR')
    and m.status_ficha = 'FINALIZADO'
    and m.aditivo_de is null
    and not exists (select 1 from assinaturas_eletronicas a where a.monitoramento_id = m.id and a.tipo in ('INSPETOR', 'INSPETOR_PARCIAL'))
  order by coalesce(m.hora_monitoramento, m.criado_em)
$$;

revoke all on function public.monitoramentos_sem_assinatura_inspetor() from public, anon;
grant execute on function public.monitoramentos_sem_assinatura_inspetor() to authenticated;
