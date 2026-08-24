import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { CheckoutReturn } from '@/components/checkout/checkout-return';
import { getRuntime } from '@/server/context';
import { getCheckoutSession, isCheckoutClaimable } from '@/domains/billing/subscription';

export const metadata: Metadata = { title: 'Confirmando pagamento' };
export const dynamic = 'force-dynamic';

export default async function CheckoutReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = await getRuntime();
  const checkout = await getCheckoutSession(db, id);

  if (!checkout) notFound();

  return (
    <AuthShell
      title={checkout.status === 'paid' ? 'Agora crie sua conta' : 'Quase lá'}
      subtitle={
        checkout.status === 'paid'
          ? 'Falta só uma senha para vocês entrarem no espaço financeiro.'
          : 'Assim que o pagamento for confirmado pelo meio de pagamento, seguimos.'
      }
    >
      <CheckoutReturn
        checkoutId={checkout.id}
        initialStatus={{
          id: checkout.id,
          status: checkout.status,
          email: checkout.email,
          claimable: isCheckoutClaimable(checkout),
        }}
      />
    </AuthShell>
  );
}
