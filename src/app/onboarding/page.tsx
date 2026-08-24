import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, eq, isNull, asc } from 'drizzle-orm';
import { AuthShell } from '@/components/auth/auth-shell';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { PartnerOnboarding } from '@/components/onboarding/partner-onboarding';
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
  // Per person: the partner gets their own pass through the wizard, with the
  // household-level steps hidden.
  if (household.member.onboardingCompletedAt) redirect('/app');
  const isOwner = household.role === 'owner';

  // Unreachable in practice — a partner can only be invited from inside the
  // app, which the owner reaches only after finishing. Handled anyway so the
  // page never renders a wizard with nothing to attach bills to.
  if (!isOwner && !household.household.onboardingCompletedAt) {
    return (
      <AuthShell title="Quase lá">
        <p className="text-[0.9375rem] leading-relaxed text-ink-700">
          Quem criou o espaço ainda está terminando a configuração inicial.
          Assim que terminar, você faz a sua.
        </p>
      </AuthShell>
    );
  }

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
      title={isOwner ? 'Falta pouco para começar' : 'Agora é a sua vez'}
      subtitle={
        isOwner
          ? 'São seis perguntas rápidas. Tudo pode ser ajustado depois.'
          : 'Cadastre as suas receitas e os seus gastos. Leva menos de dois minutos.'
      }
      wide
    >
      {isOwner ? (
        <OnboardingWizard
          ownerName={household.member.displayName}
          ownerMemberId={household.member.id}
          categories={categories}
        />
      ) : (
        <PartnerOnboarding
          partnerName={household.member.displayName}
          householdName={household.household.name}
          categories={categories}
        />
      )}
    </AuthShell>
  );
}
