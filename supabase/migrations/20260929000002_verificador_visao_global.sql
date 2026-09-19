-- VERIFICADOR passa a enxergar e verificar fichas de monitoramento de QUALQUER setor, não só
-- do(s) setor(es) do próprio perfil — confirmado pelo usuário: "TODOS COM HABILITAÇÃO DE
-- VERIFICADOR PODEM VER TODAS AS FICHAS DE MONITORAMENTO QUE ESTÃO AGUARDANDO VERIFICAÇÃO".
-- Diferente de "Acesso Geral" (setores_permitidos = ['Todos'], opt-in por usuário via
-- FormUsuarioModal): isto é inerente ao PERFIL VERIFICADOR, não depende de configuração por
-- pessoa — a função de auditoria de qualidade é cross-setor por natureza.
--
-- Bug real que isto corrige: monitoramentos_update_verificar não tinha bypass nem para
-- ADMIN_MASTER nem para VERIFICADOR — um Verificador com setores_permitidos = ['LINHA_DIF',
-- 'PRE_INSPECAO'] tentando verificar uma ficha do setor RECEPCAO recebia 409 "não encontrado,
-- já verificado, ou sem permissão" (a RLS negava a UPDATE silenciosamente — a policy de
-- SELECT já escondia a ficha da fila antes disso, então o usuário nem sabia que ela existia).
--
-- Só quem age sobre a ficha (verificar, ler o dossiê/relatório) ganha o bypass — não a
-- criação (monitoramentos_insert continua exigindo setor = ANY(meus_setores()), o inspetor só
-- registra no próprio setor) nem a tratativa de RNC (rnc_update continua do Gestor de Setor).

drop policy if exists monitoramentos_select on monitoramentos;
create policy monitoramentos_select on monitoramentos
  for select
  using (
    public.tem_permissao('monitoramentos', 'ler')
    and (
      public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR')
      or (public.meu_perfil() = 'INSPECAO_FEDERAL' and liberado_sif = true)
      or setor = any (public.meus_setores())
    )
  );

drop policy if exists monitoramentos_update_verificar on monitoramentos;
create policy monitoramentos_update_verificar on monitoramentos
  for update
  using (
    public.tem_permissao('monitoramentos', 'verificar')
    and (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR') or setor = any (public.meus_setores()))
  )
  with check (public.tem_permissao('monitoramentos', 'verificar'));

-- rnc_select e assinaturas_eletronicas_select também precisam do mesmo bypass: o relatório de
-- monitoramento (RelatorioMonitoramento.tsx) lê a RNC vinculada e as assinaturas eletrônicas
-- de qualquer ficha que o Verificador agora enxerga na fila, mesmo fora do próprio setor —
-- sem isto, "Ver Dados"/"Imprimir" numa ficha de outro setor mostraria a RNC/selo de
-- assinatura em branco mesmo com o registro principal visível.
drop policy if exists rnc_select on rnc;
create policy rnc_select on rnc
  for select
  using (
    public.tem_permissao('rnc', 'ler')
    and (public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR') or setor = any (public.meus_setores()))
  );

drop policy if exists assinaturas_eletronicas_select on assinaturas_eletronicas;
create policy assinaturas_eletronicas_select on assinaturas_eletronicas
  for select
  using (
    public.tem_permissao('assinaturas_eletronicas', 'ler')
    and exists (
      select 1 from monitoramentos m
      where m.id = assinaturas_eletronicas.monitoramento_id
        and (
          public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR')
          or (public.meu_perfil() = 'INSPECAO_FEDERAL' and m.liberado_sif = true)
          or m.setor = any (public.meus_setores())
        )
    )
  );
