-- Fase 11 — VERIFICADOR passa a atuar como revisor da tratativa de RNC (decisão de produto
-- que substitui os itens 21/22 do ASSUMPTIONS.md, escritos quando ainda não havia um perfil
-- de revisor definido). Espelha o Verificador da Qualidade da v1 (VerificadorReview.jsx):
-- o Gestor de Setor trata (ABERTA/REABERTA/DEVOLVIDA -> TRATADA), mas não fecha mais a
-- própria RNC sozinho — o fechamento (aprovação) ou a devolução para nova tratativa é do
-- VERIFICADOR/ADMIN_MASTER, nunca da mesma pessoa que tratou.

alter type status_rnc add value if not exists 'DEVOLVIDA';

alter table rnc
  add column revisado_por uuid references perfis_usuarios (id),
  add column motivo_devolucao text;

comment on column rnc.revisado_por is
  'VERIFICADOR (ou ADMIN_MASTER) que aprovou o fechamento ou devolveu a tratativa ao gestor. '
  'Nunca a mesma pessoa que tratou (rnc.tratado_por) — reforçado por trg_segregacao_funcoes_rnc.';
comment on column rnc.motivo_devolucao is
  'Motivo informado pelo revisor ao devolver a RNC para nova tratativa (status = DEVOLVIDA).';

-- Segregação de funções (mesmo princípio de checar_segregacao_funcoes em monitoramentos —
-- ver 20260916000008_monitoramentos.sql): quem tratou a RNC nunca pode ser quem a revisa,
-- mesmo que acumule os dois perfis (ex.: ADMIN_MASTER trata e tenta revisar a mesma RNC).
create or replace function public.checar_segregacao_funcoes_rnc()
returns trigger
language plpgsql
as $$
begin
  if new.revisado_por is not null and new.tratado_por is not null and new.revisado_por = new.tratado_por then
    raise exception
      'Segregação de funções violada: o mesmo usuário não pode tratar e revisar a mesma RNC (rnc %).',
      new.id;
  end if;
  return new;
end;
$$;

create trigger trg_segregacao_funcoes_rnc
  before insert or update on rnc
  for each row execute function public.checar_segregacao_funcoes_rnc();

insert into permissoes_perfil (perfil, recurso, acao) values
  ('VERIFICADOR', 'rnc', 'revisar'),
  ('ADMIN_MASTER', 'rnc', 'revisar')
on conflict (perfil, recurso, acao) do nothing;

-- rnc_update (ação 'tratar') passa a proibir explicitamente que quem só trata avance a RNC
-- para um status de resultado de revisão (FECHADA/DEVOLVIDA) ou grave revisado_por — fecha a
-- brecha de um cliente com permissão 'tratar' simplesmente enviar esses campos direto, sem
-- passar pela ação 'revisar'. Também impede tocar numa RNC já FECHADA (reabertura só pode
-- acontecer via rnc_insert/useReabrirRnc — sempre uma linha nova, nunca UPDATE na fechada).
-- Substitui a policy original (mesmo nome, definição nova).
drop policy if exists rnc_update on rnc;

create policy rnc_update on rnc
  for update
  using (
    public.tem_permissao('rnc', 'tratar')
    and setor = any (public.meus_setores())
    and status <> 'FECHADA'
  )
  with check (
    public.tem_permissao('rnc', 'tratar')
    and status not in ('FECHADA', 'DEVOLVIDA')
    and revisado_por is null
  );

-- Revisão (aprovar fechamento ou devolver ao gestor): só transiciona uma RNC já TRATADA para
-- FECHADA/DEVOLVIDA, e exige que o próprio chamador seja quem assina como revisor — impede
-- que um revisor atribua a revisão a outra pessoa. Múltiplas policies permissivas de UPDATE
-- são combinadas com OR pelo Postgres (mesmo padrão de monitoramentos_update_verificar /
-- monitoramentos_update_liberar_sif).
create policy rnc_update_revisar on rnc
  for update
  using (
    public.tem_permissao('rnc', 'revisar')
    and setor = any (public.meus_setores())
    and status = 'TRATADA'
  )
  with check (
    public.tem_permissao('rnc', 'revisar')
    and status in ('FECHADA', 'DEVOLVIDA')
    and revisado_por = auth.uid()
  );
