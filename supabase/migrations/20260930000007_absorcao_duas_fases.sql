-- Teste de Absorção de Água em duas fases (mesmo registro):
--   1. Pesagem inicial  -> status_ficha = 'EM_ANDAMENTO' (lacre + peso inicial; sem conformidade)
--   2. Pesagem final    -> status_ficha = 'FINALIZADO'   (peso final de cada lacre; assina INSPETOR)
--
-- Horas no SERVIDOR (nunca do aparelho): início = criado_em (default now()); fim = finalizado_em,
-- preenchido por trigger na finalização.
--
-- Um registro EM_ANDAMENTO não pode ser verificado, liberado ao SIF nem ganhar conformidade;
-- os pesos iniciais e lacres gravados na fase 1 são imutáveis; a finalização exige peso final em
-- toda linha com peso inicial (ou linha descartada com motivo); só o inspetor que abriu (ou o
-- ADMIN_MASTER) finaliza; e não pode haver dois registros em andamento para o mesmo lacre.

alter table monitoramentos
  add column if not exists status_ficha text not null default 'FINALIZADO'
    check (status_ficha in ('EM_ANDAMENTO', 'FINALIZADO')),
  add column if not exists finalizado_em timestamptz;

comment on column monitoramentos.status_ficha is
  'FINALIZADO (padrão: fichas de uma fase e absorção concluída) ou EM_ANDAMENTO (absorção só com pesagem inicial).';
comment on column monitoramentos.finalizado_em is
  'Hora (servidor) em que a pesagem final foi gravada e o registro passou a FINALIZADO. Início = criado_em.';

create index if not exists idx_monitoramentos_em_andamento
  on monitoramentos (user_id, criado_em)
  where status_ficha = 'EM_ANDAMENTO';

-- ---------------------------------------------------------------------------------------------
-- Helpers: itens do teste de absorção (objetos com `items[]` cujas linhas têm `initial`).
-- (O Dripping Test tem items com m0/m1/... e nunca `initial` — não entra aqui.)
-- ---------------------------------------------------------------------------------------------
create or replace function public.absorcao_itens(p_dados jsonb)
returns setof jsonb
language sql
immutable
as $$
  select elem
  from jsonb_each(case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end) as campo(chave, valor),
       jsonb_array_elements(
         case
           when jsonb_typeof(campo.valor) = 'object' and jsonb_typeof(campo.valor -> 'items') = 'array'
             then campo.valor -> 'items'
           else '[]'::jsonb
         end
       ) as elem
  where jsonb_typeof(elem) = 'object' and elem ? 'initial';
$$;

-- Número tolerante a texto vazio/inválido (peso digitado como "12.500").
create or replace function public.num_seguro(p_texto text)
returns numeric
language sql
immutable
as $$
  select case when p_texto ~ '^[0-9]+(\.[0-9]+)?$' then p_texto::numeric else null end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Guarda das duas fases
-- ---------------------------------------------------------------------------------------------
create or replace function public.guard_fase_absorcao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  antigo jsonb;
  novo jsonb;
  tem_linha boolean := false;
  selo text;
  campos_livres text[] := array['dados_dinamicos', 'status_ficha', 'finalizado_em', 'situacao_conformidade'];
