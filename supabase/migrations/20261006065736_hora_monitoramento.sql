-- Hora do monitoramento: a hora em que a medição foi feita, informada manualmente pelo inspetor
-- (permite registrar no local, salvar como rascunho e assinar depois, em até 24 h). Fica em
-- dados_dinamicos->>'hora_monitoramento' (dentro do hash assinado) e é espelhada nesta coluna por
-- trigger, para filtros e ordenação. É distinta de criado_em (hora do servidor ao gravar,
-- inalterável) e da hora da assinatura (assinaturas_eletronicas.criado_em).
--
-- Registros anteriores a esta migração ficam com a coluna nula: os leitores usam
-- coalesce(hora_monitoramento, criado_em). Sem backfill de propósito — monitoramentos liberados ao
-- SIF são imutáveis.

alter table public.monitoramentos add column hora_monitoramento timestamptz;

comment on column public.monitoramentos.hora_monitoramento is
  'Hora em que o monitoramento foi realizado, informada pelo inspetor (espelho de '
  'dados_dinamicos->>''hora_monitoramento'', que é o valor assinado). Nulo em registros antigos: '
  'vale criado_em. Aceita até 5 min no futuro e no máximo 24 h (+1 h de folga) antes de criado_em.';

create index idx_monitoramentos_hora on public.monitoramentos (setor, hora_monitoramento desc);

create or replace function public.definir_hora_monitoramento()
returns trigger
language plpgsql
as $$
declare
  v_hora timestamptz;
begin
  -- Reenvio idempotente (upsert com ignoreDuplicates da fila/rascunho): se o registro já existe, o
  -- INSERT vira no-op e não deve falhar só porque o prazo de 24 h passou entre as tentativas.
  if exists (select 1 from public.monitoramentos m where m.id = new.id) then
    return new;
  end if;
  if new.dados_dinamicos ? 'hora_monitoramento' then
    begin
      v_hora := (new.dados_dinamicos ->> 'hora_monitoramento')::timestamptz;
    exception when others then
      raise exception 'Hora do monitoramento inválida.';
    end;
    if v_hora > now() + interval '5 minutes' then
      raise exception 'A hora do monitoramento não pode ser futura.';
    end if;
    if v_hora < now() - interval '25 hours' then
      raise exception 'A hora do monitoramento passou do prazo de 24 horas para assinatura.';
    end if;
    new.hora_monitoramento := v_hora;
  end if;
  return new;
end;
$$;

create trigger trg_definir_hora_monitoramento
  before insert on public.monitoramentos
  for each row execute function public.definir_hora_monitoramento();
