# Migração de dados legados (Fase 10)

Ver [ADR 0004](adr/0004-relacao-globo-sigma.md) e ASSUMPTIONS.md item 1 sobre o escopo do
GloboPac 2.0 (só a camada de assinatura/auditoria/liberação, não PCM completo). Esta página
documenta o contrato de entrada do script `scripts/migrar-dados-legados.mjs`.

## Escopo desta migração

🔴 **Assumida sob risco — nenhum export real do v1 foi fornecido nesta fase.** O contrato
abaixo foi desenhado a partir do schema da v2 e do que a seção 11 do PROMPT MESTRE exige
preservar (hash e carimbo originais, nunca recomputados), **não** a partir de um formato de
export real do v1 (que este projeto não teve acesso). Quando o export real existir, o formato
abaixo provavelmente precisará de ajustes — o script foi escrito para ser fácil de adaptar
(cada tabela tem sua própria função `migrar*`), não para ser a palavra final sobre o assunto.

Cobre os três tipos de registro com valor probatório: monitoramentos (fichas PAC), RNC, e OS
de manutenção. **Só registros já concluídos/fechados no v1** — uma OS em andamento no momento
do corte fica fora deste contrato (ver "Corte", abaixo, sobre como tratar isso).

## Pré-requisitos antes de rodar

1. Todo usuário referenciado (por matrícula) já precisa existir em `perfis_usuarios` na v2 —
   o script nunca inventa um usuário novo.
2. Todo `fichas_templates.codigo` referenciado por um monitoramento migrado já precisa existir
   na v2 (mesmo que só para arquivar o histórico, sem uso corrente).
3. Rodar sempre primeiro com `--dry-run` e revisar o relatório antes de rodar de verdade.

## Formato do arquivo de entrada (JSON)

```jsonc
{
  "monitoramentos": [
    {
      "id_legado": "v1-monitoramento-000123",
      "ficha_template_codigo": "TEMP-LINHA-DIF",
      "setor": "LINHA_DIF",
      "dados_dinamicos": { "temperatura_celsius": 4.2 },
      "conformidade": true,
      "criado_em": "2025-03-01T10:00:00Z",
      "criado_por_matricula": "1001",
      "verificado_em": "2025-03-01T14:00:00Z",
      "verificado_por_matricula": "1002",
      "liberado_sif": true,
      "liberado_em": "2025-03-02T08:00:00Z",
      "assinaturas": [
        { "tipo": "INSPETOR", "hash_documento": "<64 hex — o hash ORIGINAL do v1, nunca recalculado>", "user_matricula": "1001", "criado_em": "2025-03-01T10:00:05Z" },
        { "tipo": "VERIFICADOR", "hash_documento": "<64 hex>", "user_matricula": "1002", "criado_em": "2025-03-01T14:00:05Z" }
      ]
    }
  ],
  "rnc": [
    {
      "id_legado": "v1-rnc-000045",
      "descricao": "Temperatura acima do limite na linha DIF",
      "setor": "LINHA_DIF",
      "status": "FECHADA",
      "severidade": "ALTA",
      "aberto_por_matricula": "1002",
      "tratado_por_matricula": "1003",
      "tratativa": "Ajuste na câmara fria, recalibração do sensor.",
      "prazo_sla": "2025-03-04T14:00:00Z",
      "fechado_em": "2025-03-03T09:00:00Z",
      "criado_em": "2025-03-01T14:10:00Z"
    }
  ],
  "manutencao_os": [
    {
      "id_legado": "v1-os-000078",
      "descricao": "Troca do rolamento do motor da esteira 3",
      "setor": "MANUTENCAO",
      "ativo_referencia": "ESTEIRA-03",
      "status": "CONCLUIDA",
      "aberto_por_matricula": "1006",
      "autorizado_por_matricula": "1006",
      "programado_por_matricula": "1006",
      "executado_por_matricula": "1006",
      "validado_por_matricula": "1006",
      "concluido_em": "2025-03-05T16:00:00Z",
      "liberado_sif": true,
      "liberado_em": "2025-03-06T08:00:00Z",
      "criado_em": "2025-03-05T09:00:00Z",
      "assinaturas": [
        { "tipo": "ABERTURA", "hash_documento": "<64 hex>", "user_matricula": "1006", "criado_em": "2025-03-05T09:00:05Z" },
        { "tipo": "VALIDACAO", "hash_documento": "<64 hex>", "user_matricula": "1006", "criado_em": "2025-03-05T16:00:05Z" }
      ]
    }
  ]
}
```

## Por que o hash nunca é recalculado

`hash_documento` de cada assinatura migrada é copiado **literalmente** do v1 — o script nunca
chama `_shared/hash.ts`/`conteudoAssinavelMonitoramento()` para um registro migrado. Duas
razões: (1) o v1 pode ter usado uma serialização diferente da v2 para chegar no hash, então
recalcular sob as regras da v2 produziria um valor que nunca bateria com o que foi realmente
assinado na época; (2) o valor probatório de uma assinatura eletrônica está em corresponder ao
que foi assinado **no momento da assinatura**, não em ser recomputável por um sistema
diferente anos depois. `origem_versao = 'v1_legado'` marca isso explicitamente em todo
registro migrado (ver comentário na migration `20260916000001_extensoes_e_enums.sql`).

## Rodando

```bash
# 1) Validação — nada é escrito no banco.
node scripts/migrar-dados-legados.mjs export-v1.json --dry-run

# 2) Import de verdade, depois de revisar o relatório do dry-run.
node scripts/migrar-dados-legados.mjs export-v1.json
```

Reexecutar com o mesmo arquivo é seguro — cada registro é procurado por `id_legado` antes de
inserir; o que já foi migrado aparece como "já existia", nunca duplicado.

## Corte (cutover)

Ver [docs/runbooks/corte-migracao-legado.md](runbooks/corte-migracao-legado.md) para o
checklist operacional do dia do corte em si (congelar o v1, migrar, validar, trocar os
usuários para a v2, decomissionar o v1).
