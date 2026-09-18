-- Testes pgTAP — Fase 6: public.email_por_matricula() (login por matrícula, ver
-- migration 20260921000001_fase6_login_por_matricula.sql e ADR 0013).
-- Executar com: supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('c0000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'ativo.matricula@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('c0000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'inativo.matricula@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos, ativo) values
  ('c0000000-0000-0000-0000-000000000010', 'Ativo Teste', 'ativo.teste', '9001', 'INSPETOR_QUALIDADE', array['LINHA_DIF'], true),
  ('c0000000-0000-0000-0000-000000000011', 'Inativo Teste', 'inativo.teste', '9002', 'INSPETOR_QUALIDADE', array['LINHA_DIF'], false);

-- Como anon (mesma role usada pela chamada real, antes do login existir).
set local role anon;

select is(
  public.email_por_matricula('9001'),
  'ativo.matricula@test.local',
  'email_por_matricula resolve a matrícula de um perfil ativo para o e-mail correto'
);

select is(
  public.email_por_matricula('9002'),
  null,
  'email_por_matricula retorna NULL para perfil inativo — nunca revela que a matrícula existe'
);

select is(
  public.email_por_matricula('9999-inexistente'),
  null,
  'email_por_matricula retorna NULL para matrícula inexistente (mesma resposta que inativo)'
);

reset role;
select is(
  has_function_privilege('authenticated', 'public.email_por_matricula(text)', 'execute'),
  false,
  'authenticated não tem EXECUTE em email_por_matricula — só anon precisa (chamada antes do login)'
);

select * from finish();
rollback;
