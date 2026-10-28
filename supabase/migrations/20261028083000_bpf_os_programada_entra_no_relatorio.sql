-- BPF Estrutural: a OS programada pelo PCM entra sozinha no relatório do dia.
--
-- Antes, uma OS programada durante o dia só aparecia no relatório se o inspetor a verificasse (C sai do
-- relatório; NP/NC entram) e, depois da emissão, o relatório do dia não mudava mais. Agora:
--   1) relatório do dia AINDA NÃO emitido: no ato de emitir, toda OS programada hoje pelo PCM que o inspetor
--      não verificou entra no relatório como "no prazo" (NP), marcada sem_verificacao = true;
--   2) relatório do dia JÁ emitido (emitido ou verificado): bpf_programar_solicitacao acrescenta a OS em
--      itens_posteriores, também como NP sem verificação. A assinatura de emissão (hash_emissao) continua
--      cobrindo só o que o inspetor emitiu: por isso as inclusões ficam numa coluna à parte, com a hora em
--      que o PCM programou e a assinatura da programação (hash) dentro do item;
--   3) relatório já liberado ao SIF é imutável: a OS não entra nele (entra normalmente nos dias seguintes).
-- OS importadas do relatório manual (origem = importada) não contam: não foram programadas pelo PCM no sistema.
--
-- Também: a OS que o inspetor marcou NÃO CONFORME e que o PCM reprogramou no MESMO dia deixa de constar como não
-- conforme no relatório: o item continua com o veredito NC do inspetor, mas leva `reprogramada` (nova programação,
-- novo prazo, quem e quando) e conta em qtd_nc_reprogramadas, não em qtd_nc. Vale na emissão, na geração do dia e
-- também quando o PCM reprograma DEPOIS da emissão (reprogramacoes_posteriores, sem mexer nos itens assinados).

-- Idempotente (if not exists): pode ser rodada de novo sem erro, por exemplo se for aplicada pelo painel do Supabase e depois pelo pipeline.
alter table bpf_relatorios
  add column if not exists itens_posteriores jsonb not null default '[]'::jsonb,
  add column if not exists reprogramacoes_posteriores jsonb not null default '[]'::jsonb,
  add column if not exists qtd_nc_reprogramadas integer not null default 0;

comment on column bpf_relatorios.reprogramacoes_posteriores is
  'Reprogramações feitas pelo PCM, no mesmo dia, depois da emissão, de OS que constam como NC nos itens: '
  '[{numero_os, reprogramada:{sequencia, prazo, justificativa, por, em, hash}}]. Fora do hash_emissao.';
comment on column bpf_relatorios.qtd_nc_reprogramadas is
  'NC marcadas pelo inspetor no dia e reprogramadas pelo PCM no mesmo dia; não entram em qtd_nc.';
comment on column bpf_relatorios.itens_posteriores is
  'OS programadas pelo PCM depois da emissão do relatório do dia (resultado NP, sem verificação do inspetor). '
  'Ficam fora do hash_emissao, que cobre apenas os itens assinados pelo inspetor; qtd_np já as inclui.';

