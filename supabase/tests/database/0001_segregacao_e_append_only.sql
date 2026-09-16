-- Testes pgTAP — Fase 0, Definition of Done: "testes de RLS por perfil passam".
-- Este arquivo cobre os triggers de banco que reforçam segregação de funções e
-- append-only, independentemente de RLS (seção 4.1, 6 e 12 do PROMPT MESTRE).
--
-- Executar com: supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

-- ------------------------------------------------------------------------------------------
-- Fixtures: dois usuários (criador e verificador), um template de ficha.
-- ------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'criador@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'verificador@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, nivel_acesso, setores_permitidos) values
  ('a0000000-0000-0000-0000-000000000001', 'Criador Teste', 'criador.teste', 'INSPETOR_QUALIDADE', array['LINHA_DIF']),
  ('a0000000-0000-0000-0000-000000000002', 'Verificador Teste', 'verificador.teste', 'VERIFICADOR', array['LINHA_DIF']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('b0000000-0000-0000-0000-000000000001', 'TEMP-TESTE', 1, 'Template de Teste', 'PAC-000', '[]'::jsonb);

-- ------------------------------------------------------------------------------------------
-- 1) Segregação de funções: criador não pode verificar o próprio registro.
-- ------------------------------------------------------------------------------------------
select throws_ok(
  $$
    insert into monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, verificado_por)
    values ('b0000000-0000-0000-0000-000000000001', 1, 'a0000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000001')
  $$,
  'P0001',
  'Segregação de funções: verificado_por = user_id deve ser bloqueado por trigger'
);

-- Registro válido (verificador diferente do criador) deve ser aceito.
select lives_ok(
  $$
    insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, verificado_por)
    values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1, 'a0000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{}'::jsonb, 'a0000000-0000-0000-0000-000000000002')
  $$,
  'Monitoramento com verificador diferente do criador deve ser aceito'
);

-- Tentar "roubar" a verificação para o próprio criador via UPDATE também deve ser bloqueado.
select throws_ok(
  $$
    update monitoramentos
       set verificado_por = 'a0000000-0000-0000-0000-000000000001'
     where id = 'c0000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Segregação de funções também se aplica a UPDATE, não só INSERT'
);

-- ------------------------------------------------------------------------------------------
-- 2) Imutabilidade após liberação ao SIF.
-- ------------------------------------------------------------------------------------------
update monitoramentos set liberado_sif = true where id = 'c0000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ update monitoramentos set setor = 'RECEPCAO' where id = 'c0000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'Monitoramento liberado ao SIF é imutável: UPDATE deve ser bloqueado'
);

select throws_ok(
  $$ delete from monitoramentos where id = 'c0000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'monitoramentos nunca aceita DELETE físico, liberado ou não'
);

-- ------------------------------------------------------------------------------------------
-- 3) Append-only em assinaturas_eletronicas (mesmo para o dono/superusuário da migration).
-- ------------------------------------------------------------------------------------------
insert into assinaturas_eletronicas (id, monitoramento_id, user_id, tipo, hash_documento)
values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'VERIFICADOR', repeat('a', 64));

select throws_ok(
  $$ update assinaturas_eletronicas set hash_documento = repeat('b', 64) where id = 'd0000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'assinaturas_eletronicas é append-only: UPDATE deve ser bloqueado por trigger de banco'
);

select throws_ok(
  $$ delete from assinaturas_eletronicas where id = 'd0000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'assinaturas_eletronicas é append-only: DELETE deve ser bloqueado por trigger de banco'
);

-- ------------------------------------------------------------------------------------------
-- 4) perfis_usuarios nunca é excluído fisicamente.
-- ------------------------------------------------------------------------------------------
select throws_ok(
  $$ delete from perfis_usuarios where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'perfis_usuarios nunca aceita DELETE físico (desativar com ativo=false)'
);

select * from finish();
rollback;
