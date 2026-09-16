-- Fase 0 — app_config e centros_custo.
-- ATENÇÃO: a v1 teve um bug real de usar centros_custo (contábil) como fallback de setores
-- de inspeção. Estas duas tabelas são propositalmente mantidas separadas e comentadas para
-- que essa confusão nunca mais aconteça (seção 12 do PROMPT MESTRE).

create table app_config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);

comment on table app_config is
  'Configuração operacional dinâmica. Chave setores_cadastrados é a ÚNICA fonte de verdade '
  'dos setores de INSPEÇÃO usados em setores_permitidos/monitoramentos.setor/rnc.setor. '
  'Nunca usar centros_custo como fallback de setores — bug real da v1 (seção 12).';

create table centros_custo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null
);

comment on table centros_custo is
  'Áreas de CUSTO CONTÁBEIS (para relatórios financeiros/gerenciais). NÃO são setores de '
  'inspeção e NÃO devem ser usadas como fallback de setores em nenhuma tela ou query — essa '
  'confusão foi um bug real da v1 (seção 12 do PROMPT MESTRE, débito nº 8). A fonte de '
  'verdade de setores de inspeção é app_config onde chave = ''setores_cadastrados''.';

alter table app_config enable row level security;
alter table centros_custo enable row level security;
