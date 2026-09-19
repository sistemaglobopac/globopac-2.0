# ADR 0015 — Bloqueio de login por IP (CAPTCHA em 5 falhas, bloqueio em 10, desbloqueio só por ADMIN_MASTER)

## Contexto
Pedido explícito do responsável do projeto, fora do roteiro de fases do PROMPT MESTRE: reduzir
o risco de força bruta contra o login, além do rate limiting nativo da Supabase Auth
(`[auth.rate_limit] sign_in_sign_ups = 30`, já configurado desde a Fase 0 — ver
`supabase/config.toml`). O pedido específico foi: 5 tentativas erradas exigem "comprovação
humana" (CAPTCHA); mais falhas até 10 no total bloqueiam o login **por IP**; só um
administrador pode liberar aquele IP de volta.

## Decisão
1. **Gate de tentativas por IP, aplicado no servidor.** O `LoginPage` não chama mais
   `supabase.auth.signInWithPassword` diretamente — ele chama uma nova Edge Function `login`,
   que consulta/atualiza a tabela `bloqueios_login_ip` (chave primária = IP) antes e depois de
   delegar a autenticação de verdade para a Supabase Auth (a Edge Function nunca reimplementa
   verificação de senha). Um gate client-side seria inútil: o cliente é exatamente quem se
   quer conter.
2. **Limiares: 5 → CAPTCHA, 10 → bloqueio total.** Implementado com Cloudflare Turnstile
   (`TURNSTILE_SECRET_KEY` verificado server-side via `siteverify`, fail-closed se a secret não
   estiver configurada). Uma tentativa bem-sucedida a qualquer momento zera o contador do IP.
3. **Desbloqueio exclusivo de ADMIN_MASTER**, via Edge Function `desbloquear-ip-login` (mesmo
   padrão de autorização de `criar-usuario`/`redefinir-senha`: revalida o chamador e o
   `nivel_acesso` no servidor, nunca confia em RLS de escrita para isso — a tabela não tem
   NENHUMA policy de INSERT/UPDATE/DELETE para `authenticated`/`anon`, só SELECT para
   ADMIN_MASTER via `tem_permissao('bloqueios_login_ip', 'ler')`, mesmo padrão de
   `assinaturas_eletronicas`).
4. **IP armazenado em claro, não hash.** Diferente de `log_acessos_verificacao` (portal
   público anônimo, onde minimização LGPD faz sentido porque ninguém nunca precisa "ler" o IP
   de volta), aqui o ADMIN_MASTER precisa **identificar** qual IP está bloqueado para decidir
   se libera — um hash irreversível tornaria essa tela inutilizável para esse julgamento
   operacional. Este é um controle interno de acesso de colaboradores (não de público
   anônimo), o que muda o cálculo de privacidade.
5. **Chaves de teste públicas da Cloudflare em dev/CI.** `1x00000000000000000000AA` (site key)
   e `1x0000000000000000000000000000AA` (secret) são documentadas pela própria Cloudflare como
   sempre-aprovam — usadas como default em `.env.example` para nunca travar um ambiente local
   ou o pipeline de CI por falta de conta Cloudflare. Produção exige as chaves reais.

## Alternativas consideradas
- **Bloqueio por usuário/matrícula, não por IP (rejeitada):** o pedido foi explicitamente por
  IP. Bloquear por matrícula teria a vantagem de não penalizar terceiros atrás do mesmo IP
  (ver Consequências), mas abriria uma forma de negação de serviço trivial (bastaria saber a
  matrícula de um colega para travar o login dele) — bloqueio por IP não tem esse problema
  simétrico.
- **Depender só do rate limit nativo da Supabase Auth (rejeitada):** o rate limit nativo
  (`sign_in_sign_ups`) já existe e continua ativo como primeira camada, mas não oferece
  CAPTCHA condicional nem um mecanismo de desbloqueio administrativo visível — não atende ao
  pedido específico.
- **Função SQL atômica (`SECURITY DEFINER`) para o contador de falhas (rejeitada por ora):**
  o `login` de fato faz um "lê, soma, grava" (não atômico sob concorrência extrema do MESMO
  IP no mesmo milissegundo). Aceito deliberadamente: o pior caso é subcontar uma falha
  ocasional, atrasando o gate em uma tentativa — nunca uma falha de segurança na direção
  oposta (nunca conta a mais). O volume esperado (ASSUMPTIONS.md item 3) não justifica a
  complexidade extra agora; se a operação real mostrar um padrão de ataque distribuído e
  simultâneo do mesmo IP, revisitar com uma função atômica.

## Consequências
- **Redes corporativas/NAT compartilhado:** vários colaboradores atrás do mesmo IP público
  (ex.: rede da própria planta) compartilham o mesmo contador — um usuário errando a senha
  repetidamente pode acionar CAPTCHA (ou, no limite, bloqueio) para os colegas na mesma rede.
  Aceito como trade-off do pedido explícito de bloqueio por IP; o desbloqueio por ADMIN_MASTER
  é rápido (um clique no Painel de Gestão → Segurança de Login) exatamente para mitigar isso.
- **CORS das Edge Functions autenticadas foi restringido no mesmo lote de mudanças**
  (`ALLOWED_ORIGINS`, substituindo o `Access-Control-Allow-Origin: *` anterior) — sem
  configurar essa variável no ambiente hospedado, só as origens de desenvolvimento local
  funcionam. Ver `supabase/functions/_shared/cors.ts`.
- **MFA (segundo fator) para ADMIN_MASTER ficou fora deste lote de mudanças**, por decisão
  explícita de escopo — é uma feature própria (enrollment de TOTP, fluxo de recuperação),
  tratada separadamente.
