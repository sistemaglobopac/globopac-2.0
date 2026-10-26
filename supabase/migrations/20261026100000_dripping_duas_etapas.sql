-- Dripping Test em DUAS ETAPAS (mesmo mecanismo EM_ANDAMENTO da absorção de água, do peso por caixa e do controle de absorção).
--
-- Etapa 1 (na hora): lote, hora de início da drenagem (banho-maria), lacre, M0 e M1 de cada carcaça (Retirada, M3 e M2 NÃO são
--   aceitos nesta etapa — o banco recusa). Grava EM_ANDAMENTO com a
--   marca dados_dinamicos.aguardando_dripping = true e assina como INSPETOR_PARCIAL.
-- Etapa 2 (depois da drenagem, no MESMO registro): hora da Retirada, M3 e M2 de cada carcaça; o registro vira FINALIZADO e o
--   inspetor assina como INSPETOR sobre o registro inteiro. Enquanto estiver em andamento NÃO vai para a verificação nem para o SIF.
--
-- Garantia: depois da etapa 1 os dados assinados são imutáveis — só mudam, por carcaça, a Retirada, o M3 e o M2 (e o que deriva
-- deles: timeNc e, no valor do campo, status / averagePercentage / validCount / timeNonConformity), mais as marcas
-- aguardando_dripping / dripping_completado. O criador, um inspetor do mesmo setor (quem assumiu o turno) ou o ADMIN_MASTER completa
-- (a RLS monitoramentos_update_finalizar já restringe o UPDATE de registros em andamento a eles).

-- O valor tem o formato do campo dripping_test? (lote + horaInicio + items[])
create or replace function public.eh_valor_dripping(v jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(v) = 'object'
    and v ? 'lote'
    and v ? 'horaInicio'
    and jsonb_typeof(v -> 'items') = 'array';
$$;

-- Carcaças (linhas) com lacre e M0 > 0 de todos os campos dripping do monitoramento.
create or replace function public.dripping_linhas(p jsonb)
returns setof jsonb
language sql
immutable
as $$
  select i
  from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) as e (k, v),
       jsonb_array_elements(case when public.eh_valor_dripping(e.v) then e.v -> 'items' else '[]'::jsonb end) as t (i)
  where jsonb_typeof(i) = 'object'
    and trim(coalesce(i ->> 'seal', '')) <> ''
    and coalesce(public.num_seguro(trim(i ->> 'm0')), 0) > 0;
$$;

-- Dados do monitoramento sem o que a etapa 2 pode alterar (para comparar antes × depois).
create or replace function public.sem_dripping_etapa2(p jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_object_agg(
      e.k,
      case
        when public.eh_valor_dripping(e.v) then
          (e.v - 'status' - 'averagePercentage' - 'validCount' - 'timeNonConformity')
          || jsonb_build_object(
               'items',
               (
                 select coalesce(
                   jsonb_agg(
                     case when jsonb_typeof(t.i) = 'object' then t.i - 'horaRetirada' - 'm3' - 'm2' - 'timeNc' else t.i end
                     order by t.ord
                   ),
                   '[]'::jsonb
                 )
                 from jsonb_array_elements(e.v -> 'items') with ordinality as t (i, ord)
               )
             )
        else e.v
      end
    ),
    '{}'::jsonb
  )
  from jsonb_each(
    case when jsonb_typeof(p) = 'object' then p - 'aguardando_dripping' - 'dripping_completado' else '{}'::jsonb end
  ) as e (k, v);
$$;

-- Alguma carcaça já tem Retirada, M3 ou M2 preenchido? (a 1ª etapa só aceita lacre, M0 e M1)
create or replace function public.dripping_etapa2_preenchida(p jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) as e (k, v),
         jsonb_array_elements(case when public.eh_valor_dripping(e.v) then e.v -> 'items' else '[]'::jsonb end) as t (i)
    where jsonb_typeof(i) = 'object'
      and (
        trim(coalesce(i ->> 'horaRetirada', '')) <> ''
        or trim(coalesce(i ->> 'm3', '')) <> ''
        or trim(coalesce(i ->> 'm2', '')) <> ''
      )
  );
