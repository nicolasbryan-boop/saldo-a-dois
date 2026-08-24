#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# End-to-end smoke test against a running dev server.
#
# Walks the exact scenario from the product spec: landing -> checkout -> account
# -> onboarding -> dashboard -> assistant -> partner invite -> partner login ->
# forced password change -> shared data -> tenant isolation -> logout.
#
#   npm run dev                 # in one terminal
#   BASE=http://localhost:3000 bash scripts/smoke.sh
# ---------------------------------------------------------------------------
set -uo pipefail

BASE="${BASE:-http://localhost:3210}"
JAR_DIR="$(mktemp -d)"
OWNER_JAR="$JAR_DIR/owner.txt"
PARTNER_JAR="$JAR_DIR/partner.txt"
SEED_JAR="$JAR_DIR/seed.txt"

STAMP="$(date +%s)"
OWNER_EMAIL="casal+$STAMP@exemplo.test"
PARTNER_EMAIL="parceiro+$STAMP@exemplo.test"
OWNER_PASSWORD="senhaForte123"
PARTNER_TEMP="TempSenha123"
PARTNER_NEW="NovaSenha456"

PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ $# -gt 1 ] && printf '        %s\n' "$2"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# check <label> <haystack> <needle>
check() {
  if printf '%s' "$2" | grep -qF -- "$3"; then ok "$1"; else bad "$1" "esperava conter: $3 | recebeu: $(printf '%s' "$2" | head -c 300)"; fi
}

# check_status <label> <url> <expected> [jar]
check_status() {
  local label="$1" url="$2" expected="$3" jar="${4:-}"
  local code
  if [ -n "$jar" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -b "$jar" "$url")
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  fi
  if [ "$code" = "$expected" ]; then ok "$label ($code)"; else bad "$label" "esperava $expected, recebeu $code de $url"; fi
}

# Writes a JSON body to $1 using \u escapes, so no shell encoding is
# involved: this shell mangles non-ASCII bytes passed inline to `curl -d`.
write_body() {
  node -e "require('fs').writeFileSync(process.argv[1], process.argv[2])" "$1" "$2"
}

json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const v=process.argv[1].split('.').reduce((a,k)=>a?.[k],j);console.log(v===undefined?'':v)}catch{console.log('')}})" "$1"; }

# ---------------------------------------------------------------------------
step '1. Landing e páginas públicas'

HOME=$(curl -s "$BASE/")
check 'landing carrega a headline principal' "$HOME" 'Vocês ganham dinheiro'
check 'landing mostra o preço' "$HOME" 'R$ 20,90'
check 'landing tem o FAQ' "$HOME" 'Preciso conectar minha conta bancária?'
check 'landing referencia as fotos locais' "$HOME" '/images/casal-contas.jpg'

check_status 'imagem casal-contas responde' "$BASE/images/casal-contas.jpg" 200
check_status 'imagem casal-planejando responde' "$BASE/images/casal-planejando.jpg" 200
check_status 'imagem casal-cozinha responde' "$BASE/images/casal-cozinha.jpg" 200
check_status 'imagem casal-danca responde' "$BASE/images/casal-danca.jpg" 200
check_status 'imagem casal-sofa responde' "$BASE/images/casal-sofa.jpg" 200
check_status 'ícone 192 responde' "$BASE/icons/icon-192.png" 200
check_status 'ícone 512 responde' "$BASE/icons/icon-512.png" 200
check_status 'apple touch icon responde' "$BASE/icons/apple-touch-icon.png" 200
check_status 'service worker responde' "$BASE/sw.js" 200
check_status 'manifest responde' "$BASE/manifest.webmanifest" 200
check_status 'política de privacidade' "$BASE/privacidade" 200
check_status 'termos de uso' "$BASE/termos" 200
check_status 'página de login' "$BASE/entrar" 200
check_status 'página offline' "$BASE/offline" 200
check_status 'rota inexistente devolve 404' "$BASE/pagina-que-nao-existe" 404

check 'landing mostra o plano trimestral' "$HOME" 'R$ 54,90'
check 'landing mostra o plano anual' "$HOME" 'R$ 229,90'
check 'landing liga o CTA ao plano' "$HOME" '/checkout?plano=anual'

CHECKOUT_PAGE=$(curl -s "$BASE/checkout")
check 'checkout oferece o mensal' "$CHECKOUT_PAGE" 'R$ 20,90'
check 'checkout oferece o trimestral' "$CHECKOUT_PAGE" 'R$ 54,90'
check 'checkout oferece o anual' "$CHECKOUT_PAGE" 'R$ 229,90'
check 'checkout mostra o equivalente mensal do anual' "$CHECKOUT_PAGE" 'R$ 19,16'

