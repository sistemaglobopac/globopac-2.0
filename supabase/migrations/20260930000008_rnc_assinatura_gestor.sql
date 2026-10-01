-- Assinatura eletrônica do Gestor de Setor na resposta da RNC (Lei 14.063/2020, Art. 4º §2º).
--
-- Quando o gestor responde (status -> TRATADA), o BANCO grava, no servidor: quem assinou
-- (auth.uid()), quando (now()) e o SHA-256 do conteúdo respondido (descrição, ação imediata,
-- causa do desvio, ação corretiva, setor, vínculo com o monitoramento). O cliente nunca envia
-- hash nem hora — só reconfere a senha antes de responder. Em qualquer outro UPDATE esses campos
-- são imutáveis (uma nova resposta, após devolução, gera uma nova assinatura).

alter table rnc
  add column if not exists assinatura_gestor_por uuid references perfis_usuarios (id),
  add column if not exists assinatura_gestor_em timestamptz,
  add column if not exists assinatura_gestor_hash char(64);

comment on column rnc.assinatura_gestor_hash is
  'SHA-256 (hex) do conteúdo da resposta do gestor no momento da assinatura, calculado pelo banco.';

create or replace function public.assinar_resposta_gestor_rnc()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'TRATADA' and old.status is distinct from 'TRATADA' then
    new.assinatura_gestor_por := coalesce(auth.uid(), new.tratado_por);
    new.assinatura_gestor_em := now();
    new.assinatura_gestor_hash := encode(
      sha256(
        convert_to(
          jsonb_build_object(
            'id', new.id,
            'monitoramento_id', new.monitoramento_id,
            'setor', new.setor,
            'severidade', new.severidade,
            'descricao', new.descricao,
            'acao_imediata', new.acao_imediata,
            'causa_desvio', new.causa_desvio,
            'tratativa', new.tratativa,
            'tratado_por', new.tratado_por
          )::text,
          'UTF8'
        )
      ),
      'hex'
    );
  else
    -- Fora da transição para TRATADA a assinatura não pode ser alterada por ninguém.
    new.assinatura_gestor_por := old.assinatura_gestor_por;
    new.assinatura_gestor_em := old.assinatura_gestor_em;
    new.assinatura_gestor_hash := old.assinatura_gestor_hash;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assinar_resposta_gestor_rnc on rnc;
create trigger trg_assinar_resposta_gestor_rnc
  before update on rnc
  for each row execute function public.assinar_resposta_gestor_rnc();
