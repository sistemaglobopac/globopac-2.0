-- Testes pgTAP — GTA nao se repete na MESMA data de abate (20261006170000_gta_unica_por_data.sql): a comparacao ignora
-- maiusculas, espacos e pontuacao; em outra data de abate a mesma GTA continua permitida.

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

insert into cargas_aves (data_abate, integrado, aviario, nucleo, gta, qtd_aves) values ('2026-10-06', 'Integrado A', '1', '', 'GTA-0001', 5000);

select lives_ok(
  $$insert into cargas_aves (data_abate, integrado, aviario, nucleo, gta, qtd_aves) values ('2026-10-06', 'Integrado A', '1', '', 'GTA-0002', 4000)$$,
  'GTA diferente na mesma data e aceita'
);
select throws_ok(
  $$insert into cargas_aves (data_abate, integrado, aviario, nucleo, gta, qtd_aves) values ('2026-10-06', 'Integrado B', '2', '', 'GTA-0001', 3000)$$,
  '23505', null, 'mesma GTA na mesma data e recusada'
);
select throws_ok(
  $$insert into cargas_aves (data_abate, integrado, aviario, nucleo, gta, qtd_aves) values ('2026-10-06', 'Integrado B', '2', '', '  gta 0001 ', 3000)$$,
  '23505', null, 'maiusculas, espacos e pontuacao nao criam outra GTA na mesma data'
);
select throws_ok(
  $$insert into cargas_aves (data_abate, integrado, aviario, nucleo, gta, qtd_aves) values ('2026-10-06', 'Integrado B', '2', '', 'gta0001', 3000)$$,
  '23505', null, 'GTA sem hifen tambem e a mesma'
);
select lives_ok(
  $$insert into cargas_aves (data_abate, integrado, aviario, nucleo, gta, qtd_aves) values ('2026-10-07', 'Integrado B', '2', '', 'GTA-0001', 3000)$$,
  'a mesma GTA em OUTRA data de abate continua permitida'
);
select throws_ok(
  $$insert into cargas_aves (data_abate, integrado, aviario, nucleo, gta, qtd_aves) values ('2026-10-08', 'Integrado B', '2', '', '---', 3000)$$,
  '23514', null, 'GTA so de pontuacao e recusada'
);
select is(
  (select integrado from gta_ja_cadastrada('gta 0001', '2026-10-06')),
  'Integrado A', 'a consulta diz onde a GTA ja esta cadastrada naquela data'
);
select is((select count(*)::int from gta_ja_cadastrada('GTA-0002', '2026-10-09')), 0, 'GTA livre em outra data nao retorna nada');

select * from finish();
rollback;
