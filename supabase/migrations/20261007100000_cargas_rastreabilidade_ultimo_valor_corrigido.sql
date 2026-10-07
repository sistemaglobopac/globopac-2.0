-- Adendo (correção) num monitoramento tem que valer nos monitoramentos seguintes. O adendo assinado vira um
-- ADITIVO (novo registro, gravado depois, com o dado corrigido). A função que alimenta o monitoramento de
-- Rastreabilidade e Controle de DOA e o SPR (vazão) só olhava a recepção de aves para o início da pendura (hora
-- do abate) e a placa, e o Peso por Caixa para o peso médio: uma correção feita por adendo no próprio registro de
-- DOA (ou na recepção/peso) não chegava aos monitoramentos seguintes.
--
-- Agora cada dado vale pelo valor NÃO VAZIO gravado por último, entre TODOS os registros que o trazem
-- (recepção, DOA e peso por caixa — aditivos incluídos). Mesma assinatura e mesmas colunas de antes.

create or replace function public.cargas_rastreabilidade_do_dia(p_dia date)
returns table (
  carga_id uuid,
  gta text,
  integrado text,
  aviario text,
  nucleo text,
  qtd_aves integer,
  placa text,
  pendura_inicio_em text,
  monitoramento_id uuid,
  peso_medio_kg text
)
language sql
stable
security definer
set search_path = public
as $$
  with cargas_dia as (
    select id from cargas_aves where data_abate = p_dia
  ),
  fontes as (
    -- Recepção de aves: o valor do campo composto traz cargaId + penduraInicioEm (+ placa).
    select
      e.valor ->> 'cargaId' as carga_id,
      m.id as monitoramento_id,
      m.criado_em,
      true as da_recepcao,
      nullif(e.valor ->> 'placa', '') as placa,
      nullif(e.valor ->> 'penduraInicioEm', '') as pendura,
      null::text as peso
    from monitoramentos m
    cross join lateral jsonb_each(m.dados_dinamicos) as e (chave, valor)
    where jsonb_typeof(e.valor) = 'object'
      and e.valor ? 'penduraInicioEm'
      and e.valor ->> 'cargaId' in (select id::text from cargas_dia)
    union all
    -- Linhas de carga do DOA: guardam placa, pendura e peso médio (podem ter sido corrigidos por adendo).
    select
      x ->> 'cargaId', m.id, m.criado_em, false,
      nullif(x ->> 'placa', ''), nullif(x ->> 'penduraInicioEm', ''), nullif(x ->> 'pesoMedioKg', '')
    from monitoramentos m
    cross join lateral jsonb_path_query(m.dados_dinamicos, '$.*.cargas[*] ? (exists(@.avesMortas))') as x
    where x ->> 'cargaId' in (select id::text from cargas_dia)
    union all
    -- Peso por Caixa de transporte: peso médio das aves da carga.
    select
      x ->> 'cargaId', m.id, m.criado_em, false,
      null, null, nullif(x ->> 'pesoMedioKg', '')
    from monitoramentos m
    cross join lateral jsonb_path_query(m.dados_dinamicos, '$.*.cargas[*] ? (exists(@.avesPorCaixa))') as x
    where x ->> 'cargaId' in (select id::text from cargas_dia)
  )
  select
    c.id,
    c.gta,
    c.integrado,
    c.aviario,
    c.nucleo,
    c.qtd_aves,
    pl.placa,
    pe.pendura,
    rc.monitoramento_id,
    pw.peso
  from cargas_aves c
  left join lateral (
    select f.placa from fontes f where f.carga_id = c.id::text and f.placa is not null order by f.criado_em desc limit 1
  ) pl on true
  left join lateral (
    select f.pendura from fontes f where f.carga_id = c.id::text and f.pendura is not null order by f.criado_em desc limit 1
  ) pe on true
  left join lateral (
    select f.peso from fontes f where f.carga_id = c.id::text and f.peso is not null order by f.criado_em desc limit 1
  ) pw on true
  left join lateral (
    select f.monitoramento_id from fontes f where f.carga_id = c.id::text and f.da_recepcao order by f.criado_em desc limit 1
  ) rc on true
  where c.data_abate = p_dia
    and public.meu_perfil() is not null
  order by pe.pendura nulls last, c.criado_em
$$;

comment on function public.cargas_rastreabilidade_do_dia(date) is
  'Cargas programadas para o dia com veículo, início da pendura e peso médio herdados dos monitoramentos '
  '(recepção, DOA e peso por caixa): cada dado vale pelo valor não vazio gravado por último, inclusive o '
  'corrigido por adendo (aditivo). Em ordem de pendura. Base do DOA e do SPR.';

revoke all on function public.cargas_rastreabilidade_do_dia(date) from public, anon;
grant execute on function public.cargas_rastreabilidade_do_dia(date) to authenticated;
