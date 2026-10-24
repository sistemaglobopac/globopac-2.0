-- BPF Estrutural: liberar o relatório de OS ao SIF não é uma assinatura do administrador no documento.
-- Igual aos relatórios de monitoramento: o relatório traz as assinaturas do inspetor, do administrador
-- (aprovação das SS), do PCM e do Verificador; a liberação ao SIF (feita pelo Painel de Arquivo) é só
-- o ato administrativo que o torna visível à Inspeção Federal, registrado em liberado_por/liberado_em
-- (trilha de auditoria), sem hash de assinatura nem selo no documento.

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
         liberado_por_nome = public.bpf_nome_usuario(v_uid), liberado_em = now()
   where id = p_id
  returning * into v_rel;
  return v_rel;
end;
$$;

comment on column bpf_relatorios.liberado_por is
  'Administrador que liberou o relatório ao SIF pelo Painel de Arquivo (exige status verificado). Trilha de '
  'auditoria: não é assinatura do documento.';
comment on column bpf_relatorios.hash_liberacao is
  'Legado: relatórios liberados antes de 24/10/2026 (liberação feita pelo Verificador junto da verificação). '
  'A liberação atual não gera hash.';
