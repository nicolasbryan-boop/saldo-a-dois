'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api-client';
import { trackPurchase, purchaseEventId } from '@/components/marketing/pixel-events';
import { getPlan } from '@/config';

interface CheckoutStatus {
  id: string;
  status: 'pending' | 'paid' | 'claimed' | 'expired' | 'failed';
  email: string;
  claimable: boolean;
}

/**
 * Post-payment screen.
 *
 * It does NOT assume payment happened because the browser came back from the
 * gateway. It polls our own API, whose answer comes from the row the verified
 * webhook wrote. Until that says `paid`, no account can be created.
 */
export function CheckoutReturn({
  checkoutId,
  initialStatus,
  planId,
}: {
  checkoutId: string;
  initialStatus: CheckoutStatus;
  /** Plan on the checkout row, read from the database by the server. */
  planId: string;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<CheckoutStatus>(initialStatus);
  const [attempts, setAttempts] = React.useState(0);

  // THE ONLY PLACE A PURCHASE IS REPORTED.
  //
  // Gated on the status of our own checkout row, which turns "paid" only when
  // a webhook with a verified signature said the gateway approved the money.
  // Not on arriving here, not on a query string, not on the browser coming
  // back from the gateway — a visitor controls all three.
  //
  // The event id is derived from the checkout row, so a reload, a second
  // webhook delivery or a future Conversions API call all describe the same
  // conversion and Meta counts it once.
  const purchaseReported = React.useRef(false);

  React.useEffect(() => {
    if (purchaseReported.current) return;
    if (status.status !== 'paid' && status.status !== 'claimed') return;

    purchaseReported.current = true;
    trackPurchase(getPlan(planId), purchaseEventId(checkoutId));
  }, [status.status, planId, checkoutId]);

  React.useEffect(() => {
    if (status.status !== 'pending' || attempts > 40) return;

    const timer = window.setTimeout(async () => {
      try {
        const next = await api.get<CheckoutStatus>(`/api/checkout/${checkoutId}`);
        setStatus(next);
      } catch {
        // Keep polling; a transient failure is not an answer.
      }
      setAttempts((value) => value + 1);
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [status.status, attempts, checkoutId]);

  if (status.status === 'claimed') {
    return (
      <Card className="p-7 text-center">
        <p className="font-display text-lg font-semibold text-ink-900">
          Esta compra já virou uma conta.
        </p>
        <p className="mt-2 text-sm text-ink-600">
          Entre com <strong>{status.email}</strong> para continuar.
        </p>
        <Link
          href="/entrar"
          className="mt-5 inline-flex h-12 items-center rounded-md bg-ink-900 px-6 text-[0.9375rem] font-semibold text-white"
        >
          Ir para o login
        </Link>
      </Card>
    );
  }

  if (status.status === 'pending') {
    return (
      <Card className="p-7 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-cream-200">
          {attempts > 40 ? (
            <Clock aria-hidden className="size-5 text-ink-500" />
          ) : (
            <Loader2 aria-hidden className="size-5 animate-spin text-ink-500" />
          )}
        </span>
        <p className="mt-4 font-display text-lg font-semibold text-ink-900">
          {attempts > 40 ? 'Ainda não recebemos a confirmação' : 'Confirmando o pagamento…'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {attempts > 40
            ? 'Se o pagamento foi aprovado, ele aparece aqui em alguns minutos. Você pode recarregar a página.'
            : 'Estamos aguardando a confirmação do meio de pagamento. Isso costuma levar poucos segundos.'}
        </p>
        {attempts > 40 && (
          <Button className="mt-5" variant="secondary" onClick={() => router.refresh()}>
            Verificar de novo
          </Button>
        )}
      </Card>
    );
  }

  if (status.status !== 'paid') {
    return (
      <Card className="p-7 text-center">
        <p className="font-display text-lg font-semibold text-ink-900">
          Não conseguimos concluir esta compra.
        </p>
        <p className="mt-2 text-sm text-ink-600">
          Nada foi cobrado. Você pode tentar novamente.
        </p>
        <Link
          href="/checkout"
          className="mt-5 inline-flex h-12 items-center rounded-md bg-ink-900 px-6 text-[0.9375rem] font-semibold text-white"
        >
          Tentar de novo
        </Link>
      </Card>
    );
  }

  return <CreateAccountForm checkoutId={checkoutId} email={status.email} />;
}

function CreateAccountForm({ checkoutId, email }: { checkoutId: string; email: string }) {
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [repeat, setRepeat] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== repeat) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }

    setLoading(true);
    try {
      const result = await api.post<{ redirectTo: string }>('/api/checkout/claim', {
        checkoutId,
        name: name.trim(),
        password,
      });
      router.push(result.redirectTo);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Não conseguimos criar a conta. Tente novamente.',
      );
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 sm:p-7">
      <div className="flex items-center gap-3 rounded-lg bg-money-in-soft px-4 py-3">
        <CheckCircle2 aria-hidden className="size-5 shrink-0 text-money-in" />
        <p className="text-sm font-semibold text-[#0b7a55]">Pagamento confirmado.</p>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="E-mail" htmlFor="claim-email">
          <Input id="claim-email" value={email} readOnly disabled />
        </Field>

        <Field label="Como podemos te chamar?" htmlFor="claim-name">
          <Input
            id="claim-name"
            autoFocus
            autoComplete="given-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Ana"
            maxLength={80}
            required
          />
        </Field>

        <Field label="Crie uma senha" htmlFor="claim-password" hint="Pelo menos 8 caracteres.">
          <Input
            id="claim-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </Field>

        <Field label="Repita a senha" htmlFor="claim-repeat">
          <Input
            id="claim-repeat"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            minLength={8}
            required
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm font-medium text-money-out">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth loading={loading}>
          Criar conta e começar
        </Button>
      </form>
    </Card>
  );
}
