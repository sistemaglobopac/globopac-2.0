# Roteiro de apresentação — GloboPac 2.0

**Público:** diretoria / chefes · **Formato:** videoconferência com tela compartilhada
**Duração sugerida:** 40 a 50 min de apresentação + 10 min de perguntas
**Ideia central:** o GloboPac substitui a ficha de papel por um registro digital que é **assinado, verificado, tratado quando dá errado e entregue à Inspeção Federal com prova de que ninguém alterou depois**.

---

## 0. Antes de entrar na chamada (preparação)

- [ ] Abrir **6 abas/janelas já logadas**, uma por perfil (use janelas anônimas ou navegadores diferentes): Inspetor de Qualidade, Verificador, Gestor de Setor, Administrador, Inspeção Federal, Inspetor PCM.
- [ ] Ter **dados de demonstração prontos**: pelo menos 1 ficha conforme, 1 ficha com desvio (para gerar RNC), 1 RNC em tratativa, 1 OS de manutenção concluída e 1 documento já liberado ao SIF.
- [ ] Ter anotado o **link do portal público** de um documento liberado (`/verificar?id=...`) e abri-lo no celular, para mostrar que funciona sem login.
- [ ] Compartilhar **só a janela do navegador**, não a tela inteira (evita notificações pessoais aparecendo).
- [ ] Testar o áudio: o sistema toca **alarme sonoro** em alertas. Se não quiser surpresa, deixe o volume baixo.
- [ ] Ter um plano B: prints ou gravação de tela de cada bloco, caso a internet caia.
- [ ] **Não usar senhas ou matrículas reais** de colaboradores na tela.

> Dica de ritmo: em cada bloco, siga sempre a mesma estrutura: **problema → o que o sistema faz → demonstração (1–2 min) → ganho**. Os chefes lembram do ganho, não do clique.

---

## 1. Abertura: o problema e a proposta (3 min)

**Fale:**
- "Somos um frigorífico de aves sob inspeção federal (SIF 1606). Todo dia dezenas de monitoramentos de qualidade precisam ser feitos, conferidos e apresentados à fiscalização."
- Dores do modelo anterior: papel/planilha, risco de rasura e de perda, dificuldade de provar que o registro não foi alterado, não conformidades que se perdem sem prazo nem dono, e dependência de internet.
- Proposta: um único sistema com **6 perfis**, cada um vendo só o que lhe cabe, e uma **cadeia de confiança** do registro até a fiscalização.

**Mostre:** um slide ou a tela de login, nada mais.

---

## 2. Visão geral: a cadeia de valor em uma imagem (3 min)

Desenhe/mostre este fluxo e volte a ele ao longo da apresentação:

```
Programação do abate  →  Inspetor registra e assina  →  Verificador confere e assina
        │                                                         │
        │                                          ┌──────────────┴──────────────┐
        │                                     Conforme                      Não conforme
        │                                          │                              │
        │                                          │                    RNC aberta automaticamente
        │                                          │                    Gestor trata → Verificador revisa
        │                                          ▼
        │                              Liberação em lote ao SIF (hash + carimbo de tempo)
        │                                          ▼
        └──────────────────────────────  Inspeção Federal audita  +  Portal público de verificação
```

**Fale:** os seis perfis e o que cada um faz, em uma frase:

| Perfil | Em uma frase |
|---|---|
| **Inspetor de Qualidade** | Está na linha, faz os monitoramentos e assina |
| **Verificador** | Segunda conferência independente; aprova, reprova ou pede correção |
| **Gestor de Setor** | Responde pelas não conformidades do seu setor |
| **Administrador** | Configura o sistema, acompanha tudo e libera ao SIF |
| **Inspeção Federal (SIF)** | Só lê o que foi liberado; não altera nada |
| **Inspetor PCM** | Manutenção: ordens de serviço com assinatura por etapa |

**Ponto-chave a destacar:** o Inspetor **não pode verificar o próprio registro**. Essa separação é garantida pelo banco de dados, não só pela tela.

---

## 3. Acesso e segurança de login (3 min)

**Mostre:** tela de login.

