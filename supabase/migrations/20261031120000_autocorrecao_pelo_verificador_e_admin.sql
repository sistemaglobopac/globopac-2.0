-- Autocorreção imediata registrada pelo VERIFICADOR e pelo ADMIN_MASTER.
--
-- A política autocorrecoes_insert (20261002000001) só deixava o inspetor do setor ou o administrador registrar a ação imediata. Quando o
-- inspetor já encerrou o turno e não registrou a autocorreção, o verificador (que enxerga todos os setores) só podia abrir RNC ou reprovar.
--
-- Única mudança: o VERIFICADOR também registra, em qualquer setor (como o ADMIN_MASTER). Continua valendo tudo o mais: o registro é no
-- próprio nome (user_id = auth.uid(), assim o relatório mostra quem registrou), o monitoramento tem não conformidade, ainda não foi
-- verificado e não tem RNC; uma por monitoramento, append-only. O inspetor segue limitado ao seu setor.

drop policy if exists autocorrecoes_insert on public.autocorrecoes_imediatas;
create policy autocorrecoes_insert on public.autocorrecoes_imediatas
  for insert
  with check (
    user_id = auth.uid()
    and public.meu_perfil() in ('INSPETOR_QUALIDADE', 'VERIFICADOR', 'ADMIN_MASTER')
    and exists (
      select 1
        from public.monitoramentos m
       where m.id = monitoramento_id
         and m.verificado_por is null
         and public.dados_tem_nao_conformidade(m.dados_dinamicos)
         and (m.setor = any (public.meus_setores()) or public.meu_perfil() in ('VERIFICADOR', 'ADMIN_MASTER'))
    )
    and not exists (select 1 from public.rnc r where r.monitoramento_id = autocorrecoes_imediatas.monitoramento_id)
  );
