-- Contingência de queda de rede (ADR 0016): o inspetor pode trabalhar por dias sem internet.
--
-- Regra de negócio aprovada: o prazo de 72 h para registrar/assinar um monitoramento (20261007110000) é
-- ESTENDIDO, até 7 dias, quando se comprova uma queda de rede. A comprovação é verificada NO SERVIDOR,
-- nunca aceita do aparelho:
--   1. O aparelho avisa o servidor que está online (registrar_contato_dispositivo, a cada ~15 min com o app
--      aberto e conectado). Cada aviso vira uma linha em contatos_dispositivo — só o servidor grava.
--   2. Um registro com mais de 72 h só é aceito se (a) o inspetor confirmou a ficha com a senha no
--      aparelho (confirmacao_offline), (b) o aparelho já era conhecido (houve contato ANTES da hora do
--      monitoramento) e (c) o servidor NÃO recebeu nenhum contato desse aparelho nas 72 h seguintes à hora do
--      monitoramento — ou seja, não houve internet para assinar dentro do prazo normal.
--   3. Teto de 7 dias (+1 h de folga). Passou disso, é recusado como antes.
-- O registro aceito por esta regra fica marcado (fora_do_prazo_offline), visível ao verificador.
--
-- Limite honesto: o aviso só prova que o APP não falou com o servidor; um inspetor mal-intencionado poderia
-- deixar de enviar avisos de propósito. Por isso a marca fica no registro, o teto é de 7 dias e a evidência da
-- confirmação (aparelho, hora, hash local) acompanha a ficha para auditoria.

create table public.contatos_dispositivo (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  dispositivo_id uuid not null,
  contato_em timestamptz not null default now()
);

comment on table public.contatos_dispositivo is
  'Avisos de "aparelho online" enviados pelo app (registrar_contato_dispositivo). Prova, do lado do servidor, '
  'QUANDO um aparelho falou com o servidor — base da contingência de queda de rede (prazo estendido de 72 h para 7 dias).';

create index idx_contatos_dispositivo on public.contatos_dispositivo (user_id, dispositivo_id, contato_em);

alter table public.contatos_dispositivo enable row level security;

-- Cada usuário só enxerga os próprios avisos. Ninguém insere/atualiza/apaga direto: só a função abaixo.
create policy contatos_dispositivo_select_proprio on public.contatos_dispositivo
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.registrar_contato_dispositivo(p_dispositivo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_dispositivo_id is null then
    return;
  end if;
  -- No máximo um aviso a cada 10 min por aparelho (o app já espaça em ~15 min; isto protege a tabela).
  if exists (
    select 1 from public.contatos_dispositivo c
    where c.user_id = auth.uid()
      and c.dispositivo_id = p_dispositivo_id
      and c.contato_em > now() - interval '10 minutes'
  ) then
    return;
  end if;
  insert into public.contatos_dispositivo (user_id, dispositivo_id) values (auth.uid(), p_dispositivo_id);
end;
$$;

revoke all on function public.registrar_contato_dispositivo(uuid) from public, anon;
grant execute on function public.registrar_contato_dispositivo(uuid) to authenticated;

alter table public.monitoramentos
  add column confirmacao_offline jsonb,
  add column fora_do_prazo_offline boolean not null default false;

comment on column public.monitoramentos.confirmacao_offline is
  'Evidência da confirmação feita no aparelho sem internet (matrícula, hora do aparelho, id do aparelho, hash local '
  'dos dados e onde a senha foi conferida). Informada pelo cliente: é metadado de auditoria, NUNCA entra no hash '
  'assinável nem substitui a assinatura oficial, que só o servidor gera.';
comment on column public.monitoramentos.fora_do_prazo_offline is
  'true quando o registro passou de 72 h e foi aceito pela contingência de queda de rede (ver contatos_dispositivo). '
  'Definida SÓ pelo trigger — qualquer valor vindo do cliente é sobrescrito.';

create or replace function public.definir_hora_monitoramento()
returns trigger
language plpgsql
as $$
declare
  v_hora timestamptz;
  v_disp uuid;
begin
  -- Nunca confiar no cliente: a marca é decidida abaixo, só pelo servidor.
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
      if v_hora < now() - interval '73 hours' then
        -- Contingência de queda de rede: ver o cabeçalho desta migration.
        begin
          v_disp := (new.confirmacao_offline ->> 'dispositivo_id')::uuid;
        exception when others then
          v_disp := null;
        end;
        if new.confirmacao_offline is not null
           and new.confirmacao_offline ->> 'senha_conferida_em' in ('aparelho', 'servidor')
           and v_disp is not null
           and v_hora >= now() - interval '169 hours'
           and exists (
             select 1 from public.contatos_dispositivo c
             where c.user_id = new.user_id and c.dispositivo_id = v_disp and c.contato_em < v_hora
           )
           and not exists (
             select 1 from public.contatos_dispositivo c
             where c.user_id = new.user_id
               and c.dispositivo_id = v_disp
               and c.contato_em >= v_hora
               and c.contato_em <= v_hora + interval '73 hours'
           )
        then
          new.fora_do_prazo_offline := true;
        else
          raise exception 'A hora do monitoramento passou do prazo de 72 horas para assinatura.';
        end if;
      end if;
    end if;
    new.hora_monitoramento := v_hora;
  end if;
  return new;
end;
$$;
