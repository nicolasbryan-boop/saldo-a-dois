# Saldo a Dois

**No ar:** https://saldo-a-dois.ainoamesquita.workers.dev

Assistente financeiro para casais. Responde uma pergunta só, e responde bem:

> **Quanto a gente realmente pode gastar?**

Não é banco, não é corretora, não movimenta dinheiro e não conecta conta
bancária. É uma ferramenta de organização financeira compartilhada por duas
pessoas, onde a métrica principal é **Livre para gastar**:

```
saldo atual
− contas do ciclo ainda não pagas
− reserva do ciclo ainda não guardada
= livre para gastar
```

Esse número pode ser negativo, e quando é, o app mostra negativo.

---

## Sumário

- [Stack](#stack)
- [Como rodar localmente](#como-rodar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados (D1 + Drizzle)](#banco-de-dados-d1--drizzle)
- [Seed de desenvolvimento](#seed-de-desenvolvimento)
- [Autenticação (Better Auth)](#autenticação-better-auth)
- [Assistente e IA](#assistente-e-ia)
- [Pagamentos](#pagamentos)
- [E-mail](#e-mail)
- [PWA](#pwa)
- [Testes](#testes)
- [Build e deploy](#build-e-deploy)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Decisões de arquitetura](#decisões-de-arquitetura)
- [Pendências e limitações conhecidas](#pendências-e-limitações-conhecidas)

---

## Stack

| Camada | Escolha |
| --- | --- |
| Front-end | Next.js 16 (App Router), React 19, TypeScript 5.9, Tailwind CSS 4 |
| Back-end | Route Handlers do Next rodando em Cloudflare Workers via `@opennextjs/cloudflare` |
| Banco | Cloudflare D1 (SQLite) |
| ORM | Drizzle ORM + Drizzle Kit (migrations versionadas) |
| Autenticação | Better Auth 1.7 (e-mail e senha, sessão em cookie) |
| IA | Cloudflare Workers AI, atrás de uma abstração de provider |
| Pagamentos | Abstração `PaymentProvider` + `MockPaymentProvider` (dev) e Stripe (isolado) |
| Testes | Vitest (unidade e integração) + suíte de fumaça HTTP em bash |

Sem Supabase, sem Firebase, sem Vercel. Tudo cabe nas camadas gratuitas da
Cloudflare para começar.

---

## Como rodar localmente

Pré-requisitos: **Node 20.18+** (desenvolvido com Node 24) e npm 10+.

```bash
# 1. Dependências
npm install

# 2. Ambiente
cp .env.example .env.local
#    Gere um segredo e cole em BETTER_AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
#    Coloque seu e-mail em ADMIN_EMAILS para acessar /admin.

# 3. Banco local (Miniflare/D1)
npm run db:migrate:local

# 4. Dados de demonstração
npm run db:seed

# 5. Subir
npm run dev          # http://localhost:3000
```

Entre com qualquer um dos dois:

```
ana@exemplo.com    / demo123456
lucas@exemplo.com  / demo123456
```

> **Importante:** `BETTER_AUTH_URL` e `NEXT_PUBLIC_APP_URL` precisam bater com a
> URL pela qual você acessa o app. O Better Auth valida a origem das requisições
> que alteram estado (proteção CSRF); se você rodar em outra porta, ajuste as
> duas variáveis, senão logout, troca de senha e afins retornam
> `INVALID_ORIGIN`.

### Rodando no runtime real (workerd)

`next dev` roda em Node. Para exercitar o mesmo runtime da produção:

```bash
cp .dev.vars.example .dev.vars   # preencha BETTER_AUTH_SECRET etc.
npm run cf:build
npx wrangler dev --port 8788 --local
```

---

## Variáveis de ambiente

Documentadas em [`.env.example`](.env.example) (Node/`next dev`) e
[`.dev.vars.example`](.dev.vars.example) (Workers). Em preview/produção use
`wrangler secret put NOME` — nada de segredo em arquivo versionado.

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | **sim** | Assina cookies e tokens. Em produção o app se recusa a subir sem ela. |
| `BETTER_AUTH_URL` | sim | Origem canônica do app (CSRF, links de e-mail). |
| `NEXT_PUBLIC_APP_URL` | sim | URL pública usada em checkout e convites. |
| `APP_ENV` | sim | `development` \| `preview` \| `production`. Controla cookies seguros e o bloqueio do gateway simulado. |
| `ADMIN_EMAILS` | não | Lista separada por vírgula com acesso a `/admin`. |
| `AI_PROVIDER` | não | `workers-ai` (padrão) \| `openai` \| `anthropic` \| `gemini` \| `none`. |
| `WORKERS_AI_MODEL` | não | Modelo do Workers AI. Padrão `@cf/meta/llama-3.1-8b-instruct`. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | não | Só se trocar o provider. |
| `PAYMENT_PROVIDER` | sim | `mock` (dev) \| `stripe`. `mock` é **recusado** quando `APP_ENV=production`. |
| `STRIPE_SECRET_KEY` | produção | Chave secreta do Stripe. |
| `STRIPE_WEBHOOK_SECRET` | produção | Verificação de assinatura do webhook. |
| `STRIPE_PRICE_MONTHLY_ID` | produção | Price ID recorrente de R$ 20,90 a cada 1 mês. |
| `STRIPE_PRICE_QUARTERLY_ID` | produção | Price ID recorrente de R$ 54,90 a cada 3 meses. |
| `STRIPE_PRICE_YEARLY_ID` | produção | Price ID recorrente de R$ 229,90 a cada 12 meses. |
| `EMAIL_PROVIDER` | sim | `console` (dev, não envia nada) \| `resend`. |
| `RESEND_API_KEY` | produção | Envio real de e-mail. |
| `EMAIL_FROM` | produção | Remetente. |
| `SEED_PASSWORD` | não | Senha dos usuários de demonstração. Padrão `demo123456`. |

---

## Banco de dados (D1 + Drizzle)

Schema em [`src/db/schema/`](src/db/schema), migrations versionadas em
[`drizzle/migrations/`](drizzle/migrations).

```bash
npm run db:generate         # gera migration a partir do schema
npm run db:migrate:local    # aplica no D1 local
npm run db:migrate:remote   # aplica no D1 de produção
npm run db:studio           # Drizzle Studio
```

### Regras não negociáveis

- **Dinheiro é `INTEGER` em centavos.** Nenhum float toca em valor monetário.
- **Datas financeiras são `TEXT` `YYYY-MM-DD`** interpretadas no fuso do
  household (`America/Sao_Paulo`). Vencimento dia 10 é dia 10 no Brasil,
  independente de onde o Worker executa. Timestamps operacionais são epoch ms.
- **Todo dado financeiro tem `household_id`** e todo acesso é validado no
  servidor contra a sessão.

### Tabelas

`user`, `session`, `account`, `verification` (Better Auth) ·
`households`, `household_members`, `partner_invites` ·
`subscriptions`, `checkout_sessions`, `payment_events` ·
`financial_cycles`, `categories`, `income_sources`, `recurring_expenses`,
`recurring_instances`, `transactions`, `goals`, `goal_contributions` ·
`assistant_messages`, `analytics_events`, `audit_logs`, `email_outbox`,
`error_logs`, `rate_limits`.

Índices em `household_id`, data do movimento, ciclo, origem da recorrência e
status da assinatura. Dois índices únicos carregam garantias do produto:

- `recurring_instances (source_type, source_id, cycle_id)` — recorrência não
  duplica, por construção.
- `payment_events (provider, provider_event_id)` — webhook repetido não é
  processado duas vezes.

---

## Seed de desenvolvimento

```bash
npm run db:seed
```

O seed constrói o casal **Ana & Lucas** chamando os **serviços de domínio
reais** contra um SQLite em memória e depois despeja as linhas no D1 local. Ou
seja: se `createTransaction` mudar, o seed muda junto — ele não pode divergir da
lógica de produção.

Resultado: renda de R$ 9.500, cinco contas fixas, meta de R$ 1.000/ciclo, seis
movimentos e saldo inicial de R$ 8.450.

O seed **apaga e recria** os dados. Rodar contra o banco remoto exige
`--remote` **e** `FORCE_REMOTE_SEED=1`; sem isso ele recusa.

---

## Autenticação (Better Auth)

- E-mail e senha, hash scrypt do próprio Better Auth. Senha nunca em texto.
- Sessão em cookie assinado, `HttpOnly`, `SameSite=Lax`, `Secure` em produção.
- Rate limit nas rotas sensíveis (login, cadastro, recuperação de senha).
- Fluxos: login, logout, esqueci minha senha, redefinição, alteração de senha.
- Campo extra `must_change_password`: quando o dono do espaço provisiona o
  parceiro com senha temporária, o parceiro só alcança a troca de senha até
  definir a própria. A troca revoga as outras sessões.

A instância é criada **por requisição**, porque o binding do D1 só existe dentro
de uma. Ver [`src/domains/auth/server.ts`](src/domains/auth/server.ts).

Para conferir o schema esperado pelo Better Auth contra o nosso:

```bash
npm run auth:schema   # gera .auth-schema-reference.ts para diff manual
```

---

## Assistente e IA

**A IA interpreta. O back-end calcula.** Nenhum valor exibido no produto sai de
um modelo de linguagem.

O caminho de uma frase:

1. **Parser determinístico** ([`parser.ts`](src/domains/assistant/parser.ts)) —
   entende "gastei 120 no mercado", "mercado 120", "59 no ifood", "recebi 4500
   de salário", além de **todas** as perguntas ("quanto posso gastar?", "quais
   contas faltam?", "quanto cada um gastou?"). Custo de IA: zero.
2. **Provider de IA**, só quando o parser desiste. O modelo recebe a frase e
   devolve **uma ação JSON** — nunca um número, nunca um saldo.
3. **Validação Zod** ([`actions.ts`](src/domains/assistant/actions.ts)). JSON
   inválido, tipo desconhecido, valor negativo ou fracionado viram `unknown`,
   que não altera nada.
4. **Execução** ([`executor.ts`](src/domains/assistant/executor.ts)) — os
   serviços gravam e o `FinancialEngine` calcula. A resposta é montada com os
   números reais do banco.

Trocar de provider é uma variável de ambiente: `workers-ai`, `openai`,
`anthropic`, `gemini` ou `none`.

> Em `next dev` o binding de Workers AI **não** está disponível (ver
> [Decisões](#decisões-de-arquitetura)); o assistente roda no parser local, que
> é justamente o caminho da maioria das frases.

---

## Pagamentos

Nada no produto fala com gateway direto. Tudo passa pela interface
[`PaymentProvider`](src/domains/billing/provider.ts):

```ts
interface PaymentProvider {
  createCheckout(params): Promise<CreateCheckoutResult>;
  verifyWebhook(rawBody, headers): Promise<WebhookOutcome>;
  cancelSubscription(id): Promise<void>;
  getSubscription(id): Promise<RemoteSubscription | null>;
}
```

### Planos

Três planos recorrentes, definidos em [`src/config/pricing.ts`](src/config/pricing.ts)
— o único lugar do código que sabe quanto o produto custa:

| Plano | Preço | Cobra a cada | Equivale a | Variável do Price ID |
| --- | --- | --- | --- | --- |
| Mensal | R$ 20,90 | 1 mês | R$ 20,90/mês | `STRIPE_PRICE_MONTHLY_ID` |
| Trimestral | R$ 54,90 | 3 meses | R$ 18,30/mês | `STRIPE_PRICE_QUARTERLY_ID` |
| Anual | R$ 229,90 | 12 meses | R$ 19,16/mês | `STRIPE_PRICE_YEARLY_ID` |

Os três dão exatamente o mesmo produto; muda só a periodicidade da cobrança.

O navegador escolhe **qual** plano — nunca quanto ele custa. O `/api/checkout`
aceita apenas um id do catálogo (`z.enum(planIds)`) e busca o preço no servidor.

Selo de economia só aparece quando existe economia de verdade.
`savingsVsMonthlyCents` compara o plano com pagar mensal pelo mesmo período:
R$ 7,80 no trimestral (R$ 54,90 contra 3 × R$ 20,90 = R$ 62,70) e R$ 20,90 no
anual (R$ 229,90 contra 12 × R$ 20,90 = R$ 250,80 — um mês de graça). A função
devolve valor **negativo** se um preço futuro ficar acima do mensal equivalente,
e a UI checa o sinal antes de renderizar o selo: nunca anuncia desconto que não
existe.

Quando o gateway não informa o fim do período, ele é derivado do plano
(`periodEndFor`). Um fallback fixo de 31 dias expiraria um assinante anual
depois de um mês.

Estados da assinatura: `pending`, `active`, `past_due`, `canceled`, `expired`.

### Fluxo de compra

```
landing → /checkout (e-mail) → gateway → webhook verificado
       → status "paid" gravado no banco → criar senha → onboarding → /app
```

O navegador **nunca** decide que houve pagamento. A página de retorno consulta
a nossa API, que devolve o que o webhook verificado gravou.

### Desenvolvimento

`PAYMENT_PROVIDER=mock` habilita um gateway simulado em
`/checkout/simulado/[id]`. Ao aprovar, ele gera um evento **assinado com HMAC**
e o empurra pela mesma verificação de assinatura e pela mesma trava de
idempotência de um webhook real.

Duas travas impedem isso em produção: `getPaymentProvider` lança exceção para
provider mock quando `APP_ENV=production`, e a rota simulada devolve 404.

### Stripe

[`stripe.ts`](src/domains/billing/providers/stripe.ts) está completo (checkout,
verificação de assinatura com tolerância de 5 min, cancelamento, consulta), via
`fetch` para rodar em Workers. Fica **inerte** até existirem
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e o Price ID do plano que está
sendo vendido — sem eles lança `not_configured` **nomeando a variável que
falta**, em vez de inventar comportamento.

Os preços são por plano, então uma conta parcialmente configurada vende os
planos que já têm Price ID e recusa os outros, em vez de cobrar o valor errado.

**Webhook:** `POST /api/webhooks/payment/stripe`

Eventos processados:

| Evento | O que faz |
| --- | --- |
| `checkout.session.completed` | Marca o checkout como pago e guarda `customer`, `subscription` e o `plan_id` dos metadados. É o que libera a criação da conta. |
| `customer.subscription.updated` | Atualiza status, fim do período e `cancel_at_period_end`. |
| `customer.subscription.deleted` | Mesma rota; o status do objeto vira `canceled`. |
| `invoice.payment_failed` | Marca a assinatura como `past_due`. |

Qualquer outro evento é registrado como `ignored` e **não altera nada**.

---

## E-mail

Duas implementações, e nenhuma delas mente:

- `console` (padrão em dev): **não envia nada**. Grava em `email_outbox`,
  imprime o conteúdo no log e devolve `delivered: false`.
- `resend`: envia de verdade. Sem `RESEND_API_KEY` devolve `not_configured`.

Quando o convite de parceiro depende de e-mail e o envio não está configurado,
a interface diz isso e oferece o link para você mandar por conta própria.

---

## PWA

- Manifest em [`src/app/manifest.ts`](src/app/manifest.ts): `standalone`,
  `start_url: /app`, atalhos, ícones normais e maskable.
- Ícones gerados por código: `npm run icons`
  ([`scripts/generate-icons.mjs`](scripts/generate-icons.mjs) desenha o símbolo
  e codifica PNG com `node:zlib`, sem dependência nativa).
- Service worker em [`public/sw.js`](public/sw.js), registrado só em produção.

**Política de cache, deliberadamente conservadora:** o app shell (`/_next/static`,
ícones, imagens) é cacheado; **toda** resposta de `/api/*` e **toda** página
autenticada é network-only. Saldo servido de cache velho é pior que erro. Sem
rede, uma navegação cai na página `/offline`, que não mostra número nenhum.

---

## Testes

```bash
npm test              # 129 testes de unidade e integração
npm run smoke         # 105 verificações HTTP de ponta a ponta
npm run browser:check # console, exceções e imagens quebradas em cada tela
```

### Unidade e integração (Vitest)

Rodam contra **as migrations reais** em um SQLite em memória, então índices e
constraints são exercitados de verdade.

| Arquivo | Cobre |
| --- | --- |
| `tests/unit/money.test.ts` | centavos, formatação pt-BR, parsing de "1.234,56" |
| `tests/unit/cycle-math.test.ts` | geometria do ciclo, dia de vencimento, fuso |
| `tests/unit/assistant.test.ts` | parser local, rejeição de saída inválida do modelo |
| `tests/integration/financial-engine.test.ts` | saldo, livre para gastar negativo, edição, exclusão, recorrência idempotente, virada de ciclo |
| `tests/integration/tenant-isolation.test.ts` | acesso cruzado entre casais, papéis, limite de 2 pessoas, gate de assinatura |
| `tests/integration/cycle-realignment.test.ts` | mudança do dia do ciclo sem ciclos sobrepostos |

### Fumaça (`scripts/smoke.sh`)

105 verificações que percorrem o cenário inteiro do produto: landing →
checkout → webhook → criação de conta → onboarding → painel → assistente →
movimentos → recorrências → metas → convite do parceiro → troca forçada de
senha → dados compartilhados → isolamento entre casais → logout.

```bash
npm run dev
BASE=http://localhost:3000 npm run smoke
```

### Varredura de navegador (`scripts/browser-check.mjs`)

Abre cada tela em um Chrome headless com uma sessão real e falha se houver erro
de console, exceção não tratada, erro de hidratação, requisição quebrada ou
imagem que não carregou. Sem dependências: usa o WebSocket nativo do Node para
falar o protocolo do DevTools.

```bash
curl -s -c jar -X POST -H 'Content-Type: application/json' \
  -d '{"email":"ana@exemplo.com","password":"demo123456"}' \
  http://localhost:3000/api/auth/sign-in/email > /dev/null

npm run browser:check -- http://localhost:3000 "$(grep session_token jar | awk '{print $NF}')"
```

---

## Build e deploy

```bash
npm run check      # lint + typecheck + testes + build
npm run cf:build   # bundle do Worker (.open-next/worker.js)
```

### Primeiro deploy

```bash
# 1. Autenticar
npx wrangler login

# 2. Criar os bancos
npx wrangler d1 create saldo-a-dois-db
npx wrangler d1 create saldo-a-dois-db-preview
#    Copie os database_id para wrangler.jsonc (produção e preview).

# 3. Segredos (repita para --env preview)
npx wrangler secret put BETTER_AUTH_SECRET --env production
npx wrangler secret put BETTER_AUTH_URL --env production
npx wrangler secret put NEXT_PUBLIC_APP_URL --env production
npx wrangler secret put ADMIN_EMAILS --env production
npx wrangler secret put STRIPE_SECRET_KEY --env production
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production
npx wrangler secret put STRIPE_PRICE_MONTHLY_ID --env production
npx wrangler secret put STRIPE_PRICE_QUARTERLY_ID --env production
npx wrangler secret put STRIPE_PRICE_YEARLY_ID --env production
npx wrangler secret put RESEND_API_KEY --env production
npx wrangler secret put EMAIL_FROM --env production

# 4. Migrations
npm run db:migrate:remote

# 5. Subir
npm run cf:deploy

# 6. Webhook no painel do Stripe
#    https://SEU-DOMINIO/api/webhooks/payment/stripe
#    Eventos: checkout.session.completed, customer.subscription.updated,
#             customer.subscription.deleted, invoice.payment_failed
```

Ambientes: `development` (local), `preview` (`npm run cf:preview`) e
`production` (`npm run cf:deploy`). Cada um com seu D1 e seus segredos.

---

## Estrutura de pastas

```
src/
├── app/                     rotas (App Router)
│   ├── page.tsx             landing
│   ├── (auth)               entrar, esqueci-senha, redefinir-senha, trocar-senha
│   ├── checkout/            compra, gateway simulado, retorno
│   ├── onboarding/          configuração inicial em 6 passos
│   ├── app/                 área assinante: hoje, chat, movimentos,
│   │                        planejamento, casal, relatório, conta
│   ├── admin/               métricas agregadas
│   └── api/                 back-end (Route Handlers)
├── components/
│   ├── ui/                  design system
│   ├── app/                 telas do produto
│   ├── marketing/           landing
│   ├── auth/  checkout/  onboarding/  pwa/
├── config/                  marca, preço  ← trocar branding é só aqui
├── db/                      schema Drizzle, cliente D1, batching
├── domains/
│   ├── auth/                sessão e instância do Better Auth
│   ├── billing/             providers, assinatura, webhooks
│   ├── households/          multi-tenancy, membros, convites, categorias
│   ├── cycles/              matemática do ciclo e serviço
│   ├── financial-engine/    ⭐ a verdade financeira (puro)
│   ├── transactions/        movimentos
│   ├── recurrences/         contas e receitas que se repetem
│   ├── goals/               metas e aportes
│   ├── assistant/           parser, providers de IA, interpretador, executor
│   ├── analytics/           eventos de produto e auditoria
│   ├── admin/               métricas agregadas
│   └── notifications/       e-mail
├── lib/                     dinheiro, datas, ids, erros, hooks
├── server/                  contexto Cloudflare, contexto do app, helpers HTTP
└── middleware.ts            gate barato antes da área logada
```

---

## Decisões de arquitetura

### O motor financeiro é puro

[`engine.ts`](src/domains/financial-engine/engine.ts) recebe números e devolve
números: sem banco, sem relógio, sem React. É o único lugar que decide o que
"livre para gastar" significa. Isso é o que torna o comportamento testável sem
mock nenhum — e o que impede regra financeira de vazar para dentro de
componente.

### Isolamento entre casais é estrutural, não uma checagem

Nenhuma rota aceita `household_id` do cliente. `getAppContext()` resolve o
household **a partir da sessão**; a partir daí toda query filtra por ele. Não
existe caminho onde alguém troca um id na URL — não porque lembramos de checar,
mas porque o id nunca vem de fora.

### Virada de ciclo não apaga nada

O ciclo que termina é **fechado** com um snapshot do saldo, e esse snapshot vira
a abertura do próximo. Editar um movimento de um ciclo passado recalcula as
aberturas seguintes em cascata. Mudar o dia de início do ciclo realinha: um
ciclo vazio desalinhado é descartado, um que já tem movimentos é fechado — nunca
ficam dois ciclos cobrindo o mesmo dia.

### Guardar dinheiro não muda o "livre para gastar"

Um aporte em meta cria um movimento `reserve`: o saldo cai e a reserva pendente
cai no mesmo valor. Guardar não é gastar, mas também não é sobra.

### Workers AI só em preview/produção

Workers AI não tem emulação local: o wrangler faz proxy para a Cloudflare e
exige `CLOUDFLARE_API_TOKEN`. Com o binding no nível raiz do `wrangler.jsonc`,
`next dev` quebrava para quem não tem token — e derrubava o D1 junto. O binding
vive só nos ambientes `preview` e `production`; localmente o assistente roda no
parser determinístico.

### Inserts em lote respeitam o limite do D1

O D1 aceita no máximo 100 parâmetros por statement. Um insert de 20 categorias
× 11 colunas estoura isso silenciosamente. Todo insert em lote passa por
[`chunkRows`](src/db/batch.ts), que divide pelo orçamento real de parâmetros.

### O bundle tem que caber em 3 MB

O plano gratuito do Cloudflare Workers limita o script a **3 MB comprimido**
(o pago vai a 10 MB). O bundle atual está em **~2,6 MB gzip**, então cabe — mas
a margem é pequena e fácil de perder.

O que já custou 1,1 MB: um `import * as Icons from 'lucide-react'` usado para
resolver ícone por nome. O curinga anula o tree-shaking e arrasta o pacote
inteiro. Por isso os ícones de categoria vivem num registro explícito em
[`category-icons.ts`](src/components/ui/category-icons.ts): adicionar categoria
significa adicionar o ícone lá.

Antes de subir, confira o tamanho:

```bash
npm run cf:build
npx wrangler deploy --dry-run --env production   # veja a linha "Total Upload ... gzip"
```

### O 307 nos prefetches RSC é do Next, não nosso

Todo prefetch `?_rsc=<hash>` recebe um 307 que normaliza a URL para `?_rsc`.
Isso acontece igual no `next start` puro, no `wrangler dev` local e em
produção — é comportamento do Next 16, não do adaptador nem da Cloudflare.
Custa um round trip a mais por prefetch e não quebra navegação alguma.

### ESLint fixado no 9.x

O `eslint-plugin-react` embutido no `eslint-config-next` 16 ainda usa
`context.getFilename()`, removido no ESLint 10. Subir para o 10 quebra o lint
inteiro, independente da nossa configuração.

---

## Pendências e limitações conhecidas

**Já feito:** Worker publicado, D1 de produção criado e migrado (25 tabelas),
segredos de autenticação configurados (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`NEXT_PUBLIC_APP_URL`, `ADMIN_EMAILS`), Preview URLs desligadas.

**Ainda precisa de credencial sua:**

1. **Gateway de pagamento.** O Stripe está implementado mas inerte. Faltam
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e os três Price IDs
   (`STRIPE_PRICE_MONTHLY_ID`, `STRIPE_PRICE_QUARTERLY_ID`,
   `STRIPE_PRICE_YEARLY_ID`), além de cadastrar o webhook. **Consequência hoje: ninguém consegue criar conta em produção** —
   por desenho, o provider mock é recusado quando `APP_ENV=production` e o
   `/api/checkout` responde 503 dizendo exatamente quais chaves faltam.
2. **Envio de e-mail.** Falta `RESEND_API_KEY`. Sem ela, recuperação de senha e
   convite por link não saem — e o app avisa isso em vez de fingir que enviou.
3. **Domínio próprio (opcional).** `src/config/branding.ts` centraliza nome,
   e-mail de suporte, domínio e cores.

**Limitações assumidas nesta versão:**

- Sem Open Finance, sem Pix, sem app nativo — como especificado.
- O rate limit do próprio Better Auth usa memória; em Workers isso não persiste
  entre isolates. As rotas que mais importam (checkout, claim, assistente,
  troca de senha, exclusão de conta) têm rate limit próprio em D1.
- `drizzle-kit` traz um `esbuild` antigo com CVE conhecida. É dependência de
  desenvolvimento e a falha só afeta o dev server do próprio esbuild; não vai
  para o bundle de produção.
- Política de Privacidade e Termos de Uso estão escritos e sinalizados como
  **pendentes de revisão jurídica** antes do lançamento comercial.
- Relatório compara com o ciclo anterior; não há histórico longo com gráfico de
  série temporal.
- O OpenNext avisa que Windows não é plenamente suportado; o build funciona,
  mas para CI use Linux.

**O que já foi verificado de ponta a ponta:** ver [Testes](#testes). A suíte de
fumaça roda contra o runtime real (workerd + D1) e cobre o cenário completo,
inclusive as tentativas de acesso entre casais.