MANIFEST=$(curl -s "$BASE/manifest.webmanifest")
check 'manifest usa display standalone' "$MANIFEST" '"display":"standalone"'
check 'manifest tem ícone maskable' "$MANIFEST" 'maskable'
check 'manifest abre no app' "$MANIFEST" '"start_url":"/app"'

# ---------------------------------------------------------------------------
step '2. Área logada bloqueada para anônimos'

APP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/app")
if [ "$APP_CODE" = "307" ] || [ "$APP_CODE" = "302" ]; then ok "/app redireciona anônimo ($APP_CODE)"; else bad '/app deveria redirecionar anônimo' "recebeu $APP_CODE"; fi

TX_ANON=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/transactions")
if [ "$TX_ANON" = "401" ]; then ok 'API de movimentos exige sessão (401)'; else bad 'API de movimentos deveria devolver 401' "recebeu $TX_ANON"; fi

ASSIST_ANON=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"message":"oi"}' "$BASE/api/assistant")
if [ "$ASSIST_ANON" = "401" ]; then ok 'API do assistente exige sessão (401)'; else bad 'API do assistente deveria devolver 401' "recebeu $ASSIST_ANON"; fi

ADMIN_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")
if [ "$ADMIN_CODE" = "307" ] || [ "$ADMIN_CODE" = "302" ]; then ok "/admin redireciona anônimo ($ADMIN_CODE)"; else bad '/admin deveria redirecionar anônimo' "recebeu $ADMIN_CODE"; fi

# ---------------------------------------------------------------------------
step '3. Planos: cada um grava o próprio preço'

for entry in "mensal:2090" "trimestral:5490" "anual:22990"; do
  PLAN="${entry%%:*}"
  CENTS="${entry##*:}"
  RESP=$(curl -s -X POST -H 'Content-Type: application/json'     -d "{\"email\":\"plano-$PLAN-$STAMP@exemplo.test\",\"planId\":\"$PLAN\"}" "$BASE/api/checkout")
  PID=$(printf '%s' "$RESP" | json checkoutId)
  DETAIL=$(curl -s "$BASE/api/checkout/$PID")
  GOT=$(printf '%s' "$DETAIL" | json amountCents)
  GOTPLAN=$(printf '%s' "$DETAIL" | json planId)
  if [ "$GOT" = "$CENTS" ] && [ "$GOTPLAN" = "$PLAN" ]; then
    ok "plano $PLAN grava $CENTS centavos"
  else
    bad "plano $PLAN gravou errado" "esperava $PLAN/$CENTS, recebeu $GOTPLAN/$GOT"
  fi
done

BAD_PLAN=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json'   -d "{\"email\":\"invalido-$STAMP@exemplo.test\",\"planId\":\"vitalicio\"}" "$BASE/api/checkout")
if [ "$BAD_PLAN" = "422" ]; then ok 'plano fora do catálogo é recusado (422)'; else bad 'plano inválido deveria falhar' "recebeu $BAD_PLAN"; fi

TAMPER=$(curl -s -X POST -H 'Content-Type: application/json'   -d "{\"email\":\"adulterado-$STAMP@exemplo.test\",\"planId\":\"anual\",\"amountCents\":1}" "$BASE/api/checkout")
TID=$(printf '%s' "$TAMPER" | json checkoutId)
TAMOUNT=$(curl -s "$BASE/api/checkout/$TID" | json amountCents)
if [ "$TAMOUNT" = "22990" ]; then ok 'preço enviado pelo cliente é ignorado'; else bad 'cliente conseguiu definir o preço' "recebeu $TAMOUNT"; fi

# /api/checkout allows 10 calls per 10 minutes per IP. This suite spends 6 of
# them, so it stays re-runnable — but not back to back within the window.

# ---------------------------------------------------------------------------
step '4. Checkout'

CHECKOUT=$(curl -s -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$OWNER_EMAIL\"}" "$BASE/api/checkout")
CHECKOUT_ID=$(printf '%s' "$CHECKOUT" | json checkoutId)
CHECKOUT_URL=$(printf '%s' "$CHECKOUT" | json url)

if [ -n "$CHECKOUT_ID" ]; then ok "checkout criado ($CHECKOUT_ID)"; else bad 'não foi possível criar o checkout' "$CHECKOUT"; exit 1; fi
check 'checkout aponta para o gateway simulado' "$CHECKOUT_URL" '/checkout/simulado/'

