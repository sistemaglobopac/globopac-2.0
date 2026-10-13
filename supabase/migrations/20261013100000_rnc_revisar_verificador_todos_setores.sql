-- O VERIFICADOR é um papel da qualidade, válido para todos os setores: já lê qualquer RNC (rnc_select) e já verifica
-- monitoramentos de qualquer setor (monitoramentos_update_verificar). Só rnc_update_revisar exigia que o setor da RNC
-- estivesse em meus_setores(): um verificador com setores_permitidos vazio via a RNC, clicava em aprovar, o UPDATE
-- afetava 0 linhas (RLS não dá erro) e a RNC ficava para sempre em TRATADA no painel de verificação, sem fechar e sem
-- passar o monitoramento vinculado para TRATADO.
--
-- Agora o VERIFICADOR e o ADMIN_MASTER revisam RNC de qualquer setor; os demais papéis com a permissão 'revisar'
-- continuam limitados aos próprios setores. O restante da regra não muda: só TRATADA vira FECHADA/DEVOLVIDA, o revisor
-- assina com o próprio id e trg_segregacao_funcoes_rnc impede quem tratou de revisar a própria tratativa.

drop policy if exists rnc_update_revisar on rnc;

create policy rnc_update_revisar on rnc
  for update
  using (
    public.tem_permissao('rnc', 'revisar')
    and (
      public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR')
      or setor = any (public.meus_setores())
    )
    and status = 'TRATADA'
  )
  with check (
    public.tem_permissao('rnc', 'revisar')
    and status in ('FECHADA', 'DEVOLVIDA')
    and revisado_por = auth.uid()
  );
