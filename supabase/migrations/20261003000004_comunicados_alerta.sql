-- Comunicados do Administrador/Verificador para os inspetores: para toda a equipe (inspetores
-- ativos) ou para inspetores selecionados. Cada inspetor recebe uma linha em
-- comunicados_alerta_destinatarios; enquanto lido_em for nulo, o sistema abre o alerta (modal com
-- som) na tela do inspetor e só o libera quando ele confirma a leitura.

create table public.comunicados_alerta (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) > 0),
  mensagem text not null check (length(btrim(mensagem)) > 0),
  autor_id uuid not null references public.perfis_usuarios (id),
  autor_nome text not null,
  autor_perfil text not null,
  para_todos boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.comunicados_alerta_destinatarios (
  comunicado_id uuid not null references public.comunicados_alerta (id) on delete cascade,
  user_id uuid not null references public.perfis_usuarios (id),
  lido_em timestamptz,
  primary key (comunicado_id, user_id)
);

create index comunicados_alerta_dest_pendentes_idx
  on public.comunicados_alerta_destinatarios (user_id) where lido_em is null;

alter table public.comunicados_alerta enable row level security;
alter table public.comunicados_alerta_destinatarios enable row level security;

-- Quem envia (Administrador/Verificador) enxerga tudo; o inspetor, só o que lhe foi endereçado.
create policy comunicados_alerta_select on public.comunicados_alerta
  for select to authenticated
  using (
    public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR')
    or exists (
      select 1 from public.comunicados_alerta_destinatarios d
      where d.comunicado_id = comunicados_alerta.id and d.user_id = auth.uid()
    )
  );

create policy comunicados_alerta_dest_select on public.comunicados_alerta_destinatarios
  for select to authenticated
  using (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR') or user_id = auth.uid());

-- Sem policies de escrita: o envio e a confirmação passam pelas funções abaixo.

create or replace function public.enviar_comunicado(
  p_titulo text,
  p_mensagem text,
  p_para_todos boolean,
  p_destinatarios uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil nivel_acesso := public.meu_perfil();
  v_id uuid;
  v_nome text;
begin
  if v_perfil is null or v_perfil not in ('ADMIN_MASTER', 'VERIFICADOR') then
    raise exception 'Apenas Administrador ou Verificador podem enviar comunicados.';
  end if;
  if coalesce(btrim(p_titulo), '') = '' or coalesce(btrim(p_mensagem), '') = '' then
    raise exception 'Informe o título e a mensagem do comunicado.';
  end if;
  if not p_para_todos and coalesce(array_length(p_destinatarios, 1), 0) = 0 then
    raise exception 'Selecione ao menos um inspetor.';
  end if;

  select nome_completo into v_nome from perfis_usuarios where id = auth.uid();

  insert into comunicados_alerta (titulo, mensagem, autor_id, autor_nome, autor_perfil, para_todos)
  values (btrim(p_titulo), btrim(p_mensagem), auth.uid(), coalesce(v_nome, 'Usuário'), v_perfil::text, p_para_todos)
  returning id into v_id;

  insert into comunicados_alerta_destinatarios (comunicado_id, user_id)
  select v_id, p.id
  from perfis_usuarios p
  where p.nivel_acesso = 'INSPETOR_QUALIDADE'
    and p.ativo
    and p.desligado_em is null
    and (p_para_todos or p.id = any (p_destinatarios));

  if not exists (select 1 from comunicados_alerta_destinatarios where comunicado_id = v_id) then
    raise exception 'Nenhum inspetor ativo encontrado para receber o comunicado.';
  end if;

  return v_id;
end;
$$;

create or replace function public.confirmar_leitura_comunicado(p_comunicado_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update comunicados_alerta_destinatarios
  set lido_em = now()
  where comunicado_id = p_comunicado_id and user_id = auth.uid() and lido_em is null
$$;

revoke all on function public.enviar_comunicado(text, text, boolean, uuid[]) from public, anon;
revoke all on function public.confirmar_leitura_comunicado(uuid) from public, anon;
grant execute on function public.enviar_comunicado(text, text, boolean, uuid[]) to authenticated;
grant execute on function public.confirmar_leitura_comunicado(uuid) to authenticated;

-- Realtime: o alerta abre na hora, em qualquer tela do inspetor.
alter publication supabase_realtime add table public.comunicados_alerta_destinatarios;
