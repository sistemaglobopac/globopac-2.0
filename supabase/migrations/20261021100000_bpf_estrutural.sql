-- BPF Estrutural (Manutenções Diversas): solicitação de serviço (SS) -> aprovação do administrador
-- -> programação do PCM (OS) -> monitoramento diário do inspetor (C / NC / NP) -> relatório
-- diário de não conformidades, conferido pelo Verificador e liberado ao SIF.
--
-- Estrutura própria: não reaproveita manutencao_os (Fase 5), que modela outro fluxo (uma OS com
-- 5 assinaturas sequenciais). Aquela estrutura fica intocada.
--
-- Todas as escritas passam por funções SECURITY DEFINER que checam permissão, setor e as regras
-- do fluxo — as tabelas não têm policy de INSERT/UPDATE/DELETE para o cliente. A regra
-- "NP só com prazo vigente / NC só com prazo vencido" também é reforçada por trigger.
--
-- Pontos de integração futura com o GLOBO SIGMA: sistema_origem + id_externo em solicitações e
-- ordens (hoje 'globopac' / null). O número da OS (numero_os) é o do sistema do PCM.

-- ------------------------------------------------------------------------------------------
-- Setor de inspeção deste monitoramento (fonte de verdade: app_config.setores_cadastrados).
-- ------------------------------------------------------------------------------------------
update app_config
   set valor = valor || '["MANUTENCOES_DIVERSAS"]'::jsonb,
       atualizado_em = now()
 where chave = 'setores_cadastrados'
   and not (valor @> '["MANUTENCOES_DIVERSAS"]'::jsonb);

create or replace function public.bpf_hoje()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Manaus')::date
$$;

create or replace function public.bpf_bloqueia_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '% nunca é excluída fisicamente (registro de auditoria).', tg_table_name;
end;
$$;

-- ------------------------------------------------------------------------------------------
-- 1) Solicitações de serviço
-- ------------------------------------------------------------------------------------------
create table bpf_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  setor text not null,
  centro_custo_id uuid not null references centros_custo (id),
  categoria text not null,
  descricao text not null check (length(btrim(descricao)) >= 10),
  local_detalhe text,
  constatado_em timestamptz not null default now(),
  aberta_por uuid not null references perfis_usuarios (id),
  aberta_por_nome text not null,
  status text not null default 'AGUARDANDO_APROVACAO'
    check (status in ('AGUARDANDO_APROVACAO', 'APROVADA', 'REPROVADA', 'PROGRAMADA')),
  aprovada_por uuid references perfis_usuarios (id),
  aprovada_por_nome text,
  aprovada_em timestamptz,
  hash_aprovacao char(64),
  reprovada_por uuid references perfis_usuarios (id),
  reprovada_por_nome text,
  reprovada_em timestamptz,
  motivo_reprovacao text,
  sistema_origem text not null default 'globopac',
  id_externo text,
  criado_em timestamptz not null default now()
);

comment on table bpf_solicitacoes is
  'Solicitação de serviço aberta pelo inspetor de qualidade ao encontrar uma não conformidade '
  'estrutural. hash_aprovacao é o SHA-256 do conteúdo no momento em que o administrador assina '
  '(calculado pelo banco, nunca enviado pelo cliente).';

create unique index uq_bpf_solicitacoes_externo
  on bpf_solicitacoes (sistema_origem, id_externo) where id_externo is not null;
create index idx_bpf_solicitacoes_status on bpf_solicitacoes (status, criado_em desc);

alter table bpf_solicitacoes enable row level security;

create trigger trg_bpf_solicitacoes_sem_delete
  before delete on bpf_solicitacoes
  for each row execute function public.bpf_bloqueia_delete();

-- ------------------------------------------------------------------------------------------
-- 2) Ordens de serviço (programação do PCM)
-- ------------------------------------------------------------------------------------------
create table bpf_ordens (
  id uuid primary key default gen_random_uuid(),
  numero_os text not null unique check (length(btrim(numero_os)) > 0),
  solicitacao_id uuid unique references bpf_solicitacoes (id),
  setor text not null,
  centro_custo_id uuid not null references centros_custo (id),
  categoria text not null default 'outros',
  descricao text not null,
  local_detalhe text,
  constatado_em timestamptz not null,
  acao_corretiva text,
  responsavel text,
  prazo_atual date not null,
  reprogramacoes integer not null default 0 check (reprogramacoes >= 0),
  status text not null default 'PROGRAMADA' check (status in ('PROGRAMADA', 'CONCLUIDA')),
  concluida_em timestamptz,
  programado_por uuid references perfis_usuarios (id),
  programado_por_nome text,
  origem text not null default 'v2' check (origem in ('v2', 'importada')),
  sistema_origem text not null default 'globopac',
  id_externo text,
  criado_em timestamptz not null default now()
);

