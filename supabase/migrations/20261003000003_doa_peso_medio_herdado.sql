-- Rastreabilidade e Controle de DOA: além de veículo e início da pendura, cada carga herda o peso
-- médio das aves informado no monitoramento de Peso Vivo por Caixa de Transporte (mais recente da
-- carga). Segue SECURITY DEFINER pelo mesmo motivo da função original (RLS por setor).

drop function if exists public.cargas_rastreabilidade_do_dia(date);

create function public.cargas_rastreabilidade_do_dia(p_dia date)
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
  select
    c.id,
    c.gta,
    c.integrado,
    c.aviario,
    c.nucleo,
    c.qtd_aves,
    r.placa,
    r.pendura_inicio_em,
    r.monitoramento_id,
    p.peso_medio_kg
  from cargas_aves c
  left join lateral (
    select
      m.id as monitoramento_id,
      nullif(e.valor ->> 'placa', '') as placa,
      nullif(e.valor ->> 'penduraInicioEm', '') as pendura_inicio_em
    from monitoramentos m
    cross join lateral jsonb_each(m.dados_dinamicos) as e (chave, valor)
    where jsonb_typeof(e.valor) = 'object'
      and e.valor ->> 'cargaId' = c.id::text
      and e.valor ? 'penduraInicioEm'
    order by m.criado_em desc
    limit 1
  ) r on true
  left join lateral (
    -- Peso médio informado no monitoramento de Peso por Caixa mais recente desta carga.
    select nullif(x ->> 'pesoMedioKg', '') as peso_medio_kg
    from monitoramentos m
    cross join lateral jsonb_path_query(m.dados_dinamicos, '$.*.cargas[*] ? (exists(@.avesPorCaixa))') as x
    where x ->> 'cargaId' = c.id::text
    order by m.criado_em desc
    limit 1
  ) p on true
  where c.data_abate = p_dia
    and public.meu_perfil() is not null
  order by r.pendura_inicio_em nulls last, c.criado_em
$$;

comment on function public.cargas_rastreabilidade_do_dia(date) is
  'Cargas programadas para o dia com veículo, início da pendura e peso médio herdados de outros '
  'monitoramentos, em ordem de pendura. Base do monitoramento de Rastreabilidade e Controle de DOA.';

revoke all on function public.cargas_rastreabilidade_do_dia(date) from public, anon;
grant execute on function public.cargas_rastreabilidade_do_dia(date) to authenticated;
