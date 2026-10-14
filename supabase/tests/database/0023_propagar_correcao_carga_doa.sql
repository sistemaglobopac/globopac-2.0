-- Testes pgTAP — propagar_correcao_carga_doa (20261014120000_propagar_correcao_carga_doa.sql): a correção por adendo de um dado de
-- CARGA no DOA segue para a apuração seguinte (de outro inspetor), achando a carga pelo id e refazendo % de DOA, saldo, nota e soma.

create extension if not exists pgtap with schema extensions;

begin;
select plan(10);

insert into auth.users (id, aud, role, email, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e9300000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'doa.a@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('e9300000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'doa.b@test.local', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

insert into perfis_usuarios (id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos) values
  ('e9300000-0000-0000-0000-000000000001', 'Doa A', 'doa.a.teste', 'T0930', 'INSPETOR_QUALIDADE', array['SETOR_DOA']),
  ('e9300000-0000-0000-0000-000000000002', 'Doa B', 'doa.b.teste', 'T0931', 'INSPETOR_QUALIDADE', array['SETOR_DOA']);

insert into fichas_templates (id, codigo, versao, nome, pac_correspondente, schema_campos)
values ('f9300000-0000-0000-0000-000000000001', 'TEMP-DOA', 1, 'Template DOA', 'PAC-000', '[]'::jsonb);

-- Apuração 6 (A): a carga 1111 veio com 3.072 aves (corrigido por adendo de 3.581). Apuração 7 (B): a carga 1111 aparece em
-- OUTRA posição, ainda com 3.581 e a soma antiga. Apuração 8 (B): a carga está com outro valor (não é o corrigido).
insert into monitoramentos (id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, hora_monitoramento, criado_em) values
  ('39300000-0000-0000-0000-0000000000a0', 'f9300000-0000-0000-0000-000000000001', 1, 'e9300000-0000-0000-0000-000000000001', 'SETOR_DOA',
    '{"hora_monitoramento":"2026-10-10T12:00:00Z",
      "campo_1":{"dataAbate":"2026-10-10","cargas":[{"cargaId":"11111111-1111-1111-1111-111111111111","gta":"G1","qtdPrevista":1000,"avesRecebidas":"3072","avesMortas":"2"}],"totalRecebidas":3072,"totalMortas":2,"doaTotalPct":0.07},
      "adendos":[{"id":"a9300000-0000-0000-0000-000000000001","status":"completed","corrections":{"campo_1.cargas.0.avesRecebidas":{"old":"3581","new":"3072"}}}]}',
    '2026-10-10T12:00:00Z', '2026-10-10T12:05:00Z'),
  ('39300000-0000-0000-0000-0000000000b0', 'f9300000-0000-0000-0000-000000000001', 1, 'e9300000-0000-0000-0000-000000000002', 'SETOR_DOA',
    '{"hora_monitoramento":"2026-10-10T16:00:00Z",
      "campo_1":{"dataAbate":"2026-10-10","cargas":[
        {"cargaId":"22222222-2222-2222-2222-222222222222","gta":"G2","qtdPrevista":500,"avesRecebidas":"500","avesMortas":"0","doaPct":0,"saldoDiferenca":0,"notaSaldo":null},
        {"cargaId":"11111111-1111-1111-1111-111111111111","gta":"G1","qtdPrevista":1000,"avesRecebidas":"3581","avesMortas":"2","doaPct":0.06,"saldoDiferenca":2581,"notaSaldo":"antiga"}],
        "totalRecebidas":4081,"totalMortas":2,"doaTotalPct":0.05}}',
    '2026-10-10T16:00:00Z', '2026-10-10T16:05:00Z'),
  ('39300000-0000-0000-0000-0000000000c0', 'f9300000-0000-0000-0000-000000000001', 1, 'e9300000-0000-0000-0000-000000000002', 'SETOR_DOA',
    '{"hora_monitoramento":"2026-10-10T18:00:00Z",
      "campo_1":{"dataAbate":"2026-10-10","cargas":[{"cargaId":"11111111-1111-1111-1111-111111111111","gta":"G1","qtdPrevista":1000,"avesRecebidas":"999","avesMortas":"2"}],"totalRecebidas":999,"totalMortas":2,"doaTotalPct":0.2}}',
    '2026-10-10T18:00:00Z', '2026-10-10T18:05:00Z');

-- Como o dono da apuração corrigida (A).
select set_config('request.jwt.claims', json_build_object('sub', 'e9300000-0000-0000-0000-000000000001', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['SETOR_DOA'])::text, true);
set local role authenticated;

