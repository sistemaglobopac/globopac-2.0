-- Rastreabilidade e Controle de DOA: cada monitoramento traz as cargas já registradas nos
-- monitoramentos anteriores do dia (somente leitura) mais as cargas novas. Esta função devolve, por
-- carga, a linha mais recente já gravada para o dia de abate. SECURITY DEFINER: o inspetor só
-- enxerga o próprio setor na RLS de monitoramentos, e quem cobre o almoço precisa ver o histórico.

create or replace function public.doa_cargas_ja_registradas(p_dia date)
returns table (carga jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (c ->> 'cargaId') c
  from monitoramentos m
  cross join lateral jsonb_path_query(
    m.dados_dinamicos,
    '$.* ? (@.dataAbate == $dia).cargas[*] ? (exists(@.avesMortas))',
    jsonb_build_object('dia', p_dia::text)
  ) as c
  where public.meu_perfil() is not null
    and c ->> 'cargaId' is not null
  order by c ->> 'cargaId', m.criado_em desc
$$;

comment on function public.doa_cargas_ja_registradas(date) is
  'Última linha gravada de cada carga nos monitoramentos de Rastreabilidade e Controle de DOA do dia.';

revoke all on function public.doa_cargas_ja_registradas(date) from public, anon;
grant execute on function public.doa_cargas_ja_registradas(date) to authenticated;
