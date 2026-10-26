-- Testes pgTAP — propagação da correção refaz a conformidade do campo de vazão (20261024100000_propagacao_refaz_conformidade_vazao.sql).
-- Caso real: o Chiller 2 Partes das 11:50 herdou a leitura anterior errada (22057) e ficou gravado NÃO CONFORME (−21904 L/kg); depois da
-- correção a leitura anterior virou 445, mas o selo e o texto da RNC continuavam os do cálculo antigo.

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e9270000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'vazao.a@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e9270000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'vazao.b@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e9270000-0000-0000-0000-000000000001', 'Vazao A', 'vazao.a.teste', 'T0970', 'INSPETOR_QUALIDADE', array['SETOR_VAZAO']),
  ('e9270000-0000-0000-0000-000000000002', 'Vazao B', 'vazao.b.teste', 'T0971', 'INSPETOR_QUALIDADE', array['SETOR_VAZAO']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f9270000-0000-0000-0000-000000000001', 'TEMP-VAZAO', 1, 'Template Vazão', 'PAC-000', '[]'::jsonb);

-- A corrigiu por adendo a leitura atual do chiller 2 de 22057 para 445. B fez o monitoramento seguinte herdando 22057 e ficou NÃO CONFORME.
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, hora_monitoramento, criado_em) values
  ('29270000-0000-0000-0000-0000000000a0', 'f9270000-0000-0000-0000-000000000001', 1, 'e9270000-0000-0000-0000-000000000001', 'SETOR_VAZAO',
    '{"campo_1":{"tanques":{"chiller1":{"prev":"22061","cur":"22063","ice":"332"},"chiller2":{"prev":"430","cur":"445","ice":"332"}},"totalCondenacoes":562,"pesoMedioCarcaca":2.507,"conformidade":true,"detalhesRNC":null},
      "adendos":[{"id":"a9270000-0000-0000-0000-000000000001","status":"completed","corrections":{"campo_1.tanques.chiller2.cur":{"old":"22057","new":"445"}}}]}',
    '2026-10-23T11:52:00Z', '2026-10-23T11:53:00Z'),
  ('29270000-0000-0000-0000-0000000000b0', 'f9270000-0000-0000-0000-000000000001', 1, 'e9270000-0000-0000-0000-000000000002', 'SETOR_VAZAO',
    '{"campo_1":{"tanques":{"chiller1":{"prev":"22061","cur":"22063","ice":"332"},"chiller2":{"prev":"22057","cur":"00457","ice":"332"}},"totalCondenacoes":562,"pesoMedioCarcaca":2.507,"conformidade":false,
      "detalhesRNC":"Vazão Insuficiente (Partes): Chiller 2 Partes (Apurado: -21904.564L/kg | Meta: 1.500L/kg)"}}',
    '2026-10-23T15:50:00Z', '2026-10-23T15:51:00Z');

-- Funções puras: o veredito sai dos valores gravados.
select is(
  public.refazer_conformidade_vazao('{"tanques":{"chiller1":{"prev":"22061","cur":"22063","ice":"332"},"chiller2":{"prev":"445","cur":"00457","ice":"332"}},"totalCondenacoes":562,"pesoMedioCarcaca":2.507}'::jsonb) ->> 'conformidade',
  'true', 'Partes com a leitura anterior certa (445): conforme'
);
select is(
  public.refazer_conformidade_vazao('{"tanques":{"chiller1":{"prev":"22061","cur":"22063","ice":"332"},"chiller2":{"prev":"445","cur":"00457","ice":"332"}},"totalCondenacoes":562,"pesoMedioCarcaca":2.507}'::jsonb) -> 'detalhesRNC',
  'null'::jsonb, 'sem desvio, o texto da RNC some'
);
select alike(
  public.refazer_conformidade_vazao('{"tanques":{"chiller1":{"prev":"22061","cur":"22063","ice":"332"},"chiller2":{"prev":"22057","cur":"00457","ice":"332"}},"totalCondenacoes":562,"pesoMedioCarcaca":2.507}'::jsonb) ->> 'detalhesRNC',
  'Vazão Insuficiente (Partes): Chiller 2 Partes (Apurado: -21900.720L/kg%', 'com a leitura errada, o desvio é apontado'
);
select is(
  public.refazer_conformidade_vazao('{"x":1}'::jsonb), '{"x":1}'::jsonb, 'valor que não é de vazão volta como estava'
);

-- Pelo dono do monitoramento corrigido: o aditivo do seguinte sai conforme (o caminho do administrador é o mesmo: só muda quem chama).
select set_config('request.jwt.claims', json_build_object('sub', 'e9270000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['SETOR_VAZAO'])::text, true);
set local role authenticated;
select isnt(
  public.propagar_leitura_adendo('29270000-0000-0000-0000-0000000000a0', 'a9270000-0000-0000-0000-000000000001', '29270000-0000-0000-0000-0000000000b0', '[{"caminho":"campo_1.tanques.chiller2.prev"}]'::jsonb),
  null, 'a propagação grava o aditivo do seguinte'
);
reset role;

select is(
  (select dados_dinamicos -> 'campo_1' -> 'tanques' -> 'chiller2' ->> 'prev' from monitoramentos where aditivo_de = '29270000-0000-0000-0000-0000000000b0'),
  '445', 'a leitura anterior do seguinte foi acertada'
);
select is(
  (select dados_dinamicos -> 'campo_1' ->> 'conformidade' from monitoramentos where aditivo_de = '29270000-0000-0000-0000-0000000000b0'),
  'true', 'e a conformidade do campo foi refeita (deixou de ser NÃO CONFORME)'
);
select is(
  (select dados_dinamicos -> 'campo_1' -> 'detalhesRNC' from monitoramentos where aditivo_de = '29270000-0000-0000-0000-0000000000b0'),
  'null'::jsonb, 'e o texto "Vazão Insuficiente" gravado foi limpo'
);

select * from finish();
rollback;
