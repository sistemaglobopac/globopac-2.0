-- BPF Estrutural: o relatório diário de OS passa a ter DUAS etapas depois da emissão.
--   emitido   -> o inspetor emitiu
--   verificado -> o Verificador verificou no Painel de Verificação (NÃO libera ao SIF)
--   liberado  -> o administrador libera ao SIF pelo Painel de Arquivo (só então a Inspeção Federal vê)
-- Antes o Verificador conferia e liberava ao SIF no mesmo ato.

alter table bpf_relatorios
  add column verificado_por uuid references perfis_usuarios (id),
  add column verificado_por_nome text,
  add column verificado_em timestamptz,
  add column hash_verificacao char(64);

alter table bpf_relatorios drop constraint bpf_relatorios_status_check;
alter table bpf_relatorios
  add constraint bpf_relatorios_status_check check (status in ('emitido', 'verificado', 'liberado'));

-- Relatórios já liberados foram verificados e liberados pelo Verificador no mesmo ato: a verificação
-- passa a constar também nos campos novos (o trigger de imutabilidade é desligado só para este ajuste).
alter table bpf_relatorios disable trigger trg_bpf_relatorios_imutavel;
update bpf_relatorios
   set verificado_por = liberado_por,
       verificado_por_nome = liberado_por_nome,
       verificado_em = liberado_em,
       hash_verificacao = hash_liberacao
 where status = 'liberado' and verificado_por is null;
alter table bpf_relatorios enable trigger trg_bpf_relatorios_imutavel;

comment on column bpf_relatorios.verificado_por is
  'Verificador que verificou o relatório no Painel de Verificação. Verificar não libera ao SIF.';
comment on column bpf_relatorios.liberado_por is
  'Administrador que liberou o relatório ao SIF pelo Painel de Arquivo (exige status verificado).';

-- Permissões: o Verificador (e o administrador) verificam; só o administrador libera ao SIF.
insert into permissoes_perfil (perfil, recurso, acao) values
  ('VERIFICADOR', 'bpf_relatorios', 'verificar'),
  ('ADMIN_MASTER', 'bpf_relatorios', 'verificar')
on conflict (perfil, recurso, acao) do nothing;

delete from permissoes_perfil
 where perfil = 'VERIFICADOR' and recurso = 'bpf_relatorios' and acao = 'liberar';

-- Verificador verifica o relatório (quem emitiu não verifica o próprio).
create or replace function public.bpf_verificar_relatorio(p_id uuid)
returns bpf_relatorios
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rel bpf_relatorios;
begin
  if v_uid is null or not public.tem_permissao('bpf_relatorios', 'verificar') then
    raise exception 'Sem permissão para verificar o relatório.';
  end if;
  select * into v_rel from bpf_relatorios where id = p_id for update;
  if not found then raise exception 'Relatório não encontrado.'; end if;
  if v_rel.status <> 'emitido' then
    raise exception 'O relatório já foi verificado.';
  end if;
  if v_rel.emitido_por = v_uid then
    raise exception 'Segregação de funções: quem emitiu o relatório não pode verificá-lo.';
  end if;

  update bpf_relatorios
     set status = 'verificado', verificado_por = v_uid,
         verificado_por_nome = public.bpf_nome_usuario(v_uid), verificado_em = now(),
         hash_verificacao = encode(sha256(convert_to(jsonb_build_object(
           'id', v_rel.id, 'hash_emissao', v_rel.hash_emissao, 'verificado_por', v_uid)::text,
           'UTF8')), 'hex')
   where id = p_id
  returning * into v_rel;
  return v_rel;
end;
$$;

-- Administrador libera ao SIF (Painel de Arquivo) um relatório já verificado.
create or replace function public.bpf_liberar_relatorio(p_id uuid)
returns bpf_relatorios
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rel bpf_relatorios;
begin
  if v_uid is null or not public.tem_permissao('bpf_relatorios', 'liberar') then
    raise exception 'Sem permissão para liberar o relatório.';
  end if;
  select * into v_rel from bpf_relatorios where id = p_id for update;
  if not found then raise exception 'Relatório não encontrado.'; end if;
  if v_rel.status = 'liberado' then
    raise exception 'O relatório já foi liberado.';
  end if;
  if v_rel.status <> 'verificado' then
    raise exception 'O relatório ainda não foi verificado pelo Verificador.';
  end if;

  update bpf_relatorios
     set status = 'liberado', liberado_por = v_uid,
         liberado_por_nome = public.bpf_nome_usuario(v_uid), liberado_em = now(),
         hash_liberacao = encode(sha256(convert_to(jsonb_build_object(
           'id', v_rel.id, 'hash_emissao', v_rel.hash_emissao,
           'hash_verificacao', v_rel.hash_verificacao, 'liberado_por', v_uid)::text,
           'UTF8')), 'hex')
   where id = p_id
  returning * into v_rel;
  return v_rel;
end;
$$;

revoke execute on function public.bpf_verificar_relatorio(uuid) from public, anon;
grant execute on function public.bpf_verificar_relatorio(uuid) to authenticated;
