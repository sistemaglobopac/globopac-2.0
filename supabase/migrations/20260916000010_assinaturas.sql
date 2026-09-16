-- Fase 0 — assinaturas_eletronicas / assinaturas_os_eletronicas: append-only, reforçado por
-- trigger de banco (seção 6 e 7.5 do PROMPT MESTRE). A escrita nestas tabelas acontece
-- exclusivamente via Edge Function (Fase 2), usando a chave service_role — por isso NENHUMA
-- policy de INSERT é concedida ao role authenticated aqui. Isso é o que impede um cliente
-- malicioso de gravar um hash que não corresponde aos dados reais (débito técnico da v1,
-- seção 12: "cálculo de hash só no cliente").

create table assinaturas_eletronicas (
  id uuid primary key default gen_random_uuid(),
  monitoramento_id uuid not null references monitoramentos (id),
  user_id uuid not null references perfis_usuarios (id),
  tipo tipo_assinatura_ficha not null,
  hash_documento char(64) not null,
  algoritmo text not null default 'SHA-256',
  tsr_base64 text,
  tsa_emitido_em timestamptz,
  tsa_utilizada text,
  cadeia_certificados_tsa bytea,
  criado_em timestamptz not null default now()
);

comment on table assinaturas_eletronicas is
  'Assinaturas eletrônicas avançadas (Lei 14.063/2020) sobre monitoramentos. APPEND-ONLY '
  '(trigger trg_append_only_assinaturas_eletronicas). hash_documento é SEMPRE recalculado no '
  'servidor a partir do registro persistido — nunca aceito do cliente. tsr_base64/'
  'tsa_emitido_em/cadeia_certificados_tsa são preenchidos de forma assíncrona pelo worker da '
  'fila_carimbo_tempo (Fase 2).';

comment on column assinaturas_eletronicas.cadeia_certificados_tsa is
  'Cadeia de certificados (e, quando disponível, resposta de revogação CRL/OCSP) da TSA '
  'usada, arquivada no momento da assinatura para permitir verificação de longo prazo (LTV) '
  'mesmo que a CA original deixe de estar acessível no futuro. Ver docs/adr/0003-recarimbo-longo-prazo-ltv.md.';

alter table assinaturas_eletronicas enable row level security;
create index idx_assinaturas_monitoramento on assinaturas_eletronicas (monitoramento_id);

create table assinaturas_os_eletronicas (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null, -- FK adicionada em migration posterior, após manutencao_os existir
  user_id uuid not null references perfis_usuarios (id),
  tipo tipo_assinatura_os not null,
  hash_documento char(64) not null,
  algoritmo text not null default 'SHA-256',
  tsr_base64 text,
  tsa_emitido_em timestamptz,
  tsa_utilizada text,
  cadeia_certificados_tsa bytea,
  criado_em timestamptz not null default now()
);

comment on table assinaturas_os_eletronicas is
  'Análoga a assinaturas_eletronicas, para o ciclo de Ordens de Serviço de manutenção '
  '(seção 7.4). APPEND-ONLY.';

alter table assinaturas_os_eletronicas enable row level security;
create index idx_assinaturas_os on assinaturas_os_eletronicas (os_id);

create trigger trg_append_only_assinaturas_eletronicas
  before update or delete on assinaturas_eletronicas
  for each row execute function public.bloqueia_update_delete();

create trigger trg_append_only_assinaturas_os_eletronicas
  before update or delete on assinaturas_os_eletronicas
  for each row execute function public.bloqueia_update_delete();