- **Login por matrícula** e senha (não por e-mail) — familiar para o chão de fábrica.
- Cada perfil cai direto na sua tela inicial.
- **Proteção contra tentativa de invasão:** após 5 erros do mesmo IP aparece um **CAPTCHA**; após 10, o **IP é bloqueado** e só o Administrador libera (aba "Segurança de Login").
- **Cada perfil vê só o que pode:** o controle é feito no banco de dados (por perfil e por setor), não apenas escondendo botões.
- Cabeçalho com saudação, data e relógio no fuso de Manaus; menu lateral muda conforme o perfil.

**Ganho:** acesso rastreável por pessoa; nada de login compartilhado.

---

## 4. O dia a dia do Inspetor de Qualidade (10 min)

> Entre como **Inspetor de Qualidade**. É o bloco mais importante: é onde o dado nasce.

### 4.1 Painel de Bordo — o "cockpit" do turno
- **Iniciar e finalizar turno.** O turno encerra automaticamente quando esquecido; para finalizar, as pendências obrigatórias (por exemplo, o registro de pragas) precisam estar cumpridas.
- **KPIs do dia:** monitoramentos feitos, fichas ativas, fichas **atrasadas** e RNCs.
- **Fichas do meu setor:** o sistema mostra só as fichas aplicáveis ao setor em que o inspetor está.
- **Alertas que não dá para ignorar:** ficha atrasada, pausa estourada e RNC crítica bloqueiam a tela com alarme sonoro até o "Ciente".
- **Processo parado:** se o monitoramento não foi feito porque a linha parou, o inspetor justifica (motivo cadastrado) e o período é dispensado, em vez de virar "atraso" falso.
- **Controle de pausas e refeições:** pausa de 20 min, almoço e jantar de 1h12, com cronômetro e alerta de estouro. Isso alimenta a **Folha de Pausa** (ver bloco 10).
- **Registro de parada de equipamento** e **abertura de OS de manutenção** direto do painel.
- **Aves na vazão** (setor Pré-resfriamento 02): compara aves programadas × aves já contadas, carga a carga.

### 4.2 Preencher uma ficha (Nova Ficha)
O formulário é gerado a partir de um modelo e **calcula e avalia sozinho**. Mencione 3 ou 4 exemplos reais do que o sistema cobre:

- **Recepção de aves / Bem-Estar Animal:** transporte, jejum, condição das aves; conformidade automática se o veículo não for conforme ou o jejum passar do limite.
- **Área de espera:** 4 boxes, detecção de aves ofegantes e exigência de aspersores e ventiladores ligados.
- **Sala de pendura e eletronarcose:** tempos e parâmetros (ex.: contenção até a cuba, saída até a sangria, sangria mínima de 3 min), sinais de insensibilização.
- **DOA (aves mortas na chegada):** percentual calculado por carga, aviso de documento de correção de saldo quando a diferença com a GTA passa de 10%.
- **Pré-resfriamento (SPR):** consumo de água em L/ave e L/kg contra a meta, por tanque (pré-chiller, chillers 1 e 2, partes, miúdos, chuveiro final), com temperatura de água, borbulhamento e conformidade calculada.
- **Potabilidade da água, higiene e hábitos, higiene operacional, qualidade dos miúdos, ventilação, águas residuais, ocorrência de pragas**, entre outros.

**Fale:** "O inspetor digita o dado bruto. O sistema faz a conta, aplica o limite e já diz se há desvio. Isso elimina erro de cálculo e subjetividade."

### 4.3 Recursos que protegem o trabalho do inspetor
- **Registro em duas etapas** (ex.: peso por caixa, absorção de água, vazão): salva o que já foi medido e completa quando a balança ou o chiller 2 ficarem prontos, sem perder nada e permitindo que **outro inspetor do setor complete**.
- **Rascunhos:** preenchidos e ainda não assinados; assina vários de uma vez com uma única confirmação de senha, em até **7 dias** da hora do monitoramento.
- **Adendo / correção:** erro de digitação não se apaga; cria-se um adendo assinado que fica ligado ao original e propaga a correção.
- **Registro substituído:** quando a amostra é refeita, o original não some, só é marcado como substituído, com motivo e autor.
- **Autocorreção imediata:** alternativa à RNC. O inspetor descreve a ação que tomou na hora para restabelecer a conformidade.
- **Abrir RNC manualmente**, com fotos e documentos anexados.
- **Conferência de Cargas:** visão do dia com todas as cargas programadas e o que falta de cada uma (recepção, peso por caixa, DOA).

