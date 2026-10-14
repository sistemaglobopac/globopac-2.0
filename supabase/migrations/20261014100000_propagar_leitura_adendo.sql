-- Propagação da correção de leitura (adendo) para os monitoramentos SEGUINTES, inclusive os de OUTROS inspetores.
--
-- Quando o inspetor assina um adendo que corrige a leitura atual de um hidrômetro, os monitoramentos seguintes (mesma ficha,
-- setor, dia e turno) que herdaram a leitura antiga como "anterior" precisam de um aditivo com a leitura anterior acertada.
-- A RLS só deixa cada um gravar registros em seu próprio nome (user_id = auth.uid()), então esta função SECURITY DEFINER grava o
-- aditivo no nome do dono do seguinte. Ela NÃO aceita dados do cliente: recalcula tudo no servidor e só mexe na leitura
-- anterior (`...prev`) do seguinte, comprovando que:
--   * quem chama é o dono do monitoramento corrigido e o adendo está ASSINADO (completed) na versão vigente dele;
--   * a correção do adendo é mesmo da leitura atual (`...cur`) daquele hidrômetro;
--   * o seguinte é da mesma ficha (qualquer versão), setor, dia e turno (Manaus), posterior ao corrigido, e é a versão vigente;
--   * a leitura anterior do seguinte é exatamente a antiga herdada (nada além disso é alterado).
-- O aditivo nasce sem verificação: o seguinte volta para a fila do Verificador.

create or replace function public.mesma_leitura_hidrometro(a text, b text)
returns boolean
language plpgsql
immutable
as $$
declare
  x text := btrim(coalesce(a, ''));
  y text := btrim(coalesce(b, ''));
begin
  if x = '' or y = '' then
    return x = y;
  end if;
  begin
    return replace(x, ',', '.')::numeric = replace(y, ',', '.')::numeric;
  exception when others then
    return x = y;
  end;
end;
$$;

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

revoke all on function public.mesma_leitura_hidrometro(text, text) from public, anon;
revoke all on function public.propagar_leitura_adendo(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.propagar_leitura_adendo(uuid, uuid, uuid, jsonb) to authenticated;

comment on function public.propagar_leitura_adendo(uuid, uuid, uuid, jsonb) is
  'Grava o aditivo do monitoramento SEGUINTE (de qualquer inspetor) com a leitura anterior acertada pela correção de um adendo assinado. '
  'Valida tudo no servidor; só altera `...prev` para a leitura herdada nova. Ver 20261014100000.';
