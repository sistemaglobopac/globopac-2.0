-- A GTA não pode se repetir na MESMA data de abate. O índice antigo (uq_cargas_aves_gta_dia) comparava o texto quase exato
-- (maiúsculas e espaços nas pontas), então "GTA-001", "GTA 001" e "gta001" no mesmo dia passavam como GTAs diferentes.
-- Agora a comparação é pelo número NORMALIZADO (maiúsculas, sem espaços nem pontuação). Zeros à esquerda continuam valendo.
-- A mesma GTA em OUTRA data de abate continua permitida.

create or replace function public.normalizar_gta(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(upper(btrim(p)), '[^A-Z0-9]', '', 'g');
$$;

-- Uma GTA só de pontuação ("---") normalizaria para vazio e colidiria com qualquer outra assim no mesmo dia.
alter table public.cargas_aves
  add constraint cargas_aves_gta_valida check (length(public.normalizar_gta(gta)) > 0);

create unique index uq_cargas_aves_gta_data on public.cargas_aves (data_abate, public.normalizar_gta(gta));

-- Substituído pelo índice acima (mesma regra, comparação normalizada).
drop index if exists public.uq_cargas_aves_gta_dia;

-- Consulta usada pela tela de cadastro para avisar, antes de salvar, que a GTA já está cadastrada naquela data.
create or replace function public.gta_ja_cadastrada(p_gta text, p_data date)
returns table (data_abate date, integrado text, aviario text)
language sql
stable
as $$
  select c.data_abate, c.integrado, c.aviario
  from public.cargas_aves c
  where c.data_abate = p_data
    and public.normalizar_gta(c.gta) = public.normalizar_gta(p_gta)
  limit 1;
$$;

revoke all on function public.gta_ja_cadastrada(text, date) from public, anon;
grant execute on function public.gta_ja_cadastrada(text, date) to authenticated;
