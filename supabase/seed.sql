-- Dados de SEED PARA DESENVOLVIMENTO LOCAL APENAS.
-- Executado por `supabase db reset` (e implicitamente por `supabase start` na primeira vez).
-- NUNCA aplicado em staging/produção — supabase/seed.sql não faz parte de `supabase db push`.
--
-- Cria usuários de teste diretamente em auth.users (atalho válido só localmente; em um
-- projeto hospedado, use a Admin API / Studio para criar usuários reais). A senha de todos
-- os usuários abaixo é "globopac-dev-2026" — apenas para o stack local.

do $$
declare
  v_senha text := crypt('globopac-dev-2026', gen_salt('bf'));
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111101', 'authenticated', 'authenticated',
     'inspetor.qualidade@dev.globopac.local', v_senha, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111102', 'authenticated', 'authenticated',
     'verificador@dev.globopac.local', v_senha, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111103', 'authenticated', 'authenticated',
     'gestor.setor@dev.globopac.local', v_senha, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111104', 'authenticated', 'authenticated',
     'admin.master@dev.globopac.local', v_senha, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111105', 'authenticated', 'authenticated',
     'inspecao.federal@dev.globopac.local', v_senha, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111106', 'authenticated', 'authenticated',
     'inspetor.pcm@dev.globopac.local', v_senha, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '')
  on conflict (id) do nothing;
end $$;

insert into perfis_usuarios (id, nome_completo, nome_usuario, nivel_acesso, setores_permitidos) values
  ('11111111-1111-1111-1111-111111111101', 'Inspetor(a) de Qualidade (dev)', 'inspetor.qualidade', 'INSPETOR_QUALIDADE', array['LINHA_DIF', 'PRE_INSPECAO']),
  ('11111111-1111-1111-1111-111111111102', 'Verificador(a) (dev)',           'verificador',        'VERIFICADOR',        array['LINHA_DIF', 'PRE_INSPECAO']),
  ('11111111-1111-1111-1111-111111111103', 'Gestor(a) de Setor (dev)',       'gestor.setor',       'GESTOR_SETOR',       array['LINHA_DIF']),
  ('11111111-1111-1111-1111-111111111104', 'Administrador(a) Master (dev)', 'admin.master',       'ADMIN_MASTER',       array['LINHA_DIF', 'PRE_INSPECAO', 'RECEPCAO', 'EXPEDICAO', 'MANUTENCAO']),
  ('11111111-1111-1111-1111-111111111105', 'Inspeção Federal (dev)',         'inspecao.federal',   'INSPECAO_FEDERAL',   array[]::text[]),
  ('11111111-1111-1111-1111-111111111106', 'Inspetor(a) PCM (dev)',          'inspetor.pcm',       'INSPETOR_PCM',       array['MANUTENCAO'])
on conflict (id) do nothing;

insert into centros_custo (codigo, nome) values
  ('CC-100', 'Abate — custo contábil'),
  ('CC-200', 'Manutenção — custo contábil')
on conflict (codigo) do nothing;

insert into fichas_templates (codigo, versao, nome, pac_correspondente, schema_campos, criterios_classificacao, criado_por) values
  (
    'TEMP-LINHA-DIF',
    1,
    'Monitoramento de Temperatura — Linha DIF',
    'PAC-002',
    '[{"chave":"temperatura_celsius","tipo":"numero","min":0,"max":45,"unidade":"celsius","obrigatorio":true},
      {"chave":"observacoes","tipo":"texto","obrigatorio":false}]'::jsonb,
    '["ARTRITE", "AEROSSACULITE", "LESAO_DE_PELE", "ASPECTO_REPUGNANTE"]'::jsonb,
    '11111111-1111-1111-1111-111111111104'
  )
on conflict (codigo, versao) do nothing;
