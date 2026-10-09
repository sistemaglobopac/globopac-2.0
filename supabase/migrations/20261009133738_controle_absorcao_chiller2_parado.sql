-- Controle de Absorção em duas etapas: o CHILLER 02 pode estar com o PROCESSO PARADO (sem funcionar). Nesse caso
-- a etapa 2 se completa sem temperatura nem borbulhamento: basta a marca tanquesParados.chiller2 = true.
-- Atualiza as duas funções de apoio do guard_fase_absorcao (20261009114451_controle_absorcao_duas_etapas.sql):
--   - chiller2_completo: o chiller 2 conta como completo com a temperatura numérica e o borbulhamento válido OU parado;
--   - sem_chiller2: a marca tanquesParados.chiller2 passa a ser um dos dados que a etapa 2 pode alterar.

create or replace function public.sem_chiller2(p jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_object_agg(
      e.k,
      case
        when jsonb_typeof(e.v) = 'object' and e.v ? 'tempoPermanenciaMin' and jsonb_typeof(e.v -> 'temperaturas') = 'object' then
          (e.v - 'conformidade' - 'detalhesRNC' - 'observacao')
          || jsonb_build_object(
               'temperaturas', (e.v -> 'temperaturas') - 'chiller2',
               'borbulhamento', coalesce(e.v -> 'borbulhamento', '{}'::jsonb) - 'chiller2',
               'tanquesParados', case when jsonb_typeof(e.v -> 'tanquesParados') = 'object' then (e.v -> 'tanquesParados') - 'chiller2' else '{}'::jsonb end
             )
        else e.v
      end
    ),
    '{}'::jsonb
  )
  from jsonb_each(
    case when jsonb_typeof(p) = 'object' then p - 'aguardando_chiller2' - 'chiller2_completado' else '{}'::jsonb end
  ) as e (k, v);
$$;

create or replace function public.chiller2_completo(p jsonb)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1
    from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) as e (k, v)
    where jsonb_typeof(e.v) = 'object'
      and e.v ? 'tempoPermanenciaMin'
      and jsonb_typeof(e.v -> 'temperaturas') = 'object'
      and coalesce(e.v -> 'tanquesParados' ->> 'chiller2', '') <> 'true'
      and (
        coalesce(trim(e.v -> 'temperaturas' ->> 'chiller2'), '') !~ '^-?[0-9]+([.,][0-9]+)?$'
        or coalesce(e.v -> 'borbulhamento' ->> 'chiller2', '') not in ('moderado', 'intenso')
      )
  );
$$;
