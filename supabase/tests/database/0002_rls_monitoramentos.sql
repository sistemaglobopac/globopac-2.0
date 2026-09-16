-- Testes pgTAP — RLS de monitoramentos por perfil e setor (seção 4, 7.3 e 10 do PROMPT
-- MESTRE: "INSPETOR_PCM não pode ler monitoramentos de outro setor", "INSPECAO_FEDERAL só vê
-- liberado_sif=true", "ADMIN_MASTER vê tudo").
--
-- Técnica: simula o JWT de cada perfil via set_config('request.jwt.claims', ...) + `set
-- local role authenticated`, replicando exatamente o que o hook custom_access_token_hook
-- embutiria no token real. Executar com: supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

-- ------------------------------------------------------------------------------------------
-- Fixtures (como postgres — dono das tabelas, ignora RLS por padrão).
-- ------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'inspetor.dif@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'verificador.dif@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'inspetor.pcm@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'admin@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'sif@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, nivel_acesso, setores_permitidos) values
  ('e0000000-0000-0000-0000-000000000001', 'Inspetor DIF', 'inspetor.dif', 'INSPETOR_QUALIDADE', array['LINHA_DIF']),
  ('e0000000-0000-0000-0000-000000000002', 'Verificador DIF', 'verificador.dif', 'VERIFICADOR', array['LINHA_DIF']),
  ('e0000000-0000-0000-0000-000000000003', 'Inspetor PCM', 'inspetor.pcm.teste', 'INSPETOR_PCM', array['MANUTENCAO']),
  ('e0000000-0000-0000-0000-000000000004', 'Admin', 'admin.teste', 'ADMIN_MASTER', array['LINHA_DIF', 'MANUTENCAO']),
  ('e0000000-0000-0000-0000-000000000005', 'SIF', 'sif.teste', 'INSPECAO_FEDERAL', array[]::text[]);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f0000000-0000-0000-0000-000000000001', 'TEMP-RLS-TESTE', 1, 'Template RLS', 'PAC-000', '[]'::jsonb);

-- Um monitoramento NÃO liberado no setor LINHA_DIF, e outro LIBERADO no mesmo setor.
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, verificado_por, liberado_sif) values
  ('10000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 1, 'e0000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{}'::jsonb, 'e0000000-0000-0000-0000-000000000002', false),
  ('10000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 1, 'e0000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{}'::jsonb, 'e0000000-0000-0000-0000-000000000002', true);

-- ------------------------------------------------------------------------------------------
-- INSPETOR_PCM (setor MANUTENCAO) não deve enxergar nenhum monitoramento de LINHA_DIF.
-- ------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000003',
  'role', 'authenticated',
  'perfil', 'INSPETOR_PCM',
  'setores_permitidos', array['MANUTENCAO']
)::text, true);
set local role authenticated;

select is(
  (select count(*)::int from monitoramentos where setor = 'LINHA_DIF'),
  0,
  'INSPETOR_PCM (setor MANUTENCAO) não vê monitoramentos de LINHA_DIF — RLS por setor'
);

-- ------------------------------------------------------------------------------------------
-- INSPETOR_QUALIDADE do setor LINHA_DIF vê os monitoramentos do próprio setor (liberado ou não).
-- ------------------------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000001',
  'role', 'authenticated',
  'perfil', 'INSPETOR_QUALIDADE',
  'setores_permitidos', array['LINHA_DIF']
)::text, true);
set local role authenticated;

select is(
  (select count(*)::int from monitoramentos where setor = 'LINHA_DIF'),
  2,
  'INSPETOR_QUALIDADE do setor LINHA_DIF vê os 2 monitoramentos do próprio setor'
);

-- ------------------------------------------------------------------------------------------
-- INSPECAO_FEDERAL só vê o monitoramento liberado (liberado_sif = true), nunca o pendente.
-- ------------------------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000005',
  'role', 'authenticated',
  'perfil', 'INSPECAO_FEDERAL',
  'setores_permitidos', array[]::text[]
)::text, true);
set local role authenticated;

select is(
  (select count(*)::int from monitoramentos),
  1,
  'INSPECAO_FEDERAL só enxerga 1 monitoramento (o liberado), nunca o pendente'
);

select is(
  (select liberado_sif from monitoramentos limit 1),
  true,
  'O único monitoramento visível à INSPECAO_FEDERAL tem liberado_sif = true'
);

-- ------------------------------------------------------------------------------------------
-- ADMIN_MASTER vê todos os monitoramentos, de qualquer setor/status.
-- ------------------------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000004',
  'role', 'authenticated',
  'perfil', 'ADMIN_MASTER',
  'setores_permitidos', array['LINHA_DIF', 'MANUTENCAO']
)::text, true);
set local role authenticated;

select is(
  (select count(*)::int from monitoramentos),
  2,
  'ADMIN_MASTER vê os 2 monitoramentos, independentemente de setor/liberação'
);

-- ------------------------------------------------------------------------------------------
-- Perfil sem a ação 'monitoramentos.ler' na matriz não vê nada, mesmo com o setor batendo —
-- deny by default. INSPETOR_PCM não tem essa ação (só ações de manutencao_*, ver migration
-- 20260916000017); simulamos setores_permitidos = LINHA_DIF para isolar que o bloqueio vem
-- da PERMISSÃO ausente, não de uma diferença de setor (já coberta no teste do topo do
-- arquivo). NOTA: GESTOR_SETOR não serve para este teste — a matriz concede a ele
-- monitoramentos.ler de propósito (para contexto ao tratar RNC do próprio setor).
-- ------------------------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000003',
  'role', 'authenticated',
  'perfil', 'INSPETOR_PCM',
  'setores_permitidos', array['LINHA_DIF']
)::text, true);
set local role authenticated;

select is(
  (select count(*)::int from monitoramentos),
  0,
  'INSPETOR_PCM não tem a ação monitoramentos.ler na matriz — deny by default nega tudo mesmo com setor batendo'
);

-- Sanidade: sem NENHUM claim (anon), nada é visível.
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;

select is(
  (select count(*)::int from monitoramentos),
  0,
  'Usuário anônimo (sem perfil) não vê nenhum monitoramento'
);

select * from finish();
rollback;