comment on table bpf_ordens is
  'OS gerada pelo PCM a partir de uma SS aprovada (ou importada do relatório manual anterior, '
  'origem = importada, sem SS). prazo_atual é sempre o prazo da última programação.';

create unique index uq_bpf_ordens_externo
  on bpf_ordens (sistema_origem, id_externo) where id_externo is not null;
create index idx_bpf_ordens_status_prazo on bpf_ordens (status, prazo_atual);
create index idx_bpf_ordens_centro on bpf_ordens (centro_custo_id);

alter table bpf_ordens enable row level security;

create trigger trg_bpf_ordens_sem_delete
  before delete on bpf_ordens
  for each row execute function public.bpf_bloqueia_delete();

-- ------------------------------------------------------------------------------------------
-- 3) Histórico de programações (sequencia 0 = programação original; 1.. = Rep. I, II, III...)
-- ------------------------------------------------------------------------------------------
create table bpf_programacoes (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references bpf_ordens (id),
  sequencia integer not null check (sequencia >= 0),
  prazo date not null,
  acao_corretiva text,
  responsavel text,
  justificativa text,
  importada boolean not null default false,
  programado_por uuid references perfis_usuarios (id),
  programado_por_nome text,
  hash_assinatura char(64),
  criado_em timestamptz not null default now(),
  unique (ordem_id, sequencia),
  -- Reprogramação feita no sistema exige motivo; as importadas do relatório manual não têm.
  check (sequencia = 0 or importada or length(btrim(coalesce(justificativa, ''))) >= 10)
);

comment on table bpf_programacoes is
  'Histórico append-only dos prazos de cada OS. Reprogramar nunca sobrescreve: grava uma nova '
  'linha com a justificativa. hash_assinatura é a assinatura eletrônica do usuário do PCM '
  '(SHA-256 do conteúdo, calculado pelo banco); nulo nas programações importadas do relatório '
  'manual, que não foram assinadas no sistema.';

alter table bpf_programacoes enable row level security;

create trigger trg_bpf_programacoes_append_only
  before update or delete on bpf_programacoes
  for each row execute function public.bloqueia_update_delete();

-- ------------------------------------------------------------------------------------------
-- 4) Verificações diárias do inspetor
-- ------------------------------------------------------------------------------------------
create table bpf_verificacoes (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references bpf_ordens (id),
  data_verificacao date not null,
  hora_verificacao time not null,
  resultado text not null check (resultado in ('C', 'NC', 'NP')),
  prazo_vigente date not null,
  observacao text,
  inspetor_id uuid not null references perfis_usuarios (id),
  inspetor_nome text not null,
  criado_em timestamptz not null default now(),
  unique (ordem_id, data_verificacao)
);

comment on column bpf_verificacoes.resultado is
  'C = conforme (OS executada, sai do relatório); NP = não executada mas dentro do prazo; '
  'NC = não executada e prazo vencido.';
comment on column bpf_verificacoes.prazo_vigente is
  'Prazo da OS no momento da verificação — base da regra NP/NC, preservada mesmo se o PCM '
  'reprogramar depois.';

create index idx_bpf_verificacoes_data on bpf_verificacoes (data_verificacao, resultado);

alter table bpf_verificacoes enable row level security;

create table bpf_verificacoes_historico (
  id uuid primary key default gen_random_uuid(),
  verificacao_id uuid not null,
  versao jsonb not null,
  substituida_em timestamptz not null default now()
);

alter table bpf_verificacoes_historico enable row level security;

create trigger trg_bpf_verificacoes_historico_append_only
  before update or delete on bpf_verificacoes_historico
  for each row execute function public.bloqueia_update_delete();

create trigger trg_bpf_verificacoes_sem_delete
  before delete on bpf_verificacoes
  for each row execute function public.bpf_bloqueia_delete();

create or replace function public.bpf_verificacoes_regras()
returns trigger
language plpgsql
as $$
begin
  if new.resultado = 'NP' and new.prazo_vigente < new.data_verificacao then
    raise exception 'NO PRAZO não é possível: o prazo (%) da OS já venceu em %. Marque NÃO CONFORME ou CONFORME.',
      to_char(new.prazo_vigente, 'DD/MM/YYYY'), to_char(new.data_verificacao, 'DD/MM/YYYY');
  end if;
  if new.resultado = 'NC' and new.prazo_vigente >= new.data_verificacao then
    raise exception 'NÃO CONFORME não é possível: a OS ainda está dentro do prazo (%). Marque NO PRAZO ou CONFORME.',
      to_char(new.prazo_vigente, 'DD/MM/YYYY');
  end if;

  if tg_op = 'UPDATE' then
    insert into bpf_verificacoes_historico (verificacao_id, versao)
    values (old.id, to_jsonb(old));
  end if;
  return new;
end;
$$;

create trigger trg_bpf_verificacoes_regras
  before insert or update on bpf_verificacoes
  for each row execute function public.bpf_verificacoes_regras();