STATUS_BEFORE=$(curl -s "$BASE/api/checkout/$CHECKOUT_ID" | json status)
if [ "$STATUS_BEFORE" = "pending" ]; then ok 'checkout começa como pending'; else bad 'checkout deveria começar pending' "$STATUS_BEFORE"; fi

CLAIM_EARLY=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"checkoutId\":\"$CHECKOUT_ID\",\"name\":\"Fraude\",\"password\":\"senhaForte123\"}" "$BASE/api/checkout/claim")
if [ "$CLAIM_EARLY" = "409" ]; then ok 'não dá para criar conta antes do pagamento (409)'; else bad 'claim antes do pagamento deveria falhar' "recebeu $CLAIM_EARLY"; fi

BAD_SIG=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -H 'x-mock-signature: 00' -d '{"id":"evt_falso","type":"checkout.paid","checkoutId":"'"$CHECKOUT_ID"'"}' \
  "$BASE/api/webhooks/payment/mock")
if [ "$BAD_SIG" = "403" ]; then ok 'webhook com assinatura inválida é recusado (403)'; else bad 'webhook forjado deveria devolver 403' "recebeu $BAD_SIG"; fi

STILL_PENDING=$(curl -s "$BASE/api/checkout/$CHECKOUT_ID" | json status)
if [ "$STILL_PENDING" = "pending" ]; then ok 'webhook forjado não alterou o pagamento'; else bad 'webhook forjado alterou o estado' "$STILL_PENDING"; fi

PAY=$(curl -s -X POST "$BASE/api/checkout/simulado/$CHECKOUT_ID")
check 'pagamento simulado processado' "$PAY" '"reason":"processed"'

PAY_AGAIN=$(curl -s -X POST "$BASE/api/checkout/simulado/$CHECKOUT_ID")
check 'webhook repetido é idempotente' "$PAY_AGAIN" '"reason":"duplicate"'

STATUS_AFTER=$(curl -s "$BASE/api/checkout/$CHECKOUT_ID" | json status)
if [ "$STATUS_AFTER" = "paid" ]; then ok 'checkout confirmado pelo servidor'; else bad 'checkout deveria estar paid' "$STATUS_AFTER"; fi

# ---------------------------------------------------------------------------
step '5. Criação da conta'

CLAIM=$(curl -s -c "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"checkoutId\":\"$CHECKOUT_ID\",\"name\":\"Ana Teste\",\"password\":\"$OWNER_PASSWORD\"}" \
  "$BASE/api/checkout/claim")
check 'conta criada e redireciona ao onboarding' "$CLAIM" '/onboarding'

if grep -q 'session_token' "$OWNER_JAR"; then ok 'cookie de sessão recebido'; else bad 'nenhum cookie de sessão foi definido'; fi

CLAIM_TWICE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"checkoutId\":\"$CHECKOUT_ID\",\"name\":\"Outro\",\"password\":\"outraSenha123\"}" "$BASE/api/checkout/claim")
if [ "$CLAIM_TWICE" = "409" ]; then ok 'o mesmo checkout não vira duas contas (409)'; else bad 'claim duplicado deveria falhar' "recebeu $CLAIM_TWICE"; fi

check_status 'onboarding acessível' "$BASE/onboarding" 200 "$OWNER_JAR"

APP_BEFORE_ONBOARDING=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" "$BASE/app")
if [ "$APP_BEFORE_ONBOARDING" = "307" ]; then ok '/app redireciona para o onboarding pendente (307)'; else bad '/app deveria redirecionar antes do onboarding' "recebeu $APP_BEFORE_ONBOARDING"; fi

# ---------------------------------------------------------------------------
step '6. Onboarding financeiro'

