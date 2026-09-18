# ADR 0014 — PWA offline: app shell instalável + fila de sincronização de fichas

## Contexto
ADR 0002 já definiu a estratégia de conflito para sincronização offline (UUID gerado no
cliente, sincronização create-only, sem merge automático) e deixou dois itens em aberto para
esta fase: a implementação real da fila local e a reautenticação após um período longo
offline. O caso de uso é o inspetor de qualidade andando pela planta com conectividade
instável — não o app inteiro funcionando sem rede.

## Decisão 1: só o app shell é cacheado, nunca dados
`vite-plugin-pwa` gera o service worker e o manifest (instalável). O precache cobre só os
arquivos estáticos do build (HTML/JS/CSS/ícones) — nenhuma resposta de API/Supabase é
cacheada pelo service worker. Mostrar um monitoramento "de ontem" como se fosse atual, numa
tela de verificação ou auditoria, seria exatamente o tipo de risco que este projeto existe
para eliminar. O app funciona offline no sentido de "a interface carrega e aceita entrada",
nunca no sentido de "os dados na tela são garantidos atuais".

## Decisão 2: só "Nova ficha" tem fila offline — não o app inteiro
Das telas existentes, só a criação de monitoramento (`NovaFichaPage`) ganha fila offline
nesta fase. Verificação, liberação ao SIF, tratativa de RNC e o ciclo de OS continuam
exigindo conexão. Motivo: são operações que **leem estado compartilhado em tempo real** antes
de agir (a lista de pendentes pode ter mudado; duas pessoas podem estar olhando a mesma fila)
— filas offline fariam sentido para elas só com uma estratégia de conflito que ADR 0002
explicitamente decidiu não construir, por não haver casos de uso real que a justifiquem ainda.
Abrir uma ficha, ao contrário, tem exatamente um criador e nenhuma leitura de estado alheio no
momento de preencher — o caso ideal para fila create-only.

## Decisão 3: assinatura nunca acontece offline — fica pendente na fila até sincronizar
O princípio "hash sempre recalculado no servidor, nunca aceito do cliente" (seção 12,
débito da v1) é inegociável e continua sendo — logicamente não pode haver assinatura
eletrônica offline. O fluxo é: o rascunho fica na fila local (status `pendente`); quando a
rede volta, a fila faz o mesmo INSERT + chamada a `assinar-documento` que o fluxo online já
fazia, na ordem em que foi enfileirado. Até sincronizar, a ficha não existe no banco, não
aparece para o verificador, e não tem nenhuma assinatura — o offline aqui é só "não perder o
que o inspetor digitou", nunca "assinar sem estar online".

## Decisão 4: `capturado_em` documenta o atraso sem fingir ser um fato verificado
Ver comentário da migration `20260922000001_fase8_pwa_offline.sql`. Resolve a tensão real
entre "a leitura foi feita às 14h" (o que importa operacionalmente) e "o registro só existe
no banco às 18h, quando a rede voltou" (`criado_em`, sempre real e do servidor) — sem inventar
confiança que o dado não tem. Exibido no card de verificação como metadado extra
("Capturado offline em: 14:32 — sincronizado às 18:05"), nunca como se fosse `criado_em`.

## Decisão 5: reautenticação após expiração é tratada como estado da fila, não como erro fatal
Se a sincronização falhar por token expirado (offline por tempo suficiente para o refresh
token não renovar sozinho), o item da fila NUNCA é descartado — fica marcado
`falha_autenticacao`, um banner pede novo login, e a fila retoma sozinha assim que
`supabase.auth.onAuthStateChange` reportar uma sessão válida de novo. Perder um rascunho por
causa de uma sessão expirada seria o pior resultado possível para este domínio.

## Alternativas descartadas
- **Cachear respostas de leitura (listas de pendentes, templates) para uso offline**:
  rejeitada nesta fase — antes de fazer isso com segurança seria preciso decidir como marcar
  visualmente "isto pode estar desatualizado" em cada tela que consome cache, o que é maior
  que o escopo desta fase. Documentado como próximo passo natural, não implementado.
- **Biblioteca de sincronização genérica (ex.: RxDB, WatermelonDB)**: rejeitada — o caso de
  uso real (uma fila FIFO de "criar ficha", create-only) é simples demais para justificar uma
  dependência pesada com seu próprio motor de sincronização e resolução de conflito genérico
  que este projeto decidiu, deliberadamente, não precisar (ADR 0002).
