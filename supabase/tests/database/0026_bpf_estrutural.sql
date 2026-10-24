-- Testes pgTAP — BPF Estrutural (migration 20261021085824_bpf_estrutural.sql): fluxo
-- SS -> aprovação -> programação do PCM -> verificação diária (C/NP/NC) -> relatório -> SIF.
--
-- Técnica idêntica a 0004_rls_manutencao_os.sql: simula o JWT de cada perfil com
-- set_config('request.jwt.claims', ...) + `set local role authenticated`. Os mesmos cenários
-- foram exercitados antes, fora do repositório, num Postgres embutido (PGlite).
-- Executar com: supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(29);

create function pg_temp.como(p_id uuid, p_perfil text, p_setores text[])
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_id, 'role', 'authenticated', 'perfil', p_perfil, 'setores_permitidos', p_setores
  )::text, true)
$$;

-- ------------------------------------------------------------------------------------------
-- Fixtures
-- ------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bpf.insp@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bpf.insp2@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'bpf.admin@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'bpf.pcm@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f1000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'bpf.verif@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('f1000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'bpf.sif@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('f1000000-0000-0000-0000-000000000001', 'Inspetor BPF', 'bpf.insp.teste', 'T0100', 'INSPETOR_QUALIDADE', array['MANUTENÇÕES DIVERSAS']),
  ('f1000000-0000-0000-0000-000000000002', 'Inspetor Recepção', 'bpf.insp2.teste', 'T0101', 'INSPETOR_QUALIDADE', array['RECEPCAO']),
  ('f1000000-0000-0000-0000-000000000003', 'Administrador BPF', 'bpf.admin.teste', 'T0102', 'ADMIN_MASTER', array[]::text[]),
  ('f1000000-0000-0000-0000-000000000004', 'PCM BPF', 'bpf.pcm.teste', 'T0103', 'INSPETOR_PCM', array['MANUTENCAO']),
  ('f1000000-0000-0000-0000-000000000005', 'Verificador BPF', 'bpf.verif.teste', 'T0104', 'VERIFICADOR', array['LINHA_DIF']),
  ('f1000000-0000-0000-0000-000000000006', 'SIF BPF', 'bpf.sif.teste', 'T0105', 'INSPECAO_FEDERAL', array[]::text[]);

insert into centros_custo (id, codigo, nome) values ('f2000000-0000-0000-0000-000000000001', 'BPFTESTE', 'Sangria (teste)');

-- OS que já existia antes de hoje e está com prazo vencido (cenário NC) e outra dentro do prazo.
insert into bpf_ordens (id, numero_os, setor, centro_custo_id, descricao, constatado_em, prazo_atual, criado_em)
values
  ('f3000000-0000-0000-0000-000000000001', 'T-VENCIDA', 'MANUTENÇÕES DIVERSAS', 'f2000000-0000-0000-0000-000000000001', 'Porta com prazo vencido', now() - interval '30 days', public.bpf_hoje() - 3, now() - interval '30 days'),
  ('f3000000-0000-0000-0000-000000000002', 'T-NOPRAZO', 'MANUTENÇÕES DIVERSAS', 'f2000000-0000-0000-0000-000000000001', 'Luminária dentro do prazo', now() - interval '5 days', public.bpf_hoje() + 10, now() - interval '5 days');

-- ------------------------------------------------------------------------------------------
-- 1) Solicitação: inspetor do setor abre; outro setor e escrita direta são negados
-- ------------------------------------------------------------------------------------------
select pg_temp.como('f1000000-0000-0000-0000-000000000001', 'INSPETOR_QUALIDADE', array['MANUTENÇÕES DIVERSAS']);
set local role authenticated;

select lives_ok(
  $$ select public.bpf_abrir_solicitacao('f2000000-0000-0000-0000-000000000001', 'Iluminação', 'Luminária sem emitir luz no lado esquerdo') $$,
  'Inspetor do setor abre uma solicitação de serviço'
);

select throws_matching(
  $$ insert into bpf_solicitacoes (setor, centro_custo_id, categoria, descricao, aberta_por, aberta_por_nome)
     values ('MANUTENÇÕES DIVERSAS', 'f2000000-0000-0000-0000-000000000001', 'x', 'descricao longa o bastante', 'f1000000-0000-0000-0000-000000000001', 'x') $$,
  'permission denied',
  'INSERT direto em bpf_solicitacoes é negado (só pela função do fluxo)'
);

reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000002', 'INSPETOR_QUALIDADE', array['RECEPCAO']);
set local role authenticated;

select throws_matching(
  $$ select public.bpf_abrir_solicitacao('f2000000-0000-0000-0000-000000000001', 'Piso', 'Piso quebrado na entrada da sala') $$,
  'acesso ao setor',
  'Inspetor de outro setor não abre solicitação no BPF'
);

select is((select count(*)::int from bpf_solicitacoes), 0, 'Inspetor de outro setor não enxerga as solicitações do BPF (RLS)');

-- ------------------------------------------------------------------------------------------
-- 2) Aprovação: PCM só vê depois da assinatura do administrador
-- ------------------------------------------------------------------------------------------
reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000004', 'INSPETOR_PCM', array['MANUTENCAO']);
set local role authenticated;
select is((select count(*)::int from bpf_solicitacoes), 0, 'PCM não vê a solicitação antes da aprovação do administrador');

reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000001', 'INSPETOR_QUALIDADE', array['MANUTENÇÕES DIVERSAS']);
set local role authenticated;
select throws_matching(
  $$ select public.bpf_aprovar_solicitacao((select id from bpf_solicitacoes limit 1)) $$,
  'Sem permissão',
  'Inspetor não aprova solicitação'
);

reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000003', 'ADMIN_MASTER', array[]::text[]);
set local role authenticated;
select lives_ok(
  $$ select public.bpf_aprovar_solicitacao((select id from bpf_solicitacoes limit 1)) $$,
  'Administrador assina e aprova a solicitação'
);
select is((select length(hash_aprovacao) from bpf_solicitacoes limit 1), 64, 'A aprovação grava o SHA-256 da assinatura, calculado pelo banco');

-- ------------------------------------------------------------------------------------------
-- 3) Programação do PCM
-- ------------------------------------------------------------------------------------------
reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000004', 'INSPETOR_PCM', array['MANUTENCAO']);
set local role authenticated;
select is((select count(*)::int from bpf_solicitacoes), 1, 'PCM passa a ver a solicitação depois de aprovada');

select throws_matching(
  $$ select public.bpf_programar_solicitacao((select id from bpf_solicitacoes limit 1), 'T-900001', 'Trocar luminária', 'Cláudia', public.bpf_hoje() - 1) $$,
  'anterior a hoje',
  'PCM não programa com prazo no passado'
);

select lives_ok(
  $$ select public.bpf_programar_solicitacao((select id from bpf_solicitacoes limit 1), 'T-900001', 'Trocar luminária', 'Cláudia', public.bpf_hoje() + 10) $$,
  'PCM transforma a SS aprovada em OS programada'
);
select is((select status from bpf_solicitacoes limit 1), 'PROGRAMADA', 'A solicitação passa a PROGRAMADA');
select is((select length(hash_assinatura) from bpf_programacoes where sequencia = 0 and ordem_id = (select id from bpf_ordens where numero_os = 'T-900001')), 64, 'A programação do PCM é assinada com hash gerado pelo banco');

select throws_matching(
  $$ select public.bpf_reprogramar_ordem('f3000000-0000-0000-0000-000000000001', public.bpf_hoje() + 7, 'curta') $$,
  'justificativa',
  'Reprogramar exige justificativa'
);
select lives_ok(
  $$ select public.bpf_reprogramar_ordem('f3000000-0000-0000-0000-000000000001', public.bpf_hoje() + 7, 'Falta de peça no almoxarifado') $$,
  'PCM reprograma o prazo com justificativa'
);
select is((select reprogramacoes from bpf_ordens where id = 'f3000000-0000-0000-0000-000000000001'), 1, 'A reprogramação é contada e registrada no histórico');