ONBOARD=$(curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' -d '{
  "householdName": "Ana & Lucas",
  "cycleStartDay": 5,
  "openingBalanceCents": 845000,
  "monthlyReserveCents": 100000,
  "incomes": [
    { "name": "Salário da Ana", "amountCents": 450000, "dayOfMonth": 5 },
    { "name": "Salário do Lucas", "amountCents": 500000, "dayOfMonth": 5 }
  ],
  "bills": [
    { "name": "Aluguel", "amountCents": 185000, "dayOfMonth": 10 },
    { "name": "Energia", "amountCents": 32000, "dayOfMonth": 12 },
    { "name": "Internet", "amountCents": 12000, "dayOfMonth": 15 },
    { "name": "Escola", "amountCents": 80000, "dayOfMonth": 20 },
    { "name": "Academia", "amountCents": 24000, "dayOfMonth": 25 }
  ],
  "goal": { "name": "Reserva de emergência", "targetCents": 2000000 }
}' "$BASE/api/onboarding")
check 'onboarding concluído' "$ONBOARD" '"ok":true'

# ---------------------------------------------------------------------------
step '7. Dashboard'

DASH=$(curl -s -b "$OWNER_JAR" "$BASE/app")
check 'dashboard mostra a métrica principal' "$DASH" 'Livre para gastar'
check 'dashboard mostra o nome do espaço' "$DASH" 'Ana &amp; Lucas'
check 'saldo atual reflete o onboarding' "$DASH" 'R$ 8.450,00'
check 'comprometido soma as contas do ciclo' "$DASH" 'R$ 3.330,00'
check 'livre para gastar calculado' "$DASH" 'R$ 4.120,00'
check 'saldo é apresentado como registrado no app' "$DASH" 'Registrado no Saldo a Dois'
check 'dashboard sugere registrar o primeiro gasto' "$DASH" 'Registrar primeiro gasto'

# ---------------------------------------------------------------------------
step '8. Assistente'

CHAT1=$(curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"message":"Gastei 120 no mercado"}' "$BASE/api/assistant")
check 'assistente registra o gasto' "$CHAT1" 'Mercado registrado'
check 'valor interpretado corretamente' "$CHAT1" 'R$ 120,00'
check 'resolvido sem chamar IA' "$CHAT1" '"resolvedBy":"rules"'
check 'ação correta' "$CHAT1" '"actionType":"create_expense"'
check 'zero tokens consumidos' "$CHAT1" '"tokensUsed":0'

CHAT2=$(curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"message":"Quanto ainda posso gastar?"}' "$BASE/api/assistant")
check 'consulta de saldo livre responde' "$CHAT2" 'livres'
check 'saldo livre já desconta o gasto' "$CHAT2" 'R$ 4.000,00'
check 'consulta não chama IA' "$CHAT2" '"resolvedBy":"rules"'

CHAT3=$(curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"message":"Quais contas faltam pagar?"}' "$BASE/api/assistant")
check 'lista de contas pendentes' "$CHAT3" 'Aluguel'

write_body "$JAR_DIR/chat4.json" '{"message":"D\u00e1 pra gastar 500 hoje?"}'
CHAT4=$(curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  --data-binary "@$JAR_DIR/chat4.json" "$BASE/api/assistant")
check 'projeção de gasto responde' "$CHAT4" 'ficam com'
check 'projeção usa o número real' "$CHAT4" 'R$ 3.500,00'

CHAT_BAD=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"message":""}' "$BASE/api/assistant")
if [ "$CHAT_BAD" = "422" ]; then ok 'mensagem vazia é rejeitada (422)'; else bad 'mensagem vazia deveria falhar' "recebeu $CHAT_BAD"; fi

# ---------------------------------------------------------------------------
step '9. Movimentos: criar, editar, excluir'

TX_LIST=$(curl -s -b "$OWNER_JAR" "$BASE/api/transactions")
check 'gasto do assistente aparece na lista' "$TX_LIST" 'Mercado'

TX_NEW=$(curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"type":"expense","amountCents":8900,"description":"Gasolina"}' "$BASE/api/transactions")
TX_ID=$(printf '%s' "$TX_NEW" | json transaction.id)
if [ -n "$TX_ID" ]; then ok "movimento manual criado ($TX_ID)"; else bad 'não foi possível criar movimento' "$TX_NEW"; fi

TX_INVALID=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"type":"expense","amountCents":-500,"description":"Negativo"}' "$BASE/api/transactions")
if [ "$TX_INVALID" = "422" ]; then ok 'valor negativo é rejeitado (422)'; else bad 'valor negativo deveria falhar' "recebeu $TX_INVALID"; fi

TX_FRACTION=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"type":"expense","amountCents":12.5,"description":"Fracionado"}' "$BASE/api/transactions")
if [ "$TX_FRACTION" = "422" ]; then ok 'valor fracionado é rejeitado (422)'; else bad 'valor fracionado deveria falhar' "recebeu $TX_FRACTION"; fi

DASH_AFTER=$(curl -s -b "$OWNER_JAR" "$BASE/app")
check 'livre para gastar recalculado após os gastos' "$DASH_AFTER" 'R$ 3.911,00'

TX_EDIT=$(curl -s -b "$OWNER_JAR" -X PATCH -H 'Content-Type: application/json' \
  -d '{"amountCents":10000}' "$BASE/api/transactions/$TX_ID")
check 'movimento editado' "$TX_EDIT" '"amountCents":10000'

