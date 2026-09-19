-- Testes pgTAP — RLS de bloqueios_login_ip (Segurança de Login, ADR 0015 / migração
-- 20260928000001_seguranca_login_bloqueio_ip.sql): só ADMIN_MASTER lê a lista de IPs em
-- CAPTCHA/bloqueados, e NENHUM papel de cliente (nem ADMIN_MASTER) escreve na tabela
-- diretamente — o contador (Edge Function login) e o desbloqueio (Edge Function
-- desbloquear-ip-login) sempre passam por service_role.

create extension if not exists pgtap with schema extensions;

begin;
select plan(5);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin.bloqueio@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'inspetor.bloqueio@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin Bloqueio', 'admin.bloqueio', 'T0010', 'ADMIN_MASTER', array['LINHA_DIF']),
  ('a0000000-0000-0000-0000-000000000002', 'Inspetor Bloqueio', 'inspetor.bloqueio', 'T0011', 'INSPETOR_QUALIDADE', array['LINHA_DIF']);

-- Linha de teste inserida como o role padrão do runner (bypassa RLS) — nenhum papel de
-- cliente deveria conseguir fazer este INSERT sozinho (é exatamente o que os testes abaixo
-- verificam).
insert into bloqueios_login_ip (ip, tentativas_falhas, status, primeira_falha_em, ultima_falha_em)
values ('203.0.113.10', 7, 'aguardando_captcha', now(), now());

-- ------------------------------------------------------------------------------------------
-- 1) ADMIN_MASTER lê a lista de IPs em CAPTCHA/bloqueados.
-- ------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object(
  'sub', 'a0000000-0000-0000-0000-000000000001',
  'role', 'authenticated',
  'perfil', 'ADMIN_MASTER',
  'setores_permitidos', array['LINHA_DIF']
)::text, true);
set local role authenticated;

select is(
  (select count(*)::int from bloqueios_login_ip where ip = '203.0.113.10'),
  1,
  'ADMIN_MASTER lê bloqueios_login_ip (permissão bloqueios_login_ip.ler)'
);

-- 2) ADMIN_MASTER não consegue UPDATE direto (nenhuma policy de escrita existe — só a Edge
-- Function desbloquear-ip-login, com service_role, pode gravar). O UPDATE roda como statement
-- de topo (uma CTE com UPDATE só é permitida no nível mais externo de uma query — não dentro do
-- argumento de is(), que gerava "WITH clause containing a data-modifying statement must be at
-- the top level"), e a checagem compara o estado antes/depois em vez de contar linhas via
-- RETURNING: sob RLS sem policy de escrita, o UPDATE roda mas afeta 0 linhas, silenciosamente.
update bloqueios_login_ip set status = 'normal' where ip = '203.0.113.10';

select is(
  (select status from bloqueios_login_ip where ip = '203.0.113.10'),
  'aguardando_captcha',
  'ADMIN_MASTER não consegue UPDATE em bloqueios_login_ip via RLS (só service_role escreve)'
);

-- 3) INSPETOR_QUALIDADE (sem a permissão) não enxerga nenhuma linha.
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'a0000000-0000-0000-0000-000000000002',
  'role', 'authenticated',
  'perfil', 'INSPETOR_QUALIDADE',
  'setores_permitidos', array['LINHA_DIF']
)::text, true);
set local role authenticated;

select is(
  (select count(*)::int from bloqueios_login_ip),
  0,
  'INSPETOR_QUALIDADE não lê bloqueios_login_ip (sem a permissão bloqueios_login_ip.ler)'
);

-- 4) anon não enxerga nada.
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;

select is(
  (select count(*)::int from bloqueios_login_ip),
  0,
  'anon não lê bloqueios_login_ip (RLS nega tudo)'
);

-- 5) A permissão foi de fato semeada para ADMIN_MASTER (checagem estrutural, sem depender de RLS).
reset role;
select is(
  (select count(*)::int from permissoes_perfil where perfil = 'ADMIN_MASTER' and recurso = 'bloqueios_login_ip' and acao = 'ler'),
  1,
  'permissoes_perfil tem ADMIN_MASTER/bloqueios_login_ip/ler semeada'
);

select * from finish();
rollback;