$$;

-- Toda carcaça com lacre e M0 tem Retirada (HH:MM), M3 e M2 numéricos? (e há ao menos uma carcaça)
create or replace function public.dripping_completo(p jsonb)
returns boolean
language sql
immutable
as $$
  select exists (select 1 from public.dripping_linhas(p))
    and not exists (
      select 1
      from public.dripping_linhas(p) as l (i)
      where coalesce(trim(l.i ->> 'horaRetirada'), '') !~ '^[0-9]{2}:[0-9]{2}$'
         or public.num_seguro(trim(l.i ->> 'm3')) is null
         or public.num_seguro(trim(l.i ->> 'm2')) is null
    );
$$;

-- ---------------------------------------------------------------------------------------------
-- Substituição por outro registro continua só para a absorção de água (o dripping não entra).
-- ---------------------------------------------------------------------------------------------
create or replace function public.marcar_monitoramento_substituido(p_id uuid, p_substituto uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo monitoramentos%rowtype;
  sub monitoramentos%rowtype;
  codigo_alvo text;
  codigo_sub text;
begin
  if public.meu_perfil() is null then
    raise exception 'Não autenticado.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da substituição (mínimo de 5 caracteres).';
  end if;

  select * into alvo from monitoramentos where id = p_id;
  select * into sub from monitoramentos where id = p_substituto;
  if alvo.id is null or sub.id is null then
    raise exception 'Registro não encontrado.';
  end if;
  if alvo.id = sub.id then
    raise exception 'Um registro não pode substituir a si mesmo.';
  end if;
  if alvo.status_ficha <> 'EM_ANDAMENTO' then
    raise exception 'Só um registro em andamento pode ser marcado como substituído.';
  end if;
  if coalesce(alvo.dados_dinamicos ->> 'aguardando_chiller2', '') = 'true'
     or coalesce(alvo.dados_dinamicos ->> 'aguardando_peso', '') = 'true'
     or coalesce(alvo.dados_dinamicos ->> 'aguardando_dripping', '') = 'true' then
    raise exception 'Só o teste de absorção de água em andamento pode ser marcado como substituído.';
  end if;
  if sub.status_ficha <> 'FINALIZADO' then
    raise exception 'O registro substituto precisa estar finalizado.';
  end if;
  if alvo.setor <> sub.setor then
    raise exception 'O registro substituto precisa ser do mesmo setor.';
  end if;
  select codigo into codigo_alvo from fichas_templates where id = alvo.ficha_template_id;
  select codigo into codigo_sub from fichas_templates where id = sub.ficha_template_id;
  if codigo_alvo is distinct from codigo_sub then
    raise exception 'O registro substituto precisa ser da mesma ficha.';
  end if;
  if sub.criado_em < alvo.criado_em then
    raise exception 'O registro substituto precisa ser posterior ao registro substituído.';
  end if;
  if not (
    alvo.user_id = auth.uid()
    or public.meu_perfil() = 'ADMIN_MASTER'
    or alvo.setor = any (public.meus_setores())
  ) then
    raise exception 'Você não tem permissão para marcar este registro como substituído.';
  end if;

  insert into monitoramentos_substituidos (monitoramento_id, substituido_por, registrado_por, motivo)
  values (alvo.id, sub.id, auth.uid(), trim(p_motivo));
end;
$$;

revoke all on function public.marcar_monitoramento_substituido(uuid, uuid, text) from public, anon;
grant execute on function public.marcar_monitoramento_substituido(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Gatilho das fases: mesma função de 20261014130000 + o ramo do dripping aguardando a etapa 2.
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
  aguarda_peso_novo boolean := coalesce(new.dados_dinamicos ->> 'aguardando_peso', '') = 'true';
  aguarda_chiller2_novo boolean := coalesce(new.dados_dinamicos ->> 'aguardando_chiller2', '') = 'true';
  aguarda_dripping_novo boolean := coalesce(new.dados_dinamicos ->> 'aguardando_dripping', '') = 'true';
begin
  if tg_op = 'INSERT' then
    if new.status_ficha = 'EM_ANDAMENTO' then
      if new.conformidade is not null or new.verificado_por is not null or new.liberado_sif is true then
        raise exception 'Registro em andamento não pode ter conformidade, verificação ou liberação ao SIF (monitoramento %).', new.id;
      end if;

      if aguarda_chiller2_novo then
        if public.chiller2_completo(new.dados_dinamicos) then
          raise exception 'Registro aguardando o chiller 02, mas ele já foi informado: assine o monitoramento normalmente (monitoramento %).', new.id;
        end if;
        return new;
      end if;

      if aguarda_peso_novo then
        if public.pesos_completos(new.dados_dinamicos) then
          raise exception 'Registro aguardando peso, mas todos os pesos já foram informados: assine o monitoramento normalmente (monitoramento %).', new.id;
        end if;
        return new;
      end if;

      -- Dripping aguardando a etapa 2: não há linhas de absorção a validar.
      if aguarda_dripping_novo then
        if not exists (select 1 from public.dripping_linhas(new.dados_dinamicos)) then
          raise exception 'Dripping Test: a 1ª etapa exige ao menos 1 carcaça com lacre e M0 maior que zero (monitoramento %).', new.id;
        end if;
        if public.dripping_etapa2_preenchida(new.dados_dinamicos) then
          raise exception 'Dripping Test: a 1ª etapa só aceita lacre, M0 e M1 — Retirada, M3 e M2 são informados na 2ª etapa (monitoramento %).', new.id;
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
              and not exists (select 1 from monitoramentos_substituidos s where s.monitoramento_id = m.id)
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

  -- Dripping aguardando a etapa 2: o criador, um inspetor do mesmo setor (quem assumiu o turno) ou o ADMIN_MASTER completa.
  if old.status_ficha = 'EM_ANDAMENTO' and coalesce(old.dados_dinamicos ->> 'aguardando_dripping', '') = 'true' then
    if auth.uid() is not null
       and old.user_id <> auth.uid()
       and coalesce(public.meu_perfil()::text, '') <> 'ADMIN_MASTER'
       and not (old.setor = any (public.meus_setores())) then
      raise exception 'Só o inspetor que abriu o registro, um inspetor do mesmo setor ou o ADMIN_MASTER pode completá-lo.';
    end if;

    if (to_jsonb(new) - campos_livres) is distinct from (to_jsonb(old) - campos_livres) then
      raise exception 'Ao completar o dripping só os dados do monitoramento podem mudar (monitoramento %).', old.id;
    end if;

    if public.sem_dripping_etapa2(new.dados_dinamicos) is distinct from public.sem_dripping_etapa2(old.dados_dinamicos) then
      raise exception 'Os dados assinados na 1ª etapa são imutáveis: só a Retirada, o M3 e o M2 de cada carcaça podem ser completados (monitoramento %).', old.id;
    end if;

    if new.status_ficha = 'FINALIZADO' then
      if aguarda_dripping_novo then
        raise exception 'Ao finalizar, retire a marca de aguardando a 2ª etapa do dripping (monitoramento %).', old.id;
      end if;
      if not public.dripping_completo(new.dados_dinamicos) then
        raise exception 'Finalização exige Retirada, M3 e M2 de todas as carcaças com lacre e M0 (monitoramento %).', old.id;
      end if;
      new.finalizado_em := now();
    else
      new.finalizado_em := old.finalizado_em;
    end if;
    return new;
  end if;

  if old.status_ficha = 'EM_ANDAMENTO' then
    -- Absorção de água: o criador, um inspetor do mesmo setor (quem assumiu o turno) ou o ADMIN_MASTER continua o registro.
    if auth.uid() is not null
       and old.user_id <> auth.uid()
       and coalesce(public.meu_perfil()::text, '') <> 'ADMIN_MASTER'
       and not (old.setor = any (public.meus_setores())) then
      raise exception 'Só o inspetor que abriu o registro, um inspetor do mesmo setor ou o ADMIN_MASTER pode continuá-lo.';
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
          elsif public.num_seguro(item ->> 'final') < public.num_seguro(item ->> 'initial') then
            raise exception 'O peso final não pode ser menor que o peso inicial (lacre %).', item ->> 'seal';
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