DASH_EDITED=$(curl -s -b "$OWNER_JAR" "$BASE/app")
check 'edição recalcula o livre para gastar' "$DASH_EDITED" 'R$ 3.900,00'

curl -s -b "$OWNER_JAR" -X DELETE "$BASE/api/transactions/$TX_ID" > /dev/null
DASH_DELETED=$(curl -s -b "$OWNER_JAR" "$BASE/app")
check 'exclusão recalcula o livre para gastar' "$DASH_DELETED" 'R$ 4.000,00'

# ---------------------------------------------------------------------------
step '10. Recorrências'

INSTANCES=$(curl -s -b "$OWNER_JAR" "$BASE/app/planejamento")
check 'contas do ciclo materializadas' "$INSTANCES" 'Aluguel'

# Reloading the dashboard several times must not duplicate any occurrence.
for _ in 1 2 3; do curl -s -o /dev/null -b "$OWNER_JAR" "$BASE/app"; done
PENDING_COUNT=$(curl -s -b "$OWNER_JAR" "$BASE/app" | grep -o 'contas em aberto' | head -1)
DASH_STABLE=$(curl -s -b "$OWNER_JAR" "$BASE/app")
check 'recorrências não duplicam após vários acessos' "$DASH_STABLE" 'R$ 3.330,00'
[ -n "$PENDING_COUNT" ] && ok 'contagem de contas em aberto exibida'

# ---------------------------------------------------------------------------
step '11. Metas'

GOAL=$(curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"name":"Viagem","targetCents":800000,"monthlyPlanCents":50000}' "$BASE/api/goals")
GOAL_ID=$(printf '%s' "$GOAL" | json goal.id)
if [ -n "$GOAL_ID" ]; then ok "meta criada ($GOAL_ID)"; else bad 'não foi possível criar a meta' "$GOAL"; fi

FREE_BEFORE_RESERVE=$(curl -s -b "$OWNER_JAR" "$BASE/app")
curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"amountCents":50000}' "$BASE/api/goals/$GOAL_ID/aportes" > /dev/null
FREE_AFTER_RESERVE=$(curl -s -b "$OWNER_JAR" "$BASE/app")

check 'guardar reduz o saldo' "$FREE_AFTER_RESERVE" 'R$ 7.830,00'
check 'guardar não muda o livre para gastar' "$FREE_AFTER_RESERVE" 'R$ 4.000,00'
printf '%s' "$FREE_BEFORE_RESERVE" | grep -qF 'R$ 4.000,00' && ok 'livre para gastar estável antes e depois do aporte'

# ---------------------------------------------------------------------------
step '12. Convite do parceiro'

INVITE=$(curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"name\":\"Lucas Teste\",\"email\":\"$PARTNER_EMAIL\"}" \
  "$BASE/api/household/parceiro")
check 'convite criado por link' "$INVITE" '"kind":"link"'

INVITE_URL=$(printf '%s' "$INVITE" | json inviteUrl)
INVITE_TOKEN="$(basename "$INVITE_URL")"
if [ -n "$INVITE_TOKEN" ]; then ok 'convite trouxe um token'; else bad 'convite sem token' "$INVITE"; fi

# The owner never learns the partner's password, so nothing in this response
# may be usable to sign in.
if printf '%s' "$INVITE" | grep -qi 'password'; then
  bad 'resposta do convite vazou algo de senha' "$INVITE"
else
  ok 'convite não expõe senha nenhuma'
fi

THIRD=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"name\":\"Terceiro\",\"email\":\"terceiro+$STAMP@exemplo.test\"}" \
  "$BASE/api/household/parceiro")
if [ "$THIRD" = "409" ]; then ok 'terceira pessoa é recusada pelo limite do plano (409)'; else bad 'limite de 2 pessoas deveria bloquear' "recebeu $THIRD"; fi

# ---------------------------------------------------------------------------
step '13. Primeiro acesso do parceiro'

SHORT_PW=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"token\":\"$INVITE_TOKEN\",\"password\":\"curta\"}" "$BASE/api/convite/criar-conta")
if [ "$SHORT_PW" = "422" ]; then ok 'senha curta é recusada (422)'; else bad 'senha curta deveria falhar' "recebeu $SHORT_PW"; fi

CREATED=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"token\":\"$INVITE_TOKEN\",\"password\":\"$PARTNER_NEW\"}" "$BASE/api/convite/criar-conta")
check 'parceiro cria a própria conta pelo token' "$CREATED" '"ok":true'