-- ------------------------------------------------------------------------------------------
-- 5) Relatório diário (emitido pelo inspetor, liberado ao SIF pelo Verificador)
-- ------------------------------------------------------------------------------------------
create table bpf_relatorios (
  id uuid primary key default gen_random_uuid(),
  setor text not null,
  data_referencia date not null,
  status text not null default 'emitido' check (status in ('emitido', 'liberado')),
  itens jsonb not null,
  qtd_nc integer not null default 0,
  qtd_np integer not null default 0,
  qtd_conformes integer not null default 0,
  emitido_por uuid not null references perfis_usuarios (id),
  emitido_por_nome text not null,
  emitido_em timestamptz not null default now(),
  hash_emissao char(64) not null,
  liberado_por uuid references perfis_usuarios (id),
  liberado_por_nome text,
  liberado_em timestamptz,
  hash_liberacao char(64),
  unique (setor, data_referencia)
);

comment on table bpf_relatorios is
  'Fotografia imutável do relatório do dia: itens guarda cada OS não conforme / no prazo com a '
  'programação do PCM e o histórico de reprogramações como estavam na emissão. Conformes saem '
  'do relatório (só entram na contagem).';

alter table bpf_relatorios enable row level security;

create or replace function public.bpf_relatorios_imutavel()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bpf_relatorios nunca é excluído fisicamente.';
  end if;
  if old.status = 'liberado' then
    raise exception 'Relatório de % já foi liberado ao SIF e é imutável.', to_char(old.data_referencia, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$;

create trigger trg_bpf_relatorios_imutavel
  before update or delete on bpf_relatorios
  for each row execute function public.bpf_relatorios_imutavel();

-- ------------------------------------------------------------------------------------------
-- 6) RLS (somente leitura para o cliente; escrita só pelas funções abaixo)
-- ------------------------------------------------------------------------------------------
revoke insert, update, delete on bpf_solicitacoes, bpf_ordens, bpf_programacoes, bpf_verificacoes,
  bpf_verificacoes_historico, bpf_relatorios from anon, authenticated;

create policy bpf_solicitacoes_select on bpf_solicitacoes
  for select
  using (
    public.tem_permissao('bpf_solicitacoes', 'ler')
    and (
      public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR')
      -- O PCM só recebe a SS depois da assinatura do administrador.
      or (public.meu_perfil() = 'INSPETOR_PCM' and status in ('APROVADA', 'PROGRAMADA'))
      or setor = any (public.meus_setores())
    )
  );

create policy bpf_ordens_select on bpf_ordens
  for select
  using (
    public.tem_permissao('bpf_ordens', 'ler')
    and (
      public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR', 'INSPETOR_PCM')
      or setor = any (public.meus_setores())
    )
  );

create policy bpf_programacoes_select on bpf_programacoes
  for select
  using (
    public.tem_permissao('bpf_ordens', 'ler')
    and exists (select 1 from bpf_ordens o where o.id = bpf_programacoes.ordem_id)
  );

create policy bpf_verificacoes_select on bpf_verificacoes
  for select
  using (
    public.tem_permissao('bpf_ordens', 'ler')
    and exists (select 1 from bpf_ordens o where o.id = bpf_verificacoes.ordem_id)
  );

create policy bpf_relatorios_select on bpf_relatorios
  for select
  using (
    public.tem_permissao('bpf_relatorios', 'ler')
    and (
      public.meu_perfil() in ('ADMIN_MASTER', 'VERIFICADOR')
      or (public.meu_perfil() = 'INSPECAO_FEDERAL' and status = 'liberado')
      or setor = any (public.meus_setores())
    )
  );

-- ------------------------------------------------------------------------------------------
-- 7) Permissões por perfil
-- ------------------------------------------------------------------------------------------
insert into permissoes_perfil (perfil, recurso, acao) values
  ('INSPETOR_QUALIDADE', 'bpf_solicitacoes', 'ler'),
  ('INSPETOR_QUALIDADE', 'bpf_solicitacoes', 'criar'),
  ('INSPETOR_QUALIDADE', 'bpf_ordens', 'ler'),
  ('INSPETOR_QUALIDADE', 'bpf_ordens', 'verificar'),
  ('INSPETOR_QUALIDADE', 'bpf_relatorios', 'ler'),
  ('INSPETOR_QUALIDADE', 'bpf_relatorios', 'emitir'),

  ('VERIFICADOR', 'bpf_solicitacoes', 'ler'),
  ('VERIFICADOR', 'bpf_ordens', 'ler'),
  ('VERIFICADOR', 'bpf_relatorios', 'ler'),
  ('VERIFICADOR', 'bpf_relatorios', 'liberar'),

  ('INSPETOR_PCM', 'bpf_solicitacoes', 'ler'),
  ('INSPETOR_PCM', 'bpf_ordens', 'ler'),
  ('INSPETOR_PCM', 'bpf_ordens', 'programar'),

  ('ADMIN_MASTER', 'bpf_solicitacoes', 'ler'),
  ('ADMIN_MASTER', 'bpf_solicitacoes', 'criar'),
  ('ADMIN_MASTER', 'bpf_solicitacoes', 'aprovar'),
  ('ADMIN_MASTER', 'bpf_ordens', 'ler'),
  ('ADMIN_MASTER', 'bpf_ordens', 'verificar'),
  ('ADMIN_MASTER', 'bpf_ordens', 'importar'),
  ('ADMIN_MASTER', 'bpf_relatorios', 'ler'),
  ('ADMIN_MASTER', 'bpf_relatorios', 'emitir'),
  ('ADMIN_MASTER', 'bpf_relatorios', 'liberar'),

  ('INSPECAO_FEDERAL', 'bpf_relatorios', 'ler')
