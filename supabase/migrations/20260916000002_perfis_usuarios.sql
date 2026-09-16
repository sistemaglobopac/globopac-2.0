-- Fase 0 — perfis_usuarios: perfil funcional 1:1 com auth.users.

create table perfis_usuarios (
  id uuid primary key references auth.users (id) on delete restrict,
  nome_completo text not null,
  nome_usuario text not null unique,
  nivel_acesso nivel_acesso not null,
  setores_permitidos text[] not null default '{}',
  ativo boolean not null default true,
  desligado_em timestamptz,
  criado_em timestamptz not null default now()
);

comment on table perfis_usuarios is
  'Perfil funcional de cada usuário autenticado. Nunca confiar em nivel_acesso enviado pelo '
  'cliente — o servidor sempre relê esta tabela (via o claim assinado embutido no JWT pelo '
  'hook custom_access_token_hook, ou por query direta em Edge Functions com service_role).';

comment on column perfis_usuarios.setores_permitidos is
  'Setores de INSPEÇÃO aos quais o usuário tem acesso (ex.: linha DIF, recepção, expedição). '
  'NÃO confundir com centros_custo, que é uma tabela contábil sem relação com RBAC — essa '
  'confusão foi um bug real da v1 (seção 12 do PROMPT MESTRE).';

comment on column perfis_usuarios.desligado_em is
  'Preenchido no desligamento do colaborador. Ao desligar, anonimizar dados de contato não '
  'essenciais à cadeia de custódia (fora desta tabela — nenhum campo de contato existe aqui '
  'ainda), mas preservar nome_completo/nome_usuario: são parte de registros já assinados '
  '(base legal LGPD art. 7º, II — cumprimento de obrigação legal/regulatória). Interpretação '
  'técnica, não jurídica — ver ASSUMPTIONS.md item 4 e seção 8.1 do PROMPT MESTRE.';

alter table perfis_usuarios enable row level security;

-- perfis_usuarios nunca é excluído fisicamente (LGPD + cadeia de custódia): desativar com
-- ativo=false + desligado_em, nunca DELETE.
create or replace function public.bloqueia_delete_perfil()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'perfis_usuarios nunca é excluído fisicamente. Desative com ativo=false e preencha desligado_em.';
end;
$$;

create trigger trg_bloqueia_delete_perfil
  before delete on perfis_usuarios
  for each row execute function public.bloqueia_delete_perfil();

-- View pública mínima para o portal de verificação anônimo (seção 7.6): nunca abrir
-- perfis_usuarios inteira para anon — a v1 tinha um bug conhecido de nomes não aparecendo
-- por causa de RLS mal ajustada. Esta view roda com o privilégio do owner (postgres), que é
-- dono da tabela e portanto ignora a RLS de perfis_usuarios; a própria view já restringe as
-- colunas expostas (só id + nome_completo) e a condição (só ativos). Isso é intencional —
-- não adicionar `security_invoker` aqui, ou a view passa a herdar (e falhar) a RLS do
-- chamador anônimo.
create view perfis_usuarios_publico as
  select id, nome_completo
  from perfis_usuarios
  where ativo = true;

comment on view perfis_usuarios_publico is
  'Único ponto de leitura de nomes de usuário permitido para o público anônimo (/verificar). '
  'Expõe apenas id + nome_completo — nunca nome_usuario, nivel_acesso ou setores_permitidos.';

grant select on perfis_usuarios_publico to anon, authenticated;
