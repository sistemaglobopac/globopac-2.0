# ADR 0002 — Estratégia de resolução de conflito offline

## Contexto
A v1 tinha `offlineSyncService.js` sincronizando fichas criadas em campo sem conexão, mas sem
uma estratégia de conflito documentada — não estava claro o que aconteceria se o mesmo
registro fosse alterado por dois caminhos diferentes antes da sincronização.

## Decisão
1. **UUID gerado no cliente, no momento da criação** (não no momento da sincronização).
   Elimina colisão de identificador entre dispositivos.
2. **Antes da verificação, a sincronização é create-only.** Um `monitoramento` tem exatamente
   um criador (`user_id`), então não existe cenário de dois dispositivos editando o mesmo
   registro simultaneamente — o único problema real a resolver é **idempotência** (reenviar o
   mesmo UUID não deve duplicar). Isso é resolvido no `INSERT` da Edge Function com
   `on conflict (id) do nothing` (ou verificação prévia de existência).
3. **Depois de assinado (e, com mais força ainda, depois de liberado ao SIF), o registro é
   imutável** (`trg_bloqueia_edicao_liberado`, Fase 0). Não há conflito de escrita possível
   nesse estágio — qualquer tentativa de alteração é rejeitada pelo banco, offline ou não.
4. **Fora desses dois casos, não existe merge automático.** Este sistema não implementa
   resolução de conflito tipo CRDT/last-write-wins para `dados_dinamicos`, porque o modelo de
   dados foi desenhado precisamente para que a situação que exigiria isso não aconteça.

## Alternativas consideradas
- **Last-write-wins com aviso (rejeitada):** desnecessária dado o ponto 2 acima, e
  arriscada em um sistema com valor probatório — sobrescrever silenciosamente dados de campo
  é o tipo de comportamento que este projeto existe para eliminar.
- **Bloqueio de edição concorrente via lock otimista (rejeitada como redundante):** um lock
  otimista (`version` + `WHERE version = ?`) resolveria conflitos de UPDATE concorrente, mas
  não há UPDATE concorrente possível no fluxo real (ponto 2), então o lock adicionaria
  complexidade sem benefício correspondente na Fase 0-1. Reavaliar se um caso de uso real de
  edição colaborativa pré-verificação surgir.

## Consequências
- O PWA (Fase 7) implementa uma fila local de envio (IndexedDB) com UI de status por ficha
  (pendente/sincronizado/falhou), mas **não** implementa uma UI de "resolver conflito" —
  estruturalmente não deveria ser necessária.
- Reautenticação após período longo offline (definir TTL máximo de sessão offline) fica como
  requisito explícito da Fase 7, não resolvido aqui.
