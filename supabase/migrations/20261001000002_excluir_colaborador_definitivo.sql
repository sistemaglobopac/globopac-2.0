-- Exclusao DEFINITIVA de colaborador, so quando ele nunca deixou historico.
-- perfis_usuarios continua sem DELETE direto (LGPD + cadeia de custodia dos registros assinados):
-- o unico caminho e a funcao abaixo, chamada pela Edge Function excluir-colaborador (service_role).
-- Todas as FKs que apontam para perfis_usuarios sao NO ACTION: se existir QUALQUER registro dele
-- (assinatura, monitoramento, RNC, turno, OS, pausa...), o DELETE falha e nada e apagado.

create or replace function public.bloqueia_delete_perfil()
returns trigger
language plpgsql
as $$
begin
  -- Liberado apenas dentro de excluir_colaborador_definitivo() (flag local da transacao).
  if current_setting('app.excluindo_colaborador', true) = 'on' then
    return old;
  end if;
  raise exception
    'perfis_usuarios nunca é excluído fisicamente. Desative com ativo=false e preencha desligado_em.';
end;
$$;

create or replace function public.excluir_colaborador_definitivo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('app.excluindo_colaborador', 'on', true);
  begin
    delete from perfis_usuarios where id = p_id;
    if not found then
      return 'nao_encontrado';
    end if;
    return 'excluido';
  exception when foreign_key_violation then
    -- Tem historico: nada foi apagado (o bloco inteiro e revertido).
    return 'tem_historico';
  end;
end;
$$;

comment on function public.excluir_colaborador_definitivo(uuid) is
  'Apaga o perfil so se nao houver nenhum registro dele (FKs NO ACTION); devolve excluido, tem_historico ou nao_encontrado.';

revoke all on function public.excluir_colaborador_definitivo(uuid) from public, anon, authenticated;
grant execute on function public.excluir_colaborador_definitivo(uuid) to service_role;
