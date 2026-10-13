-- Teste de Absorção de Água: (1) qualquer inspetor do setor pode finalizar a absorção aberta por um colega e
-- (2) um registro em andamento pode ser marcado como SUBSTITUÍDO por outro registro já finalizado.
--
-- Contexto: o inspetor A abriu a pesagem inicial e o inspetor B, que assumiu o turno, não podia nem ver nem finalizar o registro
-- (só o criador ou o ADMIN_MASTER), então refez a amostra inteira num registro novo e o do A ficou pendente para sempre.
-- Peso por caixa já funciona assim (qualquer inspetor do setor completa); a absorção passa a seguir a mesma regra.
--
-- De quebra, a função de guarda também recusa na FINALIZAÇÃO um peso final menor ou igual ao inicial (a tela já recusava).

-- ------------------------------------------------------------------------------------------
-- 1) RLS: quem é do setor também finaliza o registro em andamento (antes: só o criador/ADMIN_MASTER).
--    Os registros que aguardam o chiller 02 continuam só do criador: o gatilho abaixo trava.
-- ------------------------------------------------------------------------------------------
drop policy if exists monitoramentos_update_finalizar on monitoramentos;

create policy monitoramentos_update_finalizar on monitoramentos
  for update
  using (
    status_ficha = 'EM_ANDAMENTO'
    and (
      user_id = auth.uid()
      or public.meu_perfil() = 'ADMIN_MASTER'
      or (setor = any (public.meus_setores()) and public.tem_permissao('monitoramentos', 'criar'))
    )
  )
  with check (status_ficha in ('EM_ANDAMENTO', 'FINALIZADO'));

-- ------------------------------------------------------------------------------------------
-- 2) Registro em andamento SUBSTITUÍDO por outro: tabela própria, só de inclusão. Não mexe no registro original
--    (que tem assinatura parcial e hash): apenas aponta qual registro finalizado o substituiu, quem marcou, quando e por quê.
-- ------------------------------------------------------------------------------------------
create table if not exists public.monitoramentos_substituidos (
  monitoramento_id uuid primary key references public.monitoramentos (id),
  substituido_por uuid not null references public.monitoramentos (id),
  registrado_por uuid not null references public.perfis_usuarios (id),
  registrado_em timestamptz not null default now(),
  motivo text not null check (length(trim(motivo)) >= 5),
  check (monitoramento_id <> substituido_por)
);

comment on table public.monitoramentos_substituidos is
  'Registros em andamento (absorção de água) marcados como substituídos por outro registro finalizado. Só inclusão, via marcar_monitoramento_substituido().';

alter table public.monitoramentos_substituidos enable row level security;

-- Lê quem enxerga o registro marcado (a política de monitoramentos vale dentro do exists).
drop policy if exists monitoramentos_substituidos_select on public.monitoramentos_substituidos;
create policy monitoramentos_substituidos_select on public.monitoramentos_substituidos
  for select to authenticated
  using (exists (select 1 from public.monitoramentos m where m.id = monitoramento_id));

revoke all on public.monitoramentos_substituidos from public, anon, authenticated;
grant select on public.monitoramentos_substituidos to authenticated;

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
     or coalesce(alvo.dados_dinamicos ->> 'aguardando_peso', '') = 'true' then
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

-- ------------------------------------------------------------------------------------------
-- 3) Gatilho de absorção: (a) quem é do setor continua o registro em andamento; (b) lacre de um registro SUBSTITUÍDO
--    não bloqueia mais uma pesagem nova; (c) na finalização o peso final precisa ser maior que o inicial.
--    Resto idêntico à versão anterior (20261009114451).
-- ------------------------------------------------------------------------------------------
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
          elsif public.num_seguro(item ->> 'final') <= public.num_seguro(item ->> 'initial') then
            raise exception 'O peso final deve ser maior que o peso inicial (lacre %).', item ->> 'seal';
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