on conflict (perfil, recurso, acao) do nothing;

-- ------------------------------------------------------------------------------------------
-- 8) Funções do fluxo
-- ------------------------------------------------------------------------------------------
create or replace function public.bpf_nome_usuario(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nome_completo from perfis_usuarios where id = p_id
$$;

create or replace function public.bpf_setor_permitido(p_setor text)
returns boolean
language sql
stable
as $$
  select public.meu_perfil() = 'ADMIN_MASTER' or p_setor = any (public.meus_setores())
$$;

-- Inspetor abre a SS.
create or replace function public.bpf_abrir_solicitacao(
  p_centro_custo_id uuid,
  p_categoria text,
  p_descricao text,
  p_local_detalhe text default null,
  p_constatado_em timestamptz default null,
  p_setor text default 'MANUTENCOES_DIVERSAS'
)
returns bpf_solicitacoes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_constatado timestamptz := coalesce(p_constatado_em, now());
  v_ss bpf_solicitacoes;
begin
  if v_uid is null or not public.tem_permissao('bpf_solicitacoes', 'criar') then
    raise exception 'Sem permissão para abrir solicitação de serviço.';
  end if;
  if not public.bpf_setor_permitido(p_setor) then
    raise exception 'Você não tem acesso ao setor %.', p_setor;
  end if;
  if v_constatado > now() + interval '5 minutes' then
    raise exception 'A data/hora da constatação não pode estar no futuro.';
  end if;
  if length(btrim(coalesce(p_descricao, ''))) < 10 then
    raise exception 'Descreva a não conformidade com pelo menos 10 caracteres.';
  end if;
  if length(btrim(coalesce(p_categoria, ''))) = 0 then
    raise exception 'Informe a categoria.';
  end if;

  insert into bpf_solicitacoes (setor, centro_custo_id, categoria, descricao, local_detalhe,
                                constatado_em, aberta_por, aberta_por_nome)
  values (p_setor, p_centro_custo_id, btrim(p_categoria), btrim(p_descricao),
          nullif(btrim(coalesce(p_local_detalhe, '')), ''), v_constatado, v_uid,
          public.bpf_nome_usuario(v_uid))
  returning * into v_ss;
  return v_ss;
end;
$$;

-- Administrador assina a SS (aprova).
create or replace function public.bpf_aprovar_solicitacao(p_id uuid)
returns bpf_solicitacoes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ss bpf_solicitacoes;
begin
  if v_uid is null or not public.tem_permissao('bpf_solicitacoes', 'aprovar') then
    raise exception 'Sem permissão para aprovar solicitação de serviço.';
  end if;
  select * into v_ss from bpf_solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_ss.status <> 'AGUARDANDO_APROVACAO' then
    raise exception 'A solicitação % não está aguardando aprovação.', v_ss.numero;
  end if;
  if v_ss.aberta_por = v_uid then
    raise exception 'Segregação de funções: quem abriu a solicitação não pode aprová-la.';
  end if;

  update bpf_solicitacoes
     set status = 'APROVADA',
         aprovada_por = v_uid,
         aprovada_por_nome = public.bpf_nome_usuario(v_uid),
         aprovada_em = now(),
         hash_aprovacao = encode(sha256(convert_to(jsonb_build_object(
           'id', v_ss.id, 'numero', v_ss.numero, 'setor', v_ss.setor,
           'centro_custo_id', v_ss.centro_custo_id, 'categoria', v_ss.categoria,
           'descricao', v_ss.descricao, 'local_detalhe', v_ss.local_detalhe,
           'constatado_em', v_ss.constatado_em, 'aberta_por', v_ss.aberta_por,
           'aprovada_por', v_uid)::text, 'UTF8')), 'hex')
   where id = p_id
  returning * into v_ss;
  return v_ss;
end;
$$;

create or replace function public.bpf_reprovar_solicitacao(p_id uuid, p_motivo text)
returns bpf_solicitacoes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ss bpf_solicitacoes;
begin
  if v_uid is null or not public.tem_permissao('bpf_solicitacoes', 'aprovar') then
    raise exception 'Sem permissão para reprovar solicitação de serviço.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da reprovação.';
  end if;
  select * into v_ss from bpf_solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_ss.status <> 'AGUARDANDO_APROVACAO' then
    raise exception 'A solicitação % não está aguardando aprovação.', v_ss.numero;
  end if;

  update bpf_solicitacoes
     set status = 'REPROVADA', reprovada_por = v_uid,
         reprovada_por_nome = public.bpf_nome_usuario(v_uid),
         reprovada_em = now(), motivo_reprovacao = btrim(p_motivo)
   where id = p_id
  returning * into v_ss;
  return v_ss;
end;
$$;

-- PCM transforma a SS aprovada em OS e programa.
create or replace function public.bpf_programar_solicitacao(
  p_solicitacao_id uuid,
  p_numero_os text,
  p_acao_corretiva text,
  p_responsavel text,
  p_prazo date
)
returns bpf_ordens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_ss bpf_solicitacoes;
  v_os bpf_ordens;
  v_hash text;
begin
  if v_uid is null or not public.tem_permissao('bpf_ordens', 'programar') then
    raise exception 'Sem permissão para programar OS.';
  end if;
  if length(btrim(coalesce(p_numero_os, ''))) = 0 then
    raise exception 'Informe o número da OS.';
  end if;
  if length(btrim(coalesce(p_acao_corretiva, ''))) < 5 then
    raise exception 'Descreva a ação que será executada para sanar a não conformidade.';
  end if;
  if p_prazo is null or p_prazo < public.bpf_hoje() then
    raise exception 'O prazo de execução não pode ser anterior a hoje.';
  end if;

  select * into v_ss from bpf_solicitacoes where id = p_solicitacao_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_ss.status <> 'APROVADA' then
    raise exception 'A solicitação % não está aprovada para programação.', v_ss.numero;
  end if;

  v_nome := public.bpf_nome_usuario(v_uid);
  begin
    insert into bpf_ordens (numero_os, solicitacao_id, setor, centro_custo_id, categoria, descricao,
                            local_detalhe, constatado_em, acao_corretiva, responsavel, prazo_atual,
                            programado_por, programado_por_nome)
    values (btrim(p_numero_os), v_ss.id, v_ss.setor, v_ss.centro_custo_id, v_ss.categoria,
            v_ss.descricao, v_ss.local_detalhe, v_ss.constatado_em, btrim(p_acao_corretiva),
            nullif(btrim(coalesce(p_responsavel, '')), ''), p_prazo, v_uid, v_nome)
    returning * into v_os;
  exception when unique_violation then
    raise exception 'Já existe uma OS com o número %.', btrim(p_numero_os);
  end;

  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'ordem_id', v_os.id, 'numero_os', v_os.numero_os, 'solicitacao_id', v_ss.id,
    'hash_aprovacao', v_ss.hash_aprovacao, 'sequencia', 0, 'prazo', p_prazo,
    'acao_corretiva', v_os.acao_corretiva, 'responsavel', v_os.responsavel,
    'programado_por', v_uid)::text, 'UTF8')), 'hex');

  insert into bpf_programacoes (ordem_id, sequencia, prazo, acao_corretiva, responsavel,
                                programado_por, programado_por_nome, hash_assinatura)
  values (v_os.id, 0, p_prazo, v_os.acao_corretiva, v_os.responsavel, v_uid, v_nome, v_hash);

  update bpf_solicitacoes set status = 'PROGRAMADA' where id = v_ss.id;
  return v_os;
