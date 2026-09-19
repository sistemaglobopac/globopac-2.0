# Matriz de permissões — GloboPac 2.0

Fonte de verdade real: tabela `permissoes_perfil`, populada pela migration
[`20260916000017_seed_permissoes_perfil.sql`](../supabase/migrations/20260916000017_seed_permissoes_perfil.sql).
Este documento é uma **projeção legível** dessa tabela — se os dois divergirem, a migration
está certa; atualize este arquivo.

Vocabulário de `recurso` e `acao` (ver ASSUMPTIONS.md item 10 — livre para expandir, desde
que sincronizado entre policies de RLS, esta tabela e a migration de seed):

| Ação | Significado |
|---|---|
| `ler` | Ler linhas do recurso (sujeito a filtros adicionais de setor/status na policy) |
| `criar` | Inserir uma nova linha |
| `verificar` | Aprovar/reprovar um monitoramento (define `conformidade`/`verificado_por`) |
| `liberar_sif` | Marcar como liberado ao SIF (ação irreversível — gera assinatura `LIBERACAO_DIARIA`) |
| `tratar` | Conduzir a tratativa de uma RNC (ABERTA/REABERTA/DEVOLVIDA → TRATADA) |
| `revisar` | Revisar a tratativa de uma RNC: aprovar o fechamento ou devolver ao gestor (TRATADA → FECHADA/DEVOLVIDA) |
| `abrir` | Abrir uma nova Ordem de Serviço |
| `avancar_etapa` | Avançar a OS para a próxima etapa da máquina de estados |
| `atualizar` | Atualizar campos administrativos (ex.: `perfis_usuarios.ativo`) |
| `gerenciar` | Controle administrativo total sobre um recurso de configuração |

## Matriz perfil × recurso × ação

| Perfil | Recursos e ações permitidas |
|---|---|
| `INSPETOR_QUALIDADE` | `monitoramentos`: ler, criar · `rnc`: ler, criar · `assinaturas_eletronicas`: ler · `turnos_inspetores`: ler |
| `VERIFICADOR` | `monitoramentos`: ler, verificar, liberar_sif · `rnc`: ler, criar (Fase 1 — abrir RNC automaticamente ao reprovar), revisar (Fase 11 — revisor da tratativa do Gestor de Setor) · `assinaturas_eletronicas`: ler · `lote_liberacao_sif`: ler · `fila_carimbo_tempo`: ler |
| `GESTOR_SETOR` | `monitoramentos`: ler · `rnc`: ler, criar, tratar |
| `ADMIN_MASTER` | Acesso total a todos os recursos listados (ver migration de seed para a lista completa) · `bloqueios_login_ip`: ler (Segurança de Login — ver ADR 0015; o desbloqueio em si é feito pela Edge Function `desbloquear-ip-login`, não por RLS de UPDATE) |
| `INSPECAO_FEDERAL` | `monitoramentos`: ler (apenas `liberado_sif=true`, reforçado na policy) · `assinaturas_eletronicas`/`assinaturas_os_eletronicas`: ler · `lote_liberacao_sif`: ler · `manutencao_os`/`manutencao_relatorios_sif`: ler (mesma restrição `liberado_sif=true`, corrigida na Fase 5 — ver ASSUMPTIONS.md) |
| `INSPETOR_PCM` | `manutencao_os`: ler, abrir, avancar_etapa · `manutencao_os_historico`: ler · `manutencao_relatorios_sif`: ler, criar, liberar · `assinaturas_os_eletronicas`: ler |

`rnc_update` (ação `tratar`) proíbe explicitamente gravar `status` em `FECHADA`/`DEVOLVIDA` ou
preencher `revisado_por` — essas transições exigem a ação `revisar`, e `rnc_update_revisar`
por sua vez só aceita `status` de origem `TRATADA` e exige `revisado_por = auth.uid()`. A
segregação `tratado_por <> revisado_por` é reforçada por trigger de banco
(`trg_segregacao_funcoes_rnc`, mesmo princípio de `trg_segregacao_funcoes` em
`monitoramentos`), não só pela RLS — ver
[supabase/migrations/20260927000001_rnc_revisor_verificador.sql](../supabase/migrations/20260927000001_rnc_revisor_verificador.sql).

## Restrições contextuais aplicadas diretamente nas policies (não na coluna `condicao`)

- **Mesmo setor:** quase toda policy de `select`/`update` em `monitoramentos`, `rnc` e
  `manutencao_os` exige `setor = any (meus_setores())`, além de `tem_permissao(...)`.
- **Somente liberado ao SIF:** `INSPECAO_FEDERAL` só enxerga `monitoramentos` com
  `liberado_sif = true` (e, por tabela relacionada, `assinaturas_eletronicas` cujo
  monitoramento correspondente já foi liberado).
- **Autoria:** `monitoramentos_insert`, `rnc_insert`, `manutencao_os_insert` e
  `turnos_insert` exigem que o `user_id`/`aberto_por` seja o próprio `auth.uid()` — impede
  que um cliente forje uma ação em nome de outro usuário.
- **Segregação de funções:** `verificado_por <> user_id` é reforçada por **trigger de banco**
  (`trg_segregacao_funcoes`), não por RLS — ver
  [supabase/migrations/20260916000008_monitoramentos.sql](../supabase/migrations/20260916000008_monitoramentos.sql).

## Rastreabilidade com os testes

| Regra | Teste pgTAP |
|---|---|
| Deny by default (perfil sem ação concedida não vê nada) | `0002_rls_monitoramentos.sql` |
| Isolamento por setor (INSPETOR_PCM não vê LINHA_DIF) | `0002_rls_monitoramentos.sql` |
| INSPECAO_FEDERAL só vê liberado ao SIF | `0002_rls_monitoramentos.sql` |
| ADMIN_MASTER vê tudo | `0002_rls_monitoramentos.sql` |
| Segregação de funções (criador ≠ verificador) | `0001_segregacao_e_append_only.sql` |
| Segregação de funções em RNC (tratou ≠ revisou) | `0001_segregacao_e_append_only.sql` |
| Imutabilidade pós-liberação | `0001_segregacao_e_append_only.sql` |
| Append-only de assinaturas | `0001_segregacao_e_append_only.sql` |
| perfis_usuarios: self-read sempre, cross-read nunca sem permissão | `0003_rls_perfis_e_permissoes.sql` |
| View pública não vaza campos sensíveis | `0003_rls_perfis_e_permissoes.sql` |
| bloqueios_login_ip: só ADMIN_MASTER lê, ninguém escreve via RLS (só service_role) | `0007_bloqueios_login_ip.sql` |
