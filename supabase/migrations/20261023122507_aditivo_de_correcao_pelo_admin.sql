-- Correção de monitoramento pelo ADMIN_MASTER.
--
-- A tela de correção (CorrigirMonitoramentoModal) grava um ADITIVO com o user_id do inspetor DONO do registro (a autoria do monitoramento
-- não muda) e o setor do registro. A política monitoramentos_insert exige user_id = auth.uid(), então só o próprio inspetor conseguia gravar;
-- o ADMIN_MASTER, que a regra de negócio autoriza a corrigir qualquer monitoramento ainda não verificado, recebia
-- "new row violates row-level security policy for table monitoramentos".
--
-- Esta política abre SÓ o aditivo (aditivo_de preenchido) para o ADMIN_MASTER. Registros novos (originais) continuam exigindo user_id = auth.uid().
-- A regra de "só antes da verificação" é do app (podeCorrigirMonitoramento) e dos gatilhos de imutabilidade do banco; aqui não muda nada.

drop policy if exists monitoramentos_insert_aditivo_admin on public.monitoramentos;
create policy monitoramentos_insert_aditivo_admin on public.monitoramentos
  for insert
  with check (
    public.meu_perfil() = 'ADMIN_MASTER'::nivel_acesso
    and aditivo_de is not null
    and public.tem_permissao('monitoramentos', 'criar')
  );
