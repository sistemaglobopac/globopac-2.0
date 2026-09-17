# ADR 0010 — Worker de carimbo de tempo: pg_cron + pg_net + Vault, cliente RFC 3161 via biblioteca

## Contexto
A fila de carimbo de tempo (`fila_carimbo_tempo`, Fase 0) precisa de um processo que
periodicamente tente obter o carimbo RFC 3161 de uma das 4 TSAs (seção 7.5) e grave o
resultado. Duas decisões de arquitetura distintas precisavam ser tomadas: (1) como agendar a
execução periódica, e (2) como construir/interpretar as mensagens RFC 3161 em si.

## Decisão 1 — Agendamento via pg_cron + pg_net, credenciais no Supabase Vault
`processar-fila-carimbo` é uma Edge Function comum, chamada via HTTP. `pg_cron` agenda uma
rotina SQL (a cada minuto) que usa `pg_net.http_post` para invocá-la. A `service_role` key
necessária no header `Authorization` nunca é escrita em uma migration (isso vazaria o segredo
real assim que a migration fosse aplicada contra um projeto hospedado) — é gravada em tempo de
execução no Supabase Vault por `scripts/configurar-worker-carimbo.mjs`, que lê o valor real do
ambiente atual (local, CI, ou produção) e nunca o commita.

A mesma função também pode ser chamada diretamente (mesma URL) por um botão "Processar
agora" no painel de pendências, para não depender de esperar o próximo minuto em uso
manual/E2E. A função aceita o chamador se ele for `service_role` (o cron) OU tiver
`perfil: ADMIN_MASTER` no JWT — checado decodificando o payload do JWT diretamente (o gateway
do Supabase já validou a assinatura antes de rotear a chamada até aqui), sem round-trip extra
a `auth.getUser()`.

### Alternativa considerada e rejeitada
Um processo externo de longa duração (worker Node/Deno rodando fora do Supabase, com seu
próprio agendador) — rejeitado por adicionar um componente de infraestrutura extra a operar e
implantar, quando o próprio Postgres já oferece `pg_cron`/`pg_net` prontos no mesmo projeto.

## Decisão 2 — Cliente RFC 3161 via `@peculiar/asn1-*`, não ASN.1 manual
Construir e interpretar `TimeStampReq`/`TimeStampResp` (DER/ASN.1) à mão é fácil de acertar
"aparentemente" e errar de um jeito sutil que só apareceria contra uma TSA real — e este
projeto não tem como testar isso de forma confiável dentro do CI (ver Decisão 3). Usamos
`@peculiar/asn1-schema`/`asn1-tsp`/`asn1-cms`/`asn1-x509` (bibliotecas maduras, também usadas
pela própria PKI.js) para serializar a requisição e interpretar a resposta (status, token
CMS/SignedData, `TSTInfo.genTime`, cadeia de certificados).

**Validado manualmente, com uma execução real via Deno, contra as 4 TSAs do PROMPT MESTRE**
(FreeTSA, Sectigo, Comodo, Certum) — todas responderam `granted` com certificados e `genTime`
extraídos corretamente (`supabase/functions/_shared/rfc3161.test.ts`, não roda em CI —
ver Decisão 3). Isso já corrigiu, antes de qualquer código de produção existir, dois erros de
uso da biblioteca que só apareceriam testando de verdade (tipos `OctetString`/`ArrayBuffer`
esperados nos campos `hashedMessage`/`nonce`, não `Uint8Array`/`BigInt` crus).

## Decisão 3 — Testes automatizados (CI) não fazem chamadas de rede reais às TSAs
Depender de 4 serviços públicos externos para um teste em CI é frágil (indisponibilidade,
rate limiting, mudança de URL) e não é repetível sob demanda. `rfc3161.test.ts` (rede real)
é uma ferramenta de validação manual, rodada ao alterar o cliente — não faz parte do
pipeline de CI. Os testes automatizados de retry/fallback (fluxo E2E nº 7 — falha simulada
de todos os TSAs) usam `app_config.tsas_carimbo_tempo` sobrescrito para apontar para
endereços que falham de forma determinística (ver `tests/e2e/fluxo-07-tsas-falham.spec.ts`),
não a internet real.

## Consequências
- Novo segredo operacional (`service_role_key` no Vault) que precisa ser rotacionado junto
  com a chave real na plataforma — ver runbook "como rotacionar uma credencial comprometida"
  (Fase 8) quando ele existir; por ora, documentado aqui como pendência.
- `scripts/configurar-worker-carimbo.mjs` precisa rodar a cada `db:reset` local/CI (a fila e
  o Vault são recriados do zero); em produção, roda uma vez, manualmente, ao provisionar o
  projeto (ou como parte de um pipeline de deploy formal — Fase 8).
