-- Fase 0 — permissoes_perfil: matriz de RBAC versionada (perfil, recurso, ação).
-- Consultada pelo frontend (para UI) e reforçada por RLS (via tem_permissao(), migration
-- seguinte) — nunca confiar apenas em esconder botões no frontend. Deny by default: qualquer
-- combinação ausente aqui é implicitamente negada.

create table permissoes_perfil (
  id uuid primary key default gen_random_uuid(),
  perfil nivel_acesso not null,
  recurso text not null,
  acao text not null,
  condicao jsonb,
  unique (perfil, recurso, acao)
);

comment on table permissoes_perfil is
  'Matriz de permissões (perfil, recurso, ação). Vocabulário de recurso/acao documentado em '
  'docs/permissions-matrix.md. Deny by default.';

comment on column permissoes_perfil.condicao is
  'Restrições contextuais em JSONB (ex.: {"mesmo_setor": true}), informativas para o '
  'frontend. A Fase 0 NÃO interpreta esta coluna genericamente: cada restrição contextual '
  '(mesmo setor, só liberado ao SIF, etc.) é escrita explicitamente na policy de RLS da '
  'tabela correspondente, para permanecer testável por pgTAP. Ver docs/adr/0006-condicao-nao-generica.md.';

alter table permissoes_perfil enable row level security;
