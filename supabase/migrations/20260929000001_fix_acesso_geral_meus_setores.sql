-- Corrige o checkbox "Acesso Geral" (setores_permitidos = ['Todos']) do cadastro de
-- colaboradores: meus_setores() devolvia o literal 'Todos' vindo direto do claim do JWT, e
-- toda policy de RLS deste projeto compara setor = ANY(meus_setores()) contra nomes REAIS de
-- setor (ex. 'Recepção', vindos de app_config.setores_cadastrados) — 'Todos' nunca batia com
-- nenhum setor real, então um usuário marcado "Acesso Geral" ficava, na prática, SEM enxergar
-- nenhum monitoramento/RNC/OS de nenhum setor (o oposto do pretendido). Bug real, reportado
-- como "ficha criada no setor Recepção não aparece para usuário com Acesso Geral".
--
-- meus_setores() é o único ponto de leitura de setores usado pelas policies (monitoramentos,
-- rnc, manutencao_os, assinaturas_*), então expandir o sentinela aqui corrige todas de uma vez.
create or replace function public.meus_setores()
returns text[]
language sql
stable
as $$
  with claim as (
    select coalesce(
      (select array_agg(value)
         from jsonb_array_elements_text(coalesce(auth.jwt() -> 'setores_permitidos', '[]'::jsonb))),
      '{}'::text[]
    ) as setores
  )
  select case
    when 'Todos' = any (claim.setores) then
      coalesce(
        (select array_agg(value)
           from jsonb_array_elements_text(
             (select ac.valor from public.app_config ac where ac.chave = 'setores_cadastrados')
           )),
        '{}'::text[]
      )
    else claim.setores
  end
  from claim
$$;

comment on function public.meus_setores is
  'Setores de inspeção do usuário autenticado, lidos do claim setores_permitidos do JWT — '
  'exceto quando esse claim contém o sentinela ''Todos'' (checkbox "Acesso Geral" em '
  'FormUsuarioModal), caso em que expande para a lista completa de '
  'app_config.setores_cadastrados. Sem essa expansão, setor = ANY(meus_setores()) nunca bate '
  'contra um setor real e o usuário "Acesso Geral" não vê nada — ver migration '
  '20260929000001_fix_acesso_geral_meus_setores. app_config é legível por qualquer '
  'authenticated (policy app_config_select), então não precisa de SECURITY DEFINER aqui.';

revoke execute on function public.meus_setores from anon;
grant execute on function public.meus_setores to authenticated;
