-- Painel de Gestão (console administrativo master do ADMIN_MASTER).
--
-- Duas colunas novas em perfis_usuarios, usadas pelo cadastro de colaborador do Painel de
-- Gestão: `email_alerta` é o e-mail real (fora do domínio fictício de login) para onde vão
-- notificações de Melhoria Contínua/CAPA; `configuracoes_extras` guarda, serializado como
-- texto JSON, os campos que não têm coluna própria (setor do dia por inspetor, cobertura
-- temporária de almoço) — um único campo texto, mesclado no cliente a cada update, em vez de
-- uma tabela nova só para isso (mesmo espírito de app_config: opções administráveis sem
-- migração de schema a cada novo campo).
alter table perfis_usuarios add column if not exists email_alerta text;
alter table perfis_usuarios add column if not exists configuracoes_extras text;

-- Realtime: o Painel de Gestão precisa recarregar a lista de usuários (perfil, setor do dia,
-- cobertura temporária) quando qualquer sessão altera um perfil — sem isso o admin só veria a
-- mudança após F5. monitoramentos e pausas_inspetores já estavam publicados (Painel de Bordo,
-- ver 20260925000001_painel_bordo.sql); perfis_usuarios é o terceiro.
alter publication supabase_realtime add table perfis_usuarios;
