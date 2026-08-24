import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { CheckoutStart } from '@/components/checkout/checkout-start';
import { getRuntime } from '@/server/context';
import { getPaymentProvider } from '@/domains/billing/registry';
import { isTransparent } from '@/domains/billing/provider';

export const metadata: Metadata = { title: 'Assinar' };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // Decided on the server: the public key is safe to render, the secret one
  // never leaves the Worker.
  const { env } = await getRuntime();
  const provider = getPaymentProvider(env);
  const publicKey = isTransparent(provider) ? provider.publicKey : null;

  return (
    <AuthShell
      title="Vamos organizar o dinheiro de vocês"
      subtitle="Uma assinatura cobre as duas pessoas do casal. Escolha a cadência que preferir."
    >
      <CheckoutStart
        canceled={params.cancelado === '1'}
        initialPlanId={typeof params.plano === 'string' ? params.plano : undefined}
        transparentPublicKey={publicKey}
      />
    </AuthShell>
  );
}
