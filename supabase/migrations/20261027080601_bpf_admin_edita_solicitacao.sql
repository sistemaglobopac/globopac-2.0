-- BPF Estrutural: o administrador pode ajustar o texto da SS (descrição), o local e o tipo da não
-- conformidade na tela de aprovação, ANTES de assinar. A assinatura (hash_aprovacao) é calculada
-- na aprovação sobre o conteúdo já ajustado.
--
-- Rastreabilidade: cada ajuste grava o conteúdo anterior e o novo em bpf_solicitacoes_edicoes
-- (append-only) e a SS passa a mostrar quem ajustou e quando (editada_por_nome / editada_em).

alter table bpf_solicitacoes
  add column if not exists editada_por uuid references perfis_usuarios (id),
  add column if not exists editada_por_nome text,
  add column if not exists editada_em timestamptz;

comment on column bpf_solicitacoes.editada_em is
  'Último ajuste do administrador antes da assinatura (descrição, local ou tipo). Histórico em bpf_solicitacoes_edicoes.';

create table if not exists bpf_solicitacoes_edicoes (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references bpf_solicitacoes (id),
  editado_por uuid not null references perfis_usuarios (id),
  editado_por_nome text not null,
  editado_em timestamptz not null default now(),
  antes jsonb not null,
  depois jsonb not null
);

comment on table bpf_solicitacoes_edicoes is
  'Histórico dos ajustes do administrador na SS (conteúdo antes e depois). Append-only.';

create index if not exists idx_bpf_solicitacoes_edicoes_ss on bpf_solicitacoes_edicoes (solicitacao_id, editado_em);

alter table bpf_solicitacoes_edicoes enable row level security;

revoke insert, update, delete on bpf_solicitacoes_edicoes from anon, authenticated;
revoke all on bpf_solicitacoes_edicoes from anon;

create trigger trg_bpf_solicitacoes_edicoes_append_only
  before update or delete on bpf_solicitacoes_edicoes
  for each row execute function public.bpf_bloqueia_delete();

-- Quem enxerga a SS enxerga o histórico dos ajustes dela.
create policy bpf_solicitacoes_edicoes_select on bpf_solicitacoes_edicoes
  for select
  using (exists (select 1 from bpf_solicitacoes s where s.id = bpf_solicitacoes_edicoes.solicitacao_id));

create or replace function public.bpf_editar_solicitacao(
  p_id uuid,
  p_descricao text,
  p_local_detalhe text,
  p_categoria text
)
returns bpf_solicitacoes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ss bpf_solicitacoes;
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_local text := nullif(btrim(coalesce(p_local_detalhe, '')), '');
  v_categoria text := btrim(coalesce(p_categoria, ''));
  v_antes jsonb;
  v_depois jsonb;
begin
  if v_uid is null or not public.tem_permissao('bpf_solicitacoes', 'aprovar') then
    raise exception 'Sem permissão para editar solicitação de serviço.';
  end if;
  if length(v_descricao) < 10 then
    raise exception 'Descreva a não conformidade com pelo menos 10 caracteres.';
  end if;
  if length(v_categoria) = 0 then
    raise exception 'Informe o tipo da não conformidade.';
  end if;

  select * into v_ss from bpf_solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_ss.status <> 'AGUARDANDO_APROVACAO' then
    raise exception 'A solicitação % já foi decidida e não pode mais ser editada.', v_ss.numero;
  end if;

  v_antes := jsonb_build_object('descricao', v_ss.descricao, 'local_detalhe', v_ss.local_detalhe, 'categoria', v_ss.categoria);
  v_depois := jsonb_build_object('descricao', v_descricao, 'local_detalhe', v_local, 'categoria', v_categoria);
  if v_antes = v_depois then
    return v_ss;
  end if;

  insert into bpf_solicitacoes_edicoes (solicitacao_id, editado_por, editado_por_nome, antes, depois)
  values (v_ss.id, v_uid, public.bpf_nome_usuario(v_uid), v_antes, v_depois);

  update bpf_solicitacoes
     set descricao = v_descricao,
         local_detalhe = v_local,
         categoria = v_categoria,
         editada_por = v_uid,
         editada_por_nome = public.bpf_nome_usuario(v_uid),
         editada_em = now()
   where id = p_id
  returning * into v_ss;
  return v_ss;
end;
$$;

revoke execute on function public.bpf_editar_solicitacao(uuid, text, text, text) from public, anon;
grant execute on function public.bpf_editar_solicitacao(uuid, text, text, text) to authenticated;