end;
$$;

-- PCM reprograma o prazo (justificativa obrigatória).
create or replace function public.bpf_reprogramar_ordem(
  p_ordem_id uuid,
  p_novo_prazo date,
  p_justificativa text,
  p_acao_corretiva text default null,
  p_responsavel text default null
)
returns bpf_ordens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_os bpf_ordens;
  v_acao text;
  v_resp text;
  v_hash text;
begin
  if v_uid is null or not public.tem_permissao('bpf_ordens', 'programar') then
    raise exception 'Sem permissão para reprogramar OS.';
  end if;
  if length(btrim(coalesce(p_justificativa, ''))) < 10 then
    raise exception 'Informe a justificativa da reprogramação (mínimo de 10 caracteres).';
  end if;
  select * into v_os from bpf_ordens where id = p_ordem_id for update;
  if not found then raise exception 'OS não encontrada.'; end if;
  if v_os.status <> 'PROGRAMADA' then
    raise exception 'A OS % já foi concluída e não pode ser reprogramada.', v_os.numero_os;
  end if;
  if p_novo_prazo is null or p_novo_prazo < public.bpf_hoje() then
    raise exception 'O novo prazo não pode ser anterior a hoje.';
  end if;
  if p_novo_prazo = v_os.prazo_atual then
    raise exception 'O novo prazo é igual ao prazo atual.';
  end if;

  v_acao := coalesce(nullif(btrim(coalesce(p_acao_corretiva, '')), ''), v_os.acao_corretiva);
  v_resp := coalesce(nullif(btrim(coalesce(p_responsavel, '')), ''), v_os.responsavel);

  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'ordem_id', v_os.id, 'numero_os', v_os.numero_os, 'sequencia', v_os.reprogramacoes + 1,
    'prazo_anterior', v_os.prazo_atual, 'prazo', p_novo_prazo, 'acao_corretiva', v_acao,
    'responsavel', v_resp, 'justificativa', btrim(p_justificativa),
    'programado_por', v_uid)::text, 'UTF8')), 'hex');

  insert into bpf_programacoes (ordem_id, sequencia, prazo, acao_corretiva, responsavel,
                                justificativa, programado_por, programado_por_nome, hash_assinatura)
  values (v_os.id, v_os.reprogramacoes + 1, p_novo_prazo, v_acao, v_resp, btrim(p_justificativa),
          v_uid, public.bpf_nome_usuario(v_uid), v_hash);

  update bpf_ordens
     set prazo_atual = p_novo_prazo, reprogramacoes = reprogramacoes + 1,
         acao_corretiva = v_acao, responsavel = v_resp
   where id = v_os.id
  returning * into v_os;
  return v_os;
