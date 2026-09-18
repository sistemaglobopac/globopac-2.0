-- Construtor de Fichas (painel administrativo): metadados de apontamento e setores de
-- aplicação de cada template. Colunas aditivas com default seguro — não quebram os templates
-- já existentes (seed e fases 0-10), que não os definem.

alter table fichas_templates
  add column tipo_apontamento text not null default 'Recorrente'
    check (tipo_apontamento in ('Recorrente', 'Demanda')),
  add column frequencia text
    check (frequencia is null or frequencia in ('Diário', 'Por Turno')),
  add column tempo_entre_apontamentos_min integer,
  add column tempo_edicao_min integer,
  add column locais_aplicacao jsonb not null default '[]'::jsonb,
  add column atualizado_em timestamptz not null default now();

comment on column fichas_templates.tipo_apontamento is
  'Recorrente (aparece periodicamente pro inspetor) ou Demanda (apontamento avulso). '
  'Definido no Construtor de Fichas (painel administrativo).';

comment on column fichas_templates.frequencia is
  'Só relevante quando tipo_apontamento = ''Recorrente'': Diário ou Por Turno.';

comment on column fichas_templates.tempo_entre_apontamentos_min is
  'Intervalo mínimo, em minutos, entre dois apontamentos consecutivos desta ficha.';

comment on column fichas_templates.tempo_edicao_min is
  'Janela, em minutos, em que um apontamento já salvo desta ficha ainda pode ser editado.';

comment on column fichas_templates.locais_aplicacao is
  'Setores (de app_config.setores_cadastrados) onde esta ficha aparece para o inspetor. '
  'Lista vazia = ficha sem setor definido.';

comment on column fichas_templates.atualizado_em is
  'Quando esta VERSÃO da linha foi criada/ativada — o versionamento nunca faz UPDATE '
  'destrutivo em schema_campos, sempre INSERT de uma nova linha (ver comentário original '
  'da tabela).';
