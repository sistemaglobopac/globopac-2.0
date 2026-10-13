-- Adendo corrige o monitoramento sem duplicá-lo: a versão VIGENTE de cada monitoramento.
--
-- Quando o inspetor assina um adendo, o sistema não altera o original (a assinatura dele guarda o hash de todo o conteúdo e,
-- depois de liberado ao SIF, o banco nem permite editar): grava uma cópia corrigida ligada ao original (`aditivo_de`).
-- Para as telas isso apareceria como DOIS monitoramentos. Esta visão devolve só a versão vigente:
--   * o original que ganhou uma correção sai (continua guardado em `monitoramentos`, aberto pelo id no histórico do relatório);
--   * se houver mais de uma correção ligada ao mesmo registro, vale a mais recente;
--   * EXCEÇÃO: o que já foi liberado ao SIF nunca some — é o documento entregue à fiscalização. A correção entra como registro novo.
-- É `security_invoker`: a RLS de `monitoramentos` continua valendo para quem consulta a visão.

create index if not exists idx_monitoramentos_aditivo_de on public.monitoramentos (aditivo_de) where aditivo_de is not null;

create or replace view public.monitoramentos_vigentes
with (security_invoker = true)
as
select m.*
from public.monitoramentos m
where (m.liberado_sif or not exists (select 1 from public.monitoramentos a where a.aditivo_de = m.id))
  and not (
    m.aditivo_de is not null
    and not m.liberado_sif
    and exists (
      select 1
      from public.monitoramentos irmao
      where irmao.aditivo_de = m.aditivo_de
        and (irmao.criado_em > m.criado_em or (irmao.criado_em = m.criado_em and irmao.id > m.id))
    )
  );

comment on view public.monitoramentos_vigentes is
  'Monitoramentos sem os originais já corrigidos por adendo (aditivo_de): uma linha por monitoramento, a versão vigente. O original segue em monitoramentos.';

revoke all on public.monitoramentos_vigentes from public, anon;
grant select on public.monitoramentos_vigentes to authenticated;
