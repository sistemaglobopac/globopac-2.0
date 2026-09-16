-- Fase 0 — lote_liberacao_sif: hash agregador diário (seção 6.2).
-- Checkpoint independente análogo a uma raiz de Merkle simplificada: mesmo que uma linha
-- isolada de assinaturas_eletronicas fosse comprometida, o hash agregador do lote do dia não
-- bateria mais com o recomputado, expondo a inconsistência mesmo sem depender daquela linha.

create table lote_liberacao_sif (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  hash_agregador char(64) not null,
  quantidade_documentos integer not null,
  liberado_por uuid not null references perfis_usuarios (id),
  tsr_base64 text,
  tsa_emitido_em timestamptz,
  criado_em timestamptz not null default now()
);

comment on table lote_liberacao_sif is
  'Um lote por liberação em lote ao SIF. hash_agregador é o SHA-256, em ordem determinística '
  '(por monitoramento_id), dos hash_documento de todos os monitoramentos liberados no lote. '
  'Recebe seu próprio carimbo de tempo RFC 3161 (via fila_carimbo_tempo, tipo_assinatura='
  '''lote''). APPEND-ONLY.';

alter table lote_liberacao_sif enable row level security;
create index idx_lote_liberacao_data on lote_liberacao_sif (data_referencia);

create trigger trg_append_only_lote_liberacao_sif
  before update or delete on lote_liberacao_sif
  for each row execute function public.bloqueia_update_delete();

-- Agora que lote_liberacao_sif existe, conectar a FK pendente em monitoramentos.
alter table monitoramentos
  add constraint fk_monitoramentos_lote_liberacao
  foreign key (lote_liberacao_id) references lote_liberacao_sif (id);