end;
$$;

-- Inspetor registra o veredito do dia para uma OS (C / NP / NC). Refazer no mesmo dia substitui
-- a marcação anterior (a versão antiga fica em bpf_verificacoes_historico).
create or replace function public.bpf_registrar_verificacao(
  p_ordem_id uuid,
  p_resultado text,
  p_observacao text default null
)
returns bpf_verificacoes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := public.bpf_hoje();
  v_os bpf_ordens;
  v_ver bpf_verificacoes;
begin
  if v_uid is null or not public.tem_permissao('bpf_ordens', 'verificar') then
    raise exception 'Sem permissão para registrar a verificação.';
  end if;
  if p_resultado not in ('C', 'NC', 'NP') then
    raise exception 'Resultado inválido: use C, NC ou NP.';
  end if;
  select * into v_os from bpf_ordens where id = p_ordem_id for update;
  if not found then raise exception 'OS não encontrada.'; end if;
  if not public.bpf_setor_permitido(v_os.setor) then
    raise exception 'Você não tem acesso ao setor desta OS.';
  end if;
  if exists (select 1 from bpf_relatorios r
              where r.setor = v_os.setor and r.data_referencia = v_hoje) then
    raise exception 'O relatório de hoje já foi emitido; não é possível alterar as verificações do dia.';
  end if;
  if v_os.status = 'CONCLUIDA'
     and not exists (select 1 from bpf_verificacoes v
                      where v.ordem_id = v_os.id and v.data_verificacao = v_hoje) then
    raise exception 'A OS % já foi concluída.', v_os.numero_os;
  end if;

  insert into bpf_verificacoes (ordem_id, data_verificacao, hora_verificacao, resultado,
                                prazo_vigente, observacao, inspetor_id, inspetor_nome)
  values (v_os.id, v_hoje, (now() at time zone 'America/Manaus')::time(0), p_resultado,
          v_os.prazo_atual, nullif(btrim(coalesce(p_observacao, '')), ''), v_uid,
          public.bpf_nome_usuario(v_uid))
  on conflict (ordem_id, data_verificacao) do update
     set hora_verificacao = excluded.hora_verificacao,
         resultado = excluded.resultado,
         prazo_vigente = excluded.prazo_vigente,
         observacao = excluded.observacao,
         inspetor_id = excluded.inspetor_id,
         inspetor_nome = excluded.inspetor_nome
  returning * into v_ver;

  if p_resultado = 'C' then
    update bpf_ordens set status = 'CONCLUIDA', concluida_em = now() where id = v_os.id;
  else
    update bpf_ordens set status = 'PROGRAMADA', concluida_em = null where id = v_os.id;
  end if;
  return v_ver;
end;
$$;

-- Inspetor encerra o dia: gera a fotografia do relatório. Exige o veredito de todas as OS que
-- já existiam antes do início do dia.
create or replace function public.bpf_emitir_relatorio(
  p_setor text default 'MANUTENCOES_DIVERSAS'
)
returns bpf_relatorios
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := public.bpf_hoje();
  v_nome text;
  v_faltam integer;
  v_itens jsonb;
  v_nc integer;
  v_np integer;
  v_c integer;
  v_rel bpf_relatorios;
