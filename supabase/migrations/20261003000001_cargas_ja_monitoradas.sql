-- Cargas que já tiveram o monitoramento feito (por tipo de campo composto), para sair da lista de
-- seleção de carga dos monitoramentos de Recepção de Aves, Área de Espera e Peso por Caixa.
-- SECURITY DEFINER: o inspetor só enxerga o próprio setor na RLS de monitoramentos, mas a carga
-- vale para o dia todo, independente de quem monitorou. Devolve só os ids das cargas.

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
    end::jsonpath
  ) as j
  where public.meu_perfil() is not null
    and p_tipo in ('recepcao', 'espera', 'peso')
    and jsonb_typeof(j) = 'string'
    and j #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

comment on function public.cargas_ja_monitoradas(text) is
  'Ids das cargas já monitoradas no tipo informado (recepcao | espera | peso).';

revoke all on function public.cargas_ja_monitoradas(text) from public, anon;
grant execute on function public.cargas_ja_monitoradas(text) to authenticated;