-- Item do relatório de uma OS: o único montador, usado na emissão, na inclusão posterior e na geração do dia.
-- Com p_verificacao_id, traz o veredito do inspetor; sem ele, é uma OS programada pelo PCM ainda não verificada
-- (entra como NP, sem_verificacao = true).
create or replace function public.bpf_item_relatorio(p_ordem_id uuid, p_verificacao_id uuid default null)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'numero_os', o.numero_os,
           'solicitacao_numero', s.numero,
           'anomalia', o.descricao,
           'categoria', o.categoria,
           'local_detalhe', o.local_detalhe,
           'setor_area', cc.nome,
           'centro_custo_codigo', cc.codigo,
           'acao_corretiva', o.acao_corretiva,
           'responsavel', o.responsavel,
           'constatado_em', o.constatado_em,
           'constatado_por', s.aberta_por_nome,
           'aprovada_por', s.aprovada_por_nome,
           'aprovada_em', s.aprovada_em,
           'aprovada_hash', s.hash_aprovacao,
           'origem', o.origem,
           'prazo_vigente', coalesce(v.prazo_vigente, o.prazo_atual),
           'reprogramacoes', o.reprogramacoes,
           'programacao', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'sequencia', p.sequencia, 'prazo', p.prazo,
                      'justificativa', p.justificativa, 'por', p.programado_por_nome,
                      'em', p.criado_em, 'hash', p.hash_assinatura)
                      order by p.sequencia), '[]'::jsonb)
               from bpf_programacoes p where p.ordem_id = o.id),
           'resultado', coalesce(v.resultado, 'NP'),
           'data_verificacao', v.data_verificacao,
           'hora_verificacao', v.hora_verificacao,
           'inspetor', v.inspetor_nome,
           'observacao', v.observacao
         )
         -- NC reprogramada pelo PCM no mesmo dia, depois da marcação do inspetor.
         || case
              when v.resultado = 'NC' then coalesce((
                select jsonb_build_object('reprogramada', jsonb_build_object(
                         'sequencia', p.sequencia, 'prazo', p.prazo, 'justificativa', p.justificativa,
                         'por', p.programado_por_nome, 'em', p.criado_em, 'hash', p.hash_assinatura))
                  from bpf_programacoes p
                 where p.ordem_id = o.id
                   and p.sequencia > 0
                   and p.criado_em > ((v.data_verificacao + v.hora_verificacao) at time zone 'America/Manaus')
                   and p.criado_em < ((v.data_verificacao + 1)::timestamp at time zone 'America/Manaus')
                 order by p.sequencia desc
                 limit 1), '{}'::jsonb)
              else '{}'::jsonb
            end
         || case
              when v.id is null then jsonb_build_object(
                'sem_verificacao', true,
                'programada_em', (select p.criado_em from bpf_programacoes p where p.ordem_id = o.id and p.sequencia = 0))
              else '{}'::jsonb
            end
    from bpf_ordens o
    join centros_custo cc on cc.id = o.centro_custo_id
    left join bpf_solicitacoes s on s.id = o.solicitacao_id
    left join bpf_verificacoes v on v.id = p_verificacao_id
   where o.id = p_ordem_id
$$;

-- Só as funções abaixo (SECURITY DEFINER) usam este auxiliar: o cliente não o chama.
revoke all on function public.bpf_item_relatorio(uuid, uuid) from public, anon, authenticated;