-- ------------------------------------------------------------------------------------------
-- 4) Verificação diária: NP só com prazo vigente; NC vale com prazo vencido ou vigente
-- ------------------------------------------------------------------------------------------
-- (a OS T-VENCIDA foi reprogramada acima; usa uma terceira, ainda vencida, para o cenário NC)
reset role;
insert into bpf_ordens (id, numero_os, setor, centro_custo_id, descricao, constatado_em, prazo_atual, criado_em)
values ('f3000000-0000-0000-0000-000000000003', 'T-VENCIDA2', 'MANUTENÇÕES DIVERSAS', 'f2000000-0000-0000-0000-000000000001', 'Outra porta vencida', now() - interval '40 days', public.bpf_hoje() - 5, now() - interval '40 days');
select pg_temp.como('f1000000-0000-0000-0000-000000000001', 'INSPETOR_QUALIDADE', array['MANUTENÇÕES DIVERSAS']);
set local role authenticated;

select lives_ok(
  $$ select public.bpf_registrar_verificacao('f3000000-0000-0000-0000-000000000002', 'NC', 'Executada, mas o desvio continua') $$,
  'NÃO CONFORME é aceito em OS dentro do prazo (executada sem sanar o desvio)'
);
select throws_matching(
  $$ select public.bpf_registrar_verificacao('f3000000-0000-0000-0000-000000000003', 'NP') $$,
  'já venceu',
  'NO PRAZO é recusado em OS com prazo vencido'
);
select lives_ok(
  $$ select public.bpf_registrar_verificacao('f3000000-0000-0000-0000-000000000003', 'NC', 'Continua sem reparo') $$,
  'NÃO CONFORME é aceito em OS vencida'
);

-- ------------------------------------------------------------------------------------------
-- 5) Relatório: emissão exige todas verificadas; o Verificador verifica; o administrador libera ao SIF
-- ------------------------------------------------------------------------------------------
select throws_matching(
  $$ select public.bpf_emitir_relatorio() $$,
  '^Faltam',
  'O dia só pode ser encerrado com todas as OS verificadas'
);

select public.bpf_registrar_verificacao('f3000000-0000-0000-0000-000000000001', 'NP');
select public.bpf_registrar_verificacao('f3000000-0000-0000-0000-000000000002', 'NP');
select lives_ok($$ select public.bpf_emitir_relatorio() $$, 'Inspetor emite o relatório do dia com todas as OS verificadas');

reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000006', 'INSPECAO_FEDERAL', array[]::text[]);
set local role authenticated;
select is((select count(*)::int from bpf_relatorios), 0, 'SIF não vê o relatório antes da verificação');

reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000003', 'ADMIN_MASTER', array[]::text[]);
set local role authenticated;
select throws_matching(
  $$ select public.bpf_liberar_relatorio((select id from bpf_relatorios limit 1)) $$,
  'ainda não foi verificado',
  'Administrador não libera um relatório que o Verificador ainda não verificou'
);

reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000005', 'VERIFICADOR', array['LINHA_DIF']);
set local role authenticated;
select throws_matching(
  $$ select public.bpf_liberar_relatorio((select id from bpf_relatorios limit 1)) $$,
  'Sem permissão',
  'Verificador não libera ao SIF (a liberação é do administrador, no Painel de Arquivo)'
);
select lives_ok(
  $$ select public.bpf_verificar_relatorio((select id from bpf_relatorios limit 1)) $$,
  'Verificador verifica o relatório (Painel de Verificação)'
);

reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000006', 'INSPECAO_FEDERAL', array[]::text[]);
set local role authenticated;
select is((select count(*)::int from bpf_relatorios), 0, 'SIF ainda não vê o relatório verificado (falta a liberação)');

reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000003', 'ADMIN_MASTER', array[]::text[]);
set local role authenticated;
select lives_ok(
  $$ select public.bpf_liberar_relatorio((select id from bpf_relatorios limit 1)) $$,
  'Administrador libera ao SIF o relatório verificado (Painel de Arquivo)'
);

reset role;
select pg_temp.como('f1000000-0000-0000-0000-000000000006', 'INSPECAO_FEDERAL', array[]::text[]);
set local role authenticated;
select is((select count(*)::int from bpf_relatorios), 1, 'SIF vê o relatório depois de liberado');

reset role;
select throws_matching(
  $$ update bpf_relatorios set qtd_nc = 99 $$,
  'imutável',
  'Relatório liberado ao SIF é imutável'
);

select * from finish();
rollback;
