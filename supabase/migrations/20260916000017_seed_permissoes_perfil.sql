-- Fase 0 — Matriz de permissões baseline (perfil, recurso, ação).
-- Diferente de supabase/seed.sql (que é só para ambiente local/dev), este arquivo É uma
-- migration real: permissoes_perfil é dado de configuração essencial para o sistema
-- funcionar (sem ele, RLS nega tudo, por design de deny-by-default) e portanto deve ser
-- aplicado em todo ambiente (dev/staging/prod) como parte do schema versionado.
-- Vocabulário de recurso/acao documentado em docs/permissions-matrix.md — mantenha os dois
-- sincronizados ao alterar este arquivo.

insert into permissoes_perfil (perfil, recurso, acao) values
  -- INSPETOR_QUALIDADE — cria fichas/RNC em campo (painel de bordo mobile-first)
  ('INSPETOR_QUALIDADE', 'monitoramentos', 'ler'),
  ('INSPETOR_QUALIDADE', 'monitoramentos', 'criar'),
  ('INSPETOR_QUALIDADE', 'rnc', 'ler'),
  ('INSPETOR_QUALIDADE', 'rnc', 'criar'),
  ('INSPETOR_QUALIDADE', 'assinaturas_eletronicas', 'ler'),
  ('INSPETOR_QUALIDADE', 'turnos_inspetores', 'ler'),

  -- VERIFICADOR — revisa/aprova fichas; libera ao SIF (seção 7.3: "ADMIN/VERIFICADOR")
  ('VERIFICADOR', 'monitoramentos', 'ler'),
  ('VERIFICADOR', 'monitoramentos', 'verificar'),
  ('VERIFICADOR', 'monitoramentos', 'liberar_sif'),
  ('VERIFICADOR', 'rnc', 'ler'),
  ('VERIFICADOR', 'assinaturas_eletronicas', 'ler'),
  ('VERIFICADOR', 'lote_liberacao_sif', 'ler'),
  ('VERIFICADOR', 'fila_carimbo_tempo', 'ler'),

  -- GESTOR_SETOR — trata não conformidades do próprio setor
  ('GESTOR_SETOR', 'monitoramentos', 'ler'),
  ('GESTOR_SETOR', 'rnc', 'ler'),
  ('GESTOR_SETOR', 'rnc', 'criar'),
  ('GESTOR_SETOR', 'rnc', 'tratar'),

  -- ADMIN_MASTER — visão completa, BI, libera SIF, administra o sistema
  ('ADMIN_MASTER', 'monitoramentos', 'ler'),
  ('ADMIN_MASTER', 'monitoramentos', 'criar'),
  ('ADMIN_MASTER', 'monitoramentos', 'verificar'),
  ('ADMIN_MASTER', 'monitoramentos', 'liberar_sif'),
  ('ADMIN_MASTER', 'rnc', 'ler'),
  ('ADMIN_MASTER', 'rnc', 'criar'),
  ('ADMIN_MASTER', 'rnc', 'tratar'),
  ('ADMIN_MASTER', 'assinaturas_eletronicas', 'ler'),
  ('ADMIN_MASTER', 'assinaturas_os_eletronicas', 'ler'),
  ('ADMIN_MASTER', 'fila_carimbo_tempo', 'ler'),
  ('ADMIN_MASTER', 'lote_liberacao_sif', 'ler'),
  ('ADMIN_MASTER', 'log_acessos_verificacao', 'ler'),
  ('ADMIN_MASTER', 'perfis_usuarios', 'ler'),
  ('ADMIN_MASTER', 'perfis_usuarios', 'atualizar'),
  ('ADMIN_MASTER', 'permissoes_perfil', 'gerenciar'),
  ('ADMIN_MASTER', 'app_config', 'gerenciar'),
  ('ADMIN_MASTER', 'centros_custo', 'gerenciar'),
  ('ADMIN_MASTER', 'fichas_templates', 'gerenciar'),
  ('ADMIN_MASTER', 'manutencao_os', 'ler'),
  ('ADMIN_MASTER', 'manutencao_os', 'abrir'),
  ('ADMIN_MASTER', 'manutencao_os', 'avancar_etapa'),
  ('ADMIN_MASTER', 'manutencao_os_historico', 'ler'),
  ('ADMIN_MASTER', 'manutencao_relatorios_sif', 'ler'),
  ('ADMIN_MASTER', 'manutencao_relatorios_sif', 'criar'),
  ('ADMIN_MASTER', 'manutencao_relatorios_sif', 'liberar'),
  ('ADMIN_MASTER', 'turnos_inspetores', 'ler'),

  -- INSPECAO_FEDERAL — somente leitura de documentos liberados (painel de auditoria)
  ('INSPECAO_FEDERAL', 'monitoramentos', 'ler'),
  ('INSPECAO_FEDERAL', 'assinaturas_eletronicas', 'ler'),
  ('INSPECAO_FEDERAL', 'assinaturas_os_eletronicas', 'ler'),
  ('INSPECAO_FEDERAL', 'lote_liberacao_sif', 'ler'),
  ('INSPECAO_FEDERAL', 'manutencao_os', 'ler'),
  ('INSPECAO_FEDERAL', 'manutencao_relatorios_sif', 'ler'),

  -- INSPETOR_PCM — gerencia manutenção (OS): abertura/autorização/programação/execução/validação
  ('INSPETOR_PCM', 'manutencao_os', 'ler'),
  ('INSPETOR_PCM', 'manutencao_os', 'abrir'),
  ('INSPETOR_PCM', 'manutencao_os', 'avancar_etapa'),
  ('INSPETOR_PCM', 'manutencao_os_historico', 'ler'),
  ('INSPETOR_PCM', 'manutencao_relatorios_sif', 'ler'),
  ('INSPETOR_PCM', 'manutencao_relatorios_sif', 'criar'),
  ('INSPETOR_PCM', 'manutencao_relatorios_sif', 'liberar'),
  ('INSPETOR_PCM', 'assinaturas_os_eletronicas', 'ler')
on conflict (perfil, recurso, acao) do nothing;

-- setores_cadastrados: fonte de verdade dos setores de inspeção (nunca centros_custo — ver
-- comentário em migration 0006). Placeholder de exemplo — ajustar para os setores reais da
-- SIF 1606 antes do go-live.
insert into app_config (chave, valor) values
  ('setores_cadastrados', '["RECEPCAO", "PRE_INSPECAO", "LINHA_DIF", "EXPEDICAO", "MANUTENCAO"]'::jsonb)
on conflict (chave) do nothing;

insert into app_config (chave, valor) values
  ('sla_rnc_horas_por_severidade', '{"CRITICA": 24, "ALTA": 72, "MEDIA": 168, "BAIXA": 360}'::jsonb)
on conflict (chave) do nothing;
