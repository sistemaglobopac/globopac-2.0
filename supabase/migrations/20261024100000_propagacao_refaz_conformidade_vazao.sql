-- A propagação da correção de leitura (hidrômetro) passa a REFAZER a conformidade do campo corrigido no monitoramento seguinte.
--
-- propagar_leitura_adendo só acertava a leitura anterior (`prev`) herdada. Mas o widget de vazão (SPR Carcaças, Partes, Miúdos e
-- Chuveiro Final) grava DENTRO do valor do campo o veredito calculado no preenchimento — `conformidade` e `detalhesRNC` — e esses
-- continuavam os do cálculo com a leitura errada: o relatório mostrava a tabela já recalculada (CONFORME), mas o selo NÃO CONFORME, o
-- texto "Vazão Insuficiente … Apurado: -21904 L/kg" e o aviso de RNC seguiam gravados. (Caso real: Chiller 2 Partes, 23/10/2026 11:50.)
--
-- Agora, depois de acertar a(s) leitura(s) anterior(es), a função refaz `conformidade` e `detalhesRNC` de cada campo tocado com
-- refazer_conformidade_vazao — as mesmas regras de ChillerCarcacasField / ChillerPartesField / MiniChillersField / LavagemFinalField
-- (calculosSpr.ts, vereditoVazao.ts), a partir dos valores-base JÁ gravados no seguinte (aves no período, peso médio, condenações).
-- Nada vem do cliente: o servidor continua aceitando só o caminho da leitura anterior. Demais validações da função não mudam.

create or replace function public.num_vazao(t text)
returns float8
language sql
immutable
as $$
  select case when btrim(coalesce(t, '')) ~ '^-?\d+([.,]\d+)?$' then replace(btrim(t), ',', '.')::float8 else 0 end;
$$;

-- Litros usados: (atual − anterior) × 1000 + gelo, com a diferença arredondada a 6 casas antes (espelha aguaUsadaLitros).
create or replace function public.agua_usada_vazao(p_prev text, p_cur text, p_gelo float8)
returns float8
language sql
immutable
as $$
  select floor(floor((public.num_vazao(p_cur) - public.num_vazao(p_prev)) * 1e6 + 0.5) / 1e6 * 1000 * 1e6 + 0.5) / 1e6 + p_gelo;
$$;

-- Litros por base; null = sem apuração. Atual = 0 → 0 (espelha apurar).
create or replace function public.apurar_vazao(p_prev text, p_cur text, p_gelo float8, p_base float8)
returns float8
language sql
immutable
as $$
  select case
    when public.num_vazao(p_cur) = 0 then 0::float8
    when p_base = 0 then null
    else public.agua_usada_vazao(p_prev, p_cur, p_gelo) / p_base
  end;
$$;

-- Meta (L/ave) do tanque do SPR Carcaças pela faixa de peso médio da carcaça (espelha metaTanqueCarcacas).
create or replace function public.meta_tanque_carcacas(p_tanque text, p_peso float8)
returns float8
language sql
immutable
as $$
  select case
    when p_peso = 0 then 0::float8
    when p_tanque = 'preChiller' then case when p_peso <= 2.5 then 1.5 when p_peso <= 5.0 then 1.7 else 2.2 end
    when p_tanque = 'chiller1' then case when p_peso <= 2.5 then 1.1 when p_peso <= 5.0 then 1.6 else 2.1 end
    else case when p_peso <= 2.5 then 1.0 when p_peso <= 5.0 then 1.5 else 2.0 end
  end;
$$;

-- Peso unitário (kg) do miúdo pelo peso médio da carcaça: a PRIMEIRA linha da tabela DE-PARA com peso <= máximo (espelha pesosMiudosPorCarcaca).
create or replace function public.peso_unitario_miudo(p_miudo text, p_peso float8)
returns float8
language sql
immutable
as $$
  select case p_miudo when 'coracao' then t.coracao when 'moela' then t.moela when 'figado' then t.figado when 'cabeca' then t.cabeca else t.pes end
  from (values
    (1.199::float8, 0.006::float8, 0.023::float8, 0.03::float8,  0.037::float8, 0.065::float8),
    (1.599::float8, 0.007::float8, 0.025::float8, 0.032::float8, 0.039::float8, 0.066::float8),
    (1.799::float8, 0.007::float8, 0.028::float8, 0.034::float8, 0.04::float8,  0.068::float8),
    (1.899::float8, 0.008::float8, 0.028::float8, 0.035::float8, 0.044::float8, 0.07::float8),
    (2.1::float8,   0.01::float8,  0.028::float8, 0.035::float8, 0.048::float8, 0.07::float8),
    (2.25::float8,  0.01::float8,  0.03::float8,  0.036::float8, 0.05::float8,  0.075::float8),
    (2.35::float8,  0.011::float8, 0.03::float8,  0.038::float8, 0.051::float8, 0.077::float8),
    (2.45::float8,  0.011::float8, 0.031::float8, 0.039::float8, 0.053::float8, 0.082::float8),
    (2.75::float8,  0.011::float8, 0.032::float8, 0.041::float8, 0.054::float8, 0.084::float8),
    ('Infinity'::float8, 0.012::float8, 0.033::float8, 0.042::float8, 0.058::float8, 0.097::float8)
  ) as t(maximo, coracao, moela, figado, cabeca, pes)
  where p_peso <= t.maximo
  order by t.maximo
  limit 1;
