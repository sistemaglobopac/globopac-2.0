# ADR 0013 — Login por matrícula e adoção do design system GloboPac v1.0

## Contexto
Duas decisões pendentes desde a Fase 0 foram resolvidas nesta fase: (1) a forma de
identificação do usuário no login (ASSUMPTIONS.md item 5 tratava só da paleta de cores, mas o
mecanismo de login em si sempre foi e-mail, por ser o que a Supabase Auth suporta nativamente);
e (2) a paleta/tratamento visual do design system (Avenorte), agora confirmada e fornecida pelo
usuário em `globopac-design-system.md` (documento externo, fora do repositório).

## Decisão 1: login por matrícula, resolvido para e-mail via RPC antes da autenticação
A Supabase Auth (GoTrue) só autentica por e-mail ou telefone — não existe suporte nativo a
"nome de usuário" ou "matrícula" como identidade de login. Em vez de reimplementar
autenticação (o que jogaria fora toda a base de RLS/hook de claims já construída sobre
`auth.users`/`auth.uid()`), a matrícula é apenas uma **camada de resolução**: uma nova coluna
`perfis_usuarios.matricula` (distinta de `nome_usuario`, que continua sendo o identificador
técnico/de auditoria) e uma função `public.email_por_matricula(matricula) returns text`,
`SECURITY DEFINER` porque é chamada **antes** de existir qualquer sessão (sem `auth.uid()`, a
RLS de `perfis_usuarios` bloquearia até a própria leitura). `LoginPage` chama essa RPC primeiro
e só então `signInWithPassword` com o e-mail resolvido — para quem usa o sistema, a experiência
é "eu logo com minha matrícula", mas por baixo continua sendo e-mail/senha padrão do GoTrue.

**Superfície de exposição da RPC:** retorna só o e-mail (nunca outra coluna de
`perfis_usuarios`), só para matrícula existente E `ativo = true`, e `NULL` para qualquer outro
caso — o front-end trata matrícula inexistente e senha errada com a MESMA mensagem genérica
("Matrícula ou senha inválidos."), não revelando qual das duas falhou. Rate limiting de
tentativas de login continua sendo responsabilidade do GoTrue (já existente, não duplicado
aqui).

## Decisão 2: design system v1.0 aplicado nos tokens estruturais, não reescrevendo componentes
A paleta (navy `#002060` dominante, lima `#c2ef4e` como acento escasso — só preenchimento
sólido ou sobre fundo escuro, nunca como texto sobre claro, por contraste insuficiente),
tipografia (Inter/JetBrains Mono) e o tratamento de superfície em glassmorphism (sidebar/topbar/
paineis com blur+transparência calibrados por densidade de conteúdo) foram aplicados via:
- `src/index.css`: variáveis CSS (`--primary`, `--destructive` etc.) recalculadas para a nova
  paleta — continuam sendo a fonte única que os componentes shadcn-style já consultavam, sem
  precisar tocar em nenhum componente.
- `tailwind.config.ts`: tokens literais novos (`lime`, `down`, `hairline`, `surface.*`,
  `ondark.*`) para os poucos casos sem equivalente estrutural no shadcn base (ex.: badge
  negativo como preenchimento suave `bg-down-soft`, não o `bg-destructive` sólido usado em
  botões — papéis diferentes, ação vs. status).
- Nenhuma mudança de lógica/comportamento em nenhuma página — só classes/tokens visuais.

## Consequência: toda a suíte E2E precisou de um ajuste mecânico
Login por e-mail → matrícula muda a assinatura de `login()` em `tests/e2e/helpers.ts` e todo
`await login(page, "<matricula>", "<senha>")` nos 8 arquivos de teste E2E existentes — mudança
mecânica, sem lógica de teste alterada. A senha de desenvolvimento também mudou (de
`globopac-dev-2026` para `121072`, escolha arbitrária do usuário) — `scripts/seed-dev-users.mjs`
é a fonte de verdade.

## Alternativas descartadas
- **Login por `nome_usuario`** (já existente): rejeitado — `nome_usuario` é declaradamente um
  identificador técnico/de auditoria (seção 4), não uma credencial pensada para digitação
  frequente por operadores de chão de fábrica; matrícula é o identificador que a operação real
  usa no crachá/holerite.
- **Adicionar telefone como login via GoTrue nativo**: rejeitado — exigiria um provedor de SMS
  configurado (custo/dependência externa) só para contornar o mesmo problema que uma RPC de
  resolução já resolve sem custo adicional.
