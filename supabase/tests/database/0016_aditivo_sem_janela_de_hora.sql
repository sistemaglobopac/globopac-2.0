-- Testes pgTAP — o aditivo (adendo assinado) herda a hora do original sem a janela de assinatura (72 h)
-- (20261006180000_aditivo_sem_janela_de_hora.sql); um monitoramento NOVO com hora antiga continua recusado.

create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e9100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'insp.aditivo@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());
insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos)
values ('e9100000-0000-0000-0000-000000000001', 'Insp Aditivo', 'insp.aditivo.teste', 'T0100', 'INSPETOR_QUALIDADE', array['S1']);
insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f9100000-0000-0000-0000-000000000001', 'TEMP-ADITIVO', 1, 'Template Aditivo', 'PAC-000', '[]'::jsonb);

-- Original feito ha 4 dias (alem do prazo de 72 h) (a hora so e validada ao inserir; aqui entra sem hora e recebe a antiga por update).
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos) values
  ('19100000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 1, 'e9100000-0000-0000-0000-000000000001', 'S1', '{"campo":1}'::jsonb);
update monitoramentos
set dados_dinamicos = jsonb_build_object('campo', 1, 'hora_monitoramento', to_char((now() - interval '4 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
where id = '19100000-0000-0000-0000-000000000001';

select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos) values ('f9100000-0000-0000-0000-000000000001', 1, 'e9100000-0000-0000-0000-000000000001', 'S1', jsonb_build_object('campo', 2, 'hora_monitoramento', to_char((now() - interval '4 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))$$,
  'P0001', null, 'monitoramento NOVO com hora de 4 dias atras continua recusado'
);
select lives_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de)
    select ficha_template_id, versao_template, user_id, setor, dados_dinamicos || '{"adendos":[{"id":"a1","status":"completed"}]}'::jsonb, id
    from monitoramentos where id = '19100000-0000-0000-0000-000000000001'$$,
  'o aditivo (adendo assinado) de um registro antigo e aceito, com a hora do original'
);
select ok(
  (select hora_monitoramento is not null and hora_monitoramento < now() - interval '2 days' from monitoramentos where aditivo_de = '19100000-0000-0000-0000-000000000001'),
  'o aditivo guarda a hora do original na coluna'
);
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos) values ('f9100000-0000-0000-0000-000000000001', 1, 'e9100000-0000-0000-0000-000000000001', 'S1', jsonb_build_object('campo', 3, 'hora_monitoramento', to_char((now() + interval '2 hours') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))$$,
  'P0001', null, 'hora futura em monitoramento novo continua recusada'
);

select * from finish();
rollback;
