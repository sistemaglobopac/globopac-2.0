# ADR 0007 — `tem_permissao()` como SECURITY DEFINER

## Contexto
A primeira execução real do CI (Fase 0) revelou `ERROR: stack depth limit exceeded` ao rodar
qualquer policy de RLS. Causa raiz: `tem_permissao()` lê `permissoes_perfil`; a própria
`permissoes_perfil` tem uma policy (`permissoes_perfil_admin`) que também chama
`tem_permissao()` para decidir se o ADMIN_MASTER pode gerenciá-la. Isso cria um ciclo: checar
permissão em qualquer tabela → `tem_permissao()` → lê `permissoes_perfil` → RLS de
`permissoes_perfil` → `tem_permissao()` de novo → ciclo infinito.

## Decisão
`tem_permissao()` passou a ser `SECURITY DEFINER` com `search_path` travado
(`set search_path = public, pg_temp`). Isso faz a leitura interna de `permissoes_perfil`
rodar com o privilégio do dono da função (o mesmo role que executa as migrations, dono de
`permissoes_perfil`), que ignora a RLS da própria tabela por ownership — quebrando o ciclo
sem tocar na semântica de deny-by-default para quem CHAMA `tem_permissao()`.

## Por que não outras alternativas
- **Remover a policy `permissoes_perfil_admin` e deixar a matriz só editável fora da RLS
  (ex.: só via service_role) (rejeitada):** funcionaria, mas tira do ADMIN_MASTER a
  capacidade de gerenciar a matriz de permissões pela própria aplicação — um requisito real
  (seção 4 do PROMPT MESTRE: ADMIN_MASTER "administra sistema").
- **Fazer `permissoes_perfil_admin` checar `nivel_acesso` diretamente em `perfis_usuarios`
  em vez de via `tem_permissao()` (rejeitada):** evitaria a recursão nesse caso específico,
  mas criaria uma exceção inconsistente — uma tabela usando um mecanismo de checagem
  diferente de todas as outras, tornando o sistema de permissões menos uniforme e mais
  difícil de auditar (viola o princípio de execução "na dúvida, priorize auditabilidade").

## Risco aceito e mitigação
`SECURITY DEFINER` é um padrão que exige cuidado (a função roda com privilégio elevado).
Mitigado por:
- `set search_path = public, pg_temp` fixo na própria definição da função, prevenindo um
  ataque de manipulação de `search_path` por quem a invoca.
- A função é puramente `SELECT ... EXISTS`, sem SQL dinâmico, sem parâmetros interpolados em
  texto de comando (só em predicados parametrizados) — sem superfície de injeção.
- Somente `authenticated` tem `EXECUTE` (revogado de `anon`/`public`).

## Consequência para revisão de segurança
Toda função `SECURITY DEFINER` deste projeto (atualmente só `tem_permissao()` e
`custom_access_token_hook`) deve ser listada explicitamente na revisão de segurança pré-go-
live (seção 8 do PROMPT MESTRE) — é a superfície de maior sensibilidade do modelo de RBAC.
