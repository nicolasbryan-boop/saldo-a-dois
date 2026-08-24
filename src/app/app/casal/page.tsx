import type { Metadata } from 'next';
import { getAppContext } from '@/server/app-context';
import { getRuntime, getAppUrl } from '@/server/context';
import { spendingByMember } from '@/domains/transactions/service';
import { getCycleTotals } from '@/domains/cycles/service';
import { listPendingInvites } from '@/domains/households/invites';
import { CoupleView } from '@/components/app/couple-view';

export const metadata: Metadata = { title: 'Casal' };
export const dynamic = 'force-dynamic';

export default async function CouplePage() {
  const context = await getAppContext();
  const { env } = await getRuntime();

  const [byMember, totals, invites] = await Promise.all([
    spendingByMember(context.db, context.household.id, context.cycle.id),
    getCycleTotals(context.db, context.household.id, context.cycle.id),
    listPendingInvites(context.db, context.household.id),
  ]);

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
