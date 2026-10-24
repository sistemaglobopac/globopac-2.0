# ADR 0017 — BPF Estrutural (Manutenções Diversas): SS, OS, monitoramento diário e relatório SIF

## Contexto
O inspetor de qualidade percorre o frigorífico registrando avarias estruturais (piso, teto,
paredes, equipamentos, instalações, oxidação, vazamentos, solda não sanitária, iluminação…). Até
aqui isso era feito num formulário manual ("Relatório de Não Conformidades — BPF Diário"). O
fluxo real é: inspetor abre uma **solicitação de serviço (SS)** → um **administrador assina** →
o **PCM** transforma em **OS** e programa (ação, responsável, prazo) → todo dia o inspetor marca
cada OS como **C** (conforme), **NP** (no prazo) ou **NC** (não conforme) → o relatório diário,
conferido pelo **Verificador**, é compartilhado com o SIF.

## Decisão: estrutura própria, `bpf_*`
Não reaproveita `manutencao_os` (Fase 5, ADR 0012), que modela uma OS com cinco assinaturas
sequenciais — outro fluxo. Aquela estrutura e suas telas ficam intocadas (as rotas `/pcm*`
continuam existindo, só saíram do menu).

| Tabela | Papel |
|---|---|
| `bpf_solicitacoes` | SS do inspetor; aprovação do administrador (hash SHA-256 gravado pelo banco) |
| `bpf_ordens` | OS do PCM; `prazo_atual` é sempre o da última programação; `origem` = `v2` ou `importada` |
| `bpf_programacoes` | Histórico append-only de prazos (Prog, Rep. I, II…) com justificativa e assinatura do PCM |
| `bpf_verificacoes` | Veredito diário por OS (único por OS e dia); refazer no mesmo dia guarda a versão anterior em `bpf_verificacoes_historico` |
| `bpf_relatorios` | Fotografia imutável do dia, com as assinaturas de emissão e de conferência |

## Regras no banco, não na tela
- Toda escrita passa por funções `SECURITY DEFINER` (`bpf_abrir_solicitacao`,
  `bpf_aprovar_solicitacao`, `bpf_programar_solicitacao`, `bpf_reprogramar_ordem`,
  `bpf_registrar_verificacao`, `bpf_emitir_relatorio`, `bpf_liberar_relatorio`,
  `bpf_importar_ordens`). As tabelas não têm INSERT/UPDATE/DELETE para o cliente.
- **NP só com prazo vigente** (prazo ≥ hoje, inclusive no dia do prazo). **NC vale com prazo
  vencido ou vigente**: dentro do prazo serve para a OS executada cujo resultado não sanou o
  desvio apontado (migration `20261024120000`). Reforçado também por trigger.
- **Segregação:** quem abriu a SS não a aprova; quem emitiu o relatório não o libera.
- **Conforme (C)** conclui a OS e ela sai dos relatórios seguintes; desfazer no mesmo dia a reabre.
- O dia só é encerrado (relatório emitido) com todas as OS que já existiam antes de hoje
  verificadas; depois de emitido, as verificações do dia ficam travadas.
- O fuso é America/Manaus (`bpf_hoje()`), igual ao resto do sistema.

## Quatro assinaturas no relatório diário
1. **Inspetor do dia** — emissão (`hash_emissao`).
2. **Administrador** — aprovação de cada SS (`hash_aprovacao`, listado por SS).
3. **PCM** — programação e reprogramações (`hash_assinatura` em cada linha de `bpf_programacoes`).
4. **Verificador** — conferência/liberação (`hash_liberacao`).

Cada assinatura é calculada pelo servidor (hash do conteúdo + usuário + hora do servidor); o
cliente nunca envia hash. O snapshot do relatório carrega nome, data/hora e código de cada uma.

## Importação do relatório manual
`bpf_importar_ordens` (só `ADMIN_MASTER`) cria OS `origem = importada`, sem SS, com o histórico
de prazos do formulário (Prog + Rep.). Programações importadas não têm assinatura nem
justificativa (não existiam no sistema); o relatório informa quantas OS estão nessa condição. A
tela de importação lê CSV; o arquivo da carga inicial está em `docs/legado/`. Setores do
formulário que não existirem em `centros_custo` são criados (a tela avisa antes).

## Integração futura com o GLOBO SIGMA
`sistema_origem` (padrão `globopac`) e `id_externo` já existem em solicitações e ordens, com
índice único por par. O número da OS (`numero_os`) é o do sistema do PCM. Quando o SIGMA passar a
receber as SS, bastará uma Edge Function de entrada que grave a OS/programação com
`sistema_origem = 'sigma'` — o monitoramento diário e o relatório não mudam.

## Pendências conhecidas (fora desta entrega)
- **Carimbo de tempo RFC 3161** (`fila_carimbo_tempo`) para o relatório liberado: hoje há hash e
  hora do servidor, ainda sem o carimbo da TSA.
- **Fotos** da não conformidade na SS.
- Código de revisão do formulário impresso (o original traz "REV. 01 - 11/2024"): não foi
  inventado um novo.
