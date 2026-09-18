# Runbook — Corte (cutover) do v1 para o GloboPac 2.0

🔴 **Este runbook nunca foi executado de verdade** — não existe ainda um projeto Supabase
hospedado (ASSUMPTIONS.md item 8) nem um export real do v1 disponível. É um checklist
preparado com antecedência para quando essas duas coisas existirem, não um relato de uma
migração já feita.

## Antes do dia do corte

- [ ] Confirmar que o projeto Supabase hospedado existe e que `.github/workflows/deploy.yml`
      já rodou com sucesso pelo menos uma vez contra ele (ver README, seção Deploy).
- [ ] Confirmar que todos os usuários que vão operar a v2 já estão cadastrados em
      `perfis_usuarios` com a matrícula correta (login por matrícula, Fase 6) — sem isso, o
      script de migração falha ao tentar resolver o autor de qualquer registro.
- [ ] Obter o export final do v1 no formato documentado em
      [docs/migracao-dados-legados.md](../migracao-dados-legados.md) (ou adaptar o script ao
      formato real do v1, se divergir — ver aviso no topo daquele documento).
- [ ] Rodar `node scripts/migrar-dados-legados.mjs export-v1.json --dry-run` contra o projeto
      de produção e revisar cuidadosamente o relatório — zero erros antes de prosseguir.

## No dia do corte

1. **Congelar escritas no v1** — comunicar aos usuários a janela de manutenção; nenhum
   registro novo deve ser criado no v1 a partir deste ponto.
2. **Exportar os dados finais do v1** (agora com certeza de que nada mais vai mudar).
3. **Rodar a migração de verdade**:
   ```bash
   node scripts/migrar-dados-legados.mjs export-v1-final.json
   ```
4. **Validar contagens**: comparar o total de registros no export do v1 com
   `relatorio.importados + relatorio.ja_existiam` da saída do script — devem bater
   exatamente. Qualquer erro reportado precisa ser resolvido (corrigindo o dado de origem ou
   o cadastro faltante na v2) antes de liberar o acesso à v2.
5. **Conferência amostral**: escolher alguns registros migrados ao acaso (incluindo pelo menos
   um de severidade CRÍTICA/liberado ao SIF) e verificar manualmente no portal público
   (`/verificar?id=<uuid da v2>`) que a trilha de assinaturas aparece corretamente.
6. **Liberar o acesso à v2** para os usuários (comunicar a URL/matrícula/senha inicial).
7. **Manter o v1 acessível somente-leitura** por um período de segurança (sugestão: 90 dias,
   ajustar conforme política de retenção real da empresa) antes de desligar de vez — nunca
   apagar o v1 no mesmo dia do corte.

## Depois do corte

- [ ] Confirmar com a Inspeção Federal (SIF) que o portal público (`/verificar`) da v2 está
      acessível e retornando os documentos históricos corretamente.
- [ ] Arquivar o export do v1 usado na migração (o arquivo JSON em si) em um local de backup
      duradouro — é a fonte da verdade caso surja qualquer questionamento sobre um registro
      migrado no futuro.
- [ ] Agendar a data de decomissionamento definitivo do v1 (depois do período de retenção
      somente-leitura) e confirmar que ninguém mais depende dele antes de desligar.

## Se algo der errado no meio do corte

O script é idempotente (idempotência via `id_legado`) — pode ser interrompido e rerodado com
segurança a qualquer momento, sem duplicar o que já foi importado. Se a migração precisar ser
abortada depois de já ter começado, os registros já importados podem ficar (não têm conflito
com o v1 continuando a operar durante o período de retenção) — só é preciso remover a janela
de congelamento do v1 e comunicar aos usuários que o corte foi adiado.
