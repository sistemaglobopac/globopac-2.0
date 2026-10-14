-- Monitoramento retroativo de QUALQUER data: sai a janela de 7 dias (20261010063259) para registrar um monitoramento com hora
-- no passado. O lançamento retroativo entra no consolidado do dia dele e o consolidado volta para a verificação.
-- Continuam valendo: hora não futura (folga de 5 min), hora válida, reenvio idempotente e o aditivo herdando a hora do original.

create or replace function public.definir_hora_monitoramento()
returns trigger
language plpgsql
as $$
declare
  v_hora timestamptz;
begin
  -- Nunca confiar no cliente.
  new.fora_do_prazo_offline := false;

  -- Reenvio idempotente (upsert com ignoreDuplicates da fila/rascunho): se o registro já existe, o INSERT vira no-op.
  if exists (select 1 from public.monitoramentos m where m.id = new.id) then
    return new;
  end if;
  if new.dados_dinamicos ? 'hora_monitoramento' then
    begin
      v_hora := (new.dados_dinamicos ->> 'hora_monitoramento')::timestamptz;
    exception when others then
      raise exception 'Hora do monitoramento inválida.';
    end;
    -- Aditivo (correção/adendo): herda a hora do original. Monitoramento novo: só não pode ser futuro.
    if new.aditivo_de is null then
      if v_hora > now() + interval '5 minutes' then
        raise exception 'A hora do monitoramento não pode ser futura.';
      end if;
    end if;
    new.hora_monitoramento := v_hora;
  end if;
  return new;
end;
$$;
