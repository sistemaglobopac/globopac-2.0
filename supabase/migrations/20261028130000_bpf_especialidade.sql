-- BPF Estrutural: o PCM classifica cada SS e cada OS por especialidade (elétrica, obra civil, pintura,
-- mecânica...) para separar o trabalho por equipe e imprimir as listas por especialidade.
--
-- Não confundir com `categoria`, que é o TIPO da não conformidade escolhido pelo inspetor (piso, teto...).
-- A especialidade é decisão do PCM, vale para a SS aprovada (antes de programar) e para a OS, e fica fora
-- do conteúdo assinado (hash_aprovacao, hash da programação e do relatório): classificar não altera assinaturas.
--
-- A lista de especialidades fica no cliente (src/modules/bpf/especialidades.ts); o banco só guarda o texto.

alter table bpf_solicitacoes
  add column if not exists especialidade text check (especialidade is null or length(btrim(especialidade)) between 1 and 40);

alter table bpf_ordens
  add column if not exists especialidade text check (especialidade is null or length(btrim(especialidade)) between 1 and 40);

comment on column bpf_solicitacoes.especialidade is
  'Especialidade da manutenção (elétrica, obra civil, pintura...), definida pelo PCM. Nula = sem classificação.';
comment on column bpf_ordens.especialidade is
  'Especialidade da manutenção, definida pelo PCM (herdada da SS ao programar, ajustável depois). Nula = sem classificação.';

create index if not exists idx_bpf_ordens_especialidade on bpf_ordens (especialidade) where status = 'PROGRAMADA';

-- A OS nasce com a especialidade que o PCM já deu à SS (bpf_programar_solicitacao não precisa mudar).
create or replace function public.bpf_ordem_herda_especialidade()
returns trigger
language plpgsql
as $$
begin
  if new.especialidade is null and new.solicitacao_id is not null then
    select s.especialidade into new.especialidade from bpf_solicitacoes s where s.id = new.solicitacao_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bpf_ordem_herda_especialidade on bpf_ordens;
create trigger trg_bpf_ordem_herda_especialidade
  before insert on bpf_ordens
  for each row execute function public.bpf_ordem_herda_especialidade();

-- PCM classifica a SS aprovada (ou já programada: a OS acompanha). Texto vazio remove a classificação.
create or replace function public.bpf_classificar_solicitacao(p_id uuid, p_especialidade text)
returns bpf_solicitacoes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_esp text := nullif(btrim(coalesce(p_especialidade, '')), '');
  v_ss bpf_solicitacoes;
begin
  if v_uid is null or not public.tem_permissao('bpf_ordens', 'programar') then
    raise exception 'Sem permissão para classificar solicitações.';
  end if;
  if v_esp is not null and length(v_esp) > 40 then
    raise exception 'A especialidade deve ter no máximo 40 caracteres.';
  end if;

  select * into v_ss from bpf_solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_ss.status not in ('APROVADA', 'PROGRAMADA') then
    raise exception 'A solicitação % ainda não foi aprovada pelo administrador.', v_ss.numero;
  end if;

  update bpf_solicitacoes set especialidade = v_esp where id = p_id returning * into v_ss;
  update bpf_ordens set especialidade = v_esp where solicitacao_id = p_id;
  return v_ss;
end;
$$;

-- PCM classifica a OS (inclusive as importadas, que não têm SS).
create or replace function public.bpf_classificar_ordem(p_id uuid, p_especialidade text)
returns bpf_ordens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_esp text := nullif(btrim(coalesce(p_especialidade, '')), '');
  v_os bpf_ordens;
begin
  if v_uid is null or not public.tem_permissao('bpf_ordens', 'programar') then
    raise exception 'Sem permissão para classificar OS.';
  end if;
  if v_esp is not null and length(v_esp) > 40 then
    raise exception 'A especialidade deve ter no máximo 40 caracteres.';
  end if;

  update bpf_ordens set especialidade = v_esp where id = p_id returning * into v_os;
  if not found then raise exception 'OS não encontrada.'; end if;

  if v_os.solicitacao_id is not null then
    update bpf_solicitacoes set especialidade = v_esp where id = v_os.solicitacao_id;
  end if;
  return v_os;
end;
$$;

revoke execute on function
  public.bpf_classificar_solicitacao(uuid, text),
  public.bpf_classificar_ordem(uuid, text)
  from public, anon;

grant execute on function
  public.bpf_classificar_solicitacao(uuid, text),
  public.bpf_classificar_ordem(uuid, text)
  to authenticated;