**Ganho:** menos retrabalho, nenhum dado perdido, e tudo que foi corrigido deixa rastro.

---

## 5. Funcionar sem internet (3 min)

**Problema real:** sinal ruim na planta. Dá para mostrar com o modo avião do navegador, se estiver seguro.

- O sistema é um **aplicativo instalável (PWA)**.
- O inspetor consegue **entrar sem rede** (a senha é conferida no aparelho, com o mesmo cuidado de um cofre de senhas) e **preencher e confirmar fichas offline**.
- Tudo fica numa fila protegida no aparelho e **sincroniza sozinho** quando a rede volta, de qualquer tela.
- Se a sessão expirar, a fila **não é descartada**: pede nova senha e continua.
- A assinatura oficial (com hash e carimbo de tempo) é gerada **no servidor** na sincronização. Offline, fica registrada a evidência da confirmação do inspetor.
- Aviso discreto de **nova versão disponível**; o sistema nunca recarrega sozinho para não perder um formulário em andamento.

**Seja transparente:** a validade jurídica da confirmação offline como assinatura do inspetor ainda aguarda aceite de Qualidade/Jurídico. Verificação e liberação ao SIF continuam exigindo internet.

---

## 6. Assinatura eletrônica e prova de integridade (4 min)

> Este é o diferencial técnico. Explique sem jargão.

**Fale:**
- Toda vez que alguém assina, o **servidor** calcula uma "impressão digital" (hash SHA-256) do documento como está gravado. O navegador nunca informa esse valor.
- A assinatura pede **confirmação de senha** na hora.
- O registro recebe um **carimbo de tempo RFC 3161**, emitido por autoridades externas independentes (4 disponíveis, com troca automática se uma falhar). Isso prova **quando** o documento existia daquele jeito.
- Assinaturas são **append-only**: não se edita, não se apaga. Depois de liberado ao SIF, o registro é **imutável**.
- Se o carimbo demorar ou falhar, **ninguém fica bloqueado**: ele é refeito em segundo plano com novas tentativas.

**Mostre (Administrador → "Carimbos de tempo"):** fila de carimbos, contagem por status, destaque do que está pendente há muito tempo e o botão "Processar agora".

**Ganho:** em uma fiscalização ou disputa, dá para provar que o registro não foi alterado e quando foi feito.

---

## 7. Verificação (Verificador) (5 min)

> Entre como **Verificador**.

- **Painel de Verificação** com abas: **Dia/turno**, **Por verificar** e **Verificadas**, mais indicadores (aguardando, com adendo pendente, verificados).
- Os apontamentos horários do mesmo inspetor/turno/ficha são agrupados em um **dossiê**, para não conferir 30 cartões soltos.
- **Tela cheia de verificação:** relatório oficial consolidado (o mesmo que vai para impressão), com a memória de cálculo para o auditor conferir.
- Três ações: **Aprovar e assinar** (inclusive vários de uma vez, com uma senha), **Reprovar** (escolhendo severidade e descrição) ou **pedir adendo**.
- **Reprovar abre a RNC automaticamente**; a tela de cada RNC lembra qual ficha a originou.
- O verificador também vê o **relatório e a prévia** (inclusive de rascunhos) dos monitoramentos do turno, e acompanha cargas e veículos.
- **Trocar Setor / Cobertura:** cobre o almoço de um inspetor ou o remaneja de setor. O aparelho do inspetor percebe em cerca de 30 s e atualiza as fichas sem ele sair do sistema; a troca volta sozinha ao fim do turno ou do prazo.
- **Comunicados:** manda um aviso aos inspetores que abre em qualquer tela, com alarme, e só fecha quando o inspetor confirma a leitura.
- **Cargas e Veículos:** cadastra a programação de abate (GTA, integrado, aviário, núcleo, nº de aves, placa) até na véspera; o inspetor escolhe a GTA ao monitorar a recepção.
- **Relatório mensal de pragas:** tabela praga × dia (presença/ausência) com as medidas corretivas.

