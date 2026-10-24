-- REPARO ÚNICO (dados) — rodar no SQL Editor DEPOIS de aplicar 20261024100000_propagacao_refaz_conformidade_vazao.sql.
-- Não é migration: mexe num registro específico de produção.
--
-- Monitoramento das 11:50 de 23/10/2026 (PRÉ-RESFRIAMENTO 02, SPR Partes). A correção do Chiller 2 Partes acertou a leitura anterior
-- (22057 → 445), mas o campo seguiu gravado NÃO CONFORME ("Apurado: -21904.564L/kg"), porque a propagação antiga não refazia o veredito.
--
-- Grava um NOVO aditivo (versão) do registro — igual ao que a propagação faz — com `conformidade` e `detalhesRNC` refeitos pela função
-- nova. O original e a versão anterior ficam no histórico; o aditivo nasce sem verificação (o registro ainda não foi verificado).
-- Idempotente: se a versão vigente já não for a ce9fb58c…, se já tiver sido verificada/liberada ou se já estiver correta, não grava nada.

do $$
declare
  v_raiz constant uuid := '99e2d7d4-069a-4008-a717-c238543710a2';
  v_esperada constant uuid := 'ce9fb58c-a865-41d1-a73a-48b1d9cedb9f';
  v_vig public.monitoramentos;
  v_dados jsonb;
  v_campo text;
  v_novo uuid;
begin
  select * into v_vig
  from public.monitoramentos m
  where m.id = v_raiz or m.aditivo_de = v_raiz
  order by m.criado_em desc, m.id desc
  limit 1;

  if v_vig.id is distinct from v_esperada then
    raise notice 'Nada feito: a versão vigente agora é % (esperada %).', v_vig.id, v_esperada;
    return;
  end if;
  if v_vig.verificado_por is not null or v_vig.liberado_sif then
    raise notice 'Nada feito: o registro já foi verificado/liberado.';
    return;
  end if;

  v_dados := v_vig.dados_dinamicos;
  for v_campo in
    select distinct split_part(e ->> 'caminho', '.', 1)
    from jsonb_array_elements(coalesce(v_dados -> 'correcoes_propagadas', '[]'::jsonb)) as e
  loop
    v_dados := jsonb_set(v_dados, array[v_campo], public.refazer_conformidade_vazao(v_dados -> v_campo));
  end loop;

  if v_dados = v_vig.dados_dinamicos then
    raise notice 'Nada feito: a conformidade do registro já está correta.';
    return;
  end if;

  insert into public.monitoramentos (ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de, hora_monitoramento)
  values (v_vig.ficha_template_id, v_vig.versao_template, v_vig.user_id, v_vig.setor, v_dados, v_raiz, v_vig.hora_monitoramento)
  returning id into v_novo;
  raise notice 'Aditivo gravado: %', v_novo;
end;
$$;

-- Conferência: a versão mais recente deve vir com conformidade = true e detalhesRNC nulo no campo de SPR Partes.
select m.id, m.criado_em, e.key as campo, e.value -> 'conformidade' as conformidade, e.value -> 'detalhesRNC' as detalhes_rnc,
       e.value -> 'tanques' -> 'chiller2' ->> 'prev' as chiller2_prev
from public.monitoramentos m
cross join lateral jsonb_each(m.dados_dinamicos) e
where (m.id = '99e2d7d4-069a-4008-a717-c238543710a2' or m.aditivo_de = '99e2d7d4-069a-4008-a717-c238543710a2')
  and jsonb_typeof(e.value) = 'object' and e.value ? 'tanques'
order by m.criado_em desc;
