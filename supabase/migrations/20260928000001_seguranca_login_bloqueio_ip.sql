-- Segurança de login: bloqueio progressivo por IP (pedido explícito do responsável do
-- projeto, fora do roteiro de fases do PROMPT MESTRE). Ver ADR 0015.
--
-- Fluxo: 5 falhas consecutivas do mesmo IP -> exige CAPTCHA (Cloudflare Turnstile) nas
-- tentativas seguintes; mais falhas até 10 no total -> bloqueia o IP por completo, só
-- desbloqueável por ADMIN_MASTER (Edge Function desbloquear-ip-login). Uma tentativa
-- BEM-SUCEDIDA a qualquer momento zera o contador (a Edge Function login faz isso).
--
-- IP em claro (não hash, ao contrário de log_acessos_verificacao): esta tabela não é sobre o
-- portal público anônimo (onde minimização LGPD faz sentido porque ninguém nunca precisa
-- "ler" o IP de volta), é um controle operacional interno onde o ADMIN_MASTER precisa
-- conseguir IDENTIFICAR qual IP está bloqueado para decidir se desbloqueia — um hash
-- irreversível tornaria essa decisão impossível. Ver ADR 0015 para o raciocínio completo.
create table bloqueios_login_ip (
  ip text primary key,
  tentativas_falhas int not null default 0,
  primeira_falha_em timestamptz,
  ultima_falha_em timestamptz,
  status text not null default 'normal' check (status in ('normal', 'aguardando_captcha', 'bloqueado')),
  bloqueado_em timestamptz,
  desbloqueado_por uuid references perfis_usuarios(id),
  desbloqueado_em timestamptz,
  atualizado_em timestamptz not null default now()
);

comment on table bloqueios_login_ip is
  'Controle de tentativas de login malsucedidas por IP (não por usuário) — bloqueio '
  'progressivo: 5 falhas -> aguardando_captcha, 10 falhas -> bloqueado. Todas as escritas '
  'passam pela Edge Function login (contador) ou desbloquear-ip-login (reset por '
  'ADMIN_MASTER) usando service_role — nenhuma policy de INSERT/UPDATE/DELETE existe para '
  'authenticated/anon, mesmo padrão de assinaturas_eletronicas (ver '
  '20260916000016_rls_policies.sql). IP em claro, deliberado — ver ADR 0015.';

alter table bloqueios_login_ip enable row level security;

-- Só ADMIN_MASTER lista os IPs bloqueados (painel de gestão) — nenhum outro perfil tem
-- motivo operacional para ver tentativas de login de terceiros.
create policy bloqueios_login_ip_select on bloqueios_login_ip
  for select to authenticated
  using (tem_permissao('bloqueios_login_ip', 'ler'));

insert into permissoes_perfil (perfil, recurso, acao) values
  ('ADMIN_MASTER', 'bloqueios_login_ip', 'ler')
on conflict (perfil, recurso, acao) do nothing;
