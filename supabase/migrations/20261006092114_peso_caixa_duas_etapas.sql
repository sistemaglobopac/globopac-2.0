-- Peso vivo por caixa de transporte em DUAS ETAPAS (mesmo mecanismo EM_ANDAMENTO da absorção de água).
--
-- Problema: o peso médio da carga vem da balança, que muitas vezes demora. Sem ele o monitoramento não
-- podia ser assinado: estourava a frequência mínima e travava quem herda o peso (rastreabilidade/DOA e
-- a vazão do pré-resfriamento).
--
-- Etapa 1 (na hora): carga, aves por caixa e hora, SEM o peso médio. Grava EM_ANDAMENTO com a marca
--   dados_dinamicos.aguardando_peso = true e assina como INSPETOR_PARCIAL. Já conta para a frequência.
-- Etapa 2 (quando a balança passar o peso): o peso médio é completado e o registro vira FINALIZADO,
--   com assinatura INSPETOR sobre o registro inteiro. Qualquer inspetor do mesmo setor pode completar
--   (o turno pode ter mudado). Enquanto estiver em andamento NÃO vai para verificação nem para o SIF.
--
-- Garantia: depois da etapa 1 os dados assinados são imutáveis — só mudam o peso médio de cada carga e
-- a avaliação (conformidade/detalhesRNC) do campo, mais as marcas aguardando_peso/peso_completado.

-- Dados do monitoramento sem os campos que a etapa 2 pode alterar (para comparar antes × depois).
create or replace function public.sem_campos_de_peso(p jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_object_agg(
      e.k,
      case
        when jsonb_typeof(e.v) = 'object' and jsonb_typeof(e.v -> 'cargas') = 'array' then
          (e.v - 'conformidade' - 'detalhesRNC')
          || jsonb_build_object(
               'cargas',
               (select coalesce(jsonb_agg(case when jsonb_typeof(c) = 'object' then c - 'pesoMedioKg' else c end), '[]'::jsonb)
                from jsonb_array_elements(e.v -> 'cargas') c)
             )
        else e.v
      end
    ),
    '{}'::jsonb
  )
  from jsonb_each(
    case when jsonb_typeof(p) = 'object' then p - 'aguardando_peso' - 'peso_completado' else '{}'::jsonb end
  ) as e (k, v);
$$;

-- Toda carga com aves por caixa tem peso médio (> 0)?
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
      and c ? 'avesPorCaixa'
      and coalesce(public.num_seguro(replace(coalesce(c ->> 'pesoMedioKg', ''), ',', '.')), 0) <= 0
  );
$$;

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
  aguarda_peso_novo boolean := coalesce(new.dados_dinamicos ->> 'aguardando_peso', '') = 'true';
begin
  if tg_op = 'INSERT' then
    if new.status_ficha = 'EM_ANDAMENTO' then
      if new.conformidade is not null or new.verificado_por is not null or new.liberado_sif is true then
        raise exception 'Registro em andamento não pode ter conformidade, verificação ou liberação ao SIF (monitoramento %).', new.id;
      end if;

      -- Peso por caixa aguardando o peso da balança: não há linhas de absorção a validar.
      if aguarda_peso_novo then
        if public.pesos_completos(new.dados_dinamicos) then
          raise exception 'Registro aguardando peso, mas todos os pesos já foram informados: assine o monitoramento normalmente (monitoramento %).', new.id;
        end if;
        return new;
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

  if old.status_ficha = 'FINALIZADO' and new.status_ficha = 'EM_ANDAMENTO' then
    raise exception 'Um monitoramento finalizado não pode voltar para em andamento (monitoramento %).', old.id;
  end if;

  if new.status_ficha = 'EM_ANDAMENTO'
     and (new.conformidade is not null or new.verificado_por is not null or new.liberado_sif is true) then
    raise exception 'Registro em andamento não pode ser verificado nem liberado ao SIF (monitoramento %).', new.id;
  end if;

  -- Peso por caixa aguardando o peso: completado por qualquer inspetor do setor.
  if old.status_ficha = 'EM_ANDAMENTO' and coalesce(old.dados_dinamicos ->> 'aguardando_peso', '') = 'true' then
    if auth.uid() is not null
       and old.user_id <> auth.uid()
       and coalesce(public.meu_perfil()::text, '') <> 'ADMIN_MASTER'
       and not (old.setor = any (public.meus_setores())) then
      raise exception 'Só o inspetor que abriu o registro, um inspetor do mesmo setor ou o ADMIN_MASTER pode completá-lo.';
    end if;

    if (to_jsonb(new) - campos_livres) is distinct from (to_jsonb(old) - campos_livres) then
      raise exception 'Ao completar o peso só os dados do monitoramento podem mudar (monitoramento %).', old.id;
    end if;

    if public.sem_campos_de_peso(new.dados_dinamicos) is distinct from public.sem_campos_de_peso(old.dados_dinamicos) then
      raise exception 'Os dados assinados na etapa 1 são imutáveis: só o peso médio e a avaliação podem ser completados (monitoramento %).', old.id;
    end if;

    if new.status_ficha = 'FINALIZADO' then
      if aguarda_peso_novo then
        raise exception 'Ao finalizar, retire a marca de aguardando peso (monitoramento %).', old.id;
      end if;
      if not public.pesos_completos(new.dados_dinamicos) then
        raise exception 'Finalização exige o peso médio de todas as cargas (monitoramento %).', old.id;
      end if;
      new.finalizado_em := now();
    else
      new.finalizado_em := old.finalizado_em;
    end if;
    return new;
  end if;

  if old.status_ficha = 'EM_ANDAMENTO' then
    if auth.uid() is not null
       and old.user_id <> auth.uid()
       and coalesce(public.meu_perfil()::text, '') <> 'ADMIN_MASTER' then
      raise exception 'Só o inspetor que abriu o registro (ou o ADMIN_MASTER) pode continuá-lo.';
    end if;

    if (to_jsonb(new) - campos_livres) is distinct from (to_jsonb(old) - campos_livres) then
      raise exception 'Na finalização só os dados do teste podem mudar (monitoramento %).', old.id;
    end if;

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

-- RLS: além do dono e do ADMIN_MASTER (policy monitoramentos_update_finalizar), qualquer inspetor do MESMO
-- SETOR pode completar o peso de um registro que aguarda o peso da balança. O trigger acima restringe o que
-- pode mudar (só o peso médio e a avaliação).
create policy monitoramentos_update_completar_peso on public.monitoramentos
  for update
  using (
    status_ficha = 'EM_ANDAMENTO'
    and coalesce(dados_dinamicos ->> 'aguardando_peso', '') = 'true'
    and public.tem_permissao('monitoramentos', 'criar')
    and setor = any (public.meus_setores())
  )
  with check (status_ficha = any (array['EM_ANDAMENTO', 'FINALIZADO']));

-- Quem herda o peso (rastreabilidade/DOA, vazão do SPR) só enxerga o peso depois que a balança passou:
-- cargas aguardando peso entram com peso nulo, como "sem peso" (já tratado por quem herda).
