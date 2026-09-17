# ADR 0011 — Portal público de verificação: service_role interno, sem RLS para anon

## Contexto
`/verificar?id=<uuid>` (seção 7.6) precisa funcionar sem login, para qualquer pessoa com o
link (tipicamente o próprio SIF). Isso choca com o modelo de RLS deny-by-default do resto do
sistema: um chamador anônimo nunca tem um claim `perfil` no JWT, então `tem_permissao()`
sempre nega — se a Edge Function usasse o cliente do chamador (anon key) para ler
`monitoramentos`, ela NUNCA encontraria nada, nem os documentos legitimamente liberados.

## Decisão
`verificar-documento` roda com `verify_jwt = false` (não exige nenhum JWT para ser chamada) e
usa **exclusivamente** um cliente `service_role` internamente. A decisão de "o que é seguro
mostrar" deixa de ser responsabilidade da RLS e passa a ser responsabilidade explícita do
código desta função: só revela dados de um `monitoramento` com `liberado_sif = true`, e trata
"não existe" e "existe mas não está liberado" com a **mesma resposta** (404 genérico) — nunca
deixando um `anon` distinguir os dois casos.

## Superfícies de risco e mitigação
- **Enumeração de UUIDs / scraping**: mitigado por rate limiting por IP (hash do IP, nunca em
  claro — `log_acessos_verificacao`), limite configurável via
  `app_config.portal_verificacao_limite_por_minuto`. CAPTCHA após N falhas (sugerido na
  seção 7.6 como possível reforço adicional) não foi implementado nesta fase — ver
  ASSUMPTIONS.md.
- **Hash/selo fabricado** (débito da v1): a função nunca gera um hash a partir do próprio
  UUID ou de qualquer coisa que não seja uma leitura real de `assinaturas_eletronicas`. Sem
  nenhuma assinatura registrada, `integridade` é `null` — sem selo algum, não um selo falso.

## Alternativa considerada e rejeitada
Expor uma view pública (`security definer`, como `perfis_usuarios_publico`) diretamente para
`anon`, deixando o PostgREST responder sem uma Edge Function no meio — rejeitada porque o
rate limiting e a lógica "mesma resposta para não-encontrado/não-autorizado" exigem código
imperativo (contar tentativas, decidir a resposta), que uma view/RLS sozinha não expressa bem
sem duplicar a mesma lógica em outro lugar (ex.: uma function SQL bem mais complexa do que o
padrão já usado no restante do projeto).

## Escopo desta fase: só monitoramentos, não OS
`manutencao_os` ainda não tem um mecanismo de "liberação" definido (isso é
`manutencao_relatorios_sif`, um relatório diário separado, não um flag por OS) — a Fase 5
ainda vai desenhar isso de verdade. Implementar a busca de OS no portal agora seria adivinhar
um design que a Fase 5 pode mudar. `verificar-documento` retorna "não encontrado" para
qualquer id que não seja um `monitoramentos.id` — o suporte a OS entra quando a Fase 5
definir como uma OS é liberada.
