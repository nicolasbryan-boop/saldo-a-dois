import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, eq, isNull, asc } from 'drizzle-orm';
import { AuthShell } from '@/components/auth/auth-shell';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { getBaseContext } from '@/server/app-context';
import { getRuntime } from '@/server/context';
import { isSubscriptionActive } from '@/domains/billing/subscription';
import { trackEvent } from '@/domains/analytics/audit';
import { categories as categoriesTable } from '@/db/schema';

export const metadata: Metadata = { title: 'Configuração inicial' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const { db, user, household } = await getBaseContext();

  if (!household) redirect('/checkout');
  if (!isSubscriptionActive(household.subscription)) redirect('/assinatura');
  if (household.household.onboardingCompletedAt) redirect('/app');
  if (household.role !== 'owner') redirect('/app');

  const categories = await db
    .select({
      id: categoriesTable.id,
      slug: categoriesTable.slug,
      name: categoriesTable.name,
      icon: categoriesTable.icon,
      color: categoriesTable.color,
      kind: categoriesTable.kind,
    })
    .from(categoriesTable)
    .where(
      and(
        eq(categoriesTable.householdId, household.household.id),
        isNull(categoriesTable.archivedAt),
      ),
    )
    .orderBy(asc(categoriesTable.sortOrder));

  const { waitUntil } = await getRuntime();
  waitUntil(
    trackEvent(db, {
      name: 'onboarding_started',
      householdId: household.household.id,
      userId: user.id,
    }),
  );

  return (
    <AuthShell
      title="Falta pouco para começar"
      subtitle="São seis perguntas rápidas. Tudo pode ser ajustado depois."
      wide
    >
      <OnboardingWizard
        ownerName={household.member.displayName}
        ownerMemberId={household.member.id}
        categories={categories}
      />
    </AuthShell>
  );
}
