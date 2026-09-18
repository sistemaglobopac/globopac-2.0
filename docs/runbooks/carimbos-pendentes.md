# Runbook — Carimbos de tempo presos na fila

## Sintoma
`/healthcheck` retorna `status: "degradado"` com `checks.carimbos_pendentes_antigos > 0`, ou o
painel `/carimbos` (ADMIN_MASTER) mostra itens pendentes há mais de
`app_config.carimbo_alerta_horas` (padrão: 4h).

## Por que isso importa
Um documento sem carimbo RFC 3161 já está assinado (a assinatura eletrônica em si aconteceu na
hora — ver ADR 0001) e permanece válido, mas sem o carimbo de tempo ele ainda não tem prova
independente de QUANDO foi assinado perante um terceiro (a TSA). Deixar isso acumular por
muito tempo enfraquece o valor probatório da assinatura em caso de disputa.

## Diagnóstico
1. Abrir `/carimbos` como ADMIN_MASTER — ver quais itens estão pendentes e há quanto tempo.
2. Consultar `fila_carimbo_tempo` diretamente (via SQL, `service_role`):
   ```sql
   select id, tipo_assinatura, tentativas, tsa_tentadas, ultimo_erro, criado_em
   from fila_carimbo_tempo
   where status in ('pendente', 'falhou_definitivo')
   order by criado_em;
   ```
3. `ultimo_erro` normalmente indica qual TSA(s) falharam e por quê (timeout, certificado
   expirado da TSA, formato de resposta inesperado — ver `_shared/rfc3161.ts`).

## Ações
- **Se for uma falha transitória** (uma ou duas TSAs fora do ar momentaneamente): clicar
  "Processar agora" no painel `/carimbos` força uma nova rodada imediatamente, sem esperar o
  próximo tick do `pg_cron` (a cada 1 minuto — ver `docs/adr/0010-worker-carimbo-tempo.md`).
- **Se todas as 4 TSAs (FreeTSA, Sectigo, Comodo, Certum) estiverem falhando** ao mesmo tempo
  por um período prolongado: verificar conectividade de saída do ambiente onde as Edge
  Functions rodam (proxy/firewall bloqueando as URLs das TSAs?). Testar manualmente uma
  requisição RFC 3161 a cada TSA a partir do mesmo ambiente.
- **Se um item específico está em `falhou_definitivo`** (excedeu
  `app_config.carimbo_max_tentativas`): pode ser reenfileirado manualmente
  (`update fila_carimbo_tempo set status = 'pendente', tentativas = 0 where id = '...'`) depois
  de confirmar que a causa raiz foi corrigida — nunca apagar/recriar a assinatura em si
  (é append-only).
- **Nunca** contornar isso "assinando de novo" ou fabricando um carimbo — o carimbo só tem
  valor se veio de verdade de uma TSA real (ver débito da v1, seção 12 do PROMPT MESTRE).

## Quando escalar
Se as 4 TSAs configuradas estiverem indisponíveis por mais de algumas horas de forma
persistente, considerar adicionar uma TSA alternativa a `app_config.tsas_carimbo_tempo` (não
requer deploy — é dado, não código) enquanto a causa raiz é investigada.
