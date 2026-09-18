-- Testes pgTAP — Fase 10: id_legado (migração de dados legados, ver
-- migration 20260923000001_fase10_migracao_dados_legados.sql). Índice único parcial (só
-- quando não nulo) garante a idempotência do script de migração — reinserir o mesmo
-- id_legado falha, várias linhas com id_legado NULL (fluxo normal da v2) continuam livres.
-- Executar com: supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('d0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'legado.teste@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('d0000000-0000-0000-0000-000000000001', 'Legado Teste', 'legado.teste', 'T0014', 'INSPETOR_QUALIDADE', array['LINHA_DIF']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('e0000000-0000-0000-0000-000000000001', 'TEMP-LEGADO-TESTE', 1, 'Template Legado', 'PAC-000', '[]'::jsonb);

-- 1) Duas linhas com o MESMO id_legado não nulo devem colidir.
select lives_ok(
  $$
    insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, id_legado, origem_versao)
    values ('80000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 1, 'd0000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{}'::jsonb, 'v1-dup-teste', 'v1_legado')
  $$,
  'Primeira inserção com id_legado novo é aceita normalmente'
);

select throws_matching(
  $$
    insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, id_legado, origem_versao)
    values ('80000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 1, 'd0000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{}'::jsonb, 'v1-dup-teste', 'v1_legado')
  $$,
  'duplicate key value violates unique constraint',
  'Reinserir o mesmo id_legado é bloqueado — é isso que torna o script de migração idempotente'
);

-- 2) Múltiplas linhas com id_legado NULL (fluxo normal da v2) continuam permitidas — o
-- índice único é parcial (where id_legado is not null).
select lives_ok(
  $$
    insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos)
    values
      ('80000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 1, 'd0000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{}'::jsonb),
      ('80000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 1, 'd0000000-0000-0000-0000-000000000001', 'LINHA_DIF', '{}'::jsonb)
  $$,
  'Múltiplas linhas com id_legado NULL (fluxo normal, não migrado) não colidem entre si'
);

-- 3) O mesmo princípio vale para rnc.id_legado (índice único parcial análogo).
select throws_matching(
  $$
    insert into rnc (id, descricao, setor, severidade, aberto_por, prazo_sla, id_legado) values
      ('90000000-0000-0000-0000-000000000010', 'Primeira', 'LINHA_DIF', 'BAIXA', 'd0000000-0000-0000-0000-000000000001', now(), 'v1-rnc-dup'),
      ('90000000-0000-0000-0000-000000000011', 'Segunda (deveria falhar)', 'LINHA_DIF', 'BAIXA', 'd0000000-0000-0000-0000-000000000001', now(), 'v1-rnc-dup')
  $$,
  'duplicate key value violates unique constraint',
  'rnc.id_legado também é único quando preenchido'
);

select * from finish();
rollback;
