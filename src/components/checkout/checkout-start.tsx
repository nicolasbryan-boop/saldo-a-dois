'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api-client';
import { TransparentPayment } from './transparent-payment';
import { trackInitiateCheckout } from '@/components/marketing/pixel-events';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/cn';
import {
  planList,
  pricing,
  getPlan,
  monthlyEquivalentCents,
  savingsVsMonthlyCents,
  type PlanId,
} from '@/config';

export function CheckoutStart({
  canceled,
  initialPlanId,
  transparentPublicKey,
}: {
  canceled: boolean;
  initialPlanId?: string;
  /** Set when the configured gateway can take the payment on this page. */
  transparentPublicKey?: string | null;
}) {
  const [planId, setPlanId] = React.useState<PlanId>(getPlan(initialPlanId).id);
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [payingHere, setPayingHere] = React.useState(false);

  const plan = getPlan(planId);

  // Reported once per plan the visitor actually looks at. Switching plans is a
  // new intent and worth an event; re-rendering is not.
  //
  // `plan` comes from the catalogue via getPlan(), which falls back to the
  // default for anything unknown — so ?plano=<qualquer coisa> can change which
  // plan is shown but never what it is worth.
  const reported = React.useRef(new Set<PlanId>());

  React.useEffect(() => {
    if (reported.current.has(plan.id)) return;
    reported.current.add(plan.id);
    trackInitiateCheckout(plan);
  }, [plan]);
  const canPayHere = Boolean(transparentPublicKey);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    if (canPayHere) {
      // Nothing is charged yet — this just reveals the payment step below.
      setPayingHere(true);
      setLoading(false);
      return;
    }

    try {
      const result = await api.post<{ checkoutId: string; url: string }>('/api/checkout', {
        email: email.trim(),
        planId,
      });
      // Leaves our origin for the gateway (or the simulated one in dev).
      window.location.href = result.url;
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Não conseguimos iniciar o pagamento. Tente de novo.',
      );
      setLoading(false);
    }
  }

  async function redirectToGateway() {
    setPayingHere(false);
    setLoading(true);
    try {
      const result = await api.post<{ checkoutId: string; url: string }>('/api/checkout', {
        email: email.trim(),
        planId,
      });
      window.location.href = result.url;
    } catch {
      setError('Não conseguimos iniciar o pagamento. Tente de novo.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {canceled && (
        <p
          role="status"
          className="rounded-lg border border-money-hold/30 bg-money-hold-soft px-4 py-3 text-sm font-medium text-[#8a5b02]"
        >
          O pagamento foi cancelado. Nada foi cobrado.
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="p-6">
          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">
              Escolha como pagar
            </legend>

            <div className="mt-3 space-y-2.5">
              {planList.map((option) => (
                <PlanOption
                  key={option.id}
                  plan={option}
                  selected={option.id === planId}
                  onSelect={() => setPlanId(option.id)}
                />
              ))}
            </div>
          </fieldset>

          <ul className="mt-6 space-y-2.5 border-t border-ink-100 pt-6">
            {pricing.features.slice(0, 5).map((feature) => (
              <li key={feature} className="flex gap-2.5">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-money-in" />
                <span className="text-sm leading-snug text-ink-700">{feature}</span>
              </li>
            ))}
          </ul>

          {payingHere && transparentPublicKey ? (
            <div className="mt-6 border-t border-ink-100 pt-6">
              <TransparentPayment
                planId={planId}
                email={email.trim()}
                publicKey={transparentPublicKey}
                onFallback={redirectToGateway}
              />
              <button
                type="button"
                onClick={() => setPayingHere(false)}
                className="mt-4 w-full text-center text-xs font-semibold text-ink-500 underline"
              >
                Trocar de plano ou e-mail
              </button>
            </div>
          ) : (
          <form onSubmit={submit} className="mt-6 space-y-4 border-t border-ink-100 pt-6">
            <Field
              label="Seu e-mail"
              htmlFor="checkout-email"
              hint="É com ele que vocês vão entrar no aplicativo."
            >
              <Input
                id="checkout-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@exemplo.com"
                required
              />
            </Field>

            {error && (
              <p role="alert" className="text-sm font-medium text-money-out">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" fullWidth loading={loading}>
              <Lock aria-hidden className="size-4" />
              {canPayHere ? 'Continuar para o pagamento' : `Pagar ${formatBRL(plan.priceCents)}`} ·
              plano {plan.name.toLowerCase()}
            </Button>

            <p className="text-center text-xs leading-relaxed text-ink-500">
              Cobrança recorrente a cada{' '}
              {plan.intervalMonths === 1 ? 'mês' : `${plan.intervalMonths} meses`}. A senha
              vem depois da confirmação do pagamento. Cancele quando quiser.
            </p>
          </form>
          )}
        </div>
      </Card>

      <p className="text-center text-sm text-ink-600">
        Já é assinante?{' '}
        <Link href="/entrar" className="link-underline font-semibold text-ink-900">
          Entrar
        </Link>
      </p>
    </div>
  );
}

function PlanOption({
  plan,
  selected,
  onSelect,
}: {
  plan: (typeof planList)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  const equivalent = monthlyEquivalentCents(plan);
  const savings = savingsVsMonthlyCents(plan);

  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
        selected
          ? 'border-ink-900 bg-cream-50 ring-1 ring-ink-900'
          : 'border-ink-200 bg-white hover:border-ink-300',
      )}
    >
      <input
        type="radio"
        name="plano"
        value={plan.id}
        checked={selected}
        onChange={onSelect}
        className="mt-1 size-4 shrink-0 accent-[#101828]"
      />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-display text-lg font-semibold text-ink-900">
            {plan.name}
          </span>
          <span className="tabular text-lg font-semibold text-ink-900">
            {formatBRL(plan.priceCents)}
            <span className="text-sm font-medium text-ink-500">/{plan.intervalLabel}</span>
          </span>
        </span>

        <span className="mt-1 block text-xs leading-snug text-ink-500">
          {plan.intervalMonths > 1 && (
            <>equivale a {formatBRL(equivalent)} por mês · </>
          )}
          {plan.tagline}
        </span>

        {/* Only shown when there is a real saving. A badge on a plan that costs
            more would be a lie, and this product does not do that. */}
        {savings > 0 && (
          <span className="mt-2 inline-block rounded-full bg-money-in-soft px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[#0b7a55]">
            economize {formatBRL(savings)}
          </span>
        )}
      </span>
    </label>
  );
}
