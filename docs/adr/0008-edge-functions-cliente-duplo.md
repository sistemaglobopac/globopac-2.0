# ADR 0008 — Edge Functions usam dois clientes Supabase (chamador + service_role)

## Contexto
`assinar-documento` e `verificar-monitoramento` (Fase 1) precisam, ao mesmo tempo: (a)
verificar que quem chamou a função realmente tem permissão para o que está pedindo, e (b)
escrever em tabelas que o cliente nunca pode escrever diretamente (`assinaturas_eletronicas`,
`fila_carimbo_tempo`).

## Decisão
Cada Edge Function cria dois clientes Supabase:
1. **`callerClient`** — instanciado com a chave `anon` + o header `Authorization` do
   chamador. Toda leitura/escrita feita com ele passa pela RLS normalmente. É usado para: obter a
   identidade real do usuário (`auth.getUser()`), ler o próprio perfil, ler/atualizar
   `monitoramentos`, e inserir em `rnc` — reaproveitando exatamente as mesmas policies de RLS
   já testadas por pgTAP na Fase 0, em vez de reimplementar a mesma checagem de autorização em
   TypeScript.
2. **`adminClient`** — instanciado com a `service_role` key, usado *apenas* para inserir em
   `assinaturas_eletronicas` e `fila_carimbo_tempo` (tabelas sem nenhuma policy de INSERT
   para `authenticated` — ver migration 20260916000016 — precisamente para que só a Edge
   Function, nunca o cliente, possa gravar uma assinatura).

## Por que não um único cliente com service_role
Fazer tudo com `service_role` (ignorando RLS o tempo todo) funcionaria, mas moveria toda a
lógica de autorização para dentro do código TypeScript da função — duplicando o que a RLS já
garante e testando duas vezes a mesma regra em dois lugares que podem divergir com o tempo.
Usar o `callerClient` para as operações "normais" significa que um bug na Edge Function que
esqueça de checar uma permissão ainda é pego pela RLS por baixo — defesa em profundidade real,
não só em papel.

## Consequência
Toda vez que uma tabela ganha uma nova regra de RLS, as Edge Functions que a tocam herdam
essa regra automaticamente (usando `callerClient`) — não é preciso lembrar de atualizar a
função também. O único lugar que precisa de atenção extra ao mexer em RLS é: tabelas
manipuladas via `adminClient` (hoje: `assinaturas_eletronicas`, `fila_carimbo_tempo`) não têm
essa rede de segurança e dependem inteiramente da lógica da própria função — por isso a
checagem manual de `tipo` permitido por perfil em `_shared/assinar.ts` existe explicitamente,
em vez de "confiar" em alguma policy inexistente.
