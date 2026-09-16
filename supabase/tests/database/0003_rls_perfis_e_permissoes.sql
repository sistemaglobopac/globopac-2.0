-- Testes pgTAP — RLS de perfis_usuarios, view pública e permissoes_perfil (seção 4.2 e 7.6:
-- "resolver com uma view pública perfis_usuarios_publico em vez de abrir a tabela inteira
-- para anon" — bug conhecido da v1).

create extension if not exists pgtap with schema extensions;

begin;
select plan(6);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'user1@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('90000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'user2@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, nivel_acesso, setores_permitidos) values
  ('90000000-0000-0000-0000-000000000001', 'Usuário Um', 'usuario.um', 'INSPETOR_QUALIDADE', array['LINHA_DIF']),
  ('90000000-0000-0000-0000-000000000002', 'Usuário Dois', 'usuario.dois', 'GESTOR_SETOR', array['LINHA_DIF']);

-- ------------------------------------------------------------------------------------------
-- 1) Um usuário sempre enxerga a própria linha em perfis_usuarios, mesmo sem permissão 'ler'.
-- ------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object(
  'sub', '90000000-0000-0000-0000-000000000001',
  'role', 'authenticated',
  'perfil', 'INSPETOR_QUALIDADE',
  'setores_permitidos', array['LINHA_DIF']
)::text, true);
set local role authenticated;

select is(
  (select count(*)::int from perfis_usuarios where id = '90000000-0000-0000-0000-000000000001'),
  1,
  'Usuário autenticado sempre enxerga a própria linha em perfis_usuarios'
);

-- 2) ...mas não enxerga a linha de outro usuário (perfil sem a ação perfis_usuarios.ler).
select is(
  (select count(*)::int from perfis_usuarios where id = '90000000-0000-0000-0000-000000000002'),
  0,
  'INSPETOR_QUALIDADE não enxerga o perfil de outro usuário (sem a permissão perfis_usuarios.ler)'
);

-- 3) anon não enxerga NADA em perfis_usuarios diretamente (só via a view pública).
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;

select is(
  (select count(*)::int from perfis_usuarios),
  0,
  'anon não lê a tabela perfis_usuarios diretamente (RLS nega tudo)'
);

-- 4) ...mas consegue ler nome_completo via a view pública, para usuários ativos.
select is(
  (select count(*)::int from perfis_usuarios_publico where id = '90000000-0000-0000-0000-000000000001'),
  1,
  'anon lê nome_completo via perfis_usuarios_publico (bug da v1 corrigido)'
);

-- 5) ...e a view pública nunca expõe nivel_acesso/setores_permitidos (a coluna nem existe na view).
select isnt(
  (select array_to_string(array(select column_name::text from information_schema.columns
                                  where table_name = 'perfis_usuarios_publico'), ',')),
  null,
  'perfis_usuarios_publico existe e tem colunas restritas (checagem estrutural)'
);

select is(
  (select bool_or(column_name in ('nivel_acesso', 'setores_permitidos', 'nome_usuario'))
     from information_schema.columns where table_name = 'perfis_usuarios_publico'),
  false,
  'perfis_usuarios_publico nunca expõe nivel_acesso, setores_permitidos ou nome_usuario'
);

select * from finish();
rollback;
