-- RNC: causa do desvio (resposta do Gestor de Setor), anexos (fotos/documentos) do inspetor na
-- abertura e do gestor na tratativa, e visibilidade da RNC para quem a abriu.

-- 1) Causa do desvio: a "ação corretiva" continua em rnc.tratativa (mesma coluna, novo rótulo na UI).
alter table rnc add column if not exists causa_desvio text;

comment on column rnc.causa_desvio is
  'Causa do desvio, informada pelo Gestor de Setor ao responder a RNC (junto com a ação corretiva em rnc.tratativa).';

-- 2) O inspetor indica o setor ONDE a não conformidade ocorre — que pode não ser um dos setores dele.
-- Sem isto ele não conseguiria nem ler de volta a RNC que acabou de abrir (rnc_select filtra por setor).
drop policy if exists rnc_select on rnc;
create policy rnc_select on rnc
  for select
  using (
    public.tem_permissao('rnc', 'ler')
    and (
      public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR')
      or setor = any (public.meus_setores())
      or aberto_por = auth.uid()
    )
  );

-- 3) Anexos da RNC (foto da não conformidade na abertura; fotos/documentos da tratativa).
create table if not exists rnc_anexos (
  id uuid primary key default gen_random_uuid(),
  rnc_id uuid not null references rnc (id) on delete cascade,
  etapa text not null check (etapa in ('ABERTURA', 'TRATATIVA')),
  nome text not null,
  caminho text not null unique,
  tipo_mime text,
  tamanho_bytes bigint,
  enviado_por uuid not null references perfis_usuarios (id),
  criado_em timestamptz not null default now()
);

create index if not exists idx_rnc_anexos_rnc on rnc_anexos (rnc_id);

alter table rnc_anexos enable row level security;

-- Quem enxerga a RNC (rnc_select) enxerga os anexos; quem anexa precisa enxergar a RNC.
create policy rnc_anexos_select on rnc_anexos
  for select
  using (exists (select 1 from rnc r where r.id = rnc_anexos.rnc_id));

create policy rnc_anexos_insert on rnc_anexos
  for insert
  with check (
    enviado_por = auth.uid()
    and exists (select 1 from rnc r where r.id = rnc_anexos.rnc_id)
  );

-- 4) Bucket privado (10 MB por arquivo; imagens, PDF e documentos comuns). O acesso ao arquivo
-- segue o acesso à linha de rnc_anexos (e, por ela, à RNC).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rnc-anexos',
  'rnc-anexos',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

create policy rnc_anexos_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'rnc-anexos');

create policy rnc_anexos_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rnc-anexos'
    and exists (select 1 from public.rnc_anexos a where a.caminho = storage.objects.name)
  );
