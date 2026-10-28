-- BPF Estrutural: relatório diário gerado na hora, a partir da data escolhida.
--
-- bpf_relatorio_do_dia(data, setor):
--   * data com relatório já EMITIDO: devolve o relatório gravado (assinado), sem mudar nada;
--   * data sem relatório emitido: monta o relatório na hora com os registros do dia — mesmos itens e mesmo formato
--     da emissão (bpf_item_relatorio): as OS verificadas NC/NP e as programadas pelo PCM no dia ainda sem
--     verificação (NP). Não grava nada e vem marcado provisorio = true: não é o documento assinado.
-- Quem só pode ver o que foi liberado ao SIF (Inspeção Federal) recebe apenas relatório liberado.

create or replace function public.bpf_relatorio_do_dia(
  p_dia date,
  p_setor text default 'MANUTENÇÕES DIVERSAS'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil text := public.meu_perfil();
  v_inicio timestamptz;
  v_fim timestamptz;
  v_rel bpf_relatorios;
  v_itens jsonb;
  v_nc integer;
  v_np integer;
  v_c integer;
  v_sem_verificacao integer;
  v_nc_reprogramadas integer;
  v_pendentes integer;
begin
  if v_uid is null or not public.tem_permissao('bpf_relatorios', 'ler') then
    raise exception 'Sem permissão para consultar o relatório.';
  end if;
  if p_dia is null then
    raise exception 'Escolha a data do relatório.';
  end if;
  if p_dia > public.bpf_hoje() then
    raise exception 'Escolha uma data até hoje (%).', to_char(public.bpf_hoje(), 'DD/MM/YYYY');
  end if;
  if not (v_perfil in ('ADMIN_MASTER', 'VERIFICADOR', 'INSPECAO_FEDERAL') or p_setor = any (public.meus_setores())) then
    raise exception 'Você não tem acesso ao setor %.', p_setor;
  end if;

  select * into v_rel from bpf_relatorios where setor = p_setor and data_referencia = p_dia;
  if found then
    if v_perfil = 'INSPECAO_FEDERAL' and v_rel.status <> 'liberado' then
      raise exception 'Nenhum relatório liberado em %.', to_char(p_dia, 'DD/MM/YYYY');
    end if;
    return to_jsonb(v_rel) || jsonb_build_object('provisorio', false);
  end if;
  if v_perfil = 'INSPECAO_FEDERAL' then
    raise exception 'Nenhum relatório liberado em %.', to_char(p_dia, 'DD/MM/YYYY');
  end if;

  v_inicio := (p_dia::timestamp at time zone 'America/Manaus');
  v_fim := ((p_dia + 1)::timestamp at time zone 'America/Manaus');

  select coalesce(jsonb_agg(t.item order by t.centro_nome, t.numero_os), '[]'::jsonb)
    into v_itens
    from (
      select cc.nome as centro_nome, o.numero_os, public.bpf_item_relatorio(o.id, v.id) as item
        from bpf_verificacoes v
        join bpf_ordens o on o.id = v.ordem_id
        join centros_custo cc on cc.id = o.centro_custo_id
       where v.data_verificacao = p_dia
         and o.setor = p_setor
         and v.resultado in ('NC', 'NP')
      union all
      select cc.nome, o.numero_os, public.bpf_item_relatorio(o.id)
        from bpf_ordens o
        join centros_custo cc on cc.id = o.centro_custo_id
       where o.setor = p_setor
         and o.origem = 'v2'
         and o.criado_em >= v_inicio and o.criado_em < v_fim
         and not exists (select 1 from bpf_verificacoes v
                          where v.ordem_id = o.id and v.data_verificacao = p_dia)
    ) t;

  select count(*) filter (where v.resultado = 'NC'),
         count(*) filter (where v.resultado = 'NP'),
         count(*) filter (where v.resultado = 'C')
    into v_nc, v_np, v_c
    from bpf_verificacoes v join bpf_ordens o on o.id = v.ordem_id
   where v.data_verificacao = p_dia and o.setor = p_setor;

  select count(*) into v_sem_verificacao
    from jsonb_array_elements(v_itens) i
   where (i ->> 'sem_verificacao')::boolean is true;

  -- NC reprogramada pelo PCM no mesmo dia não conta como não conforme (o item mostra a reprogramação).
  select count(*) into v_nc_reprogramadas
    from jsonb_array_elements(v_itens) i
   where i ->> 'resultado' = 'NC' and i ? 'reprogramada';

  -- OS que já existiam no dia, ainda abertas, e que o inspetor não verificou: não têm veredito, então não constam no relatório.
  select count(*) into v_pendentes
    from bpf_ordens o
   where o.setor = p_setor
     and o.criado_em < v_inicio
     and (o.concluida_em is null or o.concluida_em >= v_inicio)
     and not exists (select 1 from bpf_verificacoes v
                      where v.ordem_id = o.id and v.data_verificacao = p_dia);

  return jsonb_build_object(
    'provisorio', true,
    'setor', p_setor,
    'data_referencia', p_dia,
    'gerado_em', now(),
    'itens', v_itens,
    'itens_posteriores', '[]'::jsonb,
    'qtd_nc', v_nc - v_nc_reprogramadas,
    'qtd_nc_reprogramadas', v_nc_reprogramadas,
    'reprogramacoes_posteriores', '[]'::jsonb,
    'qtd_np', v_np + v_sem_verificacao,
    'qtd_conformes', v_c,
    'sem_verificacao_pendentes', v_pendentes
  );
end;
$$;

revoke all on function public.bpf_relatorio_do_dia(date, text) from public, anon;
grant execute on function public.bpf_relatorio_do_dia(date, text) to authenticated;
