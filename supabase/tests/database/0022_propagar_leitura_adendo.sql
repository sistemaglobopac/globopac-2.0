-- Testes pgTAP — propagar_leitura_adendo (20261014100000_propagar_leitura_adendo.sql): a correção de leitura de um adendo assinado
-- acerta a leitura anterior do monitoramento SEGUINTE, mesmo sendo de outro inspetor, e só nisso.

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e9200000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'prop.a@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e9200000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'prop.b@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e9200000-0000-0000-0000-000000000001', 'Prop A', 'prop.a.teste', 'T0920', 'INSPETOR_QUALIDADE', array['SETOR_PROP']),
  ('e9200000-0000-0000-0000-000000000002', 'Prop B', 'prop.b.teste', 'T0921', 'INSPETOR_QUALIDADE', array['SETOR_PROP']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f9200000-0000-0000-0000-000000000001', 'TEMP-PROP', 1, 'Template Propagação', 'PAC-000', '[]'::jsonb);

-- A (inspetor das 8h) corrigiu por adendo a leitura atual do chiller 1 de 100 para 104. B fez o monitoramento seguinte (12h, mesmo turno)
-- herdando 100 como leitura anterior; há também um monitoramento de outro dia, que não pode ser tocado.
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, hora_monitoramento) values
  ('29200000-0000-0000-0000-0000000000a0', 'f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'SETOR_PROP',
    '{"hora_monitoramento":"2026-10-10T12:00:00Z","campo_1":{"tanques":{"chiller1":{"prev":"90","cur":"104"}}},
      "adendos":[{"id":"a9200000-0000-0000-0000-000000000001","status":"completed","corrections":{"campo_1.tanques.chiller1.cur":{"old":"100","new":"104"}}}]}',
    '2026-10-10T12:00:00Z'),
  ('29200000-0000-0000-0000-0000000000b0', 'f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000002', 'SETOR_PROP',
    '{"hora_monitoramento":"2026-10-10T16:00:00Z","campo_1":{"tanques":{"chiller1":{"prev":"100","cur":"110"}}}}',
    '2026-10-10T16:00:00Z'),
  ('29200000-0000-0000-0000-0000000000c0', 'f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000002', 'SETOR_PROP',
    '{"hora_monitoramento":"2026-10-11T16:00:00Z","campo_1":{"tanques":{"chiller1":{"prev":"100","cur":"120"}}}}',
    '2026-10-11T16:00:00Z');

-- Como o dono do monitoramento corrigido (A): propaga para o seguinte de B.
select set_config('request.jwt.claims', json_build_object('sub', 'e9200000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['SETOR_PROP'])::text, true);
set local role authenticated;

select throws_like(
  $$select public.propagar_leitura_adendo('29200000-0000-0000-0000-0000000000a0', 'a9200000-0000-0000-0000-000000000001', '29200000-0000-0000-0000-0000000000b0', '[{"caminho":"campo_1.tanques.chiller1.cur"}]'::jsonb)$$,
  '%Caminho de leitura inválido%', 'só a leitura anterior (prev) pode ser acertada'
);

select isnt(
  public.propagar_leitura_adendo('29200000-0000-0000-0000-0000000000a0', 'a9200000-0000-0000-0000-000000000001', '29200000-0000-0000-0000-0000000000b0', '[{"caminho":"campo_1.tanques.chiller1.prev"}]'::jsonb),
  null, 'o dono do corrigido propaga para o monitoramento seguinte de outro inspetor'
);

select throws_like(
  $$select public.propagar_leitura_adendo('29200000-0000-0000-0000-0000000000a0', 'a9200000-0000-0000-0000-000000000001', '29200000-0000-0000-0000-0000000000b0', '[{"caminho":"campo_1.tanques.chiller1.prev"}]'::jsonb)$$,
  '%versão mais recente%', 'repetir a propagação no seguinte já corrigido é recusado'
);
select throws_like(
  $$select public.propagar_leitura_adendo('29200000-0000-0000-0000-0000000000a0', 'a9200000-0000-0000-0000-000000000001', '29200000-0000-0000-0000-0000000000c0', '[{"caminho":"campo_1.tanques.chiller1.prev"}]'::jsonb)$$,
  '%mesmo dia e turno%', 'monitoramento de outro dia não é alterado'
);

-- Quem não é o dono do monitoramento corrigido não pode propagar.
select set_config('request.jwt.claims', json_build_object('sub', 'e9200000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['SETOR_PROP'])::text, true);
select throws_like(
  $$select public.propagar_leitura_adendo('29200000-0000-0000-0000-0000000000a0', 'a9200000-0000-0000-0000-000000000001', '29200000-0000-0000-0000-0000000000c0', '[{"caminho":"campo_1.tanques.chiller1.prev"}]'::jsonb)$$,
  '%dono do monitoramento corrigido%', 'outro inspetor não propaga a correção que não é dele'
);
reset role;

select is(
  (select dados_dinamicos -> 'campo_1' -> 'tanques' -> 'chiller1' ->> 'prev' from monitoramentos where aditivo_de = '29200000-0000-0000-0000-0000000000b0'),
  '104', 'o aditivo do seguinte traz a leitura anterior corrigida (104), no nome do dono dele'
);
select is(
  (select user_id::text from monitoramentos where aditivo_de = '29200000-0000-0000-0000-0000000000b0'),
  'e9200000-0000-0000-0000-000000000002', 'o aditivo é gravado em nome do dono do seguinte (B)'
);
select is(
  (select dados_dinamicos -> 'campo_1' -> 'tanques' -> 'chiller1' ->> 'prev' from monitoramentos where id = '29200000-0000-0000-0000-0000000000b0'),
  '100', 'o monitoramento original do seguinte não é alterado (fica no histórico)'
);

select * from finish();
rollback;
