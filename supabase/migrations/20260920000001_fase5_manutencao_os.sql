-- Fase 5 — Portal PCM/OS: ciclo completo da Ordem de Serviço de manutenção (seção 7.4).
-- O schema/RBAC desta tabela já existia desde a Fase 0 (migrations 20260916000014/000016/
-- 000017) — esta migration só (1) corrige uma lacuna real de RLS encontrada ao revisar o
-- código antes de implementar a Edge Function de transição, e (2) adiciona as colunas de
-- liberação ao SIF que faltavam para manutencao_os/manutencao_relatorios_sif, espelhando
-- exatamente o padrão já usado em monitoramentos/lote_liberacao_sif.

-- ------------------------------------------------------------------------------------------
-- 1) BUG FIX: manutencao_os_update não tinha escopo de setor, ao contrário do que
-- docs/permissions-matrix.md já documentava como se existisse ("quase toda policy de
-- select/update em monitoramentos, rnc e manutencao_os exige setor = any(meus_setores())").
-- Sem esse fix, qualquer INSPETOR_PCM (tem_permissao avancar_etapa) poderia avançar a etapa
-- de uma OS de QUALQUER setor, não só do seu — falha de isolamento por setor, mesma classe de
-- regra já testada para monitoramentos/rnc. Corrigido antes de construir a Edge Function que
-- depende desta policy para autorizar o UPDATE.
-- ------------------------------------------------------------------------------------------
drop policy manutencao_os_update on manutencao_os;

create policy manutencao_os_update on manutencao_os
  for update
  using (
    public.tem_permissao('manutencao_os', 'avancar_etapa')
    and (public.meu_perfil() = 'ADMIN_MASTER' or setor = any (public.meus_setores()))
  )
  with check (
    public.tem_permissao('manutencao_os', 'avancar_etapa')
    and (public.meu_perfil() = 'ADMIN_MASTER' or setor = any (public.meus_setores()))
  );

-- ------------------------------------------------------------------------------------------
-- 2) manutencao_os: colunas de conclusão e liberação ao SIF, análogas a
-- monitoramentos.liberado_sif/liberado_em/lote_liberacao_id (seção 7.3, replicada para OS
-- pela seção 7.4). concluido_em é dedicado (em vez de reaproveitar atualizado_em, que muda a
-- cada etapa) para que a data de referência do relatório diário SIF seja inequívoca.
-- ------------------------------------------------------------------------------------------
alter table manutencao_os add column concluido_em timestamptz;
alter table manutencao_os add column liberado_sif boolean not null default false;
alter table manutencao_os add column liberado_em timestamptz;
alter table manutencao_os add column relatorio_sif_id uuid;

comment on column manutencao_os.concluido_em is
  'Preenchido no momento em que a assinatura VALIDACAO é registrada (status passa direto de '
  'EXECUCAO para CONCLUIDA — ver ASSUMPTIONS.md Fase 5 sobre a máquina de estados). Usado '
  'como data de referência para o relatório diário de liberação ao SIF.';

-- Imutabilidade após liberação ao SIF — mesmo princípio de monitoramentos
-- (trg_bloqueia_edicao_liberado): uma correção necessária após a liberação exige um novo
-- fluxo (fora do escopo desta fase), nunca um UPDATE na linha já liberada.
create or replace function public.bloqueia_edicao_os_liberada()
returns trigger
language plpgsql
as $$
begin
  if old.liberado_sif is true then
    raise exception
      'OS % já foi liberada ao SIF e é imutável.', old.id;
  end if;
  return new;
end;
$$;

create trigger trg_bloqueia_edicao_os_liberada
  before update on manutencao_os
  for each row execute function public.bloqueia_edicao_os_liberada();

-- ------------------------------------------------------------------------------------------
-- 2b) BUG FIX: manutencao_os_select deixava INSPECAO_FEDERAL ver TODAS as OS do setor,
-- inclusive as ainda em andamento — inconsistente com monitoramentos_select, que restringe
-- INSPECAO_FEDERAL a liberado_sif = true (a Inspeção Federal só deveria enxergar o que já foi
-- formalmente liberado ao SIF, não o operacional interno em andamento). Só foi percebido ao
-- construir o painel de auditoria desta fase, e só pode ser corrigido agora que a coluna
-- liberado_sif (acima) existe.
-- ------------------------------------------------------------------------------------------
drop policy manutencao_os_select on manutencao_os;

create policy manutencao_os_select on manutencao_os
  for select
  using (
    public.tem_permissao('manutencao_os', 'ler')
    and (
      public.meu_perfil() = 'ADMIN_MASTER'
      or (public.meu_perfil() = 'INSPECAO_FEDERAL' and liberado_sif = true)
      or setor = any (public.meus_setores())
    )
  );

-- ------------------------------------------------------------------------------------------
-- 3) manutencao_relatorios_sif: colunas de hash agregador, análogas a lote_liberacao_sif
-- (seção 6.2). Ao contrário de lote_liberacao_sif (criado só no momento da liberação), esta
-- tabela já existia desde a Fase 0 com `status` default 'pendente' — o relatório do dia é
-- criado (upsert por data_referencia) e só ganha hash_agregador/tsr_base64 no momento em que
-- é efetivamente liberado (status -> 'liberado').
-- ------------------------------------------------------------------------------------------
alter table manutencao_relatorios_sif add column hash_agregador char(64);
alter table manutencao_relatorios_sif add column quantidade_os integer;
alter table manutencao_relatorios_sif add column tsr_base64 text;
alter table manutencao_relatorios_sif add column tsa_emitido_em timestamptz;
alter table manutencao_relatorios_sif add column tsa_utilizada text;

comment on table manutencao_relatorios_sif is
  'Um relatório por dia (data_referencia). hash_agregador é o SHA-256, em ordem '
  'determinística (por os_id), dos hash_documento da assinatura VALIDACAO de cada OS '
  'concluída incluída no relatório — mesmo princípio de lote_liberacao_sif, adaptado para '
  'OS. Recebe seu próprio carimbo de tempo RFC 3161 (fila_carimbo_tempo, tipo_assinatura='
  '''relatorio_os'').';

alter table manutencao_os
  add constraint fk_manutencao_os_relatorio_sif
  foreign key (relatorio_sif_id) references manutencao_relatorios_sif (id);

create index idx_manutencao_os_liberado on manutencao_os (liberado_sif, concluido_em);

-- ------------------------------------------------------------------------------------------
-- 4) fila_carimbo_tempo: novo tipo 'relatorio_os', para o carimbo do hash agregador do
-- relatório diário de OS — mesmo mecanismo genérico já usado por 'lote' (monitoramentos),
-- apontando agora para manutencao_relatorios_sif em vez de lote_liberacao_sif. O worker
-- (processar-fila-carimbo) só precisa de uma entrada nova no seu mapa tabela-por-tipo, não de
-- nenhuma lógica nova — ver ADR 0012.
-- ------------------------------------------------------------------------------------------
alter table fila_carimbo_tempo drop constraint fila_carimbo_tempo_tipo_assinatura_check;
alter table fila_carimbo_tempo add constraint fila_carimbo_tempo_tipo_assinatura_check
  check (tipo_assinatura in ('ficha', 'os', 'lote', 'relatorio_os'));