$$;

-- "<Tanque> (Apurado: X.XXXL/c | Meta: Y.YYYL/c)" (espelha detalheDesvio).
create or replace function public.detalhe_desvio_vazao(p_nome text, p_apurado float8, p_meta float8, p_unidade text)
returns text
language sql
immutable
as $$
  select p_nome || ' (Apurado: ' || round(p_apurado::numeric, 3)::text || p_unidade || ' | Meta: ' || round(p_meta::numeric, 3)::text || p_unidade || ')';
$$;

-- Número guardado no JSON (número ou texto) como float8; ausente = 0.
create or replace function public.num_json_vazao(p_valor jsonb, p_chave text)
returns float8
language sql
immutable
as $$
  select case jsonb_typeof(p_valor -> p_chave)
    when 'number' then (p_valor ->> p_chave)::float8
    when 'string' then public.num_vazao(p_valor ->> p_chave)
    else 0
  end;
$$;

-- Refaz `conformidade` e `detalhesRNC` de um campo de vazão (SPR Carcaças, Partes, Miúdos ou Chuveiro Final) a partir do que está gravado
-- nele. O formato do campo diz de qual se trata; qualquer outro valor volta como estava.
create or replace function public.refazer_conformidade_vazao(p_valor jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_tanques jsonb := p_valor -> 'tanques';
  v_sem jsonb := case when jsonb_typeof(p_valor -> 'tanquesSemProducao') = 'object' then p_valor -> 'tanquesSemProducao' else '{}'::jsonb end;
  v_tipo text;
  v_prefixo text;
  v_unidade text;
  v_peso float8;
  v_base float8;
  v_aves float8;
  v_pendente boolean := false;
  v_chaves text[];
  v_nomes text[];
  v_i int;
  v_chave text;
  v_tanque jsonb;
  v_cur text;
  v_sem_producao boolean;
  v_apurado float8;
  v_meta float8;
  v_conforme boolean;
  v_ok boolean := true;
  v_detalhes text[] := '{}';
  v_resumo text := null;
begin
  if jsonb_typeof(p_valor) is distinct from 'object' then
    return p_valor;
  end if;

  if jsonb_typeof(p_valor -> 'chuveiro') = 'object' then
    v_tipo := 'chuveiro';
  elsif jsonb_typeof(v_tanques) = 'object' and v_tanques ? 'coracao' then
    v_tipo := 'miudos';
  elsif jsonb_typeof(v_tanques) = 'object' and v_tanques ? 'preChiller' then
    v_tipo := 'carcacas';
  elsif jsonb_typeof(v_tanques) = 'object' and v_tanques ? 'chiller1' then
    v_tipo := 'partes';
  else
    return p_valor;
  end if;

  if v_tipo = 'chuveiro' then
    v_chaves := array['chuveiro'];
    v_nomes := array['Chuveiro Final'];
    v_unidade := 'L/carcaça';
    v_prefixo := 'Vazão Insuficiente (Chuveiro Final): ';
    v_base := public.num_json_vazao(p_valor, 'totalAves');
  elsif v_tipo = 'partes' then
    v_chaves := array['chiller1', 'chiller2'];
    v_nomes := array['Chiller 1 Partes', 'Chiller 2 Partes'];
    v_unidade := 'L/kg';
    v_prefixo := 'Vazão Insuficiente (Partes): ';
    -- Massa processada = parciais × peso médio da carcaça × 0,70.
    v_base := public.num_json_vazao(p_valor, 'totalCondenacoes') * public.num_json_vazao(p_valor, 'pesoMedioCarcaca') * 0.7;
  elsif v_tipo = 'miudos' then
    v_chaves := array['coracao', 'moela', 'figado', 'cabeca', 'pes'];
    v_nomes := array['Coração', 'Moela', 'Fígado', 'Cabeça', 'Pés'];
    v_unidade := 'L/kg';
    v_prefixo := 'Vazão Insuficiente (Mini-Chillers): ';
    v_aves := public.num_json_vazao(p_valor, 'totalAves');
    v_peso := public.num_json_vazao(p_valor, 'pesoCarcaca');
  else
    v_chaves := array['preChiller', 'chiller1', 'chiller2'];
    v_nomes := array['Pré-chiller', 'Chiller 01', 'Chiller 02'];
    v_unidade := 'L/c';
    v_base := public.num_json_vazao(p_valor, 'totalAves');
    v_peso := public.num_json_vazao(p_valor, 'pesoMedioCarcaca');
    -- Peso médio ainda desconhecido (lotes sem peso e sem peso parcial): só vale o veredito antecipado.
    v_pendente := v_peso = 0 and v_base > 0;
    if v_pendente then
      v_prefixo := 'Vazão Insuficiente em qualquer faixa de peso (peso das cargas ainda não informado): ';
    else
      if jsonb_typeof(p_valor -> 'pesoParcial') = 'object' then
        v_resumo := 'peso médio parcial: '
          || public.formatar_inteiro_ptbr(round(public.num_json_vazao(p_valor -> 'pesoParcial', 'avesComPeso'))::bigint)
          || ' de '
          || public.formatar_inteiro_ptbr(round(public.num_json_vazao(p_valor -> 'pesoParcial', 'avesComPeso') + public.num_json_vazao(p_valor -> 'pesoParcial', 'avesSemPeso'))::bigint)
          || ' aves com peso (' || round(public.num_json_vazao(p_valor -> 'pesoParcial', 'lotesSemPeso'))::bigint
          || ' lote(s) sem peso ficaram de fora da média)';
      end if;
      v_prefixo := 'Vazão Insuficiente' || case when v_resumo is not null then ' (' || v_resumo || ')' else '' end || ': ';
    end if;
  end if;

  for v_i in 1 .. array_length(v_chaves, 1) loop
    v_chave := v_chaves[v_i];
    v_tanque := case when v_tipo = 'chuveiro' then p_valor -> 'chuveiro' else v_tanques -> v_chave end;
    if jsonb_typeof(v_tanque) is distinct from 'object' then
      continue;
    end if;
    v_cur := coalesce(v_tanque ->> 'cur', '');
    v_sem_producao := coalesce(case when v_tipo = 'chuveiro' then (p_valor ->> 'semProducao') = 'true' else (v_sem ->> v_chave) = 'true' end, false);

    if v_tipo = 'miudos' then
      v_base := case when v_peso = 0 then 0 else v_aves * public.peso_unitario_miudo(v_chave, v_peso) end;
    end if;
    v_meta := case when v_tipo = 'carcacas' then public.meta_tanque_carcacas(v_chave, v_peso) else 1.5 end;
    -- O chuveiro não tem gelo; nos demais o gelo é o gravado no tanque.
    v_apurado := public.apurar_vazao(
      v_tanque ->> 'prev', v_cur,
      case when v_tipo = 'chuveiro' then 0 else public.num_vazao(v_tanque ->> 'ice') end,
      v_base
    );

    if v_pendente then
      -- Abaixo da meta da faixa mais branda (carcaça até 2,5 kg): não conforme em QUALQUER peso.
      v_meta := public.meta_tanque_carcacas(v_chave, 2.4);
      if v_cur <> '' and v_base > 0 and v_apurado is not null and v_apurado < v_meta then
        v_ok := false;
        v_detalhes := v_detalhes || public.detalhe_desvio_vazao(v_nomes[v_i], v_apurado, v_meta, v_unidade);
      end if;
    else
      v_conforme := case
        when v_sem_producao or v_cur = '' then true
        when v_base = 0 then true
        else coalesce(v_apurado, 0) >= v_meta
      end;
      if not v_conforme then
        v_ok := false;
        v_detalhes := v_detalhes || public.detalhe_desvio_vazao(v_nomes[v_i], coalesce(v_apurado, 0), v_meta, v_unidade);
      end if;
    end if;
  end loop;

  return p_valor || jsonb_build_object(
    'conformidade', v_ok,
    'detalhesRNC', case when array_length(v_detalhes, 1) > 0 then to_jsonb(v_prefixo || array_to_string(v_detalhes, '; ')) else 'null'::jsonb end
  );
end;
$$;

-- propagar_leitura_adendo: igual à de 20261023130000 (dono OU ADMIN_MASTER propaga), mais o passo que refaz a conformidade dos campos tocados.
create or replace function public.propagar_leitura_adendo(
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
  v_caminho text;
  v_base text;
  v_corr jsonb;
  v_prev_origem text;
  v_antes text;
  v_agora text;
  v_atual jsonb;
  v_atual_txt text;
  v_registro jsonb := '[]'::jsonb;
  v_campo text;
  v_campos_tocados text[] := '{}';
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

  -- Versão vigente (a mais recente da cadeia) do monitoramento corrigido: é nela que o adendo consta como assinado.
  select * into v_vig
  from public.monitoramentos m
  where m.id = v_raiz or m.aditivo_de = v_raiz
  order by m.criado_em desc, m.id desc
  limit 1;

  -- O dono do monitoramento corrigido OU o ADMIN_MASTER (que corrige qualquer registro ainda não verificado) propaga a correção.
  if (v_vig.user_id <> v_uid and public.meu_perfil() is distinct from 'ADMIN_MASTER'::nivel_acesso)
     or not (v_vig.setor = any (public.meus_setores())) then
    raise exception 'Só o dono do monitoramento corrigido (ou o administrador) pode propagar a correção.' using errcode = '42501';
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
  if v_hora_alvo <= v_hora_vig
     or (v_hora_alvo at time zone 'America/Manaus')::date <> (v_hora_vig at time zone 'America/Manaus')::date
     or ((extract(hour from v_hora_alvo at time zone 'America/Manaus') >= 4 and extract(hour from v_hora_alvo at time zone 'America/Manaus') < 17)
         <> (extract(hour from v_hora_vig at time zone 'America/Manaus') >= 4 and extract(hour from v_hora_vig at time zone 'America/Manaus') < 17)) then
    raise exception 'O monitoramento seguinte não é posterior, do mesmo dia e turno.';
  end if;

  v_dados := v_alvo.dados_dinamicos;
  for v_aj in select t.e from jsonb_array_elements(coalesce(p_ajustes, '[]'::jsonb)) as t(e) loop
    v_caminho := v_aj ->> 'caminho';
    if v_caminho is null or v_caminho !~ '^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*\.prev$' then
      raise exception 'Caminho de leitura inválido.';
    end if;
    v_base := left(v_caminho, length(v_caminho) - 5);

    -- A correção assinada tem de ser da leitura atual (cur) deste mesmo hidrômetro.
    v_corr := v_adendo -> 'corrections' -> (v_base || '.cur');
    if v_corr is null then
      raise exception 'O adendo não corrige a leitura atual de %.', v_base;
    end if;
    v_prev_origem := v_vig.dados_dinamicos #>> string_to_array(v_base || '.prev', '.');
    -- O que o seguinte herda: a leitura atual do corrigido; se estava vazia, a anterior dele.
    v_antes := coalesce(nullif(v_corr ->> 'old', ''), v_prev_origem, '');
    v_agora := coalesce(nullif(v_corr ->> 'new', ''), v_prev_origem, '');
    if public.mesma_leitura_hidrometro(v_antes, v_agora) then
      continue;
    end if;

    v_atual := v_dados #> string_to_array(v_caminho, '.');
    v_atual_txt := v_dados #>> string_to_array(v_caminho, '.');
    if v_atual is null or not public.mesma_leitura_hidrometro(v_atual_txt, v_antes) then
      raise exception 'A leitura anterior de % no monitoramento seguinte não é a herdada do corrigido.', v_base;
    end if;

    v_dados := jsonb_set(
      v_dados,
      string_to_array(v_caminho, '.'),
      case when jsonb_typeof(v_atual) = 'number' then to_jsonb(replace(v_agora, ',', '.')::numeric) else to_jsonb(v_agora) end
    );
    v_campo := split_part(v_caminho, '.', 1);
    if not (v_campo = any (v_campos_tocados)) then
      v_campos_tocados := v_campos_tocados || v_campo;
    end if;
    v_registro := v_registro || jsonb_build_object(
      'origemId', v_raiz,
      'adendoId', p_adendo,
      'caminho', v_caminho,
      'de', v_atual_txt,
      'para', v_agora,
      'em', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  end loop;

  if jsonb_array_length(v_registro) = 0 then
    raise exception 'Não há leitura a propagar para este monitoramento.';
  end if;

  -- O veredito gravado no campo (conformidade/detalhesRNC) era o do cálculo com a leitura antiga: refaz com a corrigida.
  foreach v_campo in array v_campos_tocados loop
    v_dados := jsonb_set(v_dados, array[v_campo], public.refazer_conformidade_vazao(v_dados -> v_campo));
  end loop;

  v_dados := jsonb_set(
    v_dados,
    '{correcoes_propagadas}',
    (case when jsonb_typeof(v_dados -> 'correcoes_propagadas') = 'array' then v_dados -> 'correcoes_propagadas' else '[]'::jsonb end) || v_registro,
    true
  );

  -- Aditivo no nome do dono do seguinte (a RLS não permitiria ao chamador). Mantém a hora do seguinte; nasce sem verificação.
  insert into public.monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de, hora_monitoramento)
  values (v_alvo.ficha_template_id, v_alvo.versao_template, v_alvo.user_id, v_alvo.setor, v_dados, v_alvo_raiz, v_alvo.hora_monitoramento)
  returning id into v_novo;

  return v_novo;
end;
$$;

revoke all on function public.propagar_leitura_adendo(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.propagar_leitura_adendo(uuid, uuid, uuid, jsonb) to authenticated;
