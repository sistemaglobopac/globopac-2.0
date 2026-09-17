-- Dados de SEED PARA DESENVOLVIMENTO LOCAL APENAS.
-- Executado por `supabase db reset` (e implicitamente por `supabase start` na primeira vez).
-- NUNCA aplicado em staging/produção — supabase/seed.sql não faz parte de `supabase db push`.
--
-- Os 6 usuários de teste NÃO são criados aqui. Inserir diretamente em auth.users via SQL
-- (crypt()/gen_salt()) não reproduz tudo o que o GoTrue exige para autenticar um login real
-- — descoberto via falha real de E2E em CI (login sempre voltava "E-mail ou senha
-- inválidos"). Rode `npm run db:seed-users` (scripts/seed-dev-users.mjs, que usa a Admin API)
-- depois de `supabase db reset` — é exatamente isso que `npm run db:reset` já faz.

insert into centros_custo (codigo, nome) values
  ('CC-100', 'Abate — custo contábil'),
  ('CC-200', 'Manutenção — custo contábil')
on conflict (codigo) do nothing;

insert into fichas_templates (codigo, versao, nome, pac_correspondente, schema_campos, criterios_classificacao) values
  (
    'TEMP-LINHA-DIF',
    1,
    'Monitoramento de Temperatura — Linha DIF',
    'PAC-002',
    '[{"chave":"temperatura_celsius","tipo":"numero","min":0,"max":45,"unidade":"celsius","obrigatorio":true},
      {"chave":"observacoes","tipo":"texto","obrigatorio":false}]'::jsonb,
    '["ARTRITE", "AEROSSACULITE", "LESAO_DE_PELE", "ASPECTO_REPUGNANTE"]'::jsonb
  )
on conflict (codigo, versao) do nothing;