begin
  if v_uid is null or not public.tem_permissao('bpf_relatorios', 'emitir') then
    raise exception 'Sem permissão para emitir o relatório.';
  end if;
  if not public.bpf_setor_permitido(p_setor) then
    raise exception 'Você não tem acesso ao setor %.', p_setor;
  end if;
  if exists (select 1 from bpf_relatorios where setor = p_setor and data_referencia = v_hoje) then
    raise exception 'O relatório de hoje já foi emitido.';
  end if;

  select count(*) into v_faltam
    from bpf_ordens o
   where o.setor = p_setor
     and o.status = 'PROGRAMADA'
     and o.criado_em < (v_hoje::timestamp at time zone 'America/Manaus')
     and not exists (select 1 from bpf_verificacoes v
                      where v.ordem_id = o.id and v.data_verificacao = v_hoje);
  if v_faltam > 0 then
    raise exception 'Faltam % OS sem verificação hoje. Marque C, NP ou NC em todas antes de emitir.', v_faltam;
  end if;

  v_nome := public.bpf_nome_usuario(v_uid);

  select coalesce(jsonb_agg(t.item order by t.centro_nome, t.numero_os), '[]'::jsonb)
    into v_itens
    from (
      select cc.nome as centro_nome, o.numero_os,
             jsonb_build_object(
               'numero_os', o.numero_os,
               'solicitacao_numero', s.numero,
               'anomalia', o.descricao,
               'categoria', o.categoria,
               'local_detalhe', o.local_detalhe,
               'setor_area', cc.nome,
               'centro_custo_codigo', cc.codigo,
               'acao_corretiva', o.acao_corretiva,
               'responsavel', o.responsavel,
               'constatado_em', o.constatado_em,
               'constatado_por', s.aberta_por_nome,
               'aprovada_por', s.aprovada_por_nome,
               'aprovada_em', s.aprovada_em,
               'aprovada_hash', s.hash_aprovacao,
               'origem', o.origem,
               'prazo_vigente', v.prazo_vigente,
               'reprogramacoes', o.reprogramacoes,
               'programacao', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'sequencia', p.sequencia, 'prazo', p.prazo,
                          'justificativa', p.justificativa, 'por', p.programado_por_nome,
                          'em', p.criado_em, 'hash', p.hash_assinatura)
                          order by p.sequencia), '[]'::jsonb)
                   from bpf_programacoes p where p.ordem_id = o.id),
               'resultado', v.resultado,
               'data_verificacao', v.data_verificacao,
               'hora_verificacao', v.hora_verificacao,
               'inspetor', v.inspetor_nome,
               'observacao', v.observacao
             ) as item
        from bpf_verificacoes v
        join bpf_ordens o on o.id = v.ordem_id
        join centros_custo cc on cc.id = o.centro_custo_id
        left join bpf_solicitacoes s on s.id = o.solicitacao_id
       where v.data_verificacao = v_hoje
         and o.setor = p_setor
         and v.resultado in ('NC', 'NP')
    ) t;

  select count(*) filter (where v.resultado = 'NC'),
         count(*) filter (where v.resultado = 'NP'),
         count(*) filter (where v.resultado = 'C')
    into v_nc, v_np, v_c
    from bpf_verificacoes v join bpf_ordens o on o.id = v.ordem_id
   where v.data_verificacao = v_hoje and o.setor = p_setor;

  insert into bpf_relatorios (setor, data_referencia, itens, qtd_nc, qtd_np, qtd_conformes,
                              emitido_por, emitido_por_nome, hash_emissao)
  values (p_setor, v_hoje, v_itens, v_nc, v_np, v_c, v_uid, v_nome,
          encode(sha256(convert_to(jsonb_build_object(
            'setor', p_setor, 'data', v_hoje, 'itens', v_itens, 'emitido_por', v_uid)::text,
            'UTF8')), 'hex'))
  returning * into v_rel;
  return v_rel;
end;
$$;

-- Verificador confere e libera ao SIF.
create or replace function public.bpf_liberar_relatorio(p_id uuid)
returns bpf_relatorios
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rel bpf_relatorios;
begin
  if v_uid is null or not public.tem_permissao('bpf_relatorios', 'liberar') then
    raise exception 'Sem permissão para liberar o relatório.';
  end if;
  select * into v_rel from bpf_relatorios where id = p_id for update;
  if not found then raise exception 'Relatório não encontrado.'; end if;
  if v_rel.status <> 'emitido' then
    raise exception 'O relatório já foi liberado.';
  end if;
  if v_rel.emitido_por = v_uid then
    raise exception 'Segregação de funções: quem emitiu o relatório não pode liberá-lo.';
  end if;

  update bpf_relatorios
     set status = 'liberado', liberado_por = v_uid,
         liberado_por_nome = public.bpf_nome_usuario(v_uid), liberado_em = now(),
         hash_liberacao = encode(sha256(convert_to(jsonb_build_object(
           'id', v_rel.id, 'hash_emissao', v_rel.hash_emissao, 'liberado_por', v_uid)::text,
           'UTF8')), 'hex')
   where id = p_id
  returning * into v_rel;
  return v_rel;
end;
$$;

