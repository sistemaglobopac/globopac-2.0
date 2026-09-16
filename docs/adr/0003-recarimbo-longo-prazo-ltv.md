# ADR 0003 — Validade de longo prazo (LTV) do carimbo de tempo

## Contexto
Certificados de TSA têm validade finita (tipicamente alguns anos). Um documento assinado hoje
pode precisar ser verificado daqui a 10+ anos (retenção de registros de autocontrole — ver
ASSUMPTIONS.md item 4), momento em que o certificado original da TSA pode já ter expirado ou
a CA pode não estar mais acessível para validação online.

## Decisão (Fase 0)
Arquivar, no momento da assinatura, a cadeia de certificados da TSA usada — coluna
`cadeia_certificados_tsa BYTEA` em `assinaturas_eletronicas` e `assinaturas_os_eletronicas`.
Isso permite que uma verificação futura reconstrua a cadeia de confiança sem depender de a CA
ainda estar operacional, análogo ao conceito de *long-term validation* (LTV) usado em
assinaturas PAdES/CAdES.

## Decisão explicitamente adiada
**Re-carimbo periódico automático** (re-carimbar uma assinatura antiga com uma nova TSA antes
que os certificados originais expirem, encadeando os carimbos) **não é implementado nesta
fase**. É reconhecido como a solução mais robusta a longo prazo, mas:
- Exige um job de manutenção contínuo (verificar validade de certificados arquivados,
  disparar re-carimbo antes do vencimento) que não existe em nenhuma fase do roteiro atual
  (seção 14 do PROMPT MESTRE não o inclui explicitamente).
- Tem impacto direto em como a trilha de verificação é exibida no portal público (mostrar uma
  cadeia de carimbos, não um único) — mudança de escopo do módulo 7.6.

## Consequências
- **Risco aceito e registrado:** sem re-carimbo periódico, a verificabilidade de longuíssimo
  prazo (além da validade dos certificados originais) depende de uma implementação futura.
  Isso não compromete a Fase 0-8 do roteiro, mas deve ser revisitado antes de qualquer prazo
  de retenção multi-década ser assumido como garantido tecnicamente, não só documentalmente.
- Próxima revisão recomendada: ao definir o prazo de retenção formal (ASSUMPTIONS.md item 4),
  decidir se o re-carimbo periódico se torna requisito obrigatório de uma fase futura (10+).