begin
  -- ---- INSERT --------------------------------------------------------------------------------
  if tg_op = 'INSERT' then
    if new.status_ficha = 'EM_ANDAMENTO' then
      if new.conformidade is not null or new.verificado_por is not null or new.liberado_sif is true then
        raise exception 'Registro em andamento não pode ter conformidade, verificação ou liberação ao SIF (monitoramento %).', new.id;
      end if;

      for item in select public.absorcao_itens(new.dados_dinamicos) loop
        selo := lower(trim(coalesce(item ->> 'seal', '')));
        if selo <> '' and coalesce(public.num_seguro(item ->> 'initial'), 0) > 0 then
          tem_linha := true;
          if exists (
            select 1
            from monitoramentos m, public.absorcao_itens(m.dados_dinamicos) e
            where m.status_ficha = 'EM_ANDAMENTO'
              and m.id <> new.id
              and lower(trim(coalesce(e ->> 'seal', ''))) = selo
          ) then
            raise exception 'Já existe um monitoramento em andamento para o lacre "%".', trim(item ->> 'seal');
          end if;
        end if;
      end loop;

      if not tem_linha then
        raise exception 'Pesagem inicial exige ao menos 1 linha com lacre e peso inicial maior que zero.';
      end if;
    end if;
    return new;
  end if;

  -- ---- UPDATE --------------------------------------------------------------------------------
  if old.status_ficha = 'FINALIZADO' and new.status_ficha = 'EM_ANDAMENTO' then
    raise exception 'Um monitoramento finalizado não pode voltar para em andamento (monitoramento %).', old.id;
  end if;

  if new.status_ficha = 'EM_ANDAMENTO'
     and (new.conformidade is not null or new.verificado_por is not null or new.liberado_sif is true) then
    raise exception 'Registro em andamento não pode ser verificado nem liberado ao SIF (monitoramento %).', new.id;
  end if;

  if old.status_ficha = 'EM_ANDAMENTO' then
    if auth.uid() is not null
       and old.user_id <> auth.uid()
       and coalesce(public.meu_perfil()::text, '') <> 'ADMIN_MASTER' then
      raise exception 'Só o inspetor que abriu o registro (ou o ADMIN_MASTER) pode continuá-lo.';
    end if;

    -- Só o conteúdo (dados) e o estado mudam; nada de identidade/autoria.
    if (to_jsonb(new) - campos_livres) is distinct from (to_jsonb(old) - campos_livres) then
      raise exception 'Na finalização só os dados do teste podem mudar (monitoramento %).', old.id;
    end if;

    -- Pesos iniciais e lacres da fase 1 são imutáveis.
    for antigo in select public.absorcao_itens(old.dados_dinamicos) loop
      if coalesce(antigo ->> 'initial', '') <> '' or coalesce(antigo ->> 'seal', '') <> '' then
        select e into novo
        from public.absorcao_itens(new.dados_dinamicos) e
        where e ->> 'id' = antigo ->> 'id'
        limit 1;
        if novo is null
           or (novo ->> 'initial') is distinct from (antigo ->> 'initial')
           or (novo ->> 'seal') is distinct from (antigo ->> 'seal') then
          raise exception 'Lacre e peso inicial gravados na pesagem inicial são imutáveis (linha %).', antigo ->> 'id';
        end if;
      end if;
    end loop;

    if new.status_ficha = 'FINALIZADO' then
      for item in select public.absorcao_itens(new.dados_dinamicos) loop
        if coalesce(public.num_seguro(item ->> 'initial'), 0) > 0 then
          if (item ->> 'descartada') = 'true' then
            if coalesce(trim(item ->> 'motivoDescarte'), '') = '' then
              raise exception 'Carcaça descartada (lacre %) exige o motivo do descarte.', item ->> 'seal';
            end if;
          elsif public.num_seguro(item ->> 'final') is null then
            raise exception 'Finalização exige o peso final de todas as linhas com peso inicial (lacre %).', item ->> 'seal';
          end if;
        end if;
      end loop;
      new.finalizado_em := now();
    else
      new.finalizado_em := old.finalizado_em;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_fase_absorcao on monitoramentos;
create trigger trg_guard_fase_absorcao
  before insert or update on monitoramentos
  for each row execute function public.guard_fase_absorcao();

-- ---------------------------------------------------------------------------------------------
-- RLS: o inspetor que abriu (ou o ADMIN_MASTER) atualiza SÓ registros em andamento.
-- ---------------------------------------------------------------------------------------------
create policy monitoramentos_update_finalizar on monitoramentos
  for update
  using (
    status_ficha = 'EM_ANDAMENTO'
    and (user_id = auth.uid() or public.meu_perfil() = 'ADMIN_MASTER')
  )
  with check (status_ficha in ('EM_ANDAMENTO', 'FINALIZADO'));
