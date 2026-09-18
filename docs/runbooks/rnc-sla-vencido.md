# Runbook — RNC com SLA vencido

## Sintoma
`/healthcheck` retorna `status: "degradado"` com `checks.rncs_com_sla_vencido > 0`, ou o
painel `/rnc` (GESTOR_SETOR/ADMIN_MASTER) mostra o badge "SLA VENCIDO" num card.

## Por que isso importa
Uma RNC representa uma não conformidade real (reprovação de um monitoramento, seção 7.2). O
prazo (`prazo_sla`, calculado a partir de `app_config.sla_rnc_horas_por_severidade` no momento
da abertura) existe para garantir que problemas de qualidade — sobretudo os de severidade
CRÍTICA/ALTA — sejam tratados dentro de um tempo aceitável para um frigorífico sob inspeção
federal permanente.

## Diagnóstico
1. Login como GESTOR_SETOR do setor afetado (ou ADMIN_MASTER, que vê todos) e abrir `/rnc`.
2. As RNCs vencidas aparecem com o badge "SLA VENCIDO"; o card mostra severidade e prazo.
3. Para uma visão agregada por setor/severidade sem precisar abrir cada setor: `/dashboard`
   (painel gerencial, Fase 7) mostra "RNC — por severidade" e o KPI "SLA vencido".

## Ações
- **RNC ainda não tratada** (`ABERTA`/`REABERTA`): o gestor do setor precisa registrar a
  tratativa e fechar assim que possível — não existe uma ação de "estender prazo" (o prazo é
  fixo a partir da severidade, seção 7.2); se o prazo real precisar ser outro, ajustar
  `app_config.sla_rnc_horas_por_severidade` afeta só RNCs *futuras*, não a atual.
- **RNC tratada mas nunca fechada** (`TRATADA` há muito tempo): confirmar com o gestor se a
  tratativa realmente resolveu o problema antes de fechar — fechar é uma confirmação, não só
  uma formalidade.
- **RNC fechada, mas a tratativa se mostrou insuficiente**: só ADMIN_MASTER pode reabrir (ver
  ASSUMPTIONS.md #21) — isso cria uma **nova** linha referenciando a fechada
  (`rnc_anterior_id`), nunca edita a original.
- **Padrão recorrente de SLA vencido no mesmo setor**: pode ser sinal de sub-dimensionamento
  de pessoal no setor, não um problema do sistema — escalar para a gestão operacional, não só
  tratar cada RNC isoladamente.

## Quando escalar
RNC de severidade CRÍTICA com SLA vencido (prazo padrão de 24h) é o caso mais urgente — se
acontecer, verificar imediatamente se há um risco de qualidade/segurança alimentar ainda ativo
por trás do prazo perdido, não só a métrica em si.
