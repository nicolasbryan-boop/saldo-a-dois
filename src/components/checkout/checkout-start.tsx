'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api-client';
import { formatBRL } from '@/lib/money';
import { pricing } from '@/config';

export function CheckoutStart({ canceled }: { canceled: boolean }) {
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await api.post<{ checkoutId: string; url: string }>('/api/checkout', {
        email: email.trim(),
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
        <div className="bg-ink-900 px-6 py-6 text-center text-white">
          <p className="font-display text-xl font-semibold">Plano {pricing.plan.name}</p>
          <p className="mt-3 flex items-baseline justify-center gap-1.5">
            <span className="tabular font-display text-[2.5rem] font-semibold leading-none">
              {formatBRL(pricing.plan.priceCents)}
            </span>
            <span className="text-sm font-medium text-white/60">/mês</span>
          </p>
          <p className="mt-2 text-xs text-white/70">
            por casal · {pricing.plan.maxMembers} pessoas inclusas
          </p>
        </div>

        <div className="p-6">
          <ul className="space-y-2.5">
            {pricing.plan.features.slice(0, 5).map((feature) => (
              <li key={feature} className="flex gap-2.5">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-money-in" />
                <span className="text-sm leading-snug text-ink-700">{feature}</span>
              </li>
            ))}
          </ul>

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
              Ir para o pagamento
            </Button>

            <p className="text-center text-xs leading-relaxed text-ink-500">
              A senha vem depois da confirmação do pagamento. Cobrança mensal, cancele
              quando quiser.
            </p>
          </form>
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
