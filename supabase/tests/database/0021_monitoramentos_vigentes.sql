-- Testes pgTAP — monitoramentos_vigentes (20261013140413_monitoramentos_vigentes.sql): o adendo corrige o monitoramento sem
-- duplicá-lo. A visão devolve só a versão vigente; o original corrigido continua em `monitoramentos`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e9100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'vig.a@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e9100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'vig.b@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e9100000-0000-0000-0000-000000000001', 'Vig A', 'vig.a.teste', 'T0910', 'INSPETOR_QUALIDADE', array['SETOR_VIG']),
  ('e9100000-0000-0000-0000-000000000002', 'Vig B', 'vig.b.teste', 'T0911', 'INSPETOR_QUALIDADE', array['OUTRO_SETOR']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f9100000-0000-0000-0000-000000000001', 'TEMP-VIG', 1, 'Template Vigente', 'PAC-000', '[]'::jsonb);

-- Original (v0) com duas correções ligadas a ele (v1 e v2) e uma correção da correção (v3), mais um registro sem correção (v9).
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, criado_em) values
  ('19100000-0000-0000-0000-00000000000a', 'f9100000-0000-0000-0000-000000000001', 1, 'e9100000-0000-0000-0000-000000000001', 'SETOR_VIG', '{"v":0}', now() - interval '4 minutes'),
  ('19100000-0000-0000-0000-0000000000b0', 'f9100000-0000-0000-0000-000000000001', 1, 'e9100000-0000-0000-0000-000000000001', 'SETOR_VIG', '{"v":9}', now() - interval '5 minutes');
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de, criado_em) values
  ('19100000-0000-0000-0000-0000000000a1', 'f9100000-0000-0000-0000-000000000001', 1, 'e9100000-0000-0000-0000-000000000001', 'SETOR_VIG', '{"v":1}', '19100000-0000-0000-0000-00000000000a', now() - interval '3 minutes'),
  ('19100000-0000-0000-0000-0000000000a2', 'f9100000-0000-0000-0000-000000000001', 1, 'e9100000-0000-0000-0000-000000000001', 'SETOR_VIG', '{"v":2}', '19100000-0000-0000-0000-00000000000a', now() - interval '2 minutes'),
  ('19100000-0000-0000-0000-0000000000a3', 'f9100000-0000-0000-0000-000000000001', 1, 'e9100000-0000-0000-0000-000000000001', 'SETOR_VIG', '{"v":3}', '19100000-0000-0000-0000-0000000000a2', now() - interval '1 minute');

select is(
  (select count(*)::int from monitoramentos where id in ('19100000-0000-0000-0000-00000000000a', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a2', '19100000-0000-0000-0000-0000000000a3', '19100000-0000-0000-0000-0000000000b0')),
  5, 'o original e as correções continuam todos guardados em monitoramentos'
);
select is(
  (select count(*)::int from monitoramentos_vigentes where id = '19100000-0000-0000-0000-00000000000a'),
  0, 'o original corrigido não aparece na visão'
);
select is(
  (select count(*)::int from monitoramentos_vigentes where id = '19100000-0000-0000-0000-0000000000a1'),
  0, 'a correção mais antiga (irmã de outra mais recente) não aparece'
);
select is(
  (select count(*)::int from monitoramentos_vigentes where id = '19100000-0000-0000-0000-0000000000a2'),
  0, 'a correção que ganhou outra correção não aparece'
);
select is(
  (select dados_dinamicos ->> 'v' from monitoramentos_vigentes where id = '19100000-0000-0000-0000-0000000000a3'),
  '3', 'só a correção mais recente da cadeia aparece'
);
select is(
  (select count(*)::int from monitoramentos_vigentes where id = '19100000-0000-0000-0000-0000000000b0'),
  1, 'o registro sem correção aparece normalmente'
);

-- O que já foi liberado ao SIF nunca some (é o documento entregue à fiscalização): a correção entra como registro novo.
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, liberado_sif, liberado_em, criado_em) values
  ('19100000-0000-0000-0000-0000000000c0', 'f9100000-0000-0000-0000-000000000001', 1, 'e9100000-0000-0000-0000-000000000001', 'SETOR_VIG', '{"v":"lib"}', true, now(), now() - interval '10 minutes');
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de, criado_em) values
  ('19100000-0000-0000-0000-0000000000c1', 'f9100000-0000-0000-0000-000000000001', 1, 'e9100000-0000-0000-0000-000000000001', 'SETOR_VIG', '{"v":"lib-corrigido"}', '19100000-0000-0000-0000-0000000000c0', now() - interval '9 minutes');
select is(
  (select count(*)::int from monitoramentos_vigentes where id in ('19100000-0000-0000-0000-0000000000c0', '19100000-0000-0000-0000-0000000000c1')),
  2, 'o original liberado ao SIF não some da visão, mesmo com correção'
);

-- A RLS de monitoramentos continua valendo na visão: quem é de outro setor não enxerga nada.
select set_config('request.jwt.claims', json_build_object('sub', 'e9100000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['OUTRO_SETOR'])::text, true);
set local role authenticated;
select is(
  (select count(*)::int from monitoramentos_vigentes where setor = 'SETOR_VIG'),
  0, 'inspetor de outro setor não vê os monitoramentos pela visão'
);
reset role;

select * from finish();
rollback;
