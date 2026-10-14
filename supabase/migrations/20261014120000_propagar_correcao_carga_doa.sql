-- Correção por adendo de um dado de CARGA no monitoramento de Rastreabilidade e Controle de DOA segue para as apurações SEGUINTES do
-- mesmo dia de abate (inclusive as de outros inspetores). Cada apuração guarda a própria cópia da carga (aves recebidas, mortas,
-- % de DOA, saldo, nota) e a soma do dia; o adendo corrigia só o registro em que foi feito.
--
-- Como em propagar_leitura_adendo (20261014083708), a função é SECURITY DEFINER (grava o aditivo no nome do dono da apuração
-- seguinte) e NÃO aceita dados do cliente: recebe só QUAL carga e QUAL dado, confere no servidor que o adendo está assinado no
-- registro do chamador, que o dado corrigido é daquela carga e que o valor atual no seguinte ainda é o antigo, aplica o valor
-- novo e REFAZ a % de DOA, o saldo, a nota e a soma do dia (mesmas regras de rastreabilidadeDoa.ts).

create or replace function public.ler_contagem_doa(t text)
returns bigint
language sql
immutable
as $$
  select case when btrim(coalesce(t, '')) ~ '^\d+$' then btrim(t)::bigint else null end;
$$;

create or replace function public.formatar_inteiro_ptbr(n bigint)
returns text
language sql
immutable
as $$
  select replace(to_char(n, 'FM999,999,999,999,999'), ',', '.');
$$;

-- Nota de documento de correção de saldo (espelha notaCorrecaoSaldo): 1 ave a mais que a GTA ou 10% (ou mais) a menos.
create or replace function public.nota_saldo_doa(p_prevista bigint, p_recebidas bigint)
returns text
language plpgsql
immutable
as $$
declare
  v_dif bigint;
  v_pct numeric;
begin
  if p_recebidas is null or p_prevista is null or p_prevista <= 0 then
    return null;
  end if;
  if p_recebidas > p_prevista then
    v_dif := p_recebidas - p_prevista;
    return 'Vieram ' || public.formatar_inteiro_ptbr(v_dif) || ' ave' || case when v_dif > 1 then 's' else '' end
      || ' a mais que as ' || public.formatar_inteiro_ptbr(p_prevista) || ' previstas na GTA: necessário documento de correção do saldo.';
  elsif p_recebidas * 100 <= p_prevista * 90 then
    v_dif := p_prevista - p_recebidas;
    v_pct := round(v_dif::numeric * 10000 / p_prevista) / 100;
    return 'Vieram ' || public.formatar_inteiro_ptbr(v_dif) || ' ave' || case when v_dif > 1 then 's' else '' end
      || ' a menos (' || replace(rtrim(rtrim(to_char(v_pct, 'FM990.00'), '0'), '.'), '.', ',') || '%) que as '
      || public.formatar_inteiro_ptbr(p_prevista) || ' previstas na GTA: necessário documento de correção do saldo.';
  end if;
  return null;
end;
$$;

