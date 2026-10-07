-- Testes pgTAP — contingência de queda de rede (20261007120000_contingencia_offline.sql): o prazo de 72 h é
-- estendido (até 7 dias) só quando o SERVIDOR comprova que o aparelho não falou com ele no prazo.

create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e9200000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'insp.contingencia@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());
insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos)
values ('e9200000-0000-0000-0000-000000000001', 'Insp Contingencia', 'insp.contingencia.teste', 'T0200', 'INSPETOR_QUALIDADE', array['S1']);
insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f9200000-0000-0000-0000-000000000001', 'TEMP-CONTING', 1, 'Template Contingencia', 'PAC-000', '[]'::jsonb);

-- Aparelho A: conhecido (contato há 10 dias, ANTES de qualquer monitoramento do teste) e sem contato depois.
-- Aparelho B: conhecido, mas voltou a falar com o servidor 1 h depois da hora de um dos monitoramentos.
insert into contatos_dispositivo (user_id, dispositivo_id, contato_em) values
  ('e9200000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', now() - interval '10 days'),
  ('e9200000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', now() - interval '10 days'),
  ('e9200000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', now() - interval '5 days' + interval '1 hour');

-- Contingência válida: 5 dias atrás, aparelho A, senha conferida no aparelho.
select lives_ok(
  $$insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, confirmacao_offline)
    values ('19200000-0000-0000-0000-000000000001', 'f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 1, 'hora_monitoramento', to_char((now() - interval '5 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            '{"dispositivo_id":"a0000000-0000-0000-0000-00000000000a","senha_conferida_em":"aparelho","matricula":"T0200"}'::jsonb)$$,
  'registro de 5 dias, sem contato do aparelho no prazo e com senha conferida no aparelho: aceito'
);
select is(
  (select fora_do_prazo_offline from monitoramentos where id = '19200000-0000-0000-0000-000000000001'),
  true, 'o registro aceito pela contingência fica marcado fora_do_prazo_offline'
);

-- Sem a confirmação com senha: recusado.
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos)
    values ('f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 2, 'hora_monitoramento', to_char((now() - interval '5 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))$$,
  'P0001', null, 'registro de 5 dias sem confirmacao_offline continua recusado'
);

-- Confirmação sem a senha conferida: recusado.
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, confirmacao_offline)
    values ('f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 3, 'hora_monitoramento', to_char((now() - interval '5 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            '{"dispositivo_id":"a0000000-0000-0000-0000-00000000000a"}'::jsonb)$$,
  'P0001', null, 'confirmação sem senha_conferida_em não vale'
);

-- Aparelho desconhecido (nunca falou com o servidor): recusado.
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, confirmacao_offline)
    values ('f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 4, 'hora_monitoramento', to_char((now() - interval '5 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            '{"dispositivo_id":"c0000000-0000-0000-0000-00000000000c","senha_conferida_em":"aparelho"}'::jsonb)$$,
  'P0001', null, 'aparelho que nunca falou com o servidor não comprova queda de rede'
);

-- Aparelho que falou com o servidor dentro das 72 h: tinha internet para assinar, recusado.
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, confirmacao_offline)
    values ('f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 5, 'hora_monitoramento', to_char((now() - interval '5 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            '{"dispositivo_id":"b0000000-0000-0000-0000-00000000000b","senha_conferida_em":"aparelho"}'::jsonb)$$,
  'P0001', null, 'aparelho com contato no servidor dentro das 72 h seguintes à hora não tem queda comprovada'
);

-- Teto de 7 dias.
select throws_ok(
  $$insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, confirmacao_offline)
    values ('f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 6, 'hora_monitoramento', to_char((now() - interval '8 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            '{"dispositivo_id":"a0000000-0000-0000-0000-00000000000a","senha_conferida_em":"aparelho"}'::jsonb)$$,
  'P0001', null, 'passou de 7 dias: recusado mesmo com tudo certo'
);

-- Dentro das 72 h nada muda, e a marca nunca vem do cliente.
select lives_ok(
  $$insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, fora_do_prazo_offline)
    values ('19200000-0000-0000-0000-000000000007', 'f9200000-0000-0000-0000-000000000001', 1, 'e9200000-0000-0000-0000-000000000001', 'S1',
            jsonb_build_object('campo', 7, 'hora_monitoramento', to_char((now() - interval '1 hour') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            true)$$,
  'registro dentro das 72 h segue aceito'
);
select is(
  (select fora_do_prazo_offline from monitoramentos where id = '19200000-0000-0000-0000-000000000007'),
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