-- Administrador importa as OS já programadas do relatório manual anterior.
-- p_itens: [{numero_os, descricao, setor_area, acao_corretiva, responsavel, aberta_em (date),
--            prazos: [date, date, ...]}]  (prazos[0] = programação original; demais = Rep. I, II...)
create or replace function public.bpf_importar_ordens(
  p_itens jsonb,
  p_setor text default 'MANUTENCOES_DIVERSAS'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_numero text;
  v_area text;
  v_centro_id uuid;
  v_prazos date[];
  v_aberta date;
  v_os_id uuid;
  v_i integer;
  v_importadas integer := 0;
  v_ignoradas jsonb := '[]'::jsonb;
  v_centros_criados jsonb := '[]'::jsonb;
begin
  if v_uid is null or not public.tem_permissao('bpf_ordens', 'importar') then
    raise exception 'Sem permissão para importar OS.';
  end if;
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Formato inválido: esperado uma lista de OS.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_numero := btrim(coalesce(v_item ->> 'numero_os', ''));
    v_area := btrim(coalesce(v_item ->> 'setor_area', ''));
    if v_numero = '' or v_area = '' or btrim(coalesce(v_item ->> 'descricao', '')) = '' then
      raise exception 'Item inválido (número da OS, setor e descrição são obrigatórios): %', v_item::text;
    end if;

    if exists (select 1 from bpf_ordens where numero_os = v_numero) then
      v_ignoradas := v_ignoradas || to_jsonb(v_numero);
      continue;
    end if;

    select array_agg(x::date order by ord)
      into v_prazos
      from jsonb_array_elements_text(v_item -> 'prazos') with ordinality as t(x, ord);
    if v_prazos is null or array_length(v_prazos, 1) < 1 then
      raise exception 'OS %: informe ao menos o prazo programado.', v_numero;
    end if;
    v_aberta := coalesce((v_item ->> 'aberta_em')::date, v_prazos[1]);

    select id into v_centro_id from centros_custo where lower(btrim(nome)) = lower(v_area) limit 1;
    if v_centro_id is null then
      insert into centros_custo (codigo, nome)
      values (left(upper(regexp_replace(v_area, '[^A-Za-z0-9]+', '_', 'g')), 40), v_area)
      on conflict (codigo) do update set codigo = centros_custo.codigo
      returning id into v_centro_id;
      v_centros_criados := v_centros_criados || to_jsonb(v_area);
    end if;

    insert into bpf_ordens (numero_os, setor, centro_custo_id, descricao, constatado_em,
                            acao_corretiva, responsavel, prazo_atual, reprogramacoes, origem)
    values (v_numero, p_setor, v_centro_id, btrim(v_item ->> 'descricao'),
            v_aberta::timestamp at time zone 'America/Manaus',
            nullif(btrim(coalesce(v_item ->> 'acao_corretiva', '')), ''),
            nullif(btrim(coalesce(v_item ->> 'responsavel', '')), ''),
            v_prazos[array_length(v_prazos, 1)], array_length(v_prazos, 1) - 1, 'importada')
    returning id into v_os_id;

    for v_i in 1 .. array_length(v_prazos, 1) loop
      insert into bpf_programacoes (ordem_id, sequencia, prazo, acao_corretiva, responsavel, importada)
      values (v_os_id, v_i - 1, v_prazos[v_i],
              nullif(btrim(coalesce(v_item ->> 'acao_corretiva', '')), ''),
              nullif(btrim(coalesce(v_item ->> 'responsavel', '')), ''), true);
    end loop;
    v_importadas := v_importadas + 1;
  end loop;

  return jsonb_build_object('importadas', v_importadas, 'ignoradas', v_ignoradas,
                            'centros_criados', v_centros_criados);
end;
$$;

revoke execute on function
  public.bpf_nome_usuario(uuid),
  public.bpf_abrir_solicitacao(uuid, text, text, text, timestamptz, text),
  public.bpf_aprovar_solicitacao(uuid),
  public.bpf_reprovar_solicitacao(uuid, text),
  public.bpf_programar_solicitacao(uuid, text, text, text, date),
  public.bpf_reprogramar_ordem(uuid, date, text, text, text),
  public.bpf_registrar_verificacao(uuid, text, text),
  public.bpf_emitir_relatorio(text),
  public.bpf_liberar_relatorio(uuid),
  public.bpf_importar_ordens(jsonb, text)
  from public, anon;

grant execute on function
  public.bpf_abrir_solicitacao(uuid, text, text, text, timestamptz, text),
  public.bpf_aprovar_solicitacao(uuid),
  public.bpf_reprovar_solicitacao(uuid, text),
  public.bpf_programar_solicitacao(uuid, text, text, text, date),
  public.bpf_reprogramar_ordem(uuid, date, text, text, text),
  public.bpf_registrar_verificacao(uuid, text, text),
  public.bpf_emitir_relatorio(text),
  public.bpf_liberar_relatorio(uuid),
  public.bpf_importar_ordens(jsonb, text)
  to authenticated;
