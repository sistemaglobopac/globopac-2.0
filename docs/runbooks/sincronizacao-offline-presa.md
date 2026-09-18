# Runbook — Ficha presa na fila de sincronização offline

## Sintoma
Um inspetor reporta que o painel "fichas aguardando sincronização" (`/fichas/nova`, Fase 8)
mostra um item há muito tempo com status "Falha ao sincronizar — tentando de novo" ou "Sessão
expirada — faça login novamente".

## Por que isso importa
Enquanto uma ficha está só na fila local (IndexedDB do dispositivo), ela não existe no
servidor, não está assinada, e não aparece para o verificador — o dado só existe naquele
navegador/dispositivo específico. Se o dispositivo for perdido, tiver os dados do navegador
limpos, ou o app for desinstalado antes de sincronizar, a ficha é perdida de verdade (ver ADR
0014 — a fila nunca substitui um backup real, só cobre a janela normal de "sem sinal por
algumas horas").

## Diagnóstico
1. **Status "falha_autenticacao"**: a sessão expirou enquanto o dispositivo estava offline
   por tempo suficiente para o refresh automático não bastar. Pedir para o inspetor fazer
   login de novo no mesmo dispositivo — a sincronização retoma sozinha
   (`useSincronizacaoOffline`, evento `SIGNED_IN`/`TOKEN_REFRESHED`).
2. **Status "falhou" persistente**: abrir o console do navegador no dispositivo (se
   acessível) e ver `ultimoErro` do item na fila — indica se é um problema de rede real
   ainda em curso, ou outra coisa (ex.: o template usado foi desativado entre a captura
   offline e a tentativa de sincronizar, um erro de validação do servidor).
3. A sincronização tenta sozinha a cada 10s e também no evento `online` do navegador — não
   deveria ser necessário fazer nada manualmente na maioria dos casos; este runbook é para
   quando isso NÃO está acontecendo sozinho.

## Ações
- **Confirmar que o dispositivo tem rede de verdade** (não só "parece conectado") — testar
  abrir qualquer outra página no mesmo navegador.
- **Nunca pedir para o inspetor preencher a ficha de novo "por garantia"** enquanto a fila
  ainda tem o item pendente — isso cria uma ficha duplicada quando a original eventualmente
  sincronizar (o sistema não tem deduplicação por conteúdo, só por `id`, e a duplicata teria
  um `id` diferente). Verificar o painel de fila primeiro.
- **Se o item ficar preso por dias**, verificar diretamente no dispositivo (IndexedDB,
  banco `globopac-fila-offline`, object store `fichas_pendentes`, via DevTools) — o dado ainda
  está lá enquanto não for sincronizado ou removido manualmente.

## Quando escalar
Se múltiplos inspetores relatarem fichas presas ao mesmo tempo (não um dispositivo isolado),
suspeitar de um problema no servidor (Edge Function `assinar-documento` fora do ar, RLS
bloqueando o INSERT inesperadamente) em vez de tratar cada caso como um problema de
conectividade individual — checar `/healthcheck` e os logs de `assinar-documento`.
