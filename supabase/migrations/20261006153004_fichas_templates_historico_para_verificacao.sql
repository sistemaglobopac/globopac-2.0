-- Fichas de dias anteriores apareciam SEM OS DADOS para a verificadora. Cada monitoramento aponta para a versão do modelo
-- (fichas_templates) vigente quando foi feito; ao editar uma ficha nasce uma versão nova e a anterior fica inativa. A regra de
-- leitura (fichas_templates_select) só deixava ler as versões ATIVAS (ou tudo, para quem "gerencia" — só o ADMIN_MASTER). Para o
-- Verificador, os registros de versões antigas ficavam sem modelo: o relatório não sabia quais campos mostrar, e o painel perdia
-- nome, PAC e código da ficha (o consolidado depende do código).
--
-- Quem verifica ou audita precisa ler TODAS as versões (são só as definições de formulário, nada sensível). O inspetor continua
-- só com as ativas (as versões antigas dele chegam por funções próprias: templates_por_ids, ids_versoes_ficha).

create policy fichas_templates_select_historico on public.fichas_templates
  for select
  to authenticated
  using (public.meu_perfil() in ('VERIFICADOR', 'INSPECAO_FEDERAL', 'GESTOR_SETOR'));
