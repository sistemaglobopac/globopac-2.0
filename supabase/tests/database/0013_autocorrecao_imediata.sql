-- Testes pgTAP — autocorrecao imediata (20261002000001_autocorrecao_imediata.sql): so o inspetor do
-- setor registra, so em monitoramento COM nao conformidade e ainda NAO verificado, uma por
-- monitoramento, append-only, e o verificador consegue ler.

create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e6000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'insp.auto@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e6000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'verif.auto@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e6000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'outro.insp.auto@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e6000000-0000-0000-0000-000000000001', 'Insp Auto', 'insp.auto.teste', 'T0060', 'INSPETOR_QUALIDADE', array['LINHA_DIF']),
  ('e6000000-0000-0000-0000-000000000002', 'Verif Auto', 'verif.auto.teste', 'T0061', 'VERIFICADOR', array['Todos']),
  ('e6000000-0000-0000-0000-000000000003', 'Outro Insp Auto', 'outro.auto.teste', 'T0062', 'INSPETOR_QUALIDADE', array['OUTRO_SETOR']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f6000000-0000-0000-0000-000000000001', 'TEMP-AUTO-TESTE', 1, 'Template Auto', 'PAC-000', '[]'::jsonb);

insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, verificado_por) values
  ('16000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001', 1, 'e6000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{"campo":{"conformidade":false}}'::jsonb, null),
  ('16000000-0000-0000-0000-000000000002', 'f6000000-0000-0000-0000-000000000001', 1, 'e6000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{"campo":{"conformidade":true}}'::jsonb, null),
  ('16000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000001', 1, 'e6000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{"campo":{"conformidade":false}}'::jsonb, 'e6000000-0000-0000-0000-000000000002'),
  ('16000000-0000-0000-0000-000000000004', 'f6000000-0000-0000-0000-000000000001', 1, 'e6000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{"campo":{"status":"nao-conforme"}}'::jsonb, null);

-- ---- inspetor do setor
select set_config('request.jwt.claims', json_build_object('sub', 'e6000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['LINHA_DIF'])::text, true);
set local role authenticated;

select lives_ok(
  $$insert into autocorrecoes_imediatas (monitoramento_id, user_id, descricao) values ('16000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', 'Equipamento ajustado na hora e produto reinspecionado')$$,
  'inspetor registra a autocorrecao de um monitoramento com nao conformidade'
);
select throws_ok(
  $$insert into autocorrecoes_imediatas (monitoramento_id, user_id, descricao) values ('16000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', 'Segunda autocorrecao para o mesmo monitoramento')$$,
  '23505', null, 'so uma autocorrecao por monitoramento'
);
select throws_ok(
  $$insert into autocorrecoes_imediatas (monitoramento_id, user_id, descricao) values ('16000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-000000000001', 'Monitoramento conforme nao precisa de autocorrecao')$$,
  '42501', null, 'monitoramento sem nao conformidade e recusado'
);
select throws_ok(
  $$insert into autocorrecoes_imediatas (monitoramento_id, user_id, descricao) values ('16000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-000000000001', 'Monitoramento ja verificado nao aceita autocorrecao')$$,
  '42501', null, 'monitoramento ja verificado e recusado'
);
select throws_ok(
  $$insert into autocorrecoes_imediatas (monitoramento_id, user_id, descricao) values ('16000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-000000000003', 'Tentando assinar como se fosse outro inspetor')$$,
  '42501', null, 'nao registra em nome de outro usuario'
);
select throws_ok(
  $$insert into autocorrecoes_imediatas (monitoramento_id, user_id, descricao) values ('16000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-000000000001', 'curta')$$,
  '23514', null, 'descricao curta demais e recusada'
);

-- ---- inspetor de OUTRO setor nao registra
select set_config('request.jwt.claims', json_build_object('sub', 'e6000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['OUTRO_SETOR'])::text, true);
select throws_ok(
  $$insert into autocorrecoes_imediatas (monitoramento_id, user_id, descricao) values ('16000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-000000000003', 'Inspetor de outro setor nao pode corrigir este monitoramento')$$,
  '42501', null, 'inspetor de outro setor e recusado'
);

-- ---- verificador le
select set_config('request.jwt.claims', json_build_object('sub', 'e6000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'VERIFICADOR', 'setores_permitidos', array['Todos'])::text, true);
select is((select count(*)::int from autocorrecoes_imediatas where monitoramento_id = '16000000-0000-0000-0000-000000000001'), 1, 'verificador enxerga a autocorrecao');
reset role;

-- ---- append-only
select throws_ok($$update autocorrecoes_imediatas set descricao = 'alterada depois da assinatura do relatorio'$$, 'P0001', null, 'autocorrecao e append-only (nao edita)');

select * from finish();
rollback;