-- Acrescenta a OS ao relatório de hoje do setor, se ele já foi emitido e ainda não foi liberado ao SIF.
create or replace function public.bpf_incluir_os_no_relatorio_do_dia(p_ordem_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_os bpf_ordens;
  v_rel bpf_relatorios;
begin
  select * into v_os from bpf_ordens where id = p_ordem_id;
  if not found or v_os.origem <> 'v2' then
    return;
  end if;

  select * into v_rel
    from bpf_relatorios
   where setor = v_os.setor and data_referencia = public.bpf_hoje()
   for update;
  if not found or v_rel.status = 'liberado' then
    return;
  end if;
  -- Já consta (chamada repetida): não duplica.
  if exists (select 1 from jsonb_array_elements(v_rel.itens_posteriores) i where i ->> 'numero_os' = v_os.numero_os) then
    return;
  end if;

  update bpf_relatorios
     set itens_posteriores = itens_posteriores || jsonb_build_array(public.bpf_item_relatorio(v_os.id)),
         qtd_np = qtd_np + 1
   where id = v_rel.id;
end;
$$;

revoke all on function public.bpf_incluir_os_no_relatorio_do_dia(uuid) from public, anon, authenticated;

-- Reprogramação feita depois da emissão: a OS que consta como NC nos itens passa a constar como "NC reprogramada".
create or replace function public.bpf_registrar_reprogramacao_no_relatorio(p_ordem_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_os bpf_ordens;
  v_rel bpf_relatorios;
  v_repro jsonb;
  v_ja boolean;
begin
  select * into v_os from bpf_ordens where id = p_ordem_id;
  if not found then
    return;
  end if;

  select * into v_rel
    from bpf_relatorios
   where setor = v_os.setor and data_referencia = public.bpf_hoje()
   for update;
  if not found or v_rel.status = 'liberado' then
    return;
  end if;

  -- Só vale para a OS que o relatório emitido traz como não conforme.
  if not exists (select 1 from jsonb_array_elements(v_rel.itens) i
                  where i ->> 'numero_os' = v_os.numero_os and i ->> 'resultado' = 'NC') then
    return;
  end if;

  select jsonb_build_object('sequencia', p.sequencia, 'prazo', p.prazo, 'justificativa', p.justificativa,
                            'por', p.programado_por_nome, 'em', p.criado_em, 'hash', p.hash_assinatura)
    into v_repro
    from bpf_programacoes p
   where p.ordem_id = v_os.id and p.sequencia > 0
   order by p.sequencia desc
   limit 1;
  if v_repro is null then
    return;
  end if;

  -- Já constava como reprogramada (na emissão ou numa reprogramação anterior do dia): só atualiza os dados.
  v_ja := exists (select 1 from jsonb_array_elements(v_rel.itens) i
                   where i ->> 'numero_os' = v_os.numero_os and i ? 'reprogramada')
       or exists (select 1 from jsonb_array_elements(v_rel.reprogramacoes_posteriores) e
                   where e ->> 'numero_os' = v_os.numero_os);

  update bpf_relatorios
     set reprogramacoes_posteriores =
           coalesce((select jsonb_agg(e) from jsonb_array_elements(reprogramacoes_posteriores) e
                      where e ->> 'numero_os' <> v_os.numero_os), '[]'::jsonb)
           || jsonb_build_array(jsonb_build_object('numero_os', v_os.numero_os, 'reprogramada', v_repro)),
         qtd_nc = qtd_nc - case when v_ja then 0 else 1 end,
         qtd_nc_reprogramadas = qtd_nc_reprogramadas + case when v_ja then 0 else 1 end
   where id = v_rel.id;
end;
$$;

revoke all on function public.bpf_registrar_reprogramacao_no_relatorio(uuid) from public, anon, authenticated;

-- PCM reprograma o prazo (mesma função de antes + registro da reprogramação no relatório do dia já emitido).
create or replace function public.bpf_reprogramar_ordem(
  p_ordem_id uuid,
  p_novo_prazo date,
  p_justificativa text,
  p_acao_corretiva text default null,
  p_responsavel text default null
)
returns bpf_ordens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_os bpf_ordens;
  v_acao text;
  v_resp text;
  v_hash text;
begin
  if v_uid is null or not public.tem_permissao('bpf_ordens', 'programar') then
    raise exception 'Sem permissão para reprogramar OS.';
  end if;
  if length(btrim(coalesce(p_justificativa, ''))) < 10 then
    raise exception 'Informe a justificativa da reprogramação (mínimo de 10 caracteres).';
  end if;
  select * into v_os from bpf_ordens where id = p_ordem_id for update;
  if not found then raise exception 'OS não encontrada.'; end if;
  if v_os.status <> 'PROGRAMADA' then
    raise exception 'A OS % já foi concluída e não pode ser reprogramada.', v_os.numero_os;
  end if;
  if p_novo_prazo is null or p_novo_prazo < public.bpf_hoje() then
    raise exception 'O novo prazo não pode ser anterior a hoje.';
  end if;
  if p_novo_prazo = v_os.prazo_atual then
    raise exception 'O novo prazo é igual ao prazo atual.';
  end if;

  v_acao := coalesce(nullif(btrim(coalesce(p_acao_corretiva, '')), ''), v_os.acao_corretiva);
  v_resp := coalesce(nullif(btrim(coalesce(p_responsavel, '')), ''), v_os.responsavel);

  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'ordem_id', v_os.id, 'numero_os', v_os.numero_os, 'sequencia', v_os.reprogramacoes + 1,
    'prazo_anterior', v_os.prazo_atual, 'prazo', p_novo_prazo, 'acao_corretiva', v_acao,
    'responsavel', v_resp, 'justificativa', btrim(p_justificativa),
    'programado_por', v_uid)::text, 'UTF8')), 'hex');

  insert into bpf_programacoes (ordem_id, sequencia, prazo, acao_corretiva, responsavel,
                                justificativa, programado_por, programado_por_nome, hash_assinatura)
  values (v_os.id, v_os.reprogramacoes + 1, p_novo_prazo, v_acao, v_resp, btrim(p_justificativa),
          v_uid, public.bpf_nome_usuario(v_uid), v_hash);

  update bpf_ordens
     set prazo_atual = p_novo_prazo, reprogramacoes = reprogramacoes + 1,
         acao_corretiva = v_acao, responsavel = v_resp
   where id = v_os.id
  returning * into v_os;

  -- Relatório de hoje já emitido: a OS marcada NC hoje passa a constar como reprogramada.
  perform public.bpf_registrar_reprogramacao_no_relatorio(v_os.id);
  return v_os;
