-- O inspetor que trocou de setor (troca rápida / cobertura, 20261001000003) fica com acesso SÓ ao setor novo: a RLS de monitoramentos
-- (setor = ANY (meus_setores())) esconde os registros que ele mesmo fez no setor de origem. Resultado: um adendo pedido pelo Verificador
-- num registro desse setor não aparecia no Painel de Bordo dele e, mesmo se aparecesse, a assinatura (que grava um ADITIVO no setor do
-- registro) era recusada pela política de INSERT.
--
-- Esta migração abre SÓ o necessário para o dono assinar o que é dele, sem devolver o acesso ao setor:
--   1. LEITURA: o inspetor lê os registros DELE que carregam um adendo endereçado a ele (monitorId = ele). Nada além disso.
--   2. GRAVAÇÃO: o inspetor grava o aditivo de uma cadeia dele que tem adendo AINDA PENDENTE endereçado a ele, no setor da própria cadeia.
-- A troca de setor continua valendo para tudo o mais (novos monitoramentos, listas, KPIs).
--
-- Limite conhecido: a propagação da correção para os monitoramentos SEGUINTES de outros inspetores no setor de origem (leitura de
-- hidrômetro e cargas do DOA) continua dependendo de enxergar esses registros; fora do setor ela não encontra nenhum e não propaga.

-- Sub-consulta na própria tabela dentro de política dá "infinite recursion detected in policy": por isso a checagem da gravação
-- fica numa função SECURITY DEFINER (lê sem RLS), que só responde sim/não.
create or replace function public.tenho_adendo_pendente_na_cadeia(p_raiz uuid, p_setor text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.monitoramentos m
     cross join lateral jsonb_array_elements(
       case when jsonb_typeof(m.dados_dinamicos -> 'adendos') = 'array' then m.dados_dinamicos -> 'adendos' else '[]'::jsonb end
     ) as a
     where (m.id = p_raiz or m.aditivo_de = p_raiz)
       and m.user_id = auth.uid()
       and m.setor = p_setor
       and a ->> 'monitorId' = auth.uid()::text
       and a ->> 'status' = 'pending_monitor'
       -- ainda não assinado em nenhuma versão da cadeia (o original guarda "pendente"; a assinatura vive no aditivo)
       and not exists (
         select 1
           from public.monitoramentos m2
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(m2.dados_dinamicos -> 'adendos') = 'array' then m2.dados_dinamicos -> 'adendos' else '[]'::jsonb end
          ) as a2
          where m2.aditivo_de = p_raiz
            and a2 ->> 'id' = a ->> 'id'
            and a2 ->> 'status' = 'completed'
       )
  )
$$;

revoke all on function public.tenho_adendo_pendente_na_cadeia(uuid, text) from public, anon;
grant execute on function public.tenho_adendo_pendente_na_cadeia(uuid, text) to authenticated;

comment on function public.tenho_adendo_pendente_na_cadeia(uuid, text) is
  'O usuário logado é o dono da cadeia (original + aditivos) do setor informado e tem nela um adendo endereçado a ele ainda não assinado. '
  'Base da política que deixa o inspetor assinar o adendo depois de trocar de setor. Ver 20261020140000.';

-- 1. LEITURA (permissiva: soma-se à política por setor).
create policy monitoramentos_select_adendo_proprio on monitoramentos
  for select
  using (
    public.tem_permissao('monitoramentos', 'ler')
    and user_id = auth.uid()
    and dados_dinamicos @> jsonb_build_object('adendos', jsonb_build_array(jsonb_build_object('monitorId', auth.uid()::text)))
  );

-- 2. GRAVAÇÃO do aditivo que assina o adendo (permissiva: soma-se à política por setor).
create policy monitoramentos_insert_aditivo_adendo_proprio on monitoramentos
  for insert
  with check (
    public.tem_permissao('monitoramentos', 'criar')
    and user_id = auth.uid()
    and aditivo_de is not null
    and public.tenho_adendo_pendente_na_cadeia(aditivo_de, setor)
  );