**Ganho:** segunda conferência independente, com segregação de funções garantida pelo banco.

---

## 8. Não conformidades: RNC do início ao fim (4 min)

> Entre como **Gestor de Setor** e depois volte ao **Verificador**.

Fluxo: **Aberta → Tratada (Gestor) → Fechada ou Devolvida (Verificador)**.

- A RNC nasce sozinha na reprovação (ou manualmente), com **severidade** e **prazo (SLA) configurável por severidade**.
- **Gestor de Setor:** vê só as RNCs do seu setor; recebe **card de alerta em qualquer tela**; responde com **causa do desvio, ação corretiva e anexos** e assina a resposta.
- **Verificador:** revisa a tratativa e **aprova o fechamento** ou **devolve** com o motivo; quem tratou nunca é quem revisa (regra imposta pelo banco).
- **Contador no menu** de quantas RNCs aguardam cada pessoa.
- Selo **"SLA vencido"** em vermelho e faixa de aviso no topo.
- **Reabertura** só pelo Administrador, como **novo registro** ligado ao anterior: a tratativa original nunca é sobrescrita.
- Uma RNC fechada como procedente marca a ficha original como **"Tratado"**, não como "não conforme".

**Ganho:** nenhuma não conformidade fica sem dono, sem prazo ou sem histórico.

---

## 9. Liberação ao SIF e auditoria (5 min)

> Entre como **Verificador/Administrador** no Painel de Arquivo, depois como **Inspeção Federal**.

### 9.1 Painel de Arquivo
- Destino de toda ficha **já verificada** (aprovada ou reprovada).
- **Filtros** por data, PAC, setor, turno, ficha, situação, inspetor e liberação.
- **Liberação em lote:** seleciona vários documentos e libera de uma vez. O sistema calcula um **hash agregador do lote**, assina cada documento como "liberação diária" e carimba o lote. Qualquer alteração posterior seria detectada.
- Consulta e **impressão** do relatório oficial.

### 9.2 Inspeção Federal (somente leitura)
- Vê **apenas o que foi liberado**, incluindo as OS de manutenção liberadas.
- Não tem botão de editar. A restrição é do banco.

### 9.3 Portal público de verificação (sem login)
- Qualquer pessoa com o link ou QR abre `/verificar?id=...` e vê a **trilha de assinaturas** (quem, quando, selo de carimbo) e o selo de **integridade**: **idêntico** ou **diferente de uma versão anterior**, recalculado na hora no servidor.
- Para o público, "não existe" e "existe mas não foi liberado" têm a **mesma resposta**, para não vazar nada.
- Tem **limite de consultas por IP** contra abuso.
- Nunca fabrica selo para um documento sem assinatura.

**Faça ao vivo:** abrir o link no celular. É o momento "uau" da apresentação.

---

## 10. Manutenção / PCM (3 min)

> Entre como **Inspetor PCM**.

- **Ordem de Serviço** com ciclo em etapas: **Abertura → Autorização → Programação → Execução → Validação → Concluída**.
- **Cada etapa tem a própria assinatura eletrônica**, e a ordem das transições é controlada por uma tabela explícita (não dá para pular etapa).
- **Liberação diária ao SIF** das OS concluídas, com hash agregador acumulado no dia.
- Os setores de manutenção (mecânica, elétrica, quebra, PCM) e os **centros de custo** são configuráveis.
- O Administrador acompanha e aprova as OS pelo Painel de Gestão.
- O inspetor de qualidade também pode **abrir uma OS** direto do Painel de Bordo.

**Seja transparente:** o campo "ativo" da OS ainda é texto livre; a integração com o GLOBO SIGMA não está feita. E hoje o mesmo perfil conduz as 5 etapas (sem segregação entre elas), risco já documentado.

---

## 11. Painel de Gestão do Administrador (6 min)

> Entre como **Administrador**. Percorra a tela de cima para baixo.

