import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { CheckoutStart } from '@/components/checkout/checkout-start';

export const metadata: Metadata = { title: 'Assinar' };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      title="Vamos organizar o dinheiro de vocês"
      subtitle="Uma assinatura cobre as duas pessoas do casal. Escolha a cadência que preferir."
    >
      <CheckoutStart
        canceled={params.cancelado === '1'}
        initialPlanId={typeof params.plano === 'string' ? params.plano : undefined}
      />
    </AuthShell>
  );
}
