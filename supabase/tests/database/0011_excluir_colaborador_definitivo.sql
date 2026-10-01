-- Testes pgTAP — exclusao definitiva de colaborador (20261001000002_excluir_colaborador_definitivo.sql):
-- so apaga quem nunca deixou historico; quem tem registro continua intacto; DELETE direto segue bloqueado.

create extension if not exists pgtap with schema extensions;

begin;
select plan(6);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'sem.historico@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e3000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'com.historico@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e3000000-0000-0000-0000-000000000001', 'Sem Historico', 'sem.historico.teste', 'T0040', 'INSPETOR_QUALIDADE', array['LINHA_DIF']),
  ('e3000000-0000-0000-0000-000000000002', 'Com Historico', 'com.historico.teste', 'T0041', 'INSPETOR_QUALIDADE', array['LINHA_DIF']);

insert into turnos_inspetores (user_id, inicio, fim)
values ('e3000000-0000-0000-0000-000000000002', now(), null);

-- 1) DELETE direto continua bloqueado pelo trigger
select throws_ok(
  $$delete from perfis_usuarios where id = 'e3000000-0000-0000-0000-000000000001'$$
);

-- 2) quem nunca deixou historico e excluido de verdade
select is(public.excluir_colaborador_definitivo('e3000000-0000-0000-0000-000000000001'), 'excluido', 'sem historico: excluido');
select is((select count(*)::int from perfis_usuarios where id = 'e3000000-0000-0000-0000-000000000001'), 0, 'perfil sem historico foi apagado');

-- 3) quem tem historico nao e apagado
select is(public.excluir_colaborador_definitivo('e3000000-0000-0000-0000-000000000002'), 'tem_historico', 'com historico: recusado');
select is((select count(*)::int from perfis_usuarios where id = 'e3000000-0000-0000-0000-000000000002'), 1, 'perfil com historico continua existindo');

-- 4) id inexistente
select is(public.excluir_colaborador_definitivo('e3000000-0000-0000-0000-0000000000ff'), 'nao_encontrado', 'inexistente');

select * from finish();
rollback;
