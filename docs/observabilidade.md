# Observabilidade — GloboPac 2.0

Ver ASSUMPTIONS.md item 6 ("Canal de alerta operacional") para a premissa ainda pendente sobre
alerta ativo (e-mail/push). Este documento cobre o que já existe: convenção de logs
estruturados e o endpoint de healthcheck (Fase 9).

## Convenção de logs (Edge Functions)

Toda Edge Function deste projeto loga em JSON de uma linha, com os mesmos quatro campos
sempre presentes:

```json
{"correlationId": "<uuid>", "funcao": "<nome-da-function>", "nivel": "info" | "error", "evento": "<nome_do_evento>", ...extra}
```

- `correlationId`: um `crypto.randomUUID()` gerado no início de cada invocação — permite
  seguir uma requisição específica pelos logs do runtime Deno (`supabase functions logs
  <nome>` localmente, ou o painel de logs do projeto hospedado), mesmo sem um sistema de
  tracing dedicado.
- `funcao`: sempre o nome literal da Edge Function (`"assinar-documento"`,
  `"verificar-monitoramento"` etc.) — permite filtrar logs por função ao ler um agregador.
- `evento`: um identificador curto e estável do que aconteceu (`"assinatura_criada"`,
  `"transicao_falhou"`, `"excecao_nao_tratada"`) — nunca uma frase livre, para poder
  contar/agrupar ocorrências.
- Campos extra variam por evento (ex.: `{monitoramentoId, tipo}` numa assinatura), sempre como
  chaves adicionais do mesmo objeto JSON, nunca concatenados na mensagem.

Por que este formato: `console.log`/`console.error` do runtime Deno já vão para o coletor de
logs do Supabase (local ou hospedado) sem nenhuma configuração extra — logar JSON estruturado
em vez de texto livre é o que torna esses logs pesquisáveis/agregáveis depois, sem precisar
adotar uma biblioteca de logging ou um serviço de tracing dedicado agora. Se o volume real
justificar isso no futuro, a migração é direta (o formato já é estruturado).

## Health-check (`healthcheck`, Fase 9)

Endpoint público (`verify_jwt = false`, mesmo padrão de `verificar-documento`) para um monitor
de uptime externo (UptimeRobot, Better Uptime, um cron simples) pingar. Não expõe nenhum dado
individual — só contagens agregadas:

```json
{
  "status": "ok" | "degradado",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "checks": {
    "banco_de_dados": true,
    "carimbos_pendentes_ha_mais_de_horas": 4,
    "carimbos_pendentes_antigos": 0,
    "carimbos_falharam_definitivamente": 0,
    "rncs_com_sla_vencido": 0,
    "usuarios_cadastrados": 6
  }
}
```

- HTTP `200` quando `status: "ok"`, `503` quando `status: "degradado"` — o próprio código HTTP
  já é suficiente para a maioria dos monitores de uptime disparar um alerta, sem precisar
  entender o corpo da resposta.
- "Degradado" significa: existe carimbo de tempo pendente há mais de
  `app_config.carimbo_alerta_horas` (o mesmo limiar já usado no painel `/carimbos`), ou existe
  RNC não fechada com `prazo_sla` vencido. Nenhum dos dois é uma falha do sistema em si — são
  sinais de que **algo no operacional** precisa de atenção (ver `docs/runbooks/`).
- Também serve como teste de conectividade real ao Postgres (não só ao PostgREST): a consulta
  a `perfis_usuarios` teria que genuinamente falhar para o healthcheck retornar erro de
  conectividade.

## O que ainda não existe (pendente, ver ASSUMPTIONS.md)

- **Alerta ativo** (e-mail/push quando degradado) — hoje é preciso consultar `/healthcheck`
  ativamente ou configurar um monitor de uptime externo apontando para ele; o sistema em si
  não dispara nada sozinho.
- **Rastreamento de erros** (Sentry ou similar) — não configurado; nenhuma credencial de
  serviço externo foi fornecida nesta fase.
- **Métricas/dashboards de infraestrutura** (latência, taxa de erro por endpoint) — os logs
  estruturados dão a base para isso, mas nenhum agregador de métricas foi configurado.

Nenhum destes está bloqueado pelo desenho atual — cada um é aditivo (uma integração nova, não
uma mudança de arquitetura) quando as credenciais/decisões correspondentes existirem.
