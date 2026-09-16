# ADR 0005 — TTL do JWT e janela de revogação de perfil

## Contexto
O perfil (`nivel_acesso`) e os setores permitidos são embutidos como claims no JWT no momento
da emissão (`custom_access_token_hook`), para que as policies de RLS não precisem consultar
`perfis_usuarios` a cada requisição. Isso significa que desativar um usuário
(`ativo = false`) só tem efeito quando o token atual expira e um novo é emitido — não
instantaneamente.

## Decisão
`jwt_expiry = 900` (15 minutos) em `supabase/config.toml`, bem abaixo do padrão do Supabase
(3600s). Aceita-se uma janela de até 15 minutos entre a desativação de um usuário e a perda
efetiva de acesso, em troca de evitar uma query extra a `perfis_usuarios` em toda requisição
sujeita a RLS.

## Alternativas consideradas
- **Não embutir claims no JWT; toda policy de RLS consulta `perfis_usuarios` diretamente
  (rejeitada):** revogação instantânea, mas adiciona uma consulta extra (com join implícito)
  a cada checagem de RLS, em um sistema com requisito de latência p95 < 300ms de leitura.
  Também precisaria tomar cuidado para não recursar (`perfis_usuarios` teria que evitar RLS
  recursiva ao ser consultada de dentro de sua própria policy).
- **TTL padrão de 1h (rejeitada):** janela de revogação grande demais para um sistema em que
  desativar um usuário (ex.: desligamento) deveria ter efeito quase imediato.

## Consequências
- Se uma revogação **imediata** for necessária (ex.: credencial comprometida), o
  procedimento operacional não pode depender só de `ativo = false` — o runbook de rotação de
  credenciais (Fase 8) deve incluir revogar as sessões ativas do usuário via
  Admin API (`supabase.auth.admin.signOut`), não só desativar o perfil.
- Este trade-off deve ser reavaliado se o volume de usuários simultâneos crescer a ponto de
  15 minutos de renovação de token gerar carga perceptível — não é esperado na escala
  declarada (15–40 usuários simultâneos).
