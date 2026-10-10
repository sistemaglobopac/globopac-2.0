-- Testes pgTAP — prazo de assinatura de 7 dias (20261010063259_prazo_assinatura_7_dias.sql), que substituiu a regra de
-- contingência de queda de rede (20261007120000): a janela é única e a marca fora_do_prazo_offline não é mais definida.

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e9200000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'insp.contingencia@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());
insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos)
values ('e9200000-0000-0000-0000-000000000001', 'Insp Contingencia', 'insp.contingencia.teste', 'T0200', 'INSPETOR_QUALIDADE', array['S1']);
insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f9200000-0000-0000-0000-000000000001', 'TEMP-CONTING', 1, 'Template Contingencia', 'PAC-000', '[]'::jsonb);

-- Dentro de 7 dias: aceito, sem precisar de confirmação offline nem de aviso de aparelho.
select lives_ok(
  $$insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos)
    values ('19200001-0000-0000-0000-000000000001', 'f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 1, 'hora_monitoramento', to_char((now() - interval '5 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))$$,
  'registro de 5 dias atrás é aceito (prazo de 7 dias)'
);
select lives_ok(
  $$insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos)
    values ('19200002-0000-0000-0000-000000000001', 'f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 2, 'hora_monitoramento', to_char((now() - interval '160 hours') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))$$,
  'registro de 160 h atrás é aceito'
);

-- Passou de 7 dias: recusado.
select throws_ok(
  $$insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos)
    values ('19200003-0000-0000-0000-000000000001', 'f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 3, 'hora_monitoramento', to_char((now() - interval '8 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))$$,
  'P0001', null, 'passou de 7 dias: recusado'
);

-- A marca nunca vem do cliente e não é mais definida pelo servidor.
select lives_ok(
  $$insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, fora_do_prazo_offline)
    values ('19200004-0000-0000-0000-000000000001', 'f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 4, 'hora_monitoramento', to_char((now() - interval '1 hour') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            true)$$,
  'registro recente segue aceito'
);
select is(
  (select fora_do_prazo_offline from monitoramentos where id = '19200004-0000-0000-0000-000000000001'),
  false, 'a marca fora_do_prazo_offline enviada pelo cliente é sobrescrita'
);

-- Aviso de contato: só o servidor grava, e o usuário não consegue inserir direto.
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e9200000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE',
  'setores_permitidos', array['S1'])::text, true);
set local role authenticated;

select throws_ok(
  $$insert into contatos_dispositivo (user_id, dispositivo_id) values ('e9200000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d')$$,
  '42501', null, 'o usuário não grava contato direto na tabela'
);
select lives_ok(
  $$select public.registrar_contato_dispositivo('d0000000-0000-0000-0000-00000000000d')$$,
  'a função registra o contato do aparelho'
);

select * from finish();
rollback;
