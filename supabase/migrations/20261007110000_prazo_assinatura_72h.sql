-- Prazo para registrar/assinar um monitoramento: de 24 h para 72 h a partir da hora do monitoramento, para cobrir
-- fins de semana e feriados sem internet ou sem assinar. Mesmo gatilho de antes (20261006150055), só a janela muda:
-- 72 h + 1 h de folga. O aditivo (correção por adendo) continua herdando a hora do original, sem a janela.

create or replace function public.definir_hora_monitoramento()
returns trigger
language plpgsql
as $$
declare
  v_hora timestamptz;
begin
  -- Reenvio idempotente (upsert com ignoreDuplicates da fila/rascunho): se o registro já existe, o INSERT vira no-op e não deve
  -- falhar só porque o prazo passou entre as tentativas.
  if exists (select 1 from public.monitoramentos m where m.id = new.id) then
    return new;
  end if;
  if new.dados_dinamicos ? 'hora_monitoramento' then
    begin
      v_hora := (new.dados_dinamicos ->> 'hora_monitoramento')::timestamptz;
    exception when others then
      raise exception 'Hora do monitoramento inválida.';
    end;
    -- Aditivo (correção/adendo de um registro já feito): herda a hora do original, sem a janela de assinatura.
    if new.aditivo_de is null then
      if v_hora > now() + interval '5 minutes' then
        raise exception 'A hora do monitoramento não pode ser futura.';
      end if;
      if v_hora < now() - interval '73 hours' then
        raise exception 'A hora do monitoramento passou do prazo de 72 horas para assinatura.';
      end if;
    end if;
    new.hora_monitoramento := v_hora;
  end if;
  return new;
end;
$$;
