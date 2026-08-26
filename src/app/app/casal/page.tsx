import type { Metadata } from 'next';
import { getAppContext } from '@/server/app-context';
import { getRuntime, getAppUrl } from '@/server/context';
import { spendingByMember } from '@/domains/transactions/service';
import { getCycleTotals } from '@/domains/cycles/service';
import { listPendingInvites } from '@/domains/households/invites';
import { loadCoupleMoney } from '@/domains/transactions/member-summary';
import { loadCoupleGoals } from '@/domains/goals/progress';
import { CoupleView } from '@/components/app/couple-view';

export const metadata: Metadata = { title: 'Casal' };
export const dynamic = 'force-dynamic';

export default async function CouplePage() {
  const context = await getAppContext();
  const { env } = await getRuntime();

  const [byMember, totals, invites, money, coupleGoals] = await Promise.all([
    spendingByMember(context.db, context.household.id, context.cycle.id),
    getCycleTotals(context.db, context.household.id, context.cycle.id),
    listPendingInvites(context.db, context.household.id),
    loadCoupleMoney(context.db, {
      householdId: context.household.id,
      cycleId: context.cycle.id,
      actorMemberId: context.member.id,
    }),
    loadCoupleGoals(context.db, context.household.id),
  ]);

  // Goals saved per person, keyed so each side can pick up its own number.
  const savedByMemberId = new Map(
    coupleGoals.perMember
      .filter((row) => row.memberId)
      .map((row) => [row.memberId!, row.amountCents]),
  );

  function side(part: typeof money.mine) {
    if (!part.memberId) return null;
    return {
      memberId: part.memberId,
      displayName: part.displayName,
      accentColor: part.accentColor,
      incomeCents: part.incomeCents,
      expenseCents: part.expenseCents,
      savedCents: savedByMemberId.get(part.memberId) ?? 0,
      // Straight from loadCoupleMoney: already nets out what was set aside.
      balanceCents: part.balanceCents,
    };
  }

  const spentByMemberId = new Map(
    byMember.filter((row) => row.memberId).map((row) => [row.memberId!, row.totalCents]),
  );
  const sharedSpentCents =
    byMember.find((row) => row.memberId === null)?.totalCents ?? 0;

  return (
    <CoupleView
      householdName={context.household.name}
      cycleLabel={context.cycle.label}
      isOwner={context.role === 'owner'}
      currentMemberId={context.member.id}
      sharedSpentCents={sharedSpentCents}
      reservedCents={totals.reserve}
      appUrl={getAppUrl(env)}
      sides={{
        mine: side(money.mine)!,
        partner: money.partner ? side(money.partner) : null,
        joint: {
          incomeCents: money.together.incomeCents,
          expenseCents: money.together.expenseCents,
          balanceCents: money.together.balanceCents,
          savedCents: coupleGoals.totalSavedCents,
        },
      }}
      sharedGoals={coupleGoals.goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        targetCents: goal.targetCents,
        savedCents: goal.savedCents,
        percent: goal.percent,
        contributors: goal.contributors,
      }))}
      members={context.members.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.displayName,
        role: member.role,
        accentColor: member.accentColor,
        spentCents: spentByMemberId.get(member.id) ?? 0,
      }))}
      pendingInvites={invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        name: invite.name,
        token: invite.token,
      }))}
    />
  );
}