select throws_like(
  $$select public.propagar_correcao_carga_doa('39300000-0000-0000-0000-0000000000a0', 'a9300000-0000-0000-0000-000000000001', '39300000-0000-0000-0000-0000000000c0', '[{"campo":"campo_1","cargaId":"11111111-1111-1111-1111-111111111111","prop":"avesRecebidas"}]'::jsonb)$$,
  '%não é o corrigido%', 'seguinte em que a carga já tem outro valor não é alterado'
);
select throws_like(
  $$select public.propagar_correcao_carga_doa('39300000-0000-0000-0000-0000000000a0', 'a9300000-0000-0000-0000-000000000001', '39300000-0000-0000-0000-0000000000b0', '[{"campo":"campo_1","cargaId":"11111111-1111-1111-1111-111111111111","prop":"doaPct"}]'::jsonb)$$,
  '%Ajuste de carga inválido%', 'dado derivado não pode ser propagado'
);

select isnt(
  public.propagar_correcao_carga_doa('39300000-0000-0000-0000-0000000000a0', 'a9300000-0000-0000-0000-000000000001', '39300000-0000-0000-0000-0000000000b0', '[{"campo":"campo_1","cargaId":"11111111-1111-1111-1111-111111111111","prop":"avesRecebidas"}]'::jsonb),
  null, 'o dono da apuração corrigida propaga a carga para a apuração seguinte de outro inspetor'
);

select throws_like(
  $$select public.propagar_correcao_carga_doa('39300000-0000-0000-0000-0000000000a0', 'a9300000-0000-0000-0000-000000000001', '39300000-0000-0000-0000-0000000000b0', '[{"campo":"campo_1","cargaId":"11111111-1111-1111-1111-111111111111","prop":"avesRecebidas"}]'::jsonb)$$,
  '%versão mais recente%', 'repetir no seguinte já corrigido é recusado'
);

-- Quem não é o dono da apuração corrigida não propaga.
select set_config('request.jwt.claims', json_build_object('sub', 'e9300000-0000-0000-0000-000000000002', 'role', 'authenticated', 'perfil', 'INSPETOR_QUALIDADE', 'setores_permitidos', array['SETOR_DOA'])::text, true);
select throws_like(
  $$select public.propagar_correcao_carga_doa('39300000-0000-0000-0000-0000000000a0', 'a9300000-0000-0000-0000-000000000001', '39300000-0000-0000-0000-0000000000c0', '[{"campo":"campo_1","cargaId":"11111111-1111-1111-1111-111111111111","prop":"avesRecebidas"}]'::jsonb)$$,
  '%dono do monitoramento corrigido%', 'outro inspetor não propaga a correção que não é dele'
);
reset role;

-- A carga é achada pelo id (estava na 2ª posição) e os derivados e a soma são refeitos.
select is(
  (select dados_dinamicos -> 'campo_1' -> 'cargas' -> 1 ->> 'avesRecebidas' from monitoramentos where aditivo_de = '39300000-0000-0000-0000-0000000000b0'),
  '3072', 'a carga (achada pelo id) ganha as aves recebidas corrigidas no aditivo da apuração seguinte'
);
select is(
  (select (dados_dinamicos -> 'campo_1' -> 'cargas' -> 1 ->> 'doaPct')::numeric || ' | ' || (dados_dinamicos -> 'campo_1' -> 'cargas' -> 1 ->> 'saldoDiferenca') from monitoramentos where aditivo_de = '39300000-0000-0000-0000-0000000000b0'),
  '0.07 | 2072', 'a % de DOA e o saldo são refeitos'
);
select is(
  (select dados_dinamicos -> 'campo_1' -> 'cargas' -> 1 ->> 'notaSaldo' from monitoramentos where aditivo_de = '39300000-0000-0000-0000-0000000000b0'),
  'Vieram 2.072 aves a mais que as 1.000 previstas na GTA: necessário documento de correção do saldo.', 'a nota de saldo é refeita'
);
select is(
  (select (dados_dinamicos -> 'campo_1' ->> 'totalRecebidas') || ' | ' || (dados_dinamicos -> 'campo_1' ->> 'totalMortas') || ' | ' || (dados_dinamicos -> 'campo_1' ->> 'doaTotalPct') from monitoramentos where aditivo_de = '39300000-0000-0000-0000-0000000000b0'),
  '3572 | 2 | 0.06', 'a SOMA do dia é refeita'
);
select is(
  (select dados_dinamicos -> 'campo_1' -> 'cargas' -> 1 ->> 'avesRecebidas' from monitoramentos where id = '39300000-0000-0000-0000-0000000000b0'),
  '3581', 'a apuração seguinte original não é alterada (fica no histórico)'
);

select * from finish();
rollback;
