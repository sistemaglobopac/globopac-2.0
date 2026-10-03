-- RNC de ficha de monitoramento JÁ VERIFICADA não pode ser reaberta. A reabertura cria uma nova RNC
-- (status REABERTA) apontando para a anterior (rnc_anterior_id); aqui o banco recusa isso quando o
-- monitoramento de origem tem verificado_por preenchido, além de a tela esconder o botão "Reabrir".

create or replace function public.bloqueia_reabertura_rnc_ficha_verificada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rnc_anterior_id is not null
     and new.monitoramento_id is not null
     and exists (
       select 1 from monitoramentos m
       where m.id = new.monitoramento_id and m.verificado_por is not null
     ) then
    raise exception 'A RNC de uma ficha de monitoramento já verificada não pode ser reaberta.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_rnc_bloqueia_reabertura_verificada
  before insert on public.rnc
  for each row execute function public.bloqueia_reabertura_rnc_ficha_verificada();
