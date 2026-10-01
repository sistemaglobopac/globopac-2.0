-- Situação de conformidade do monitoramento com o estado TRATADO.
--
-- `conformidade` (boolean) é decidida pelo Verificador e entra no hash assinado do documento
-- (conteudoAssinavelMonitoramento) — por isso NÃO pode mudar depois da assinatura. Quando a RNC
-- vinculada é procedente (todas as RNCs do monitoramento FECHADAS pelo Verificador), o
-- monitoramento deixa de ser "não conforme" e passa a TRATADO: isso vive numa coluna própria,
-- mantida por trigger, FORA do hash. Painéis e exportações leem `situacao_conformidade`.
--
--   CONFORME      conformidade = true
--   NAO_CONFORME  conformidade = false e ainda há RNC aberta (ou nenhuma RNC fechada)
--   TRATADO       conformidade = false, com RNC(s) vinculada(s) e TODAS FECHADAS (procedente)
--   NULL          ainda sem decisão do Verificador

alter table monitoramentos
  add column if not exists situacao_conformidade text
    check (situacao_conformidade in ('CONFORME', 'NAO_CONFORME', 'TRATADO'));

comment on column monitoramentos.situacao_conformidade is
  'CONFORME / NAO_CONFORME / TRATADO (RNC procedente e fechada) / NULL (aguardando verificação). '
  'Mantida por trigger a partir de conformidade + rnc; NÃO faz parte do hash assinado.';

-- Imutabilidade após liberação ao SIF continua valendo para todo o conteúdo do documento; só a
-- situação derivada pode mudar (uma RNC pode ser fechada depois da liberação).
create or replace function public.bloqueia_edicao_liberado()
returns trigger
language plpgsql
as $$
begin
  if old.liberado_sif is true
     and (to_jsonb(new) - 'situacao_conformidade') is distinct from (to_jsonb(old) - 'situacao_conformidade') then
    raise exception
      'Monitoramento % já foi liberado ao SIF e é imutável. Registre uma correção como aditivo (novo registro com aditivo_de = %), nunca como UPDATE.',
      old.id, old.id;
  end if;
  return new;
end;
$$;

-- Cálculo único da situação (usado pelos dois triggers abaixo).
create or replace function public.calcular_situacao_conformidade(p_monitoramento uuid, p_conformidade boolean)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_conformidade is null then null
    when p_conformidade is true then 'CONFORME'
    when exists (select 1 from rnc r where r.monitoramento_id = p_monitoramento and r.status = 'FECHADA')
         and not exists (select 1 from rnc r where r.monitoramento_id = p_monitoramento and r.status <> 'FECHADA')
      then 'TRATADO'
    else 'NAO_CONFORME'
  end;
$$;

create or replace function public.definir_situacao_conformidade()
returns trigger
language plpgsql
as $$
begin
  new.situacao_conformidade := public.calcular_situacao_conformidade(new.id, new.conformidade);
  return new;
end;
$$;

drop trigger if exists trg_situacao_conformidade on monitoramentos;
create trigger trg_situacao_conformidade
  before insert or update on monitoramentos
  for each row execute function public.definir_situacao_conformidade();

-- Quando a RNC muda (abre, é fechada, é reaberta), recalcula a situação do monitoramento vinculado.
-- O UPDATE "vazio" dispara o trigger acima; roda como owner para ignorar RLS.
create or replace function public.atualizar_situacao_por_rnc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.monitoramento_id is not null then
    update monitoramentos set conformidade = conformidade where id = new.monitoramento_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rnc_atualiza_situacao on rnc;
create trigger trg_rnc_atualiza_situacao
  after insert or update of status, monitoramento_id on rnc
  for each row execute function public.atualizar_situacao_por_rnc();

-- Preenche o histórico (o UPDATE dispara o trigger; liberados só mudam a coluna derivada).
update monitoramentos set conformidade = conformidade where conformidade is not null;
