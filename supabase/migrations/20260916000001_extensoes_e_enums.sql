-- Fase 0 — Fundação: extensões e tipos enumerados do GloboPac 2.0
-- Ver PROMPT MESTRE seções 4 e 6.

create extension if not exists pgcrypto;   -- digest() para SHA-256 (assinaturas)
create extension if not exists pg_cron;    -- worker/agendador da fila de carimbo de tempo (Fase 2)

-- Perfis de acesso (RBAC) — seção 4. Fonte única de verdade do vocabulário de perfis;
-- permissões finas (o que cada perfil pode fazer) vivem em permissoes_perfil, nunca em
-- condicionais espalhados pelo código (if (nivel_acesso === 'X') da v1).
create type nivel_acesso as enum (
  'INSPETOR_QUALIDADE',
  'VERIFICADOR',
  'GESTOR_SETOR',
  'ADMIN_MASTER',
  'INSPECAO_FEDERAL',
  'INSPETOR_PCM'
);

-- Tipo de assinatura em fichas de monitoramento (PAC)
create type tipo_assinatura_ficha as enum (
  'INSPETOR',
  'VERIFICADOR',
  'GESTOR',
  'ADMIN',
  'LIBERACAO_DIARIA'
);

-- Etapas do ciclo de OS de manutenção — reaproveitadas como tipo de assinatura da OS
create type tipo_assinatura_os as enum (
  'ABERTURA',
  'AUTORIZACAO',
  'PROGRAMACAO',
  'EXECUCAO',
  'VALIDACAO',
  'LIBERACAO_DIARIA'
);

create type status_os as enum (
  'ABERTURA',
  'AUTORIZACAO',
  'PROGRAMACAO',
  'EXECUCAO',
  'VALIDACAO',
  'CONCLUIDA'
);

create type status_rnc as enum (
  'ABERTA',
  'EM_TRATATIVA',
  'TRATADA',
  'REABERTA',
  'FECHADA'
);

create type severidade_rnc as enum (
  'CRITICA',
  'ALTA',
  'MEDIA',
  'BAIXA'
);

create type status_fila_carimbo as enum (
  'pendente',
  'processando',
  'concluido',
  'falhou_definitivo'
);

create type origem_registro as enum (
  'v2',
  'v1_legado'
);

comment on type nivel_acesso is
  'Perfis de acesso do GloboPac 2.0 (seção 4 do PROMPT MESTRE). O que cada perfil pode fazer '
  'fica em permissoes_perfil — este enum é só o vocabulário fechado de perfis possíveis.';

comment on type origem_registro is
  'v1_legado identifica registros importados da versão anterior (seção 11): hash e carimbo '
  'originais são preservados como fato histórico e NUNCA recomputados sob as regras da v2.';
