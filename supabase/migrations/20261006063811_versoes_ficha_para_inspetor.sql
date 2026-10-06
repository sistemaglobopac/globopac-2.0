-- O inspetor só lê templates ATIVOS (RLS de fichas_templates). Ao reeditar uma ficha nasce uma versão
-- nova e a anterior fica inativa; os monitoramentos já feitos no dia continuam apontando para a
-- versão antiga, que o inspetor não consegue listar. Resultado: a leitura anterior (hidrômetros do
-- SPR) não era herdada e a contagem de fichas iniciadas/atrasos perdia os registros antigos.
-- Estas funções expõem só ids e códigos (nada do schema) para esse cruzamento.

create or replace function public.ids_versoes_ficha(p_codigo text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.fichas_templates where codigo = p_codigo;
$$;

create or replace function public.codigos_de_templates(p_ids uuid[])
returns table (id uuid, codigo text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.codigo from public.fichas_templates t where t.id = any (p_ids);
$$;

revoke all on function public.ids_versoes_ficha(text) from public, anon;
revoke all on function public.codigos_de_templates(uuid[]) from public, anon;
grant execute on function public.ids_versoes_ficha(text) to authenticated;
grant execute on function public.codigos_de_templates(uuid[]) to authenticated;

-- Retomar um monitoramento em andamento (ex.: absorção em 2 fases) depois que a ficha ganhou uma
-- versão nova: ele precisa continuar com o template da versão em que foi iniciado, que o inspetor
-- não lê por RLS (inativo).
create or replace function public.templates_por_ids(p_ids uuid[])
returns table (id uuid, codigo text, nome text, pac_correspondente text, schema_campos jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.codigo, t.nome, t.pac_correspondente, t.schema_campos
  from public.fichas_templates t
  where t.id = any (p_ids);
$$;

revoke all on function public.templates_por_ids(uuid[]) from public, anon;
grant execute on function public.templates_por_ids(uuid[]) to authenticated;