REUSE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"token\":\"$INVITE_TOKEN\",\"password\":\"OutraSenha789\"}" "$BASE/api/convite/criar-conta")
if [ "$REUSE" != "201" ]; then ok "token do convite não pode ser reutilizado ($REUSE)"; else bad 'token do convite foi aceito duas vezes'; fi

curl -s -c "$PARTNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PARTNER_EMAIL\",\"password\":\"$PARTNER_NEW\"}" \
  "$BASE/api/auth/sign-in/email" > /dev/null

if grep -q 'session_token' "$PARTNER_JAR"; then ok 'parceiro entra com a senha que escolheu'; else bad 'parceiro não conseguiu entrar'; fi

PARTNER_ONB=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$PARTNER_JAR" "$BASE/app")
check 'parceiro é levado ao próprio onboarding' "$PARTNER_ONB" '/onboarding'

PARTNER_WIZARD=$(curl -s -b "$PARTNER_JAR" "$BASE/onboarding")
check 'onboarding do parceiro deixa a regra explícita' "$PARTNER_WIZARD" 'Cadastre somente as suas receitas e os seus gastos'

PARTNER_ONBOARD=$(curl -s -b "$PARTNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"displayName":"Lucas Parceiro","incomes":[{"name":"Salario do Lucas","amountCents":300000,"dayOfMonth":5}],"bills":[{"name":"Academia do Lucas","amountCents":12000,"dayOfMonth":10}],"goal":null}' \
  "$BASE/api/onboarding")
check 'parceiro conclui o próprio onboarding' "$PARTNER_ONBOARD" '"ok":true'

REDO=$(curl -s -o /dev/null -w '%{http_code}' -b "$PARTNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"incomes":[],"bills":[],"goal":null}' "$BASE/api/onboarding")
if [ "$REDO" = "409" ]; then ok 'onboarding não pode ser refeito (409)'; else bad 'onboarding deveria ser único' "recebeu $REDO"; fi

PARTNER_DASH=$(curl -s -b "$PARTNER_JAR" "$BASE/app")
check 'parceiro vê o mesmo espaço' "$PARTNER_DASH" 'Ana &amp; Lucas'
check 'painel separa o dinheiro de cada um' "$PARTNER_DASH" 'Quem movimentou o quê'
check 'painel mostra o total do casal' "$PARTNER_DASH" 'Nós dois'

# ---------------------------------------------------------------------------
step '14. Dados compartilhados entre o casal'

curl -s -b "$PARTNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"message":"gastei 80 de gasolina"}' "$BASE/api/assistant" > /dev/null

OWNER_SEES=$(curl -s -b "$OWNER_JAR" "$BASE/api/transactions")
check 'dono enxerga o lançamento do parceiro' "$OWNER_SEES" 'Gasolina'

OWNER_DASH_SHARED=$(curl -s -b "$OWNER_JAR" "$BASE/app")
# The partner's own onboarding added their salary and their gym bill to the
# household, so this figure is no longer the single-person one.
OWNER_BALANCE=$(printf '%s' "$OWNER_DASH_SHARED" | grep -o 'R$ [0-9.]*,[0-9]*' | head -1)
if [ -n "$OWNER_BALANCE" ]; then ok "dono vê um saldo consolidado ($OWNER_BALANCE)"; else bad 'dashboard do dono sem saldo'; fi
check 'lançamento do parceiro aparece para o dono' "$OWNER_SEES" 'Gasolina'

# ---------------------------------------------------------------------------
step '15. Cada um só mexe no próprio dinheiro'

# The partner's own movement, created by the partner.
PARTNER_TX=$(curl -s -b "$PARTNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"type":"expense","amountCents":4500,"description":"Barbeiro do Lucas"}' "$BASE/api/transactions")
PARTNER_TX_ID=$(printf '%s' "$PARTNER_TX" | json transaction.id)
if [ -n "$PARTNER_TX_ID" ]; then ok 'parceiro lança o próprio gasto'; else bad 'parceiro não conseguiu lançar' "$PARTNER_TX"; fi

OWNER_TX=$(curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"type":"expense","amountCents":6500,"description":"Salao da Ana"}' "$BASE/api/transactions")
OWNER_TX_ID=$(printf '%s' "$OWNER_TX" | json transaction.id)
if [ -n "$OWNER_TX_ID" ]; then ok 'dono lança o próprio gasto'; else bad 'dono não conseguiu lançar' "$OWNER_TX"; fi

# Ownership is assigned by the server, from the session — not by the payload.
OWNER_MEMBER=$(printf '%s' "$OWNER_TX" | json transaction.memberId)
PARTNER_MEMBER=$(printf '%s' "$PARTNER_TX" | json transaction.memberId)
if [ -n "$OWNER_MEMBER" ] && [ "$OWNER_MEMBER" != "$PARTNER_MEMBER" ]; then
  ok 'cada lançamento nasce com o dono certo'
else
  bad 'lançamentos não foram atribuídos a pessoas diferentes' "dono=$OWNER_MEMBER parceiro=$PARTNER_MEMBER"
fi

# THE boundary: same household, different person.
EDIT_OTHER=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X PATCH -H 'Content-Type: application/json' \
  -d '{"amountCents":1}' "$BASE/api/transactions/$PARTNER_TX_ID")
if [ "$EDIT_OTHER" = "403" ]; then ok 'dono não edita o lançamento do parceiro (403)'; else bad 'dono conseguiu editar o lançamento do parceiro' "recebeu $EDIT_OTHER"; fi

DELETE_OTHER=$(curl -s -o /dev/null -w '%{http_code}' -b "$PARTNER_JAR" -X DELETE "$BASE/api/transactions/$OWNER_TX_ID")
if [ "$DELETE_OTHER" = "403" ]; then ok 'parceiro não exclui o lançamento do dono (403)'; else bad 'parceiro conseguiu excluir o lançamento do dono' "recebeu $DELETE_OTHER"; fi

LAUNDER=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X PATCH -H 'Content-Type: application/json' \
  -d "{\"memberId\":\"$PARTNER_MEMBER\"}" "$BASE/api/transactions/$OWNER_TX_ID")
if [ "$LAUNDER" = "403" ]; then ok 'não dá para transferir um lançamento para o parceiro (403)'; else bad 'lançamento foi transferido para o outro membro' "recebeu $LAUNDER"; fi

FORGE=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"type\":\"expense\",\"amountCents\":9900,\"description\":\"Em nome do outro\",\"memberId\":\"$PARTNER_MEMBER\"}" \
  "$BASE/api/transactions")
