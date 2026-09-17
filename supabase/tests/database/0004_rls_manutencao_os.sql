-- Testes pgTAP — Fase 5: RLS de manutencao_os por setor (bug fix — ver migration
-- 20260920000001_fase5_manutencao_os.sql) e imutabilidade após liberação ao SIF.
--
-- Técnica idêntica a 0002_rls_monitoramentos.sql: simula o JWT de cada perfil via
-- set_config('request.jwt.claims', ...) + `set local role authenticated`.
-- Executar com: supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(5);

-- ------------------------------------------------------------------------------------------
-- Fixtures.
-- ------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pcm.manutencao@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pcm.outra.area@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin.fase5@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'sif.fase5@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, nivel_acesso, setores_permitidos) values
  ('f0000000-0000-0000-0000-000000000001', 'PCM Manutenção', 'pcm.manutencao.teste', 'INSPETOR_PCM', array['MANUTENCAO']),
  ('f0000000-0000-0000-0000-000000000002', 'PCM Outra Área', 'pcm.outra.teste', 'INSPETOR_PCM', array['OUTRA_AREA']);

insert into manutencao_os (id, descricao, setor, aberto_por, status)
values ('90000000-0000-0000-0000-000000000001', 'Troca de rolamento', 'MANUTENCAO', 'f0000000-0000-0000-0000-000000000001', 'ABERTURA');

-- ------------------------------------------------------------------------------------------
-- 1) BUG FIX: INSPETOR_PCM de OUTRA_AREA não pode avançar etapa de uma OS de MANUTENCAO —
-- antes desta migration, manutencao_os_update não verificava setor, e este UPDATE teria
-- afetado a linha (só checava tem_permissao, que INSPETOR_PCM tem independente do setor).
-- ------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object(
  'sub', 'f0000000-0000-0000-0000-000000000002',
  'role', 'authenticated',
  'perfil', 'INSPETOR_PCM',
  'setores_permitidos', array['OUTRA_AREA']
)::text, true);
set local role authenticated;

update manutencao_os set status = 'AUTORIZACAO', autorizado_por = 'f0000000-0000-0000-0000-000000000002'
 where id = '90000000-0000-0000-0000-000000000001';

-- reset role antes de conferir: o próprio ator de teste (setor OUTRA_AREA) não tem
-- permissão de SELECT sobre uma OS de MANUTENCAO (mesma policy que bloqueou o UPDATE) — a
-- verificação precisa ler como superusuário, ignorando RLS, não através da mesma visão
-- restrita que estamos testando.
reset role;
select is(
  (select status::text from manutencao_os where id = '90000000-0000-0000-0000-000000000001'),
  'ABERTURA',
  'INSPETOR_PCM de outro setor não avança etapa de OS de MANUTENCAO — RLS por setor (bug fix Fase 5)'
);

-- ------------------------------------------------------------------------------------------
-- 2) INSPETOR_PCM do próprio setor (MANUTENCAO) avança a etapa normalmente.
-- ------------------------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'f0000000-0000-0000-0000-000000000001',
  'role', 'authenticated',
  'perfil', 'INSPETOR_PCM',
  'setores_permitidos', array['MANUTENCAO']
)::text, true);
set local role authenticated;

update manutencao_os set status = 'AUTORIZACAO', autorizado_por = 'f0000000-0000-0000-0000-000000000001'
 where id = '90000000-0000-0000-0000-000000000001';

select is(
  (select status::text from manutencao_os where id = '90000000-0000-0000-0000-000000000001'),
  'AUTORIZACAO',
  'INSPETOR_PCM do próprio setor (MANUTENCAO) avança a etapa normalmente'
);

-- ------------------------------------------------------------------------------------------
-- 3) Imutabilidade após liberação ao SIF (mesmo princípio de monitoramentos).
-- ------------------------------------------------------------------------------------------
reset role;
update manutencao_os set status = 'CONCLUIDA', concluido_em = now() where id = '90000000-0000-0000-0000-000000000001';
update manutencao_os set liberado_sif = true, liberado_em = now() where id = '90000000-0000-0000-0000-000000000001';

select throws_matching(
  $$ update manutencao_os set descricao = 'tentativa de edição' where id = '90000000-0000-0000-0000-000000000001' $$,
  '^OS .* já foi liberada ao SIF',
  'OS liberada ao SIF é imutável: UPDATE deve ser bloqueado por trigger de banco'
);

-- ------------------------------------------------------------------------------------------
-- 4) ADMIN_MASTER sempre pode avançar etapa, independente de setor.
-- ------------------------------------------------------------------------------------------
insert into perfis_usuarios (id, nome_completo, nome_usuario, nivel_acesso, setores_permitidos) values
  ('f0000000-0000-0000-0000-000000000003', 'Admin', 'admin.fase5.teste', 'ADMIN_MASTER', array[]::text[]);
insert into manutencao_os (id, descricao, setor, aberto_por, status)
values ('90000000-0000-0000-0000-000000000002', 'Lubrificação preventiva', 'MANUTENCAO', 'f0000000-0000-0000-0000-000000000001', 'ABERTURA');

select set_config('request.jwt.claims', json_build_object(
  'sub', 'f0000000-0000-0000-0000-000000000003',
  'role', 'authenticated',
  'perfil', 'ADMIN_MASTER',
  'setores_permitidos', array[]::text[]
)::text, true);
set local role authenticated;

update manutencao_os set status = 'AUTORIZACAO', autorizado_por = 'f0000000-0000-0000-0000-000000000003'
 where id = '90000000-0000-0000-0000-000000000002';

select is(
  (select status::text from manutencao_os where id = '90000000-0000-0000-0000-000000000002'),
  'AUTORIZACAO',
  'ADMIN_MASTER avança etapa de qualquer OS, independente de setor'
);

-- ------------------------------------------------------------------------------------------
-- 5) BUG FIX: INSPECAO_FEDERAL só enxerga OS já liberada ao SIF, nunca a que está em
-- andamento (mesma regra já aplicada a monitoramentos_select).
-- ------------------------------------------------------------------------------------------
reset role;
insert into perfis_usuarios (id, nome_completo, nome_usuario, nivel_acesso, setores_permitidos) values
  ('f0000000-0000-0000-0000-000000000004', 'SIF', 'sif.fase5.teste', 'INSPECAO_FEDERAL', array[]::text[]);

select set_config('request.jwt.claims', json_build_object(
  'sub', 'f0000000-0000-0000-0000-000000000004',
  'role', 'authenticated',
  'perfil', 'INSPECAO_FEDERAL',
  'setores_permitidos', array[]::text[]
)::text, true);
set local role authenticated;

-- Das duas OS fixture, só a primeira foi liberada ao SIF (passo 3 acima); a segunda segue em
-- AUTORIZACAO, não liberada — INSPECAO_FEDERAL deve enxergar só a primeira.
select is(
  (select count(*)::int from manutencao_os),
  1,
  'INSPECAO_FEDERAL só vê a OS já liberada ao SIF, não a que está em andamento'
);

select * from finish();
rollback;
