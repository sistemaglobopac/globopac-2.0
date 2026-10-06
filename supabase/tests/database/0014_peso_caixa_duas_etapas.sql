-- Testes pgTAP — peso por caixa em duas etapas (20261006140000_peso_caixa_duas_etapas.sql): a etapa 1
-- (EM_ANDAMENTO, aguardando_peso) pode ser completada por qualquer inspetor do MESMO setor, mas os dados
-- assinados na etapa 1 sao imutaveis (so peso medio e avaliacao mudam) e a finalizacao exige todos os pesos.

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e7000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'insp.a.peso@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e7000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'insp.b.peso@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e7000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'insp.c.peso@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e7000000-0000-0000-0000-000000000001', 'Insp A Peso', 'insp.a.peso.teste', 'T0070', 'INSPETOR_QUALIDADE', array['BEM_ESTAR']),
  ('e7000000-0000-0000-0000-000000000002', 'Insp B Peso', 'insp.b.peso.teste', 'T0071', 'INSPETOR_QUALIDADE', array['BEM_ESTAR']),
  ('e7000000-0000-0000-0000-000000000003', 'Insp C Peso', 'insp.c.peso.teste', 'T0072', 'INSPETOR_QUALIDADE', array['OUTRO_SETOR']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f7000000-0000-0000-0000-000000000001', 'TEMP-PESO-TESTE', 1, 'Template Peso', 'PAC-000', '[]'::jsonb);

-- Etapa 1 gravada pelo inspetor A: uma carga com peso, outra aguardando a balanca.
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, status_ficha) values
  ('17000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 1, 'e7000000-0000-0000-0000-000000000001', 'BEM_ESTAR',
   '{"campo":{"cargas":[{"cargaId":"a","gta":"1","avesPorCaixa":"10","pesoMedioKg":"2,8"},{"cargaId":"b","gta":"2","avesPorCaixa":"12","pesoMedioKg":""}],"conformidade":true,"detalhesRNC":null},"aguardando_peso":true}'::jsonb,
   'EM_ANDAMENTO');

-- ---- inspetor de OUTRO setor tenta completar: a RLS filtra a linha (0 linhas, sem erro). A conferencia vem
-- depois, como inspetor B (o inspetor C nem enxerga o registro).
select set_config('request.jwt.claims', json_build_object('sub', 'e7000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['OUTRO_SETOR'])::text, true);
set local role authenticated;
update monitoramentos set dados_dinamicos = jsonb_set(dados_dinamicos, '{campo,cargas,1,pesoMedioKg}', '"2,9"') where id = '17000000-0000-0000-0000-000000000001';

-- ---- inspetor B, do MESMO setor (nao e quem abriu), completa
select set_config('request.jwt.claims', json_build_object('sub', 'e7000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['BEM_ESTAR'])::text, true);

select is(
  (select dados_dinamicos #>> '{campo,cargas,1,pesoMedioKg}' from monitoramentos where id = '17000000-0000-0000-0000-000000000001'),
  '', 'inspetor de outro setor nao completou o peso'
);
select throws_ok(
  $$update monitoramentos set dados_dinamicos = jsonb_set(dados_dinamicos, '{campo,cargas,0,avesPorCaixa}', '"99"') where id = '17000000-0000-0000-0000-000000000001'$$,
  'P0001', null, 'dados assinados na etapa 1 (aves por caixa) sao imutaveis'
);
select throws_ok(
  $$update monitoramentos set status_ficha = 'FINALIZADO' where id = '17000000-0000-0000-0000-000000000001'$$,
  'P0001', null, 'nao finaliza mantendo a marca de aguardando peso'
);
select throws_ok(
  $$update monitoramentos set dados_dinamicos = dados_dinamicos - 'aguardando_peso', status_ficha = 'FINALIZADO' where id = '17000000-0000-0000-0000-000000000001'$$,
  'P0001', null, 'nao finaliza com carga sem peso'
);
select lives_ok(
  $$update monitoramentos set dados_dinamicos = jsonb_set(dados_dinamicos, '{campo,cargas,1,pesoMedioKg}', '"2,9"') where id = '17000000-0000-0000-0000-000000000001'$$,
  'inspetor do mesmo setor completa o peso (parcial, ainda em andamento)'
);
select lives_ok(
  $$update monitoramentos set dados_dinamicos = (dados_dinamicos - 'aguardando_peso') || '{"peso_completado":{"em":"agora"}}'::jsonb, status_ficha = 'FINALIZADO' where id = '17000000-0000-0000-0000-000000000001'$$,
  'finaliza com todos os pesos e a marca retirada'
);
select ok(
  (select status_ficha = 'FINALIZADO' and finalizado_em is not null from monitoramentos where id = '17000000-0000-0000-0000-000000000001'),
  'finalizado_em carimbado pelo servidor'
);

-- ---- etapa 1 so vale com peso faltando
select set_config('request.jwt.claims', json_build_object('sub', 'e7000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['BEM_ESTAR'])::text, true);
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, status_ficha) values ('f7000000-0000-0000-0000-000000000001', 1, 'e7000000-0000-0000-0000-000000000001', 'BEM_ESTAR', '{"campo":{"cargas":[{"cargaId":"a","avesPorCaixa":"10","pesoMedioKg":"2,8"}]},"aguardando_peso":true}'::jsonb, 'EM_ANDAMENTO')$$,
  'P0001', null, 'aguardando peso com todos os pesos informados e recusado (assine normalmente)'
);
reset role;

select * from finish();
rollback;
