-- Controle de Absorção em DUAS ETAPAS (mesmo mecanismo EM_ANDAMENTO do peso por caixa e da absorção de água).
--
-- Etapa 1 (na hora): tempo de permanência + temperatura e borbulhamento do PRÉ-CHILLER e do CHILLER 1. Grava
--   EM_ANDAMENTO com a marca dados_dinamicos.aguardando_chiller2 = true e assina como INSPETOR_PARCIAL.
-- Etapa 2 (depois): temperatura (e borbulhamento) do CHILLER 2 + observação; o registro vira FINALIZADO e o
--   inspetor assina como INSPETOR sobre o registro inteiro. Enquanto estiver em andamento NÃO vai para a
--   verificação nem para o SIF.
--
-- Garantia: depois da etapa 1 os dados assinados são imutáveis — só mudam o chiller 2 (temperatura e
-- borbulhamento), a observação e a avaliação (conformidade/detalhesRNC) do campo, mais as marcas
-- aguardando_chiller2 / chiller2_completado. Só o inspetor que abriu (ou o ADMIN_MASTER) completa — é ele quem
-- assina (a RLS monitoramentos_update_finalizar já restringe o UPDATE de registros em andamento a eles).

-- Dados do monitoramento sem o que a etapa 2 pode alterar (para comparar antes × depois).
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
               'borbulhamento', coalesce(e.v -> 'borbulhamento', '{}'::jsonb) - 'chiller2'
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

-- O chiller 2 tem temperatura numérica e borbulhamento válido?
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
      and (
        coalesce(trim(e.v -> 'temperaturas' ->> 'chiller2'), '') !~ '^-?[0-9]+([.,][0-9]+)?$'
        or coalesce(e.v -> 'borbulhamento' ->> 'chiller2', '') not in ('moderado', 'intenso')
      )
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
  aguarda_chiller2_novo boolean := coalesce(new.dados_dinamicos ->> 'aguardando_chiller2', '') = 'true';
begin
  if tg_op = 'INSERT' then
    if new.status_ficha = 'EM_ANDAMENTO' then
      if new.conformidade is not null or new.verificado_por is not null or new.liberado_sif is true then
        raise exception 'Registro em andamento não pode ter conformidade, verificação ou liberação ao SIF (monitoramento %).', new.id;
      end if;

      -- Controle de absorção aguardando o chiller 2: não há linhas de absorção a validar.
      if aguarda_chiller2_novo then
        if public.chiller2_completo(new.dados_dinamicos) then
          raise exception 'Registro aguardando o chiller 02, mas ele já foi informado: assine o monitoramento normalmente (monitoramento %).', new.id;
        end if;
        return new;
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

  -- Controle de absorção aguardando o chiller 2: só o dono (ou o ADMIN_MASTER) completa.
  if old.status_ficha = 'EM_ANDAMENTO' and coalesce(old.dados_dinamicos ->> 'aguardando_chiller2', '') = 'true' then
    if auth.uid() is not null
       and old.user_id <> auth.uid()
       and coalesce(public.meu_perfil()::text, '') <> 'ADMIN_MASTER' then
      raise exception 'Só o inspetor que abriu o registro (ou o ADMIN_MASTER) pode completá-lo.';
    end if;

    if (to_jsonb(new) - campos_livres) is distinct from (to_jsonb(old) - campos_livres) then
      raise exception 'Ao completar o chiller 02 só os dados do monitoramento podem mudar (monitoramento %).', old.id;
    end if;

    if public.sem_chiller2(new.dados_dinamicos) is distinct from public.sem_chiller2(old.dados_dinamicos) then
      raise exception 'Os dados assinados na etapa 1 são imutáveis: só o chiller 02, a observação e a avaliação podem ser completados (monitoramento %).', old.id;
    end if;

    if new.status_ficha = 'FINALIZADO' then
      if aguarda_chiller2_novo then
        raise exception 'Ao finalizar, retire a marca de aguardando o chiller 02 (monitoramento %).', old.id;
      end if;
      if not public.chiller2_completo(new.dados_dinamicos) then
        raise exception 'Finalização exige a temperatura e o borbulhamento do chiller 02 (monitoramento %).', old.id;
      end if;
      new.finalizado_em := now();
    else
      new.finalizado_em := old.finalizado_em;
    end if;
    return new;
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
