-- Fase 0 — fichas_templates: templates versionados de fichas PAC (seção 6 e 7.1).

create table fichas_templates (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  versao integer not null default 1,
  nome text not null,
  pac_correspondente text not null,
  schema_campos jsonb not null,
  criterios_classificacao jsonb,
  ativo boolean not null default true,
  criado_por uuid references perfis_usuarios (id),
  criado_em timestamptz not null default now(),
  unique (codigo, versao)
);

comment on table fichas_templates is
  'Templates versionados de fichas PAC. NUNCA alterar schema_campos de uma versão já usada '
  'em produção — criar nova versao. monitoramentos.versao_template fixa qual versão foi '
  'usada, para que um registro assinado permaneça interpretável à luz do template vigente '
  'quando foi criado (seção 6 do PROMPT MESTRE).';

comment on column fichas_templates.schema_campos is
  'Definição declarativa dos campos do formulário (ex.: {"tipo":"numero","min":0,"max":45,'
  '"unidade":"celsius"}). Na Fase 1, um schema Zod é gerado a partir desta definição e '
  'reaproveitado tanto no formulário (React Hook Form) quanto na Edge Function de gravação — '
  'única fonte de verdade de validação.';

comment on column fichas_templates.criterios_classificacao is
  'Lista configurável e versionada de causas/classificações usadas por esta ficha (ex.: '
  'causas de condenação na linha DIF/pré-inspeção: artrite, aerossaculite, lesão de pele, '
  'aspecto repugnante, entre outras do atlas de referência da planta). Mudança de critério '
  'gera nova versão do template (nova linha, versao+1), nunca sobrescreve a definição vigente.';

alter table fichas_templates enable row level security;

create index idx_fichas_templates_codigo_ativo on fichas_templates (codigo) where ativo = true;
