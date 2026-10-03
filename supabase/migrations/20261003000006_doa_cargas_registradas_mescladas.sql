-- Rastreabilidade e Controle de DOA: ao somar as cargas já registradas em apurações anteriores, a
-- função devolvia só a LINHA MAIS RECENTE de cada carga. Um adendo/aditivo de outra apuração
-- (cópia de um registro antigo, sem o peso médio incluído depois) virava a linha mais recente e
-- apagava dados já registrados. Agora cada campo da carga vale pelo valor NÃO VAZIO mais recente
-- entre todos os registros do dia: uma correção sobrescreve só o campo corrigido e os demais
-- continuam constando.

create or replace function public.doa_cargas_ja_registradas(p_dia date)
returns table (carga jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with linhas as (
    select c, m.criado_em
    from monitoramentos m
    cross join lateral jsonb_path_query(
      m.dados_dinamicos,
      '$.* ? (@.dataAbate == $dia).cargas[*] ? (exists(@.avesMortas))',
      jsonb_build_object('dia', p_dia::text)
    ) as c
    where public.meu_perfil() is not null
      and c ->> 'cargaId' is not null
  ),
  campos as (
    select distinct on (l.c ->> 'cargaId', e.chave)
      l.c ->> 'cargaId' as carga_id, e.chave, e.valor
    from linhas l
    cross join lateral jsonb_each(l.c) as e (chave, valor)
    where e.valor not in ('null'::jsonb, '""'::jsonb)
    order by l.c ->> 'cargaId', e.chave, l.criado_em desc
  )
  select jsonb_object_agg(chave, valor) from campos group by carga_id
$$;

comment on function public.doa_cargas_ja_registradas(date) is
  'Cargas já registradas nos monitoramentos de DOA do dia: cada campo vale pelo valor não vazio mais recente entre todos os registros (correções por adendo preservam os demais campos).';

revoke all on function public.doa_cargas_ja_registradas(date) from public, anon;
grant execute on function public.doa_cargas_ja_registradas(date) to authenticated;
