-- Testes pgTAP — BPF Estrutural: especialidade da SS/OS (migration 20261028130000_bpf_especialidade.sql).
-- Mesma técnica de 0026_bpf_estrutural.sql (JWT simulado + `set local role authenticated`).
-- Executar com: supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(10);

create function pg_temp.como(p_id uuid, p_perfil text, p_setores text[])
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_id, 'role', 'authenticated', 'perfil', p_perfil, 'setores_permitidos', p_setores
  )::text, true)
$$;

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f4000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'esp.insp@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f4000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'esp.admin@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f4000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'esp.pcm@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('f4000000-0000-0000-0000-000000000001', 'Inspetor Esp', 'esp.insp.teste', 'T0200', 'INSPETOR_QUALIDADE', array['MANUTENÇÕES DIVERSAS']),
  ('f4000000-0000-0000-0000-000000000002', 'Admin Esp', 'esp.admin.teste', 'T0201', 'ADMIN_MASTER', array[]::text[]),
  ('f4000000-0000-0000-0000-000000000003', 'PCM Esp', 'esp.pcm.teste', 'T0202', 'INSPETOR_PCM', array['MANUTENCAO']);

insert into centros_custo (id, codigo, nome) values ('f5000000-0000-0000-0000-000000000001', 'ESPTESTE', 'Sangria (teste esp.)');

-- Fluxo até a SS aprovada.
select pg_temp.como('f4000000-0000-0000-0000-000000000001', 'INSPETOR_QUALIDADE', array['MANUTENÇÕES DIVERSAS']);
set local role authenticated;
select public.bpf_abrir_solicitacao('f5000000-0000-0000-0000-000000000001', 'Iluminação', 'Fiação exposta na parede lateral');
reset role;

select pg_temp.como('f4000000-0000-0000-0000-000000000001', 'INSPETOR_QUALIDADE', array['MANUTENÇÕES DIVERSAS']);
set local role authenticated;
select throws_matching(
  $$ select public.bpf_classificar_solicitacao((select id from bpf_solicitacoes limit 1), 'Elétrica') $$,
  'Sem permissão',
  'Inspetor de qualidade não classifica'
);
reset role;

-- O id é guardado antes de trocar de perfil: a RLS esconde do PCM a SS ainda não aprovada, então um
-- `select id from bpf_solicitacoes` feito como PCM devolveria NULL ("não encontrada").
select set_config('test.ss_id', (select id::text from bpf_solicitacoes limit 1), true);

select pg_temp.como('f4000000-0000-0000-0000-000000000003', 'INSPETOR_PCM', array['MANUTENCAO']);
set local role authenticated;
select throws_matching(
  $$ select public.bpf_classificar_solicitacao(current_setting('test.ss_id')::uuid, 'Elétrica') $$,
  'ainda não foi aprovada',
  'PCM não classifica SS que o administrador ainda não aprovou'
);
reset role;

select pg_temp.como('f4000000-0000-0000-0000-000000000002', 'ADMIN_MASTER', array[]::text[]);
set local role authenticated;
select public.bpf_aprovar_solicitacao((select id from bpf_solicitacoes limit 1));
reset role;

select pg_temp.como('f4000000-0000-0000-0000-000000000003', 'INSPETOR_PCM', array['MANUTENCAO']);
set local role authenticated;

select lives_ok(
  $$ select public.bpf_classificar_solicitacao((select id from bpf_solicitacoes limit 1), 'Elétrica') $$,
  'PCM classifica a SS aprovada'
);
select is((select especialidade from bpf_solicitacoes limit 1), 'Elétrica', 'SS guarda a especialidade');

select throws_matching(
  $$ select public.bpf_classificar_solicitacao((select id from bpf_solicitacoes limit 1), repeat('x', 41)) $$,
  'no máximo 40',
  'Especialidade com mais de 40 caracteres é recusada'
);

select public.bpf_programar_solicitacao((select id from bpf_solicitacoes limit 1), 'T-ESP-1', 'Trocar a fiação', 'PCM', public.bpf_hoje() + 5);
select is((select especialidade from bpf_ordens where numero_os = 'T-ESP-1'), 'Elétrica', 'A OS nasce com a especialidade da SS');

select lives_ok(
  $$ select public.bpf_classificar_ordem((select id from bpf_ordens where numero_os = 'T-ESP-1'), 'Mecânica') $$,
  'PCM reclassifica a OS'
);
select is((select especialidade from bpf_solicitacoes limit 1), 'Mecânica', 'A SS de origem acompanha a OS');

select public.bpf_classificar_ordem((select id from bpf_ordens where numero_os = 'T-ESP-1'), '  ');
select is((select especialidade from bpf_ordens where numero_os = 'T-ESP-1'), null, 'Texto vazio remove a classificação');

select throws_matching(
  $$ update bpf_ordens set especialidade = 'Pintura' $$,
  'permission denied',
  'UPDATE direto em bpf_ordens continua negado'
);

reset role;
select * from finish();
rollback;