end;
$$;

-- PCM transforma a SS aprovada em OS e programa (mesma função de antes + inclusão no relatório do dia).
create or replace function public.bpf_programar_solicitacao(
  p_solicitacao_id uuid,
  p_numero_os text,
  p_acao_corretiva text,
  p_responsavel text,
  p_prazo date
)
returns bpf_ordens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_ss bpf_solicitacoes;
  v_os bpf_ordens;
  v_hash text;
begin
  if v_uid is null or not public.tem_permissao('bpf_ordens', 'programar') then
    raise exception 'Sem permissão para programar OS.';
  end if;
  if length(btrim(coalesce(p_numero_os, ''))) = 0 then
    raise exception 'Informe o número da OS.';
  end if;
  if length(btrim(coalesce(p_acao_corretiva, ''))) < 5 then
    raise exception 'Descreva a ação que será executada para sanar a não conformidade.';
  end if;
  if p_prazo is null or p_prazo < public.bpf_hoje() then
    raise exception 'O prazo de execução não pode ser anterior a hoje.';
  end if;

  select * into v_ss from bpf_solicitacoes where id = p_solicitacao_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_ss.status <> 'APROVADA' then
    raise exception 'A solicitação % não está aprovada para programação.', v_ss.numero;
  end if;

  v_nome := public.bpf_nome_usuario(v_uid);
  begin
    insert into bpf_ordens (numero_os, solicitacao_id, setor, centro_custo_id, categoria, descricao,
                            local_detalhe, constatado_em, acao_corretiva, responsavel, prazo_atual,
                            programado_por, programado_por_nome)
    values (btrim(p_numero_os), v_ss.id, v_ss.setor, v_ss.centro_custo_id, v_ss.categoria,
            v_ss.descricao, v_ss.local_detalhe, v_ss.constatado_em, btrim(p_acao_corretiva),
            nullif(btrim(coalesce(p_responsavel, '')), ''), p_prazo, v_uid, v_nome)
    returning * into v_os;
  exception when unique_violation then
    raise exception 'Já existe uma OS com o número %.', btrim(p_numero_os);
  end;

  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'ordem_id', v_os.id, 'numero_os', v_os.numero_os, 'solicitacao_id', v_ss.id,
    'hash_aprovacao', v_ss.hash_aprovacao, 'sequencia', 0, 'prazo', p_prazo,
    'acao_corretiva', v_os.acao_corretiva, 'responsavel', v_os.responsavel,
    'programado_por', v_uid)::text, 'UTF8')), 'hex');

  insert into bpf_programacoes (ordem_id, sequencia, prazo, acao_corretiva, responsavel,
                                programado_por, programado_por_nome, hash_assinatura)
  values (v_os.id, 0, p_prazo, v_os.acao_corretiva, v_os.responsavel, v_uid, v_nome, v_hash);

  update bpf_solicitacoes set status = 'PROGRAMADA' where id = v_ss.id;

  -- Relatório de hoje já emitido: a OS programada agora entra nele.
  perform public.bpf_incluir_os_no_relatorio_do_dia(v_os.id);
  return v_os;
end;
$$;

