-- Testes pgTAP — carga cancelada (20261113100000_carga_cancelada.sql): o inspetor cancela e reativa a carga SÓ pelas funções, com
-- motivo e trilha; a carga cancelada sai da base do DOA/SPR; carga com a recepção já monitorada não pode ser cancelada.

create extension if not exists pgtap with schema extensions;

begin;
select plan(14);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('ca290000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'carga.insp@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('ca290000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'carga.adm@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('ca290000-0000-0000-0000-000000000001', 'Inspetor Carga', 'carga.insp.teste', 'T0990', 'INSPETOR_QUALIDADE', array['BEM_ESTAR_ANIMAL']),
  ('ca290000-0000-0000-0000-000000000002', 'Admin Carga', 'carga.adm.teste', 'T0991', 'ADMIN_MASTER', array['BEM_ESTAR_ANIMAL']);

insert into cargas_aves (id, data_abate, integrado, aviario, nucleo, gta, qtd_aves) values
  ('cc290000-0000-0000-0000-000000000001', '2026-11-13', 'Integrado A', '1', '', 'GTA-A', 1000),
  ('cc290000-0000-0000-0000-000000000002', '2026-11-13', 'Integrado B', '2', '', 'GTA-B', 2000),
  ('cc290000-0000-0000-0000-000000000003', '2026-11-13', 'Integrado C', '3', '', 'GTA-C', 3000);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('fc290000-0000-0000-0000-000000000001', 'TEMP-CARGA', 1, 'Template Carga', 'PAC-000', '[]'::jsonb);

-- A carga C já teve a recepção monitorada.
insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos)
values ('fc290000-0000-0000-0000-000000000001', 1, 'ca290000-0000-0000-0000-000000000001', 'BEM_ESTAR_ANIMAL',
  '{"campo_1":{"cargaId":"cc290000-0000-0000-0000-000000000003","penduraInicioEm":"2026-11-13T07:00","placa":"ABC1D23"}}');

select set_config('request.jwt.claims', json_build_object('sub', 'ca290000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['BEM_ESTAR_ANIMAL'])::text, true);
set local role authenticated;

select is((select count(*)::int from cargas_rastreabilidade_do_dia('2026-11-13')), 3, 'antes: as 3 cargas entram na base do DOA/SPR');

select throws_ok($$select cancelar_carga_aves('cc290000-0000-0000-0000-000000000001', 'x')$$, '22023', null, 'motivo curto demais é recusado');
select lives_ok($$select cancelar_carga_aves('cc290000-0000-0000-0000-000000000001', 'Carga cancelada pela integração')$$, 'o inspetor cancela a carga com motivo');
select is((select cancelada_por from cargas_aves where id = 'cc290000-0000-0000-0000-000000000001'), 'ca290000-0000-0000-0000-000000000001'::uuid, 'grava quem cancelou');
select is((select motivo_cancelamento from cargas_aves where id = 'cc290000-0000-0000-0000-000000000001'), 'Carga cancelada pela integração', 'grava o motivo');
select is((select count(*)::int from cargas_rastreabilidade_do_dia('2026-11-13')), 2, 'a carga cancelada sai da base do DOA/SPR');
select throws_ok($$select cancelar_carga_aves('cc290000-0000-0000-0000-000000000001', 'Cancelar de novo')$$, '23505', null, 'não cancela duas vezes');
select throws_ok($$select cancelar_carga_aves('cc290000-0000-0000-0000-000000000003', 'Tentativa indevida')$$, '23514', null, 'carga com a recepção já monitorada não pode ser cancelada');

-- O inspetor não edita a programação direto (só as funções).
update cargas_aves set qtd_aves = 1 where id = 'cc290000-0000-0000-0000-000000000002';
select is((select qtd_aves from cargas_aves where id = 'cc290000-0000-0000-0000-000000000002'), 2000, 'o inspetor não altera cargas_aves diretamente');

select lives_ok($$select reativar_carga_aves('cc290000-0000-0000-0000-000000000001')$$, 'o inspetor reativa a carga cancelada por engano');
select is((select cancelada_em from cargas_aves where id = 'cc290000-0000-0000-0000-000000000001'), null, 'reativada: volta a ser carga ativa');
select is((select count(*)::int from cargas_rastreabilidade_do_dia('2026-11-13')), 3, 'reativada: volta para a base do DOA/SPR');
select is(
  (select string_agg(acao, ',' order by criado_em, acao) from cargas_aves_cancelamentos where carga_id = 'cc290000-0000-0000-0000-000000000001'),
  'CANCELADA,REATIVADA', 'a trilha guarda o cancelamento e a reativação'
);

select set_config('request.jwt.claims', json_build_object('sub', 'ca290000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'ADMIN_MASTER', 'setores_permitidos', array['BEM_ESTAR_ANIMAL'])::text, true);
select lives_ok($$select cancelar_carga_aves('cc290000-0000-0000-0000-000000000002', 'Cancelada pelo administrador')$$, 'o administrador também cancela');

select * from finish();
rollback;
