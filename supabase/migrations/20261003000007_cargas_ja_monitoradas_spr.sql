-- Monitoramento de vazão (SPR Carcaças) herda as cargas e pesos do Bem-Estar Animal. Cada carga só
-- entra em UMA apuração (as "cargas processadas no período"): acrescenta o tipo 'spr' à função que
-- diz quais cargas já foram usadas, olhando os lotes gravados no campo chiller_carcacas.

create or replace function public.cargas_ja_monitoradas(p_tipo text)
returns table (carga_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct (j #>> '{}')::uuid
  from monitoramentos m
  cross join lateral jsonb_path_query(
    m.dados_dinamicos,
    case p_tipo
      when 'recepcao' then '$.* ? (exists(@.penduraInicioEm)).cargaId'
      when 'espera' then '$.*.boxes[*].cargaId'
      when 'peso' then '$.*.cargas[*] ? (exists(@.avesPorCaixa)).cargaId'
      when 'spr' then '$.*.cargas[*] ? (exists(@.avgLiveWeight)).cargaId'
    end::jsonpath
  ) as j
  where public.meu_perfil() is not null
    and p_tipo in ('recepcao', 'espera', 'peso', 'spr')
    and jsonb_typeof(j) = 'string'
    and j #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

comment on function public.cargas_ja_monitoradas(text) is
  'Ids das cargas já monitoradas no tipo informado (recepcao | espera | peso | spr).';

revoke all on function public.cargas_ja_monitoradas(text) from public, anon;
grant execute on function public.cargas_ja_monitoradas(text) to authenticated;
