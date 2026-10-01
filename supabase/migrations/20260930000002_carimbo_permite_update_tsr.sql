-- Carimbo de tempo RFC 3161: permite ao worker gravar o resultado nas tabelas append-only.
--
-- Bug: assinaturas_eletronicas, assinaturas_os_eletronicas e lote_liberacao_sif usavam
-- bloqueia_update_delete(), que recusa TODO update — inclusive o do worker
-- (processar-fila-carimbo), que precisa preencher tsr_base64/tsa_* depois de emitido o carimbo.
-- Resultado: o worker processava a fila, a gravação era recusada e o item ficava "pendente"
-- para sempre, com 0 tentativas e sem erro registrado.
--
-- Correção: um trigger específico que continua bloqueando DELETE e qualquer UPDATE de conteúdo
-- (hash, tipo, usuário, datas…), mas aceita um UPDATE que mexa APENAS nas colunas do carimbo e
-- só uma vez (write-once: se tsr_base64 já foi preenchido, nunca é sobrescrito).
create or replace function public.bloqueia_update_exceto_carimbo()
returns trigger
language plpgsql
as $$
declare
  colunas_carimbo constant text[] := array['tsr_base64', 'tsa_emitido_em', 'tsa_utilizada', 'cadeia_certificados_tsa'];
begin
  if tg_op = 'DELETE' then
    raise exception '% é append-only: DELETE nunca é permitido nesta tabela, por trigger de banco (independente de RLS).',
      tg_table_name;
  end if;

  if (to_jsonb(new) - colunas_carimbo) is distinct from (to_jsonb(old) - colunas_carimbo) then
    raise exception '% é append-only: só as colunas do carimbo de tempo (%) podem ser preenchidas depois da criação.',
      tg_table_name, array_to_string(colunas_carimbo, ', ');
  end if;

  if old.tsr_base64 is not null then
    raise exception '% : o carimbo de tempo já foi gravado e não pode ser sobrescrito.', tg_table_name;
  end if;

  return new;
end;
$$;

comment on function public.bloqueia_update_exceto_carimbo is
  'Append-only com exceção: o worker de carimbo RFC 3161 pode preencher (uma única vez) '
  'tsr_base64/tsa_emitido_em/tsa_utilizada/cadeia_certificados_tsa. Qualquer outra alteração ou DELETE é bloqueada.';

drop trigger trg_append_only_assinaturas_eletronicas on assinaturas_eletronicas;
create trigger trg_append_only_assinaturas_eletronicas
  before update or delete on assinaturas_eletronicas
  for each row execute function public.bloqueia_update_exceto_carimbo();

drop trigger trg_append_only_assinaturas_os_eletronicas on assinaturas_os_eletronicas;
create trigger trg_append_only_assinaturas_os_eletronicas
  before update or delete on assinaturas_os_eletronicas
  for each row execute function public.bloqueia_update_exceto_carimbo();

drop trigger trg_append_only_lote_liberacao_sif on lote_liberacao_sif;
create trigger trg_append_only_lote_liberacao_sif
  before update or delete on lote_liberacao_sif
  for each row execute function public.bloqueia_update_exceto_carimbo();
