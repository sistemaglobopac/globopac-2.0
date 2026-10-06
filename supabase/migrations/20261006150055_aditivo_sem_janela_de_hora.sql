-- O gatilho da hora do monitoramento (20261006065736) recusava hora_monitoramento com mais de 25 h. Mas o ADITIVO de um adendo
-- (novo registro com aditivo_de que o inspetor grava ao assinar uma correção pedida pelo Verificador) copia os dados do registro
-- ORIGINAL, inclusive a hora dele: assinar o adendo de um monitoramento com mais de 25 h falhava com "passou do prazo de 24 horas".
-- A janela de 24 h vale só para monitoramentos novos; o aditivo mantém a hora do original, sem validação de janela.

create or replace function public.definir_hora_monitoramento()
returns trigger
language plpgsql
as $$
declare
  v_hora timestamptz;
begin
  -- Reenvio idempotente (upsert com ignoreDuplicates da fila/rascunho): se o registro já existe, o INSERT vira no-op e não deve
  -- falhar só porque o prazo de 24 h passou entre as tentativas.
  if exists (select 1 from public.monitoramentos m where m.id = new.id) then
    return new;
  end if;
  if new.dados_dinamicos ? 'hora_monitoramento' then
    begin
      v_hora := (new.dados_dinamicos ->> 'hora_monitoramento')::timestamptz;
    exception when others then
      raise exception 'Hora do monitoramento inválida.';
    end;
    -- Aditivo (correção/adendo de um registro já feito): herda a hora do original, sem a janela de 24 h.
    if new.aditivo_de is null then
      if v_hora > now() + interval '5 minutes' then
        raise exception 'A hora do monitoramento não pode ser futura.';
      end if;
      if v_hora < now() - interval '25 hours' then
        raise exception 'A hora do monitoramento passou do prazo de 24 horas para assinatura.';
      end if;
    end if;
    new.hora_monitoramento := v_hora;
  end if;
  return new;
end;
$$;
