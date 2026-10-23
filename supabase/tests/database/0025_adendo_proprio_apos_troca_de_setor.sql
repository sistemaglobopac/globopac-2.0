-- Testes pgTAP — adendo próprio depois da troca de setor (20261020135045_adendo_proprio_apos_troca_de_setor.sql):
-- o inspetor que trocou de setor lê e assina SÓ o adendo endereçado a ele, num registro dele do setor de origem, e nada além disso.

create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('ea250000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'adendo.a@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('ea250000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'adendo.b@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

-- A trocou do setor de origem para o novo: o JWT dele só traz o setor novo.
insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('ea250000-0000-0000-0000-000000000001', 'Adendo A', 'adendo.a.teste', 'T0950', 'INSPETOR_QUALIDADE', array['SETOR_NOVO']),
  ('ea250000-0000-0000-0000-000000000002', 'Adendo B', 'adendo.b.teste', 'T0951', 'INSPETOR_QUALIDADE', array['SETOR_ORIGEM']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('fa250000-0000-0000-0000-000000000001', 'TEMP-ADENDO', 1, 'Template Adendo', 'PAC-000', '[]'::jsonb);

insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, hora_monitoramento, criado_em) values
  -- (1) de A, setor de origem, com adendo pendente endereçado a A
  ('2a250000-0000-0000-0000-0000000000a1', 'fa250000-0000-0000-0000-000000000001', 1, 'ea250000-0000-0000-0000-000000000001', 'SETOR_ORIGEM',
    '{"campo_1":{"v":"10"},"adendos":[{"id":"aa250000-0000-0000-0000-000000000001","status":"pending_monitor","monitorId":"ea250000-0000-0000-0000-000000000001","corrections":{"campo_1.v":{"old":"10","new":"11"}}}]}',
    '2026-10-16T12:00:00Z', '2026-10-16T12:05:00Z'),
  -- (2) de A, setor de origem, SEM adendo
  ('2a250000-0000-0000-0000-0000000000a2', 'fa250000-0000-0000-0000-000000000001', 1, 'ea250000-0000-0000-0000-000000000001', 'SETOR_ORIGEM',
    '{"campo_1":{"v":"20"}}', '2026-10-16T13:00:00Z', '2026-10-16T13:05:00Z'),
  -- (3) de B, mesmo setor, com adendo endereçado a B
  ('2a250000-0000-0000-0000-0000000000b1', 'fa250000-0000-0000-0000-000000000001', 1, 'ea250000-0000-0000-0000-000000000002', 'SETOR_ORIGEM',
    '{"campo_1":{"v":"30"},"adendos":[{"id":"aa250000-0000-0000-0000-000000000002","status":"pending_monitor","monitorId":"ea250000-0000-0000-0000-000000000002","corrections":{}}]}',
    '2026-10-16T14:00:00Z', '2026-10-16T14:05:00Z');

select set_config('request.jwt.claims', json_build_object('sub', 'ea250000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['SETOR_NOVO'])::text, true);
set local role authenticated;

-- Leitura
select is(
  (select count(*)::int from monitoramentos where id = '2a250000-0000-0000-0000-0000000000a1'),
  1, 'A lê o registro dele, do setor de origem, que tem adendo endereçado a ele'
);
select is(
  (select count(*)::int from monitoramentos where id = '2a250000-0000-0000-0000-0000000000a2'),
  0, 'A continua sem ver o registro dele do setor de origem que não tem adendo'
);
select is(
  (select count(*)::int from monitoramentos where id = '2a250000-0000-0000-0000-0000000000b1'),
  0, 'A não vê o registro de B, mesmo com adendo (o adendo é de B)'
);

-- Gravação
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de)
    values ('fa250000-0000-0000-0000-000000000001', 1, 'ea250000-0000-0000-0000-000000000001', 'SETOR_ORIGEM', '{"campo_1":{"v":"21"}}', '2a250000-0000-0000-0000-0000000000a2')$$,
  '42501', null, 'A não grava aditivo numa cadeia dele sem adendo pendente'
);
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de)
    values ('fa250000-0000-0000-0000-000000000001', 1, 'ea250000-0000-0000-0000-000000000001', 'SETOR_ORIGEM', '{"campo_1":{"v":"31"}}', '2a250000-0000-0000-0000-0000000000b1')$$,
  '42501', null, 'A não grava aditivo na cadeia de B'
);
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos)
    values ('fa250000-0000-0000-0000-000000000001', 1, 'ea250000-0000-0000-0000-000000000001', 'SETOR_ORIGEM', '{"campo_1":{"v":"99"}}')$$,
  '42501', null, 'A não cria monitoramento novo no setor de origem (só aditivo de adendo)'
);
select lives_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de)
    values ('fa250000-0000-0000-0000-000000000001', 1, 'ea250000-0000-0000-0000-000000000001', 'SETOR_ORIGEM',
      '{"campo_1":{"v":"11"},"adendos":[{"id":"aa250000-0000-0000-0000-000000000001","status":"completed","monitorId":"ea250000-0000-0000-0000-000000000001","corrections":{"campo_1.v":{"old":"10","new":"11"}}}]}',
      '2a250000-0000-0000-0000-0000000000a1')$$,
  'A assina o adendo pendente dele: grava o aditivo no setor de origem'
);
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de)
    values ('fa250000-0000-0000-0000-000000000001', 1, 'ea250000-0000-0000-0000-000000000001', 'SETOR_ORIGEM', '{"campo_1":{"v":"12"}}', '2a250000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'depois de assinado não há mais adendo pendente: nova gravação na cadeia é recusada'
);

reset role;
select is(
  (select count(*)::int from monitoramentos where aditivo_de = '2a250000-0000-0000-0000-0000000000a1'),
  1, 'só o aditivo da assinatura foi gravado'
);

select * from finish();
rollback;
