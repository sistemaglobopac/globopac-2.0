-- Prazo para registrar/assinar um monitoramento: de 72 h para 7 dias a partir da hora do monitoramento (+1 h de folga).
-- Um monitoramento do dia 06 ficou sem assinar e o prazo de 72 h já havia vencido. Com a janela única de 7 dias, a regra
-- de contingência de queda de rede (20261007120000) deixa de ser necessária para estender o prazo: o gatilho volta a ter só
-- a janela. As colunas confirmacao_offline / fora_do_prazo_offline e a tabela contatos_dispositivo ficam (os registros já
-- marcados continuam marcados), mas fora_do_prazo_offline passa a ser sempre false em registros novos.
-- O aditivo (correção por adendo) continua herdando a hora do original, sem a janela.

create or replace function public.definir_hora_monitoramento()
returns trigger
language plpgsql
as $$
declare
  v_hora timestamptz;
begin
  -- Nunca confiar no cliente.
  new.fora_do_prazo_offline := false;

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
      if v_hora < now() - interval '169 hours' then
        raise exception 'A hora do monitoramento passou do prazo de 7 dias para assinatura.';
      end if;
    end if;
    new.hora_monitoramento := v_hora;
  end if;
  return new;
end;
$$;

comment on column public.monitoramentos.fora_do_prazo_offline is
  'true em registros antigos aceitos além de 72 h pela contingência de queda de rede (ver contatos_dispositivo). '
  'Desde a migration 20261010063259 o prazo é de 7 dias para todos e a marca não é mais definida. '
  'Definida SÓ pelo trigger — qualquer valor vindo do cliente é sobrescrito.';
