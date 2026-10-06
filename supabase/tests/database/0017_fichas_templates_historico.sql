-- Testes pgTAP — versoes antigas (inativas) das fichas legiveis por quem verifica/audita
-- (20261006190000_fichas_templates_historico_para_verificacao.sql); o inspetor continua so com as ativas.

create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('ea100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'verif.hist@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('ea100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'insp.hist@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('ea100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'sif.hist@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());
insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('ea100000-0000-0000-0000-000000000001', 'Verif Hist', 'verif.hist.teste', 'T0300', 'VERIFICADOR', array['Todos']),
  ('ea100000-0000-0000-0000-000000000002', 'Insp Hist', 'insp.hist.teste', 'T0301', 'INSPETOR_QUALIDADE', array['S1']),
  ('ea100000-0000-0000-0000-000000000003', 'Sif Hist', 'sif.hist.teste', 'T0302', 'INSPECAO_FEDERAL', array['Todos']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos, ativo) values
  ('fa100000-0000-0000-0000-000000000001', 'TEMP-HIST', 1, 'Ficha historica v1', 'PAC-000', '[]'::jsonb, false),
  ('fa100000-0000-0000-0000-000000000002', 'TEMP-HIST', 2, 'Ficha historica v2', 'PAC-000', '[]'::jsonb, true);

-- verificador: enxerga a versao antiga (inativa) e a atual
select set_config('request.jwt.claims', json_build_object('sub', 'ea100000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'VERIFICADOR', 'setores_permitidos', array['Todos'])::text, true);
set local role authenticated;
select is((select count(*)::int from fichas_templates where codigo = 'TEMP-HIST'), 2, 'verificador le todas as versoes da ficha (inclusive a inativa)');

-- inspecao federal tambem
select set_config('request.jwt.claims', json_build_object('sub', 'ea100000-0000-0000-0000-000000000003', 'role', 'authenticated', 'perfil', 'INSPECAO_FEDERAL', 'setores_permitidos', array['Todos'])::text, true);
select is((select count(*)::int from fichas_templates where codigo = 'TEMP-HIST'), 2, 'inspecao federal le todas as versoes da ficha');

-- inspetor: continua so com a ativa
select set_config('request.jwt.claims', json_build_object('sub', 'ea100000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['S1'])::text, true);
select is((select count(*)::int from fichas_templates where codigo = 'TEMP-HIST'), 1, 'inspetor continua so com a versao ativa');
select is((select versao from fichas_templates where codigo = 'TEMP-HIST'), 2, 'e e a versao atual');
reset role;

select * from finish();
rollback;
