import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/primitives';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { requireActiveUser } from '@/domains/auth/session';
import { getRuntime } from '@/server/context';
import { loadContext } from '@/domains/households/service';
import {
  isSubscriptionActive,
  subscriptionLabel,
} from '@/domains/billing/subscription';
import { formatBRL } from '@/lib/money';
import { pricing } from '@/config';

export const metadata: Metadata = { title: 'Assinatura' };
export const dynamic = 'force-dynamic';

/**
 * Where a household lands when the plan is not active.
 * It states the situation plainly rather than pretending the app is broken.
 */
export default async function SubscriptionPage() {
  const user = await requireActiveUser();
  const { db } = await getRuntime();
  const context = await loadContext(db, user.id);

  if (!context) redirect('/checkout');
  if (isSubscriptionActive(context.subscription)) redirect('/app');

  const subscription = context.subscription;
  const isOwner = context.role === 'owner';

  return (
    <AuthShell
      title="Sua assinatura precisa de atenção"
      subtitle={`O espaço "${context.household.name}" continua aqui, com todo o histórico. Só o acesso está pausado.`}
    >
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-ink-900">Plano {pricing.plan.name}</p>
            <p className="tabular mt-0.5 text-sm text-ink-600">
              {formatBRL(pricing.plan.priceCents)}/mês por casal
            </p>
          </div>
          <Badge tone="negative">
            {subscription ? subscriptionLabel(subscription.status) : 'Sem assinatura'}
          </Badge>
        </div>

        <p className="mt-5 border-t border-ink-100 pt-5 text-[0.9375rem] leading-relaxed text-ink-700">
          {isOwner
            ? 'Reative a assinatura para voltar a usar o espaço de vocês. Nenhum lançamento foi apagado.'
            : 'Quem criou o espaço precisa reativar a assinatura. Assim que isso acontecer, seu acesso volta automaticamente.'}
        </p>

        {isOwner && (
          <Link
            href="/checkout"
            className="mt-5 flex h-13 w-full items-center justify-center rounded-md bg-ink-900 px-5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-ink-800"
          >
            Reativar assinatura
          </Link>
        )}

        <div className="mt-4 flex justify-center">
          <SignOutButton />
        </div>
      </Card>
    </AuthShell>
  );
}
