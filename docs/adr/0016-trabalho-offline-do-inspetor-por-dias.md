# ADR 0016 — Inspetor trabalhando sem internet por horas ou dias

## Contexto
O ADR 0014 cobre a falta de sinal por algumas horas, com o inspetor já logado. A operação real exige mais:
a internet pode faltar por **dias** (inclusive no começo do turno, antes do login) e só os **inspetores**
precisam trabalhar assim. Três lacunas: (1) não era possível **entrar** sem rede; (2) offline não havia
confirmação do inspetor (a ficha entrava na fila sem pedir a senha); (3) a regra de 72 h (migration
`20261007110000`) fazia a ficha mais antiga que isso nunca sincronizar.

Um instalador (Electron/Tauri/Capacitor) foi descartado: não resolve nada disso (usa o mesmo código e o mesmo
IndexedDB do navegador) e, se empacotasse o build, congelaria a versão do app. A PWA já instalável continua sendo o único cliente.

## Decisão 1: login offline do inspetor com verificador local da senha
Depois de cada login online, o aparelho guarda o perfil e um **verificador** da senha — PBKDF2-HMAC-SHA256,
600 mil iterações, salt aleatório; nunca a senha — em IndexedDB (`credencialOffline.ts`). Sem rede, matrícula + senha
são conferidas ali e o app abre em "modo offline". Só `INSPETOR_QUALIDADE`; os demais perfis dependem de estado do
servidor e continuam exigindo internet. Vale **7 dias** a partir da última leitura do perfil COM rede (login, abertura do
app, renovação do token): é a nova janela de revogação (antes eram 15 min, ADR 0005) — desligar alguém só tem efeito
no aparelho na próxima sincronização, no máximo em 7 dias. 5 senhas erradas seguidas bloqueiam 5 min. Vários inspetores
podem revezar no mesmo aparelho: o cache offline das consultas passou a ser **por usuário** (`offlineCache.ts`).

O login offline só libera a **interface**. A autorização continua sendo a RLS do servidor, e o app não tem sessão no servidor
até a rede voltar: nesse momento o `ReconectarModal` pede a senha, abre a sessão pela Edge Function `login` e a fila sincroniza.
Se o login exigir CAPTCHA/estiver bloqueado, o inspetor é mandado à tela de login sem perder fila nem rascunhos.

## Decisão 2: confirmação com senha offline, assinatura oficial só no servidor
A assinatura eletrônica **continua sendo gerada só pelo servidor** (hash recalculado a partir do banco + carimbo RFC 3161;
ADR 0014, decisão 3). O que o inspetor faz offline é **confirmar a ficha com a senha**, conferida no aparelho. Essa
confirmação acompanha a ficha como evidência (`monitoramentos.confirmacao_offline`: matrícula, hora do aparelho, id do
aparelho, hash local dos dados e onde a senha foi conferida). O hash local é só evidência e nunca substitui o do servidor; o
carimbo de tempo só existe depois da sincronização. A mesma confirmação vale para os rascunhos ("Confirmar todos sem internet").
Isso depende de aceitação de Qualidade/Jurídico de que a confirmação offline basta como assinatura do inspetor enquanto não há rede.

## Decisão 3: prazo de 72 h estendido a 7 dias só com queda de rede PROVADA NO SERVIDOR
> **Substituída em 2026-10-10 (migration `20261010063259`):** o prazo passou a ser de 7 dias para todos, sem exigir prova de queda de rede (um monitoramento do dia 06 ficou sem assinar). O gatilho voltou a ter só a janela de 7 dias (+1 h); `fora_do_prazo_offline` não é mais definida em registros novos. O texto abaixo fica como histórico.

A regra anterior recusava o INSERT de uma ficha com mais de 72 h. Agora ela é aceita (e marcada `fora_do_prazo_offline`,
visível ao verificador) se, no gatilho `definir_hora_monitoramento`:
1. a ficha tem `confirmacao_offline` com a senha conferida (no aparelho ou no servidor);
2. o aparelho é conhecido — houve contato dele com o servidor ANTES da hora do monitoramento;
3. o servidor **não** recebeu nenhum contato desse aparelho nas 73 h seguintes à hora do monitoramento; e
4. a hora do monitoramento tem no máximo 7 dias (+1 h de folga).
O "contato" é registrado por `registrar_contato_dispositivo`, chamada pelo app a cada ~15 min com ele aberto e conectado
(`useContatoServidor`); só o servidor grava em `contatos_dispositivo`. A lógica do ponto 3: se o aparelho falou com o servidor
dentro do prazo, havia internet para assinar. A fila sincroniza de qualquer tela (`SincronizadorOffline` no AppShell).

**Limite conhecido:** a prova é "o app não falou com o servidor", não "a internet esteve fora". Um inspetor mal-intencionado
poderia deixar o app fechado de propósito e declarar queda. Mitigações: o teto de 7 dias, a marca visível ao verificador e
a evidência da confirmação. O rascunho NÃO confirmado continua vencendo em 72 h.

## Consequências / operação
- **Ordem de deploy: migration `20261007120000` ANTES do frontend.** O app novo envia `confirmacao_offline` no upsert e lê
  `confirmacao_offline`/`fora_do_prazo_offline` na verificação; sem as colunas esses comandos falham.
- `contatos_dispositivo` cresce ~4 linhas/h por aparelho online; não há expurgo ainda (candidato a cron simples de 30 dias).
- `navigator.storage.persist()` é pedido na inicialização para o navegador não apagar fila/rascunhos/credencial por falta de espaço.
- Trocar a senha online invalida o verificador local só no próximo login online daquele aparelho.
- Quem faz "Sair" mantém a credencial do inspetor no aparelho (é o que permite entrar offline no próximo turno).
- Fora de escopo, em aberto: **iniciar o turno offline** (`useIniciarTurno` exige rede: o turno é aberto quando a rede volta,
  com a hora da reconexão) e as operações de verificação/liberação, que seguem exigindo internet.