**Indicadores em cartões (clicáveis):**
- **Usuários ativos** (quem está com o app aberto agora, em tempo real).
- **Pausa dos inspetores** em andamento.
- **Monitoramentos em andamento** / em atraso no turno.
- **RNCs pendentes** (em tratativa, aguardando verificação e fichas não conformes ainda sem RNC).

**Ferramentas:**
1. **Criar Fichas** — o *Construtor de Fichas* (ver bloco 12).
2. **Comunicados** — publicar avisos com confirmação de leitura.
3. **Folhas de Pausa** — relatório mensal de jornada por inspetor, pronto para imprimir em A4, individual ou em lote.
4. **Controle de Pragas** — registro de ocorrências e ações, mais o relatório mensal.
5. **Painel de Indicadores** — BI (ver bloco 13).
6. **Cargas e Veículos** — programação de abate.
7. **Trocar Setor / Cobertura.**
8. **Pendências de Assinatura** — o que cada inspetor ainda não assinou (rascunhos prestes a vencer e registros sem assinatura).

**Gestão do sistema:**
1. **Acessos de usuários** — criar colaborador (matrícula, perfil, setores, turno, e-mail para alertas), editar, **redefinir senha**, desligar e excluir definitivamente (preservando o nome nos relatórios). "Acesso geral" libera todos os setores.
2. **Setores globais.**
3. **Áreas e Custos** (PCM).
4. **Aprovação de OS.**
5. **Equipamentos** cadastrados.
6. **Desvios** — lista de motivos de parada e não conformidade.
7. **Segurança de Login** — IPs bloqueados e desbloqueio.

O administrador também **abre as telas dos outros perfis** (simulador do Painel de Bordo, Verificação, Tratativas) para dar suporte ou cobrir ausência.

---

## 12. Construtor de Fichas — o sistema se adapta sem programador (3 min)

> Administrador → Criar Fichas.

- Cria e edita o modelo de uma ficha, com **pré-visualização ao vivo** do formulário real, **usando a mesma validação** do preenchimento.
- Define: código, versão, PAC correspondente, **campos** (número, hora, texto, foto, escolha, e os campos especiais como chiller, DOA, pendura), **limites e tolerâncias**, **critérios de classificação** e **em quais setores a ficha aparece**.
- Fichas com **versões**: registros antigos continuam abrindo com o modelo com que foram feitos.
- Fichas "sem setor definido" ficam destacadas.

**Ganho:** uma mudança de PAC ou de limite não depende de nova versão do software.

---

## 13. Painel de Indicadores / BI (3 min)

> Administrador, Gestor de Setor ou Inspetor PCM.

- **Visão geral** (últimos 30 dias): monitoramentos, RNCs e OS, com gráficos. Cada perfil vê só o que a regra de acesso permite.
- **Aba "Consumo de água"** (Administrador e Gestor de Setor): litros por chiller e por hora, dia, semana e mês; o gelo não entra na conta; leituras incoerentes do hidrômetro são sinalizadas.
- **Exportação para CSV** por seção (abre direto no Excel com acentuação correta).

**Seja transparente:** o consumo por hora é uma **estimativa** (o hidrômetro é lido a cada monitoramento, não de hora em hora) e aguarda validação de Qualidade/Produção.

---

## 14. Confiabilidade e operação (2 min)

Fale rápido; é para a diretoria sentir segurança, não para detalhar.

- **Testes automatizados** cobrem os fluxos principais ponta a ponta e as regras de segurança do banco.
- **Verificação de saúde** pública para monitor externo (avisa se há carimbo preso ou RNC com SLA vencido).
- **Manuais de operação (runbooks)** para carimbos presos, RNC vencida, fila offline travada e corte de migração.
- **Script de migração de dados do sistema anterior** preservando hash e datas originais, sem duplicar.
- **Registros nunca são apagados fisicamente.**
- **Dados em horário de Manaus** em toda a interface.

---

## 15. O que ainda NÃO está pronto (2 min) — fale antes que perguntem

Isso passa credibilidade. Deixe claro:

