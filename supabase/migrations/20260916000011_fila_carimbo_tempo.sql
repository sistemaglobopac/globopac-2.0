-- Fase 0 — fila_carimbo_tempo: fila persistente de carimbo de tempo RFC 3161 (seção 6.1).
-- Substitui o fetch(keepalive:true) fire-and-forget da v1 (débito técnico, seção 12) por um
-- mecanismo com retry e visibilidade operacional. O worker que processa esta fila é Fase 2.

create table fila_carimbo_tempo (
  id uuid primary key default gen_random_uuid(),
  assinatura_id uuid not null,
  tipo_assinatura text not null check (tipo_assinatura in ('ficha', 'os', 'lote')),
  status status_fila_carimbo not null default 'pendente',
  tentativas integer not null default 0,
  proxima_tentativa_em timestamptz,
  ultimo_erro text,
  tsa_tentadas text[] not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table fila_carimbo_tempo is
  'Fila persistente de processamento de carimbo de tempo RFC 3161. Um worker (Edge Function '
  'agendada via pg_cron, Fase 2) processa registros pendentes com retry exponencial e '
  'fallback entre os 4 TSAs (FreeTSA, Sectigo, Comodo, Certum), persistindo tentativas/'
  'ultimo_erro para dar visibilidade quando todos falham (o painel de administração expõe um '
  'contador de "carimbos pendentes há mais de X horas" — seção 7.5).';

comment on column fila_carimbo_tempo.assinatura_id is
  'Referencia assinaturas_eletronicas.id, assinaturas_os_eletronicas.id ou '
  'lote_liberacao_sif.id, conforme tipo_assinatura. Sem FK física porque aponta para uma de '
  'três tabelas diferentes — a integridade é garantida pela Edge Function que insere o '
  'registro (dentro da mesma transação que grava a assinatura), nunca por escrita direta do '
  'cliente.';

alter table fila_carimbo_tempo enable row level security;

create index idx_fila_carimbo_pendentes on fila_carimbo_tempo (status, proxima_tentativa_em)
  where status in ('pendente', 'processando');

create or replace function public.atualiza_timestamp_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

comment on function public.atualiza_timestamp_atualizado_em is
  'Trigger genérico reutilizável: mantém a coluna atualizado_em de qualquer tabela que a '
  'possua sempre igual ao momento do UPDATE.';

create trigger trg_atualiza_timestamp_fila_carimbo
  before update on fila_carimbo_tempo
  for each row execute function public.atualiza_timestamp_atualizado_em();