if [ "$FORGE" = "403" ]; then ok 'não dá para lançar em nome do parceiro (403)'; else bad 'lançou em nome do parceiro' "recebeu $FORGE"; fi

# And each still controls their own.
OWN_EDIT=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X PATCH -H 'Content-Type: application/json' \
  -d '{"amountCents":7000}' "$BASE/api/transactions/$OWNER_TX_ID")
if [ "$OWN_EDIT" = "200" ]; then ok 'cada um edita o que é seu (200)'; else bad 'dono não conseguiu editar o próprio lançamento' "recebeu $OWN_EDIT"; fi

# Both see the couple's whole list, which is the point of a shared space.
BOTH_SEE=$(curl -s -b "$PARTNER_JAR" "$BASE/api/transactions")
check 'parceiro enxerga o lançamento do dono' "$BOTH_SEE" 'Salao da Ana'

# ---------------------------------------------------------------------------
step '16. Permissões de administração do casal'

PARTNER_CANCEL=$(curl -s -o /dev/null -w '%{http_code}' -b "$PARTNER_JAR" -X POST "$BASE/api/assinatura/cancelar")
if [ "$PARTNER_CANCEL" = "403" ]; then ok 'parceiro não gerencia a assinatura (403)'; else bad 'parceiro não deveria cancelar a assinatura' "recebeu $PARTNER_CANCEL"; fi

PARTNER_INVITE=$(curl -s -o /dev/null -w '%{http_code}' -b "$PARTNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"name\":\"Alguem\",\"email\":\"alguem+$STAMP@exemplo.test\"}" \
  "$BASE/api/household/parceiro")
if [ "$PARTNER_INVITE" = "403" ] || [ "$PARTNER_INVITE" = "409" ]; then ok "parceiro não convida terceiros ($PARTNER_INVITE)"; else bad 'parceiro não deveria convidar' "recebeu $PARTNER_INVITE"; fi

# ---------------------------------------------------------------------------
step '17. Isolamento entre casais'

curl -s -c "$SEED_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"ana@exemplo.com","password":"demo123456"}' "$BASE/api/auth/sign-in/email" > /dev/null

if grep -q 'session_token' "$SEED_JAR"; then ok 'casal do seed entrou'; else bad 'casal do seed não conseguiu entrar'; fi

