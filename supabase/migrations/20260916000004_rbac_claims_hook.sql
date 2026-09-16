-- Fase 0 — Auth Hook (Custom Access Token): embute perfil e setores_permitidos no JWT no
-- momento da emissão do token, para que RLS possa checar RBAC sem uma query extra por
-- requisição. Registrado em supabase/config.toml ([auth.hook.custom_access_token]).
--
-- Consequência aceita (documentada, não um bug): a revogação de um usuário (ativo=false) só
-- é efetiva quando o token atual expira e é renovado. jwt_expiry está configurado para 900s
-- (15 min) em supabase/config.toml exatamente para limitar essa janela — ver seção 4.2 do
-- PROMPT MESTRE e ASSUMPTIONS.md.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_perfil record;
  v_claims jsonb;
begin
  select nivel_acesso, setores_permitidos, ativo
    into v_perfil
    from public.perfis_usuarios
    where id = (event ->> 'user_id')::uuid;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);

  if found and v_perfil.ativo is true then
    v_claims := jsonb_set(v_claims, '{perfil}', to_jsonb(v_perfil.nivel_acesso::text));
    v_claims := jsonb_set(v_claims, '{setores_permitidos}', to_jsonb(v_perfil.setores_permitidos));
  else
    -- Usuário sem perfil ativo (ou sem linha em perfis_usuarios ainda): nenhum claim de RBAC
    -- é emitido. As policies de RLS tratam perfil ausente como "sem permissão nenhuma"
    -- (deny by default), nunca como erro.
    v_claims := jsonb_set(v_claims, '{perfil}', 'null'::jsonb);
    v_claims := jsonb_set(v_claims, '{setores_permitidos}', '[]'::jsonb);
  end if;

  event := jsonb_set(event, '{claims}', v_claims);
  return event;
end;
$$;

comment on function public.custom_access_token_hook is
  'Auth Hook (Custom Access Token) do Supabase Auth. Embute perfil/setores_permitidos no '
  'JWT. Ver supabase/config.toml e ASSUMPTIONS.md sobre a janela de revogação.';

-- Permissões mínimas exigidas pelo Supabase Auth para executar o hook e ler perfis_usuarios.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
grant select on public.perfis_usuarios to supabase_auth_admin;