-- Refaz os derivados de UMA carga (doaPct, saldoDiferenca, notaSaldo) a partir das aves digitadas e da quantidade prevista.
create or replace function public.recalcular_carga_doa(p_carga jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_rec bigint := public.ler_contagem_doa(p_carga ->> 'avesRecebidas');
  v_mor bigint := public.ler_contagem_doa(p_carga ->> 'avesMortas');
  v_prev bigint := case when (p_carga ->> 'qtdPrevista') ~ '^\d+(\.\d+)?$' then round((p_carga ->> 'qtdPrevista')::numeric)::bigint else null end;
begin
  return p_carga || jsonb_build_object(
    'doaPct', case when v_mor is null or v_rec is null or v_rec <= 0 then null else round(v_mor::numeric / v_rec * 10000)::float8 / 100 end,
    'saldoDiferenca', case when v_rec is null or v_prev is null then null else v_rec - v_prev end,
    'notaSaldo', public.nota_saldo_doa(v_prev, v_rec)
  );
end;
$$;

-- Refaz a SOMA do dia (totalRecebidas, totalMortas, doaTotalPct) de um valor de DOA: só entram cargas com recebidas E mortas.
create or replace function public.recalcular_totais_doa(p_valor jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_c jsonb;
  v_rec bigint;
  v_mor bigint;
  v_tr bigint := 0;
  v_tm bigint := 0;
begin
  for v_c in select t.e from jsonb_array_elements(coalesce(p_valor -> 'cargas', '[]'::jsonb)) as t(e) loop
    v_rec := public.ler_contagem_doa(v_c ->> 'avesRecebidas');
    v_mor := public.ler_contagem_doa(v_c ->> 'avesMortas');
    if v_rec is not null and v_mor is not null then
      v_tr := v_tr + v_rec;
      v_tm := v_tm + v_mor;
    end if;
  end loop;
  return p_valor || jsonb_build_object(
    'totalRecebidas', v_tr,
    'totalMortas', v_tm,
    'doaTotalPct', case when v_tr <= 0 then null else round(v_tm::numeric / v_tr * 10000)::float8 / 100 end
  );
end;
$$;

create or replace function public.propagar_correcao_carga_doa(
  p_origem uuid,
  p_adendo uuid,
  p_alvo uuid,
  p_ajustes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_origem public.monitoramentos;
  v_raiz uuid;
  v_vig public.monitoramentos;
  v_alvo public.monitoramentos;
  v_alvo_raiz uuid;
  v_codigo text;
  v_adendo jsonb;
  v_dados jsonb;
  v_aj jsonb;
  v_campo text;
  v_carga_id text;
  v_prop text;
  v_chave text;
  v_corr jsonb;
  v_corr_key text;
  v_i int;
  v_j int;
  v_atual text;
  v_novo_txt text;
  v_campos_tocados text[] := '{}';
  v_registro jsonb := '[]'::jsonb;
  v_hora_vig timestamptz;
  v_hora_alvo timestamptz;
  v_novo uuid;
begin
  if v_uid is null or not public.tem_permissao('monitoramentos', 'criar') then
    raise exception 'Sem permissão para propagar a correção.' using errcode = '42501';
  end if;

  select * into v_origem from public.monitoramentos where id = p_origem;
  if not found then
    raise exception 'Monitoramento corrigido não encontrado.';
  end if;
  v_raiz := coalesce(v_origem.aditivo_de, v_origem.id);

  select * into v_vig
  from public.monitoramentos m
  where m.id = v_raiz or m.aditivo_de = v_raiz
  order by m.criado_em desc, m.id desc
  limit 1;

  if v_vig.user_id <> v_uid or not (v_vig.setor = any (public.meus_setores())) then
    raise exception 'Só o dono do monitoramento corrigido pode propagar a correção.' using errcode = '42501';
  end if;

  select t.a into v_adendo
  from jsonb_array_elements(coalesce(v_vig.dados_dinamicos -> 'adendos', '[]'::jsonb)) as t(a)
  where t.a ->> 'id' = p_adendo::text and t.a ->> 'status' = 'completed'
  limit 1;
  if v_adendo is null then
    raise exception 'O adendo informado não está assinado neste monitoramento.';
  end if;

  select * into v_alvo from public.monitoramentos where id = p_alvo;
  if not found then
    raise exception 'Monitoramento seguinte não encontrado.';
  end if;
  v_alvo_raiz := coalesce(v_alvo.aditivo_de, v_alvo.id);
  if v_alvo_raiz = v_raiz then
    raise exception 'O monitoramento seguinte não pode ser o próprio corrigido.';
  end if;
  if exists (
    select 1 from public.monitoramentos x
    where x.aditivo_de = v_alvo_raiz
      and x.id <> v_alvo.id
      and (x.criado_em > v_alvo.criado_em or (x.criado_em = v_alvo.criado_em and x.id > v_alvo.id))
  ) then
    raise exception 'O monitoramento seguinte já tem uma versão mais recente: atualize a tela e tente de novo.';
  end if;

  select t.codigo into v_codigo from public.fichas_templates t where t.id = v_vig.ficha_template_id;
  if not exists (select 1 from public.fichas_templates t where t.id = v_alvo.ficha_template_id and t.codigo = v_codigo)
     or v_alvo.setor <> v_vig.setor then
    raise exception 'O monitoramento seguinte não é da mesma ficha e setor.';
  end if;

  v_hora_vig := coalesce(v_vig.hora_monitoramento, v_vig.criado_em);
  v_hora_alvo := coalesce(v_alvo.hora_monitoramento, v_alvo.criado_em);
  if v_hora_alvo <= v_hora_vig then
    raise exception 'O monitoramento seguinte não é posterior ao corrigido.';
  end if;

  v_dados := v_alvo.dados_dinamicos;
  for v_aj in select t.e from jsonb_array_elements(coalesce(p_ajustes, '[]'::jsonb)) as t(e) loop
    v_campo := v_aj ->> 'campo';
    v_carga_id := v_aj ->> 'cargaId';
    v_prop := v_aj ->> 'prop';
    if v_campo is null or v_campo !~ '^[A-Za-z0-9_]+$' or v_carga_id is null or v_carga_id !~ '^[0-9a-fA-F-]{36}$'
       or v_prop is null or v_prop not in ('avesRecebidas', 'avesMortas', 'pesoMedioKg', 'placa', 'penduraInicioEm', 'gta', 'integrado', 'aviario', 'nucleo') then
      raise exception 'Ajuste de carga inválido.';
    end if;

    -- A correção assinada tem de ser deste dado desta carga, no registro corrigido (a carga é achada pelo id, não pela posição).
    v_corr := null;
    for v_corr_key in select k from jsonb_object_keys(coalesce(v_adendo -> 'corrections', '{}'::jsonb)) as k
                      where k ~ ('^' || v_campo || '\.cargas\.[0-9]+\.' || v_prop || '$') loop
      v_i := (regexp_match(v_corr_key, '\.cargas\.([0-9]+)\.'))[1]::int;
      if v_vig.dados_dinamicos -> v_campo -> 'cargas' -> v_i ->> 'cargaId' = v_carga_id then
        v_corr := v_adendo -> 'corrections' -> v_corr_key;
        exit;
      end if;
    end loop;
    if v_corr is null then
      raise exception 'O adendo não corrige % da carga informada.', v_prop;
    end if;

    -- Mesmo dia de abate.
    if (v_vig.dados_dinamicos -> v_campo ->> 'dataAbate') is distinct from (v_dados -> v_campo ->> 'dataAbate') then
      raise exception 'O monitoramento seguinte é de outro dia de abate.';
    end if;

    -- A carga no seguinte (pela id) e o valor atual: tem de ser ainda o antigo.
    select (t.ord - 1)::int into v_j
    from jsonb_array_elements(coalesce(v_dados -> v_campo -> 'cargas', '[]'::jsonb)) with ordinality as t(e, ord)
    where t.e ->> 'cargaId' = v_carga_id
    limit 1;
    if v_j is null then
      raise exception 'A carga não consta no monitoramento seguinte.';
    end if;
    v_atual := v_dados #>> array[v_campo, 'cargas', v_j::text, v_prop];
    if btrim(coalesce(v_atual, '')) <> btrim(coalesce(v_corr ->> 'old', '')) then
      raise exception 'O valor de % da carga no monitoramento seguinte não é o corrigido pelo adendo.', v_prop;
    end if;
    v_novo_txt := coalesce(v_corr ->> 'new', '');

    v_dados := jsonb_set(v_dados, array[v_campo, 'cargas', v_j::text, v_prop], to_jsonb(v_novo_txt));
    v_dados := jsonb_set(v_dados, array[v_campo, 'cargas', v_j::text], public.recalcular_carga_doa(v_dados -> v_campo -> 'cargas' -> v_j));
    if not (v_campo = any (v_campos_tocados)) then
      v_campos_tocados := v_campos_tocados || v_campo;
    end if;
    v_registro := v_registro || jsonb_build_object(
      'origemId', v_raiz,
      'adendoId', p_adendo,
      'caminho', v_campo || '.cargas.' || v_j || '.' || v_prop,
      'cargaId', v_carga_id,
      'de', coalesce(v_atual, ''),
      'para', v_novo_txt,
      'em', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  end loop;

  if jsonb_array_length(v_registro) = 0 then
    raise exception 'Não há correção a propagar para este monitoramento.';
  end if;

  -- A SOMA do dia de cada campo de DOA tocado.
  foreach v_chave in array v_campos_tocados loop
    v_dados := jsonb_set(v_dados, array[v_chave], public.recalcular_totais_doa(v_dados -> v_chave));
  end loop;

  v_dados := jsonb_set(
    v_dados,
    '{correcoes_propagadas}',
    (case when jsonb_typeof(v_dados -> 'correcoes_propagadas') = 'array' then v_dados -> 'correcoes_propagadas' else '[]'::jsonb end) || v_registro,
    true
  );

  insert into public.monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de, hora_monitoramento)
  values (v_alvo.ficha_template_id, v_alvo.versao_template, v_alvo.user_id, v_alvo.setor, v_dados, v_alvo_raiz, v_alvo.hora_monitoramento)
  returning id into v_novo;

  return v_novo;
end;
$$;

revoke all on function public.ler_contagem_doa(text) from public, anon;
revoke all on function public.formatar_inteiro_ptbr(bigint) from public, anon;
revoke all on function public.nota_saldo_doa(bigint, bigint) from public, anon;
revoke all on function public.recalcular_carga_doa(jsonb) from public, anon;
revoke all on function public.recalcular_totais_doa(jsonb) from public, anon;
revoke all on function public.propagar_correcao_carga_doa(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.propagar_correcao_carga_doa(uuid, uuid, uuid, jsonb) to authenticated;

comment on function public.propagar_correcao_carga_doa(uuid, uuid, uuid, jsonb) is
  'Grava o aditivo da apuração SEGUINTE de DOA (de qualquer inspetor) com a carga corrigida por um adendo assinado e a soma do dia refeita. '
  'Valida tudo no servidor. Ver 20261014120000.';
