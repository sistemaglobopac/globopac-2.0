-- Testes pgTAP — checkbox "Acesso Geral" (setores_permitidos = ['Todos']) deve enxergar
-- monitoramentos de QUALQUER setor cadastrado, não só um setor literalmente chamado "Todos".
-- Regressão do bug reportado: ficha criada no setor Recepção não aparecia para um usuário
-- GESTOR_SETOR marcado como Acesso Geral. Ver migration
-- 20260929000001_fix_acesso_geral_meus_setores.
--
-- Técnica idêntica a 0002_rls_monitoramentos.sql: simula o JWT via set_config('request.jwt.claims', ...).
-- Executar com: supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(3);

-- ------------------------------------------------------------------------------------------
-- Fixtures.
-- ------------------------------------------------------------------------------------------
insert into app_config (chave, valor) values
  ('setores_cadastrados', '["Recepção", "Pré-Inspeção", "Linha DIF", "Expedição", "Manutenção"]'::jsonb)
on conflict (chave) do update set valor = excluded.valor;

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e0000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'gestor.geral@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e0000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'inspetor.recepcao@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e0000000-0000-0000-0000-000000000010', 'Gestor Acesso Geral', 'gestor.geral', 'T0010', 'GESTOR_SETOR', array['Todos']),
  ('e0000000-0000-0000-0000-000000000011', 'Inspetor Recepção', 'inspetor.recepcao', 'T0011', 'INSPETOR_QUALIDADE', array['Recepção']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f0000000-0000-0000-0000-000000000010', 'TEMP-ACESSO-GERAL', 1, 'Template Acesso Geral', 'PAC-000', '[]'::jsonb);

insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos) values
  ('10000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000010', 1, 'e0000000-0000-0000-0000-000000000011', 'Recepção', '{}'::jsonb);

-- ------------------------------------------------------------------------------------------
-- public.meus_setores() expande o sentinela 'Todos' para a lista completa de
-- app_config.setores_cadastrados.
-- ------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000010',
  'role', 'authenticated',
  'perfil', 'GESTOR_SETOR',
  'setores_permitidos', array['Todos']
)::text, true);
set local role authenticated;

-- Comparação por conjunto (não por ordem/posição): jsonb_array_elements_text não garante
-- ordem de agregação em array_agg sem ORDER BY explícito, então testamos os dois sentidos de
-- contains (@>) em vez de igualdade posicional de array.
select ok(
  public.meus_setores() @> array['Recepção', 'Pré-Inspeção', 'Linha DIF', 'Expedição', 'Manutenção']
  and array['Recepção', 'Pré-Inspeção', 'Linha DIF', 'Expedição', 'Manutenção'] @> public.meus_setores(),
  'meus_setores() expande o sentinela Todos para app_config.setores_cadastrados'
);

-- ------------------------------------------------------------------------------------------
-- Um GESTOR_SETOR com Acesso Geral enxerga o monitoramento do setor Recepção mesmo sem
-- "Recepção" estar literalmente em setores_permitidos.
-- ------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from monitoramentos where setor = 'Recepção'),
  1,
  'GESTOR_SETOR com Acesso Geral (Todos) vê o monitoramento do setor Recepção'
);

-- ------------------------------------------------------------------------------------------
-- Sanidade: um perfil SEM Acesso Geral, de outro setor, continua sem ver o monitoramento —
-- a expansão não vira um bypass geral de RLS.
-- ------------------------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e0000000-0000-0000-0000-000000000011',
  'role', 'authenticated',
  'perfil', 'INSPETOR_QUALIDADE',
  'setores_permitidos', array['Manutenção']
)::text, true);
set local role authenticated;

select is(
  (select count(*)::int from monitoramentos where setor = 'Recepção'),
  0,
  'INSPETOR_QUALIDADE do setor Manutenção (sem Acesso Geral) não vê o monitoramento de Recepção'
);

select * from finish();
rollback;
