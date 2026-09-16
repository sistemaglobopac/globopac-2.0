-- Fase 0 — Funções auxiliares de RBAC, usadas por todas as policies de RLS deste projeto.
-- Ponto único de leitura de identidade/permissão: qualquer mudança na forma como perfil e
-- setores são obtidos do JWT muda em um só lugar.

create or replace function public.meu_perfil()
returns nivel_acesso
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'perfil', '')::nivel_acesso
$$;

comment on function public.meu_perfil is
  'Perfil (RBAC) do usuário autenticado, lido do claim embutido no JWT por '
  'custom_access_token_hook. Retorna NULL se o usuário não tiver perfil ativo — toda policy '
  'que compara contra meu_perfil() falha (nega) naturalmente nesse caso.';

create or replace function public.meus_setores()
returns text[]
language sql
stable
as $$
  select coalesce(
    (select array_agg(value)
       from jsonb_array_elements_text(coalesce(auth.jwt() -> 'setores_permitidos', '[]'::jsonb))),
    '{}'::text[]
  )
$$;

comment on function public.meus_setores is
  'Setores de inspeção do usuário autenticado, lidos do claim setores_permitidos do JWT.';

create or replace function public.tem_permissao(p_recurso text, p_acao text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.permissoes_perfil pp
    where pp.perfil = public.meu_perfil()
      and pp.recurso = p_recurso
      and pp.acao = p_acao
  )
$$;

comment on function public.tem_permissao is
  'Ponto único de checagem de permissão (perfil, recurso, ação), usado em toda policy de RLS '
  'deste projeto. Deny by default: combinação ausente em permissoes_perfil, ou perfil nulo, '
  'retorna false. A coluna condicao de permissoes_perfil NÃO é avaliada aqui — restrições '
  'contextuais (mesmo setor, etc.) são expressas diretamente em cada policy, combinando '
  'tem_permissao() com meus_setores()/meu_perfil(). Ver ASSUMPTIONS.md item 11.';

revoke execute on function public.meu_perfil from anon;
revoke execute on function public.meus_setores from anon;
revoke execute on function public.tem_permissao from anon;
grant execute on function public.meu_perfil to authenticated;
grant execute on function public.meus_setores to authenticated;
grant execute on function public.tem_permissao to authenticated;

-- Trigger genérico e reutilizável para reforçar append-only em nível de banco,
-- independentemente de como a RLS estiver configurada (débito técnico da v1: "RLS pode ser
-- mal configurada; um trigger não" — seção 6 do PROMPT MESTRE).
create or replace function public.bloqueia_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    '% é append-only: UPDATE e DELETE nunca são permitidos nesta tabela, por trigger de banco (independente de RLS).',
    tg_table_name;
end;
$$;

comment on function public.bloqueia_update_delete is
  'Trigger genérico usado por todas as tabelas append-only do sistema (assinaturas_*, '
  'lote_liberacao_sif, log_acessos_verificacao, manutencao_os_historico).';
