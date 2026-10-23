# GloboPac 2.0 — Roteiro de 12 minutos

**Antes:** 5 janelas logadas (Inspetor, Verificador, Gestor, Administrador, SIF) · uma ficha de teste com desvio · link do portal público aberto no celular · compartilhar só a janela do navegador · **não clicar em "Melhoria Contínua"**.

| Tempo | Tela | Dizer | Mostrar |
|---|---|---|---|
| **0:00** | Abertura | "Trocamos a ficha de papel por um registro digital **assinado, conferido por outra pessoa, tratado quando dá errado e entregue ao SIF com prova de que ninguém alterou**." | — |
| **1:00** | Fluxo | 6 perfis, cada um vê só o seu. O inspetor **não verifica o próprio registro** (o banco impede). | Inspetor → Verificador → (RNC ou Liberação) → SIF |
| **2:00** | Inspetor | "Ele digita o dado bruto; o sistema **faz a conta, aplica o limite e aponta o desvio**." Funciona **sem internet** e sincroniza sozinho. | Painel de Bordo (turno, alertas) → preencher ficha (pré-resfriamento ou DOA) → assinar com senha |
| **4:30** | Verificador | "Segunda conferência independente." | Aprovar vários com uma senha → **reprovar a ficha de teste: a RNC nasce sozinha** |
| **6:00** | Gestor | "Cada RNC tem dono, prazo e histórico. Quem trata não é quem fecha." | Card de alerta, selo "SLA vencido", resposta com causa e anexo |
| **6:30** | SIF e portal | "Liberação em lote com hash e carimbo de tempo. A fiscalização só lê." | Painel de Arquivo → **portal público no celular, sem login: "idêntico"** |
| **8:00** | Administrador | "Configura tudo sem programador." | Painel de Gestão → Construtor de Fichas → Indicadores (BI) → citar Manutenção (OS em 5 etapas assinadas) |
| **9:00** | Mapa | "Está tudo nesta tabela; envio por escrito." | Página 2, na tela |
| **10:00** | O que falta | Melhoria Contínua · alertas por e-mail · integração com o SIGMA · migração do sistema antigo (script pronto, nunca rodou com dados reais) · aceite de Qualidade/Jurídico para o offline e a retenção. | — |
| **11:00** | Fechamento | "Dado digital e assinado → segunda conferência → RNC com prazo → prova de integridade para o SIF." Propor: validar pendências com Qualidade/Jurídico e priorizar alertas e Melhoria Contínua. | — |

**Se faltar tempo:** corte o Gestor (6:30) e encurte o Administrador. **Se perguntarem:** sem internet → o inspetor segue e sincroniza; verificação e liberação precisam de rede. Alterar depois de assinado → não; correção vira adendo e, liberado ao SIF, é imutável.

## Mapa de funcionalidades

| Perfil | O que faz |
|---|---|
| **Inspetor de Qualidade** | Painel de Bordo (turno, pausas, alertas, parada de processo) · fichas com cálculo e conformidade automáticos · registro em duas etapas · rascunhos · adendos · autocorreção · abrir RNC · conferência de cargas · offline |
| **Verificador** | Verificação em lote · reprovar abre RNC · revisão de RNC · comunicados · cargas e veículos · trocar setor/cobertura · arquivo e liberação ao SIF · relatório de pragas |
| **Gestor de Setor** | Tratativa de RNC com alerta, prazo, causa, ação e anexos · indicadores |
| **Administrador** | Painel de Gestão · usuários e senhas · setores, equipamentos, desvios · construtor de fichas · folha de pausa · pendências de assinatura · carimbos de tempo · segurança de login · reabrir RNC · BI |
| **Inspeção Federal** | Auditoria somente leitura do que foi liberado (fichas e OS) |
| **Inspetor PCM** | OS em 5 etapas assinadas · liberação diária ao SIF · indicadores |
| **Público (sem login)** | Portal de verificação de autenticidade |