| Item | Situação |
|---|---|
| **Melhoria Contínua / CAPA** | Botão existe, mas o módulo **não foi construído**. Mostre só como próxima etapa; **não clique nele na demonstração**. |
| **Alertas por e-mail/push** (SLA vencido, sistema degradado) | Hoje o alerta é visual dentro do sistema; o e-mail real já fica cadastrado para quando o módulo existir |
| **Integração com o GLOBO SIGMA** | Não feita |
| **Migração dos dados do sistema anterior** | Script pronto e testado, mas **nunca executada com dados reais** |
| **Confirmação offline como assinatura** | Aguarda aceite de Qualidade/Jurídico |
| **Prazo de retenção legal dos registros** | Precisa de validação jurídica |
| **Segregação entre etapas da OS** | Risco documentado |

---

## 16. Encerramento e próximos passos (2 min)

**Resuma em 4 frases:**
1. O dado nasce **digital, calculado e assinado** pelo inspetor.
2. Passa por **segunda conferência independente**.
3. O que dá errado vira **RNC com dono, prazo e histórico**.
4. O que dá certo chega ao SIF **com prova matemática de integridade**, e qualquer um pode conferir pelo portal público.

**Proponha:** piloto/expansão por setor, validação com Qualidade e Jurídico dos pontos em aberto, e priorização de Melhoria Contínua e alertas por e-mail.

---

## Anexo A — Cronograma sugerido

| Bloco | Tempo | Perfil usado |
|---|---|---|
| 1. Abertura | 3 min | — |
| 2. Visão geral | 3 min | — |
| 3. Acesso e segurança | 3 min | Login |
| 4. Inspetor de Qualidade | 10 min | Inspetor |
| 5. Offline | 3 min | Inspetor |
| 6. Assinatura e integridade | 4 min | Administrador |
| 7. Verificação | 5 min | Verificador |
| 8. RNC | 4 min | Gestor + Verificador |
| 9. SIF e portal público | 5 min | Verificador, SIF, celular |
| 10. Manutenção | 3 min | Inspetor PCM |
| 11. Painel de Gestão | 6 min | Administrador |
| 12. Construtor de Fichas | 3 min | Administrador |
| 13. BI | 3 min | Administrador |
| 14. Confiabilidade | 2 min | — |
| 15. O que falta | 2 min | — |
| 16. Encerramento | 2 min | — |
| **Total** | **≈ 61 min** | |

> Se o tempo for curto (30 min), corte: 5 (resumir em 1 min), 10, 12, 13 e 14, e apresente 11 em 2 min.

## Anexo B — Perguntas prováveis dos chefes e respostas curtas

- **"E se a internet cair?"** O inspetor continua trabalhando e tudo sincroniza quando a rede volta. Verificação e liberação ao SIF precisam de internet.
- **"Alguém pode alterar um registro depois de assinado?"** Não. Correções viram adendo assinado, e o original permanece. Depois de liberado ao SIF, é imutável.
- **"Como o SIF sabe que não foi adulterado?"** Pelo hash e carimbo de tempo, e pelo portal público que recalcula a integridade na hora.
- **"E se o inspetor esquecer de assinar?"** Há prazo de 7 dias para rascunhos, e a aba "Pendências de Assinatura" mostra quem está devendo. Registro já gravado sem assinatura não pode ser assinado depois.
- **"Dá para acrescentar uma ficha nova?"** Sim, pelo Construtor de Fichas, sem programação.
- **"Quanto custa manter?"** Não levantado aqui. Tenha o número da infraestrutura (hospedagem do banco e do front) antes da reunião.
- **"Quem acessa o quê?"** Controlado por perfil e por setor, no banco de dados. Matriz completa em `docs/permissions-matrix.md`.
- **"Já está em uso?"** Confirme com antecedência o estágio real (piloto ou produção) para responder com segurança. Esta informação não está clara no repositório.

## Anexo C — Checklist do que NÃO fazer durante a demonstração

- Não clicar em **Melhoria Contínua** (é só um aviso de "não implementado").
- Não digitar a senha de um colaborador real à vista.
- Não liberar ao SIF documentos reais durante a demonstração (a liberação é irreversível).
- Não reprovar uma ficha real para mostrar a RNC; use dados de teste.
- Evitar mexer em **Setores globais** ao vivo: renomear um setor não atualiza os registros antigos.
