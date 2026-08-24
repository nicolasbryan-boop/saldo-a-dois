import type { Metadata } from 'next';
import { getAppContext } from '@/server/app-context';
import { subscriptionLabel } from '@/domains/billing/subscription';
import { AccountView } from '@/components/app/account-view';
import { todayIn } from '@/lib/dates';

export const metadata: Metadata = { title: 'Conta' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const context = await getAppContext();
  const subscription = context.subscription;

  return (
    <AccountView
      user={{ name: context.user.name, email: context.user.email }}
      role={context.role}
      householdName={context.household.name}
      subscription={
        subscription
          ? {
              status: subscription.status,
              statusLabel: subscriptionLabel(subscription.status),
              priceCents: subscription.priceCents,
              planId: subscription.planId,
              currentPeriodEnd: subscription.currentPeriodEnd
                ? todayIn(context.household.timezone, subscription.currentPeriodEnd)
                : null,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              provider: subscription.provider,
            }
          : null
      }
    />
  );
}
