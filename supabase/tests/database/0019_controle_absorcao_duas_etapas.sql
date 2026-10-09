-- Testes pgTAP — controle de absorção em duas etapas (20261009114451_controle_absorcao_duas_etapas.sql): a etapa 1
-- (EM_ANDAMENTO, aguardando_chiller2) só é completada por quem a abriu; os dados assinados na etapa 1 são imutáveis
-- (só chiller 02, observação e avaliação mudam) e a finalização exige o chiller 02 completo.

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e9000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'insp.a.abs@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e9000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'insp.b.abs@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e9000000-0000-0000-0000-000000000001', 'Insp A Abs', 'insp.a.abs.teste', 'T0090', 'INSPETOR_QUALIDADE', array['PRE_RESFRIAMENTO']),
  ('e9000000-0000-0000-0000-000000000002', 'Insp B Abs', 'insp.b.abs.teste', 'T0091', 'INSPETOR_QUALIDADE', array['PRE_RESFRIAMENTO']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f9000000-0000-0000-0000-000000000001', 'TEMP-ABS-TESTE', 1, 'Template Controle de Absorção', 'PAC-000', '[]'::jsonb);

-- Etapa 1 gravada pelo inspetor A: pré-chiller e chiller 1, sem o chiller 2.
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, status_ficha) values
  ('19000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 1, 'e9000000-0000-0000-0000-000000000001', 'PRE_RESFRIAMENTO',
   '{"campo":{"tempoPermanenciaMin":"15","temperaturas":{"preChiller":"12","chiller1":"3","chiller2":""},"borbulhamento":{"preChiller":"moderado","chiller1":"intenso","chiller2":""},"observacao":"","conformidade":true,"detalhesRNC":null},"aguardando_chiller2":true}'::jsonb,
   'EM_ANDAMENTO');

-- ---- inspetor B (mesmo setor, mas não é quem abriu): a RLS não deixa completar (0 linhas, sem erro)
select set_config('request.jwt.claims', json_build_object('sub', 'e9000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['PRE_RESFRIAMENTO'])::text, true);
set local role authenticated;
update monitoramentos set dados_dinamicos = jsonb_set(dados_dinamicos, '{campo,temperaturas,chiller2}', '"3"') where id = '19000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select dados_dinamicos #>> '{campo,temperaturas,chiller2}' from monitoramentos where id = '19000000-0000-0000-0000-000000000001'),
  '', 'outro inspetor não completa o chiller 02'
);

-- ---- inspetor A (dono)
select set_config('request.jwt.claims', json_build_object('sub', 'e9000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['PRE_RESFRIAMENTO'])::text, true);
set local role authenticated;

select throws_ok(
  $$update monitoramentos set dados_dinamicos = jsonb_set(dados_dinamicos, '{campo,temperaturas,preChiller}', '"5"') where id = '19000000-0000-0000-0000-000000000001'$$,
  'P0001', null, 'a temperatura do pré-chiller assinada na etapa 1 é imutável'
);
select throws_ok(
  $$update monitoramentos set status_ficha = 'FINALIZADO' where id = '19000000-0000-0000-0000-000000000001'$$,
  'P0001', null, 'não finaliza mantendo a marca de aguardando o chiller 02'
);
select throws_ok(
  $$update monitoramentos set dados_dinamicos = dados_dinamicos - 'aguardando_chiller2', status_ficha = 'FINALIZADO' where id = '19000000-0000-0000-0000-000000000001'$$,
  'P0001', null, 'não finaliza sem a temperatura e o borbulhamento do chiller 02'
);
select lives_ok(
  $$update monitoramentos set dados_dinamicos = (jsonb_set(jsonb_set(jsonb_set(dados_dinamicos, '{campo,temperaturas,chiller2}', '"3,5"'), '{campo,borbulhamento,chiller2}', '"moderado"'), '{campo,observacao}', '"ok"') - 'aguardando_chiller2') || '{"chiller2_completado":{"em":"agora"}}'::jsonb, status_ficha = 'FINALIZADO' where id = '19000000-0000-0000-0000-000000000001'$$,
  'o dono completa o chiller 02 e finaliza'
);
reset role;
select ok(
  (select status_ficha = 'FINALIZADO' and finalizado_em is not null from monitoramentos where id = '19000000-0000-0000-0000-000000000001'),
  'finalizado_em carimbado pelo servidor'
);

-- ---- a etapa 1 só vale com o chiller 02 faltando
select set_config('request.jwt.claims', json_build_object('sub', 'e9000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['PRE_RESFRIAMENTO'])::text, true);
set local role authenticated;
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, status_ficha) values ('f9000000-0000-0000-0000-000000000001', 1, 'e9000000-0000-0000-0000-000000000001', 'PRE_RESFRIAMENTO', '{"campo":{"tempoPermanenciaMin":"15","temperaturas":{"preChiller":"12","chiller1":"3","chiller2":"3"},"borbulhamento":{"preChiller":"moderado","chiller1":"intenso","chiller2":"moderado"}},"aguardando_chiller2":true}'::jsonb, 'EM_ANDAMENTO')$$,
  'P0001', null, 'aguardando o chiller 02 com ele já informado é recusado (assine normalmente)'
);
select lives_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, status_ficha) values ('f9000000-0000-0000-0000-000000000001', 1, 'e9000000-0000-0000-0000-000000000001', 'PRE_RESFRIAMENTO', '{"campo":{"tempoPermanenciaMin":"15","temperaturas":{"preChiller":"12","chiller1":"3","chiller2":""},"borbulhamento":{"preChiller":"moderado","chiller1":"intenso","chiller2":""}},"aguardando_chiller2":true}'::jsonb, 'EM_ANDAMENTO')$$,
  'etapa 1 sem o chiller 02 é aceita como em andamento'
);
reset role;

select * from finish();
rollback;
