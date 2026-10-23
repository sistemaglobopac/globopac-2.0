-- Testes pgTAP — reabrir_turno() / turnos_para_reabertura() (20261019120000_reabrir_turno.sql):
-- ADMIN_MASTER e VERIFICADOR reabrem o turno finalizado de um inspetor; o inspetor não; e a função
-- recusa turno já aberto, inspetor com outro turno aberto e turno fora do horário-limite do
-- encerramento automático (que fecharia de novo logo em seguida).

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'inspetor.reabrir@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'verificador.reabrir@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin.reabrir@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('f0000000-0000-0000-0000-000000000001', 'Inspetor Reabrir', 'inspetor.reabrir.teste', 'T0030', 'INSPETOR_QUALIDADE', array['LINHA_DIF']),
  ('f0000000-0000-0000-0000-000000000002', 'Verificador Reabrir', 'verificador.reabrir.teste', 'T0031', 'VERIFICADOR', array['Todos']),
  ('f0000000-0000-0000-0000-000000000003', 'Admin Reabrir', 'admin.reabrir.teste', 'T0032', 'ADMIN_MASTER', array['Todos']);

-- Turno finalizado há 1 minuto (começou há 2): o horário-limite dele ainda está no futuro.
insert into turnos_inspetores (id, user_id, inicio, fim) values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', now() - interval '2 minutes', now() - interval '1 minute');

select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE')::text, true);
set local role authenticated;
select throws_ok(
  $$select public.reabrir_turno('f1000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'INSPETOR_QUALIDADE não reabre turno'
);
select throws_ok(
  $$select * from public.turnos_para_reabertura(current_date)$$,
  '42501',
  null,
  'INSPETOR_QUALIDADE não lista turnos para reabertura'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'VERIFICADOR')::text, true);
select ok(
  exists (select 1 from public.turnos_para_reabertura((now() at time zone 'America/Manaus')::date) where id = 'f1000000-0000-0000-0000-000000000001'),
  'VERIFICADOR enxerga o turno na listagem'
);
select lives_ok(
  $$select public.reabrir_turno('f1000000-0000-0000-0000-000000000001')$$,
  'VERIFICADOR reabre o turno finalizado'
);
reset role;
select is(
  (select fim from turnos_inspetores where id = 'f1000000-0000-0000-0000-000000000001'),
  null::timestamptz,
  'o turno ficou sem fim (em andamento)'
);
select is(
  (select reaberto_por from turnos_inspetores where id = 'f1000000-0000-0000-0000-000000000001'),
  'f0000000-0000-0000-0000-000000000002'::uuid,
  'registra quem reabriu'
);

-- Já aberto
select set_config('request.jwt.claims', json_build_object('sub', 'f0000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'perfil', 'ADMIN_MASTER')::text, true);
set local role authenticated;
select throws_ok(
  $$select public.reabrir_turno('f1000000-0000-0000-0000-000000000001')$$,
  'P0001',
  'Este turno já está aberto.',
  'recusa reabrir turno que já está aberto'
);

-- Turno de ontem: já passou do limite do encerramento automático
reset role;
insert into turnos_inspetores (id, user_id, inicio, fim) values
  ('f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003', now() - interval '3 days', now() - interval '3 days' + interval '1 hour');
set local role authenticated;
select throws_ok(
  $$select public.reabrir_turno('f1000000-0000-0000-0000-000000000002')$$,
  'P0001',
  null,
  'recusa reabrir turno que passou do horário-limite do encerramento automático'
);

select * from finish();
rollback;
