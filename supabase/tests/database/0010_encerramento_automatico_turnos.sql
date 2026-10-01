-- Testes pgTAP — encerramento automatico de turnos (20261001000001_encerramento_automatico_turnos.sql):
-- 1o turno fecha as 22:00 (Manaus) do mesmo dia; 2o turno fecha as 04:00 do dia seguinte; turno
-- ja encerrado manualmente nao e tocado; turno ainda dentro do prazo continua aberto.

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'auto.turno@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos)
values ('e2000000-0000-0000-0000-000000000001', 'Auto Turno', 'auto.turno.teste', 'T0030', 'INSPETOR_QUALIDADE', array['LINHA_DIF']);

-- Datas fixas e antigas (todas ja vencidas): 2026-01-10 em Manaus.
insert into turnos_inspetores (id, user_id, inicio, fim) values
  ('e2100000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', '2026-01-10 05:30:00-04', null),  -- 1o turno -> 22:00 de 10/01
  ('e2100000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', '2026-01-10 17:10:00-04', null),  -- 2o turno -> 04:00 de 11/01
  ('e2100000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000001', '2026-01-10 00:30:00-04', null),  -- 2o turno apos meia-noite -> 04:00 de 10/01
  ('e2100000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-000000000001', '2026-01-10 04:00:00-04', '2026-01-10 15:00:00-04'), -- ja encerrado manualmente
  ('e2100000-0000-0000-0000-000000000005', 'e2000000-0000-0000-0000-000000000001', now(), null);                       -- ainda dentro do prazo

select ok(public.encerrar_turnos_automaticamente() >= 3, 'encerra os turnos vencidos');

select is((select fim from turnos_inspetores where id = 'e2100000-0000-0000-0000-000000000001'), '2026-01-10 22:00:00-04'::timestamptz, '1o turno encerra as 22:00 do mesmo dia');
select is((select fim from turnos_inspetores where id = 'e2100000-0000-0000-0000-000000000002'), '2026-01-11 04:00:00-04'::timestamptz, '2o turno encerra as 04:00 do dia seguinte');
select is((select fim from turnos_inspetores where id = 'e2100000-0000-0000-0000-000000000003'), '2026-01-10 04:00:00-04'::timestamptz, '2o turno iniciado apos a meia-noite encerra as 04:00 do mesmo dia');
select is((select encerrado_automaticamente from turnos_inspetores where id = 'e2100000-0000-0000-0000-000000000001'), true, 'marca como encerrado automaticamente');
select is((select fim from turnos_inspetores where id = 'e2100000-0000-0000-0000-000000000004'), '2026-01-10 15:00:00-04'::timestamptz, 'nao altera turno ja encerrado manualmente');
select is((select encerrado_automaticamente from turnos_inspetores where id = 'e2100000-0000-0000-0000-000000000004'), false, 'turno manual continua sem a marca automatica');
select is((select fim from turnos_inspetores where id = 'e2100000-0000-0000-0000-000000000005'), null, 'turno dentro do prazo continua aberto');

select * from finish();
rollback;
