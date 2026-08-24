import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { Card } from '@/components/ui/card';
import { SimulatedGateway } from '@/components/checkout/simulated-gateway';
import { getRuntime, isProduction } from '@/server/context';
import { isMockBillingEnabled } from '@/domains/billing/registry';
import { getCheckoutSession } from '@/domains/billing/subscription';
import { formatBRL } from '@/lib/money';
import { FlaskConical } from 'lucide-react';

export const metadata: Metadata = { title: 'Pagamento simulado', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Stand-in for the payment gateway while no real one is connected.
 *
 * It exists only outside production and is guarded twice: this page 404s when
 * mock billing is off, and the endpoint behind the button refuses as well.
 */
export default async function SimulatedCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { env, db } = await getRuntime();
  if (isProduction(env) || !isMockBillingEnabled(env)) notFound();

  const { id } = await params;
  const checkout = await getCheckoutSession(db, id);
  if (!checkout) notFound();

  return (
    <AuthShell
      title="Gateway de pagamento simulado"
      subtitle="Nenhuma cobrança real acontece aqui. Esta tela existe para exercitar o fluxo completo enquanto o gateway definitivo não está configurado."
    >
      <Card className="p-6">
        <div className="flex items-center gap-3 rounded-lg bg-money-hold-soft px-4 py-3">
          <FlaskConical aria-hidden className="size-5 shrink-0 text-[#8a5b02]" />
          <p className="text-sm font-semibold text-[#8a5b02]">Ambiente de desenvolvimento</p>
        </div>

        <dl className="mt-6 space-y-3 border-b border-ink-100 pb-6">
          <div className="flex justify-between gap-3">
            <dt className="text-sm text-ink-600">E-mail</dt>
            <dd className="text-sm font-semibold text-ink-900">{checkout.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-sm text-ink-600">Plano</dt>
            <dd className="text-sm font-semibold text-ink-900">Básico mensal</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-sm text-ink-600">Valor</dt>
            <dd className="tabular text-sm font-semibold text-ink-900">
              {formatBRL(checkout.amountCents)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-sm text-ink-600">Situação</dt>
            <dd className="text-sm font-semibold text-ink-900">
              {checkout.status === 'pending' ? 'Aguardando pagamento' : checkout.status}
            </dd>
          </div>
        </dl>

        <SimulatedGateway checkoutId={checkout.id} alreadyPaid={checkout.status !== 'pending'} />

        <p className="mt-5 text-xs leading-relaxed text-ink-500">
          Ao aprovar, um evento assinado é gerado e passa pela mesma verificação de
          assinatura e pela mesma trava de idempotência que um webhook real usaria.
        </p>
      </Card>
    </AuthShell>
  );
}
