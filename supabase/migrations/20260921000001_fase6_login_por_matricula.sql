-- Fase 6 — Login por matrícula: perfis_usuarios ganha uma matrícula funcional, distinta de
-- nome_usuario (que é só um identificador técnico/de exibição, usado em auditoria). A
-- Supabase Auth só autentica por e-mail/telefone — o front-end resolve matrícula -> e-mail
-- via a RPC abaixo antes de chamar signInWithPassword, sem precisar reimplementar auth.

alter table perfis_usuarios
  add column matricula text unique;

comment on column perfis_usuarios.matricula is
  'Registro funcional do colaborador, usado como credencial de login (em vez de e-mail). '
  'Distinto de nome_usuario (identificador técnico/de exibição).';

-- Backfill dos usuários de dev já existentes (nome_usuario é estável e determinístico — ver
-- scripts/seed-dev-users.mjs). Projeto novo, sem usuários reais ainda além destes.
update perfis_usuarios set matricula = '1001' where nome_usuario = 'inspetor.qualidade';
update perfis_usuarios set matricula = '1002' where nome_usuario = 'verificador';
update perfis_usuarios set matricula = '1003' where nome_usuario = 'gestor.setor';
update perfis_usuarios set matricula = '1004' where nome_usuario = 'admin.master';
update perfis_usuarios set matricula = '1005' where nome_usuario = 'inspecao.federal';
update perfis_usuarios set matricula = '1006' where nome_usuario = 'inspetor.pcm';

alter table perfis_usuarios
  alter column matricula set not null;

-- SECURITY DEFINER (não o padrão): chamada antes do login existir (sem auth.uid()), então a
-- RLS de perfis_usuarios (que exige id = auth.uid() ou tem_permissao()) bloquearia a leitura
-- mesmo tratando-se apenas de resolver a própria matrícula — não há "própria linha" ainda
-- nesse ponto. Expõe apenas o e-mail de auth.users, nunca outra coluna de perfis_usuarios.
create or replace function public.email_por_matricula(p_matricula text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.email
  from perfis_usuarios p
  join auth.users u on u.id = p.id
  where p.matricula = p_matricula
    and p.ativo = true
$$;

comment on function public.email_por_matricula is
  'Resolve matrícula -> e-mail para login (a Supabase Auth só autentica por e-mail/telefone). '
  'Retorna NULL se a matrícula não existir ou o perfil estiver inativo — o front-end trata '
  'isso como "matrícula ou senha inválidos", sem revelar qual dos dois está errado.';

revoke execute on function public.email_por_matricula from public, authenticated;
grant execute on function public.email_por_matricula to anon;