-- Inspetor encerra o dia (mesma função de antes + as OS programadas hoje e ainda não verificadas entram como NP).
create or replace function public.bpf_emitir_relatorio(
  p_setor text default 'MANUTENÇÕES DIVERSAS'
)
returns bpf_relatorios
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := public.bpf_hoje();
  v_inicio_dia timestamptz := (v_hoje::timestamp at time zone 'America/Manaus');
  v_nome text;
  v_faltam integer;
  v_itens jsonb;
  v_nc integer;
  v_np integer;
  v_c integer;
  v_sem_verificacao integer;
  v_nc_reprogramadas integer;
  v_rel bpf_relatorios;
begin
  if v_uid is null or not public.tem_permissao('bpf_relatorios', 'emitir') then
    raise exception 'Sem permissão para emitir o relatório.';
  end if;
  if not public.bpf_setor_permitido(p_setor) then
    raise exception 'Você não tem acesso ao setor %.', p_setor;
  end if;
  if exists (select 1 from bpf_relatorios where setor = p_setor and data_referencia = v_hoje) then
    raise exception 'O relatório de hoje já foi emitido.';
  end if;

  select count(*) into v_faltam
    from bpf_ordens o
   where o.setor = p_setor
     and o.status = 'PROGRAMADA'
     and o.criado_em < v_inicio_dia
     and not exists (select 1 from bpf_verificacoes v
                      where v.ordem_id = o.id and v.data_verificacao = v_hoje);
  if v_faltam > 0 then
    raise exception 'Faltam % OS sem verificação hoje. Marque C, NP ou NC em todas antes de emitir.', v_faltam;
  end if;

  v_nome := public.bpf_nome_usuario(v_uid);

  select coalesce(jsonb_agg(t.item order by t.centro_nome, t.numero_os), '[]'::jsonb)
    into v_itens
    from (
      select cc.nome as centro_nome, o.numero_os, public.bpf_item_relatorio(o.id, v.id) as item
        from bpf_verificacoes v
        join bpf_ordens o on o.id = v.ordem_id
        join centros_custo cc on cc.id = o.centro_custo_id
       where v.data_verificacao = v_hoje
         and o.setor = p_setor
         and v.resultado in ('NC', 'NP')
      union all
      -- Programadas hoje pelo PCM e que o inspetor não verificou: entram como no prazo, sem verificação.
      select cc.nome, o.numero_os, public.bpf_item_relatorio(o.id)
        from bpf_ordens o
        join centros_custo cc on cc.id = o.centro_custo_id
       where o.setor = p_setor
         and o.origem = 'v2'
         and o.status = 'PROGRAMADA'
         and o.criado_em >= v_inicio_dia
         and not exists (select 1 from bpf_verificacoes v
                          where v.ordem_id = o.id and v.data_verificacao = v_hoje)
    ) t;

  select count(*) filter (where v.resultado = 'NC'),
         count(*) filter (where v.resultado = 'NP'),
         count(*) filter (where v.resultado = 'C')
    into v_nc, v_np, v_c
    from bpf_verificacoes v join bpf_ordens o on o.id = v.ordem_id
   where v.data_verificacao = v_hoje and o.setor = p_setor;

  select count(*) into v_sem_verificacao
    from jsonb_array_elements(v_itens) i
   where (i ->> 'sem_verificacao')::boolean is true;
  v_np := v_np + v_sem_verificacao;

  -- NC reprogramada pelo PCM no mesmo dia não conta como não conforme.
  select count(*) into v_nc_reprogramadas
    from jsonb_array_elements(v_itens) i
   where i ->> 'resultado' = 'NC' and i ? 'reprogramada';
  v_nc := v_nc - v_nc_reprogramadas;

  insert into bpf_relatorios (setor, data_referencia, itens, qtd_nc, qtd_np, qtd_conformes, qtd_nc_reprogramadas,
                              emitido_por, emitido_por_nome, hash_emissao)
  values (p_setor, v_hoje, v_itens, v_nc, v_np, v_c, v_nc_reprogramadas, v_uid, v_nome,
          encode(sha256(convert_to(jsonb_build_object(
            'setor', p_setor, 'data', v_hoje, 'itens', v_itens, 'emitido_por', v_uid)::text,
            'UTF8')), 'hex'))
  returning * into v_rel;
  return v_rel;
end;
$$;
