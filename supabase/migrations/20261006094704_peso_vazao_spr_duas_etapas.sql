-- Vazão do SPR (Carcaças, Partes, Miúdos, Chuveiro) em DUAS ETAPAS, no mesmo mecanismo do peso por caixa
-- (20261006092114_peso_caixa_duas_etapas.sql): a vazão tem que ser calculada sobre o peso REAL, mas a
-- medição (hidrômetros, gelo, aves) precisa ser feita na hora.
--
-- Etapa 1: leituras, aves de cada carga e hora gravadas sem o peso vivo das cargas que a balança ainda não
--   passou (EM_ANDAMENTO + dados_dinamicos.aguardando_peso = true, assinatura parcial).
-- Etapa 2: o peso é completado, a meta/conformidade/massas são recalculadas e o registro vira FINALIZADO.
--
-- Esta migração só ensina as duas funções de apoio do gatilho guard_fase_absorcao sobre o formato do SPR:
--   • quais campos a etapa 2 pode mudar (peso vivo dos lotes e tudo o que deriva do peso);
--   • quando os pesos estão completos (todo lote com aves tem peso vivo).
-- Tudo o mais assinado na etapa 1 (leituras, gelo, aves, condenas, cargas, hora) continua imutável.

create or replace function public.sem_campos_de_peso(p jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_object_agg(
      e.k,
      case
        -- Widgets cujo resultado depende do peso: com `cargas` (peso por caixa e SPR Carcaças) ou com o peso médio
        -- de carcaça herdado (SPR Partes e Miúdos). O Chuveiro Final não depende de peso: nada dele muda.
        when jsonb_typeof(e.v) = 'object'
             and (jsonb_typeof(e.v -> 'cargas') = 'array' or e.v ? 'pesoMedioCarcaca' or e.v ? 'pesoCarcaca') then
          (e.v - 'conformidade' - 'detalhesRNC' - 'pesoMedioCarcaca' - 'pesoCarcaca' - 'pesoCarcacaIndisponivel' - 'pesoMiudoIndisponivel')
          || case
               when jsonb_typeof(e.v -> 'cargas') = 'array' then
                 jsonb_build_object(
                   'cargas',
                   (select coalesce(jsonb_agg(case when jsonb_typeof(c) = 'object' then c - 'pesoMedioKg' - 'avgLiveWeight' else c end), '[]'::jsonb)
                    from jsonb_array_elements(e.v -> 'cargas') c)
                 )
               else '{}'::jsonb
             end
        else e.v
      end
    ),
    '{}'::jsonb
  )
  from jsonb_each(
    case when jsonb_typeof(p) = 'object' then p - 'aguardando_peso' - 'peso_completado' else '{}'::jsonb end
  ) as e (k, v);
$$;

-- Toda carga com aves tem peso (> 0)? Peso por caixa: pesoMedioKg nas cargas com avesPorCaixa. SPR Carcaças:
-- avgLiveWeight nos lotes com quantidade de aves.
create or replace function public.pesos_completos(p jsonb)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1
    from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) as e (k, v),
         jsonb_array_elements(
           case when jsonb_typeof(e.v) = 'object' and jsonb_typeof(e.v -> 'cargas') = 'array' then e.v -> 'cargas' else '[]'::jsonb end
         ) as c
    where jsonb_typeof(c) = 'object'
      and (
        (c ? 'avesPorCaixa'
          and coalesce(public.num_seguro(replace(coalesce(c ->> 'pesoMedioKg', ''), ',', '.')), 0) <= 0)
        or (c ? 'avgLiveWeight'
          and coalesce(public.num_seguro(replace(coalesce(c ->> 'quantity', ''), ',', '.')), 0) > 0
          and coalesce(public.num_seguro(replace(coalesce(c ->> 'avgLiveWeight', ''), ',', '.')), 0) <= 0)
      )
  );
$$;
