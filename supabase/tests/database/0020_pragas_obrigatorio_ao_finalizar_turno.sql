-- Testes pgTAP — monitoramento de pragas obrigatório ao finalizar o turno
-- (20261010085329_pragas_obrigatorio_ao_finalizar_turno.sql): o inspetor não finaliza o PRÓPRIO turno sem o monitoramento de
-- pragas do dia (feito por ele ou por quem cobriu o setor); o job automático e a administração não são barrados.

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('ea000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'insp.a.pragas@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('ea000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'insp.b.pragas@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('ea000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin.pragas@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('ea000000-0000-0000-0000-000000000001', 'Insp A Pragas', 'insp.a.pragas.teste', 'T0100', 'INSPETOR_QUALIDADE', array['PRAGAS_TESTE']),
  ('ea000000-0000-0000-0000-000000000002', 'Insp B Pragas', 'insp.b.pragas.teste', 'T0101', 'INSPETOR_QUALIDADE', array['PRAGAS_TESTE']),
  ('ea000000-0000-0000-0000-000000000003', 'Admin Pragas', 'admin.pragas.teste', 'T0102', 'ADMIN_MASTER', array['PRAGAS_TESTE']);

-- Ficha de pragas do setor de teste e uma ficha comum (não deve ser cobrada).
insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos, locais_aplicacao) values
  ('fa000000-0000-0000-0000-000000000001', 'PRAGAS-TESTE', 1, 'Monitoramento de Pragas (teste)', 'PAC-000', '[{"chave":"p","tipo":"ocorrencia_pragas"}]'::jsonb, '["PRAGAS_TESTE"]'::jsonb),
  ('fa000000-0000-0000-0000-000000000002', 'COMUM-TESTE', 1, 'Ficha comum (teste)', 'PAC-000', '[{"chave":"x","tipo":"texto"}]'::jsonb, '["PRAGAS_TESTE"]'::jsonb);

-- Turnos abertos do inspetor A (um para cada cenário) e do B.
insert into turnos_inspetores (id, user_id, setor, inicio) values
  ('7a000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001', 'PRAGAS_TESTE', now() - interval '3 hours'),
  ('7a000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000002', 'PRAGAS_TESTE', now() - interval '3 hours');

-- ---- sem monitoramento de pragas: o inspetor A não finaliza o próprio turno
select set_config('request.jwt.claims', json_build_object('sub', 'ea000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['PRAGAS_TESTE'])::text, true);
set local role authenticated;
select throws_ok(
  $$update turnos_inspetores set fim = now() where id = '7a000000-0000-0000-0000-000000000001'$$,
  'P0001', null, 'sem o monitoramento de pragas do dia, o inspetor não finaliza o turno'
);
-- editar outro dado do turno (sem fechar) continua livre
select lives_ok(
  $$update turnos_inspetores set setor = 'PRAGAS_TESTE' where id = '7a000000-0000-0000-0000-000000000001'$$,
  'alterações que não fecham o turno não são barradas'
);
reset role;

-- ---- um monitoramento de OUTRA ficha não cumpre a exigência
insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos)
values ('fa000000-0000-0000-0000-000000000002', 1, 'ea000000-0000-0000-0000-000000000001', 'PRAGAS_TESTE', '{}'::jsonb);
select set_config('request.jwt.claims', json_build_object('sub', 'ea000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['PRAGAS_TESTE'])::text, true);
set local role authenticated;
select throws_ok(
  $$update turnos_inspetores set fim = now() where id = '7a000000-0000-0000-0000-000000000001'$$,
  'P0001', null, 'monitoramento de outra ficha não cumpre a exigência de pragas'
);
reset role;

-- ---- ainda sem pragas hoje: a administração e o job automático não são barrados
-- administração fecha o turno de outro inspetor sem a exigência
select set_config('request.jwt.claims', json_build_object('sub', 'ea000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'perfil', 'ADMIN_MASTER', 'setores_permitidos', array['PRAGAS_TESTE'])::text, true);
set local role authenticated;
select lives_ok(
  $$update turnos_inspetores set fim = now() where id = '7a000000-0000-0000-0000-000000000002'$$,
  'o administrador encerra o turno de outro inspetor mesmo sem o monitoramento de pragas'
);
reset role;

-- o job automático (sem usuário) também não é barrado
insert into turnos_inspetores (id, user_id, setor, inicio) values
  ('7a000000-0000-0000-0000-000000000003', 'ea000000-0000-0000-0000-000000000001', 'PRAGAS_TESTE', now() - interval '30 hours');
select set_config('request.jwt.claims', '', true);
select lives_ok(
  $$update turnos_inspetores set fim = now() where id = '7a000000-0000-0000-0000-000000000003'$$,
  'sem usuário (job automático) o turno é encerrado normalmente'
);

-- a função de apoio lista a ficha de pragas pendente
select is(
  (select count(*)::int from public.pragas_pendentes_do_turno(now() - interval '3 hours', array['PRAGAS_TESTE'])),
  1, 'a ficha de pragas do setor aparece como pendente; a ficha comum não'
);

-- ---- o inspetor B (mesmo setor) faz o monitoramento de pragas: cumpre para o A também
insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos)
values ('fa000000-0000-0000-0000-000000000001', 1, 'ea000000-0000-0000-0000-000000000002', 'PRAGAS_TESTE', '{}'::jsonb);
select set_config('request.jwt.claims', json_build_object('sub', 'ea000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['PRAGAS_TESTE'])::text, true);
set local role authenticated;
select lives_ok(
  $$update turnos_inspetores set fim = now() where id = '7a000000-0000-0000-0000-000000000001'$$,
  'com o monitoramento de pragas do dia (feito por quem cobriu o setor), o inspetor finaliza o turno'
);
reset role;

select * from finish();
rollback;
