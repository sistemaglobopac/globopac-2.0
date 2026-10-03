-- Rastreabilidade e Controle de DOA (Dead On Arrival): uma linha por carga do dia, com os dados
-- HERDADOS da programação de abate (cargas_aves) e do monitoramento de recepção de aves (veículo e
-- hora de início da pendura). O inspetor só digita aves recebidas e aves mortas; o monitoramento em
-- si fica em monitoramentos.dados_dinamicos (campo composto "rastreabilidade_doa").
--
-- O inspetor do DOA normalmente está em outro setor que o da recepção, e a RLS de monitoramentos
-- só mostra o próprio setor. Por isso a leitura da recepção passa por esta função SECURITY DEFINER,
-- que devolve apenas o necessário (placa e hora de início da pendura), nunca o registro inteiro.

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
  monitoramento_id uuid
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
    r.monitoramento_id
  from cargas_aves c
  left join lateral (
    -- Recepção mais recente desta carga: o valor do campo composto traz cargaId + penduraInicioEm.
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
  where c.data_abate = p_dia
    and public.meu_perfil() is not null
  -- Ordem de pendura: quem começou a pendurar primeiro vem primeiro (formato YYYY-MM-DDTHH:mm
  -- ordena como texto); cargas ainda sem recepção ficam no fim, na ordem da programação.
  order by r.pendura_inicio_em nulls last, c.criado_em
$$;

comment on function public.cargas_rastreabilidade_do_dia(date) is
  'Cargas programadas para o dia com veículo e início da pendura herdados da recepção de aves, '
  'em ordem de pendura. Base do monitoramento de Rastreabilidade e Controle de DOA.';

revoke all on function public.cargas_rastreabilidade_do_dia(date) from public, anon;
grant execute on function public.cargas_rastreabilidade_do_dia(date) to authenticated;
