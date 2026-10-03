-- Nomes dos usuários para relatórios e selos de assinatura. O Verificador não lê perfis_usuarios
-- (a RLS só mostra o próprio perfil), então o selo da assinatura do inspetor aparecia como
-- "Usuário do Sistema". Esta função devolve SÓ id + nome_completo (nunca matrícula, nível de acesso
-- ou setores), inclusive de usuários já desligados, para qualquer usuário autenticado com perfil.

create or replace function public.nomes_usuarios(p_ids uuid[] default null)
returns table (id uuid, nome_completo text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome_completo
  from perfis_usuarios p
  where public.meu_perfil() is not null
    and (p_ids is null or p.id = any (p_ids))
$$;

comment on function public.nomes_usuarios(uuid[]) is
  'id + nome_completo dos usuários (todos se p_ids for nulo). Não expõe nenhum outro dado do perfil.';

revoke all on function public.nomes_usuarios(uuid[]) from public, anon;
grant execute on function public.nomes_usuarios(uuid[]) to authenticated;