VICTIM_TX=$(curl -s -b "$OWNER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"type":"expense","amountCents":9999,"description":"Segredo do casal A"}' "$BASE/api/transactions")
VICTIM_ID=$(printf '%s' "$VICTIM_TX" | json transaction.id)

CROSS=$(curl -s -o /dev/null -w '%{http_code}' -b "$SEED_JAR" "$BASE/api/transactions/$VICTIM_ID")
if [ "$CROSS" = "404" ]; then ok 'outro casal não lê o movimento por id (404)'; else bad 'vazamento entre households na leitura' "recebeu $CROSS"; fi

CROSS_EDIT=$(curl -s -o /dev/null -w '%{http_code}' -b "$SEED_JAR" -X PATCH -H 'Content-Type: application/json' \
  -d '{"amountCents":1}' "$BASE/api/transactions/$VICTIM_ID")
if [ "$CROSS_EDIT" = "404" ]; then ok 'outro casal não edita o movimento (404)'; else bad 'vazamento entre households na edição' "recebeu $CROSS_EDIT"; fi

CROSS_DELETE=$(curl -s -o /dev/null -w '%{http_code}' -b "$SEED_JAR" -X DELETE "$BASE/api/transactions/$VICTIM_ID")
if [ "$CROSS_DELETE" = "404" ]; then ok 'outro casal não exclui o movimento (404)'; else bad 'vazamento entre households na exclusão' "recebeu $CROSS_DELETE"; fi

SEED_LIST=$(curl -s -b "$SEED_JAR" "$BASE/api/transactions?limit=200")
if printf '%s' "$SEED_LIST" | grep -qF 'Segredo do casal A'; then bad 'lista de outro casal vazou dados'; else ok 'lista do outro casal não contém dados alheios'; fi

STILL_THERE=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" "$BASE/api/transactions/$VICTIM_ID")
if [ "$STILL_THERE" = "200" ]; then ok 'movimento do dono continua intacto'; else bad 'movimento do dono foi afetado' "recebeu $STILL_THERE"; fi

curl -s -b "$OWNER_JAR" -X DELETE "$BASE/api/transactions/$VICTIM_ID" > /dev/null

# ---------------------------------------------------------------------------
step '18. Demais telas do app'

check_status 'tela de chat' "$BASE/app/chat" 200 "$OWNER_JAR"
check_status 'tela de movimentos' "$BASE/app/movimentos" 200 "$OWNER_JAR"
check_status 'tela de planejamento' "$BASE/app/planejamento" 200 "$OWNER_JAR"
check_status 'tela do casal' "$BASE/app/casal" 200 "$OWNER_JAR"
check_status 'tela de relatório' "$BASE/app/relatorio" 200 "$OWNER_JAR"
check_status 'tela de conta' "$BASE/app/conta" 200 "$OWNER_JAR"

COUPLE=$(curl -s -b "$OWNER_JAR" "$BASE/app/casal")
# Distinct from the household name 'Ana & Lucas', so this really proves the
# member row is rendered.
check 'tela do casal lista as duas pessoas' "$COUPLE" 'Lucas Parceiro'
check 'tela do casal evita linguagem de fiscalização' "$COUPLE" 'não para prestar contas um ao outro'

REPORT=$(curl -s -b "$OWNER_JAR" "$BASE/app/relatorio")
check 'relatório traz o resumo do ciclo' "$REPORT" 'Receberam'

# ---------------------------------------------------------------------------
step '19. Logout e sessão'

curl -s -b "$OWNER_JAR" -c "$OWNER_JAR" -X POST \
  -H 'Content-Type: application/json' -H "Origin: $BASE" \
  -d '{}' "$BASE/api/auth/sign-out" > /dev/null
AFTER_LOGOUT=$(curl -s -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" "$BASE/api/transactions")
if [ "$AFTER_LOGOUT" = "401" ]; then ok 'sessão encerrada após logout (401)'; else bad 'sessão continuou válida após logout' "recebeu $AFTER_LOGOUT"; fi

RELOGIN=$(curl -s -c "$OWNER_JAR" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" "$BASE/api/auth/sign-in/email")
if [ "$RELOGIN" = "200" ]; then ok 'login novamente funciona'; else bad 'não foi possível entrar de novo' "recebeu $RELOGIN"; fi

HISTORY=$(curl -s -b "$OWNER_JAR" "$BASE/api/transactions")
check 'histórico continua correto após reentrar' "$HISTORY" 'Mercado'

# ---------------------------------------------------------------------------
rm -rf "$JAR_DIR"

printf '\n\033[1m================================\033[0m\n'
printf '  \033[32m%d passaram\033[0m   \033[31m%d falharam\033[0m\n' "$PASS" "$FAIL"
printf '\033[1m================================\033[0m\n\n'

[ "$FAIL" -eq 0 ] || exit 1
