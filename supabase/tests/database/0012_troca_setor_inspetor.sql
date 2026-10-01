-- Testes pgTAP — troca rapida de setor do inspetor (20261001000003_troca_setor_inspetor.sql):
-- substitui o setor, guarda o original, volta manualmente ou sozinha ao fim do turno, e so
-- administrador/verificador podem trocar.

create extension if not exists pgtap with schema extensions;

begin;
select plan(18);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e4000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'insp.troca@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e4000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'verif.troca@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e4000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'outro.insp.troca@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e4000000-0000-0000-0000-000000000001', 'Joao Inspetor', 'joao.troca.teste', 'T0050', 'INSPETOR_QUALIDADE', array['SALA_CORTES']),
  ('e4000000-0000-0000-0000-000000000002', 'Vera Verificadora', 'vera.troca.teste', 'T0051', 'VERIFICADOR', array['Todos']),
  ('e4000000-0000-0000-0000-000000000003', 'Outro Inspetor', 'outro.troca.teste', 'T0052', 'INSPETOR_QUALIDADE', array['SALA_CORTES']);

insert into app_config (chave, valor) values ('setores_cadastrados', '["SALA_CORTES","EVISCERACAO"]')
on conflict (chave) do update set valor = excluded.valor;

-- ---- como INSPETOR (sem permissao): recusado
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e4000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE',
  'setores_permitidos', array['SALA_CORTES'])::text, true);
set local role authenticated;

select throws_ok(
  $$select public.trocar_setor_inspetor('e4000000-0000-0000-0000-000000000001', 'EVISCERACAO')$$,
  '42501', null, 'inspetor nao pode trocar o setor de ninguem'
);

-- ---- como VERIFICADOR
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e4000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'VERIFICADOR',
  'setores_permitidos', array['Todos'])::text, true);

select lives_ok(
  $$select public.trocar_setor_inspetor('e4000000-0000-0000-0000-000000000001', 'EVISCERACAO')$$,
  'verificador troca o setor do inspetor'
);

select throws_ok(
  $$select public.trocar_setor_inspetor('e4000000-0000-0000-0000-000000000001', 'SETOR_INEXISTENTE')$$,
  'P0001', null, 'setor nao cadastrado e recusado'
);

select throws_ok(
  $$select public.trocar_setor_inspetor('e4000000-0000-0000-0000-000000000002', 'EVISCERACAO')$$,
  'P0001', null, 'so inspetor de qualidade pode ser trocado'
);

select ok((select count(*)::int from public.listar_inspetores_troca_setor()) >= 2, 'lista os inspetores ativos');

reset role;

select is((select setores_permitidos from perfis_usuarios where id = 'e4000000-0000-0000-0000-000000000001'), array['EVISCERACAO'], 'setor SUBSTITUIDO pelo novo');
select is((select setores_base from perfis_usuarios where id = 'e4000000-0000-0000-0000-000000000001'), array['SALA_CORTES'], 'setor original guardado em setores_base');
select ok((select troca_setor_expira_em from perfis_usuarios where id = 'e4000000-0000-0000-0000-000000000001') > now(), 'a troca expira no futuro (fim do turno)');

-- ---- segunda troca mantem o setor de origem original
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e4000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'VERIFICADOR',
  'setores_permitidos', array['Todos'])::text, true);
set local role authenticated;
select public.trocar_setor_inspetor('e4000000-0000-0000-0000-000000000001', 'SALA_CORTES');
reset role;
-- escolher o proprio setor de origem desfaz a troca
select is((select setores_permitidos from perfis_usuarios where id = 'e4000000-0000-0000-0000-000000000001'), array['SALA_CORTES'], 'escolher o setor de origem desfaz a troca');
select is((select setores_base from perfis_usuarios where id = 'e4000000-0000-0000-0000-000000000001'), null, 'setores_base limpo apos o retorno');

-- ---- cobertura de almoco: o inspetor fica SO com o setor coberto, por tempo limitado
select set_config('request.jwt.claims', json_build_object(
  'sub', 'e4000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'VERIFICADOR',
  'setores_permitidos', array['Todos'])::text, true);
set local role authenticated;
select lives_ok(
  $$select public.trocar_setor_inspetor('e4000000-0000-0000-0000-000000000001', 'EVISCERACAO', now() + interval '1 hour 30 minutes')$$,
  'verificador cobre o almoco com prazo'
);
select throws_ok(
  $$select public.trocar_setor_inspetor('e4000000-0000-0000-0000-000000000001', 'EVISCERACAO', now() - interval '1 minute')$$,
  'P0001', null, 'prazo da cobertura no passado e recusado'
);
reset role;
select is((select setores_permitidos from perfis_usuarios where id = 'e4000000-0000-0000-0000-000000000001'), array['EVISCERACAO'], 'cobertura: acesso SO ao setor coberto');
select is((select setores_base from perfis_usuarios where id = 'e4000000-0000-0000-0000-000000000001'), array['SALA_CORTES'], 'setor de origem guardado na cobertura');
select ok((select troca_setor_expira_em from perfis_usuarios where id = 'e4000000-0000-0000-0000-000000000001') <= now() + interval '1 hour 31 minutes', 'cobertura expira no prazo pedido (ou antes)');
select is((select count(*)::int from trocas_setor_inspetor where user_id = 'e4000000-0000-0000-0000-000000000001' and tipo = 'cobertura'), 1, 'cobertura auditada como tipo cobertura');

-- ---- retorno automatico ao fim do turno
update perfis_usuarios set setores_base = array['SALA_CORTES'], setores_permitidos = array['EVISCERACAO'],
  troca_setor_expira_em = now() - interval '1 minute' where id = 'e4000000-0000-0000-0000-000000000001';
select is(public.restaurar_setores_expirados(), 1, 'job restaura 1 troca expirada');
select is((select setores_permitidos from perfis_usuarios where id = 'e4000000-0000-0000-0000-000000000001'), array['SALA_CORTES'], 'job devolveu o setor de origem');
select is((select count(*)::int from trocas_setor_inspetor where user_id = 'e4000000-0000-0000-0000-000000000001' and tipo = 'retorno_automatico'), 1, 'retorno automatico auditado');

select * from finish();
rollback;
