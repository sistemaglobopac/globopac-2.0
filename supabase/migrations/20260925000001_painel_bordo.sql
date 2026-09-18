-- Painel de Bordo (cockpit de turno do INSPETOR_QUALIDADE): pausas/refeições e paradas de
-- processo são conceitos novos, sem tabela própria até agora — turnos_inspetores só cobre o
-- turno como um todo (início/fim do dia), não cada pausa individual.

create table pausas_inspetores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references perfis_usuarios (id),
  tipo_pausa text not null check (tipo_pausa in ('CURTA_20M', 'ALMOCO_72M', 'JANTAR_72M')),
  status text not null default 'EM_ANDAMENTO' check (status in ('EM_ANDAMENTO', 'CONCLUIDA')),
  hora_inicio timestamptz not null default now(),
  hora_fim timestamptz,
  criado_em timestamptz not null default now()
);

comment on table pausas_inspetores is
  'Pausas/refeições do inspetor durante o turno (Painel de Bordo). Cada pausa é uma linha '
  'própria — não reaproveita turnos_inspetores, que rastreia o turno como um todo.';

alter table pausas_inspetores enable row level security;

create index idx_pausas_user_status on pausas_inspetores (user_id, status);

-- Mesmo padrão de turnos_inspetores: select exige a permissão; insert/update só exigem que o
-- inspetor seja dono da própria linha (não há ação administrativa sobre pausa de outro).
create policy pausas_select on pausas_inspetores
  for select
  using (
    public.tem_permissao('pausas_inspetores', 'ler')
    and (public.meu_perfil() = 'ADMIN_MASTER' or user_id = auth.uid())
  );

create policy pausas_insert on pausas_inspetores
  for insert
  with check (user_id = auth.uid());

create policy pausas_update on pausas_inspetores
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table paradas_processo (
  id uuid primary key default gen_random_uuid(),
  inspetor_id uuid not null references perfis_usuarios (id),
  setor text not null,
  equipamento text,
  motivo text not null,
  detalhes text,
  hora_inicio timestamptz not null,
  hora_fim timestamptz,
  criado_em timestamptz not null default now()
);

comment on table paradas_processo is
  'Log de parada operacional/bloqueio de linha registrado pelo inspetor (Painel de Bordo) — '
  'registro simples, sem máquina de estados (diferente de manutencao_os).';

alter table paradas_processo enable row level security;

create index idx_paradas_inspetor on paradas_processo (inspetor_id, hora_inicio desc);

create policy paradas_select on paradas_processo
  for select
  using (
    public.tem_permissao('paradas_processo', 'ler')
    and (public.meu_perfil() = 'ADMIN_MASTER' or inspetor_id = auth.uid())
  );

create policy paradas_insert on paradas_processo
  for insert
  with check (inspetor_id = auth.uid());

insert into permissoes_perfil (perfil, recurso, acao) values
  ('INSPETOR_QUALIDADE', 'pausas_inspetores', 'ler'),
  ('INSPETOR_QUALIDADE', 'paradas_processo', 'ler'),
  ('ADMIN_MASTER', 'pausas_inspetores', 'ler'),
  ('ADMIN_MASTER', 'paradas_processo', 'ler'),
  -- Aba de Manutenção do Painel de Bordo (só pro setor "Manutenções Diversas"): o inspetor
  -- abre e acompanha OS pelas telas reais de PCM (/pcm, /pcm/nova) — não avança etapa, isso
  -- continua exclusivo de INSPETOR_PCM/ADMIN_MASTER.
  ('INSPETOR_QUALIDADE', 'manutencao_os', 'ler'),
  ('INSPETOR_QUALIDADE', 'manutencao_os', 'abrir'),
  ('INSPETOR_QUALIDADE', 'manutencao_os_historico', 'ler')
on conflict (perfil, recurso, acao) do nothing;

-- Realtime: nenhuma tabela deste projeto usava postgres_changes até agora — o Painel de Bordo
-- é o primeiro consumidor (recarrega KPIs quando monitoramentos muda, e o card de pausa quando
-- outra aba/dispositivo do mesmo inspetor inicia/encerra uma pausa).
alter publication supabase_realtime add table monitoramentos;
alter publication supabase_realtime add table pausas_inspetores;
