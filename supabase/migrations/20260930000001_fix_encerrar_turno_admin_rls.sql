-- Bug real: o comentário da migração original (20260916000016_rls_policies.sql) já dizia
-- "ADMIN_MASTER vê todos" para turnos_inspetores, mas só a policy de SELECT tinha essa exceção
-- — INSERT/UPDATE ficaram restritos a `user_id = auth.uid()` desde o dia 1. O Painel de
-- Verificação (encerrarTurnoAdmin, botão "Encerrar turno") depende de um ADMIN_MASTER
-- conseguir fechar/criar o turno de OUTRO inspetor — nunca funcionou de verdade: um
-- UPDATE/INSERT filtrado pelo RLS para 0 linhas não retorna erro, só não muda nada, então o
-- botão "Verificar" (disabled enquanto o turno está aberto) ficava travado pra sempre sem
-- nenhum aviso na tela.
drop policy if exists turnos_insert on turnos_inspetores;
drop policy if exists turnos_update on turnos_inspetores;

create policy turnos_insert on turnos_inspetores
  for insert
  with check (user_id = auth.uid() or public.meu_perfil() = 'ADMIN_MASTER');

create policy turnos_update on turnos_inspetores
  for update
  using (user_id = auth.uid() or public.meu_perfil() = 'ADMIN_MASTER')
  with check (user_id = auth.uid() or public.meu_perfil() = 'ADMIN_MASTER');
