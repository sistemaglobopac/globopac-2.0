# ADR 0009 — `custom_access_token_hook` como SECURITY DEFINER

## Contexto
O primeiro E2E real (Fase 1) contra um login de verdade revelou que todo JWT emitido saía
com `perfil: null` e `setores_permitidos: []`, mesmo para usuários com perfil ativo em
`perfis_usuarios` — confirmado inspecionando o token na aba de rede do trace do Playwright.
Consequência: toda policy de RLS que dependia de `tem_permissao()`/`meu_perfil()` negava
tudo, incluindo a criação de um monitoramento pelo próprio criador em seu próprio setor
(`403 Forbidden`, PostgREST `42501`).

## Causa raiz
`custom_access_token_hook` roda como `supabase_auth_admin` (o role que o GoTrue usa para
chamar hooks). A migration 20260916000004 já concedia `GRANT SELECT` nessa tabela para esse
role — mas GRANT é ortogonal à RLS: `supabase_auth_admin` não é dono de `perfis_usuarios` nem
tem `BYPASSRLS`, então a policy `perfis_usuarios_select` (`id = auth.uid() OR
tem_permissao(...)`) ainda se aplica. No momento em que o hook roda, não existe JWT/GUC
`request.jwt.claims` no contexto — `auth.uid()` retorna `NULL` — e a policy nega a leitura.
O `SELECT ... INTO v_perfil` sempre retornava zero linhas, `found` era sempre falso, e o
hook caía no ramo "sem perfil ativo" para todo mundo, sempre.

Isso não apareceu nos testes pgTAP da Fase 0 porque aqueles testes **simulam** o JWT
diretamente via `set_config('request.jwt.claims', ...)`, sem nunca passar pelo hook de
verdade — exatamente o tipo de lacuna que só um login real (E2E) expõe. Mesma classe de
problema do [ADR 0007](0007-tem-permissao-security-definer.md) (RLS bloqueando uma leitura
interna de infraestrutura), desta vez no próprio hook de emissão do token, não em
`tem_permissao()`.

## Decisão
`custom_access_token_hook` passou a ser `SECURITY DEFINER` com `search_path` travado, pela
mesma razão do ADR 0007: a leitura interna de `perfis_usuarios` passa a rodar com o
privilégio do dono da função (o role que executa as migrations, dono da tabela), que ignora
RLS por ownership — sem precisar dar `BYPASSRLS` a `supabase_auth_admin` (que afetaria RLS em
*todas* as tabelas para esse role, não só nesta leitura pontual).

## Lição para o restante do projeto
Qualquer função chamada por um role de infraestrutura (hooks do GoTrue, workers, crons) que
precise ler uma tabela com RLS baseada em `auth.uid()`/claims deve ser tratada como candidata
a `SECURITY DEFINER` desde o início — o padrão "dar GRANT e achar que resolve" não funciona
com RLS habilitada, e o sintoma (retorno vazio silencioso, não um erro) só aparece em
execução real, não em simulação de JWT. Vale revisar isso explicitamente ao escrever
qualquer nova Edge Function/worker nas fases seguintes (Fase 2 em diante).
