-- BPF Estrutural: o inspetor pode marcar NÃO CONFORME também em OS dentro do prazo.
-- Caso real: a OS foi executada, mas o resultado não sanou o desvio apontado. Antes, NC só valia
-- com o prazo vencido. NP continua exigindo prazo vigente (prazo >= data da verificação).

create or replace function public.bpf_verificacoes_regras()
returns trigger
language plpgsql
as $$
begin
  if new.resultado = 'NP' and new.prazo_vigente < new.data_verificacao then
    raise exception 'NO PRAZO não é possível: o prazo (%) da OS já venceu em %. Marque NÃO CONFORME ou CONFORME.',
      to_char(new.prazo_vigente, 'DD/MM/YYYY'), to_char(new.data_verificacao, 'DD/MM/YYYY');
  end if;

  if tg_op = 'UPDATE' then
    insert into bpf_verificacoes_historico (verificacao_id, versao)
    values (old.id, to_jsonb(old));
  end if;
  return new;
end;
$$;

comment on column bpf_verificacoes.resultado is
  'C = conforme (OS executada, sai do relatório); NP = não executada mas dentro do prazo; '
  'NC = não conforme: prazo vencido sem execução, ou OS executada cujo resultado não sanou o '
  'desvio (vale também dentro do prazo).';
