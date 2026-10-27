-- BPF Estrutural: fotos da SS. O inspetor anexa imagens (câmera ou galeria) ao abrir a solicitação
-- de serviço; o administrador (assinatura) e o PCM (programação) as veem junto com a SS.
--
-- As fotos são evidência: depois de enviadas não podem ser alteradas nem apagadas pelo cliente.
-- Só quem abriu a SS anexa, e só enquanto ela aguarda a assinatura do administrador.

create table if not exists bpf_solicitacao_fotos (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references bpf_solicitacoes (id),
  nome text not null,
  caminho text not null unique,
  tipo_mime text,
  tamanho_bytes bigint,
  enviado_por uuid not null references perfis_usuarios (id),
  criado_em timestamptz not null default now()
);

comment on table bpf_solicitacao_fotos is
  'Fotos anexadas pelo inspetor à SS (bucket privado bpf-fotos). Imutáveis para o cliente: sem UPDATE/DELETE.';

create index if not exists idx_bpf_solicitacao_fotos_ss on bpf_solicitacao_fotos (solicitacao_id);

alter table bpf_solicitacao_fotos enable row level security;

create trigger trg_bpf_solicitacao_fotos_sem_delete
  before delete on bpf_solicitacao_fotos
  for each row execute function public.bpf_bloqueia_delete();

revoke update, delete on bpf_solicitacao_fotos from anon, authenticated;
revoke all on bpf_solicitacao_fotos from anon;

-- Quem enxerga a SS (bpf_solicitacoes_select) enxerga as fotos dela.
create policy bpf_solicitacao_fotos_select on bpf_solicitacao_fotos
  for select
  using (exists (select 1 from bpf_solicitacoes s where s.id = bpf_solicitacao_fotos.solicitacao_id));

create policy bpf_solicitacao_fotos_insert on bpf_solicitacao_fotos
  for insert
  with check (
    enviado_por = auth.uid()
    and exists (
      select 1 from bpf_solicitacoes s
       where s.id = bpf_solicitacao_fotos.solicitacao_id
         and s.aberta_por = auth.uid()
         and s.status = 'AGUARDANDO_APROVACAO'
    )
  );

-- No máximo 10 fotos por SS. Trigger (e não a policy): contar a própria tabela dentro da policy dela
-- dá "infinite recursion detected in policy".
create or replace function public.bpf_limita_fotos_da_solicitacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from bpf_solicitacao_fotos where solicitacao_id = new.solicitacao_id) >= 10 then
    raise exception 'Máximo de 10 fotos por solicitação.';
  end if;
  return new;
end;
$$;

create trigger trg_bpf_solicitacao_fotos_limite
  before insert on bpf_solicitacao_fotos
  for each row execute function public.bpf_limita_fotos_da_solicitacao();

-- Bucket privado (10 MB por foto; só imagens). O caminho é "<id da SS>/<uuid>-<nome>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bpf-fotos',
  'bpf-fotos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

-- Só o autor da SS (aguardando assinatura) grava na pasta dela.
create policy bpf_fotos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bpf-fotos'
    and exists (
      select 1 from public.bpf_solicitacoes s
       where s.id::text = (storage.foldername(name))[1]
         and s.aberta_por = auth.uid()
         and s.status = 'AGUARDANDO_APROVACAO'
    )
  );

-- A leitura do arquivo segue a leitura da linha em bpf_solicitacao_fotos (e, por ela, da SS).
create policy bpf_fotos_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bpf-fotos'
    and exists (select 1 from public.bpf_solicitacao_fotos f where f.caminho = storage.objects.name)
  );
