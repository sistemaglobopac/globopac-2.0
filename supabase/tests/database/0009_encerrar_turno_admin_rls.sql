-- Testes pgTAP — regressão do bug real corrigido em
-- 20260930000001_fix_encerrar_turno_admin_rls.sql: ADMIN_MASTER precisa conseguir
-- fechar/criar o turno de OUTRO inspetor (botão "Encerrar turno" do Painel de Verificação),
-- mas turnos_insert/turnos_update só permitiam `user_id = auth.uid()` desde o dia 1 — um
-- UPDATE/INSERT filtrado pelo RLS para 0 linhas não retorna erro, só não muda nada, e o botão
-- "Verificar" (disabled com turno aberto) ficava travado pra sempre, silenciosamente.
-- Técnica idêntica a 0004_rls_manutencao_os.sql.

create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'inspetor.turno@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'admin.turno@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'outro.inspetor.turno@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e0000000-0000-0000-0000-000000000001', 'Inspetor Turno', 'inspetor.turno.teste', 'T0020', 'INSPETOR_QUALIDADE', array['LINHA_DIF']),
  ('e0000000-0000-0000-0000-000000000002', 'Admin Turno', 'admin.turno.teste', 'T0021', 'ADMIN_MASTER', array['Todos']),
  ('e0000000-0000-0000-0000-000000000003', 'Outro Inspetor', 'outro.inspetor.turno.teste', 'T0022', 'INSPETOR_QUALIDADE', array['LINHA_DIF']);

insert into turnos_inspetores (id, user_id, inicio, fim)
values ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', now(), null);

-- ------------------------------------------------------------------------------------------
-- 1) BUG FIX: outro INSPETOR_QUALIDADE (não é o dono nem ADMIN_MASTER) não consegue fechar o
-- turno alheio — continua protegido (a correção só adicionou uma exceção pra ADMIN_MASTER).
-- ------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000003',
  'role', 'authenticated',
  'perfil', 'INSPETOR_QUALIDADE',
  'setores_permitidos', array['LINHA_DIF']
)::text, true);
set local role authenticated;

update turnos_inspetores set fim = now() where id = 'e1000000-0000-0000-0000-000000000001';

reset role;
select is(
  (select fim from turnos_inspetores where id = 'e1000000-0000-0000-0000-000000000001'),
  null::timestamptz,
  'INSPETOR_QUALIDADE não consegue fechar o turno de outro inspetor via RLS'
);

-- ------------------------------------------------------------------------------------------
-- 2) BUG FIX: ADMIN_MASTER consegue fechar o turno de outro inspetor (era exatamente isto que
-- o botão "Encerrar turno" precisava e nunca conseguiu, silenciosamente).
-- ------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000002',
  'role', 'authenticated',
  'perfil', 'ADMIN_MASTER',
  'setores_permitidos', array['Todos']
)::text, true);
set local role authenticated;

update turnos_inspetores set fim = now() where id = 'e1000000-0000-0000-0000-000000000001';

reset role;
select isnt(
  (select fim from turnos_inspetores where id = 'e1000000-0000-0000-0000-000000000001'),
  null::timestamptz,
  'ADMIN_MASTER consegue fechar o turno de outro inspetor via RLS'
);

-- ------------------------------------------------------------------------------------------
-- 3) BUG FIX: ADMIN_MASTER consegue inserir um turno (já fechado) em nome de outro inspetor
-- — caminho de encerrarTurnoAdmin quando o inspetor nunca abriu turno formalmente.
-- ------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000002',
  'role', 'authenticated',
  'perfil', 'ADMIN_MASTER',
  'setores_permitidos', array['Todos']
)::text, true);
set local role authenticated;

insert into turnos_inspetores (user_id, inicio, fim) values ('e0000000-0000-0000-0000-000000000003', now(), now());

reset role;
select is(
  (select count(*)::int from turnos_inspetores where user_id = 'e0000000-0000-0000-0000-000000000003'),
  1,
  'ADMIN_MASTER consegue inserir um turno em nome de outro inspetor via RLS'
);

-- ------------------------------------------------------------------------------------------
-- 4) Continua protegido: um INSPETOR_QUALIDADE não consegue inserir turno em nome de outro.
-- ------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000001',
  'role', 'authenticated',
  'perfil', 'INSPETOR_QUALIDADE',
  'setores_permitidos', array['LINHA_DIF']
)::text, true);
set local role authenticated;

insert into turnos_inspetores (user_id, inicio, fim) values ('e0000000-0000-0000-0000-000000000003', now(), now());

reset role;
select is(
  (select count(*)::int from turnos_inspetores where user_id = 'e0000000-0000-0000-0000-000000000003'),
  1,
  'INSPETOR_QUALIDADE não consegue inserir turno em nome de outro inspetor via RLS'
);

select * from finish();
rollback;
