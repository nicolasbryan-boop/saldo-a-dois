import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@/db';
import { transactions, householdMembers } from '@/db/schema';

/**
 * PER-PERSON MONEY INSIDE ONE CYCLE
 * =================================
 * The dashboard answers three questions at once: what did I move, what did my
 * partner move, and what did we move together. All three come from the same
 * rows — only the grouping changes — so they can never disagree.
 *
 * The couple total is the sum of every row in the cycle, including rows with
 * no owner. It is computed from the rows, never by adding the two personal
 * cards together, so an unowned row can't silently vanish from the total.
 */

export interface MemberMoney {
  /** Null for the shared bucket: rows that belong to the house, not a person. */
  memberId: string | null;
  displayName: string;
  accentColor: string;
  incomeCents: number;
  expenseCents: number;
  /** Set aside into goals. Not spent, but no longer available either. */
  reservedCents: number;
  /**
   * What is left: income minus expense minus what was set aside.
   *
   * Money in a goal is still the couple's, but it is not spendable, so a
   * balance that ignored it would overstate what this person can use.
   */
  balanceCents: number;
}

export interface CoupleMoney {
  /** The logged-in person. Always present. */
  mine: MemberMoney;
  /** The other member, or null while the household is still a party of one. */
  partner: MemberMoney | null;
  /** Rows with no owner. Null when there are none, so the UI can skip it. */
  shared: MemberMoney | null;
  together: {
    incomeCents: number;
    expenseCents: number;
    reservedCents: number;
    balanceCents: number;
  };
}

function emptyMoney(
  memberId: string | null,
  displayName: string,
  accentColor: string,
): MemberMoney {
  return {
    memberId,
    displayName,
    accentColor,
    incomeCents: 0,
    expenseCents: 0,
    reservedCents: 0,
    balanceCents: 0,
  };
}

export async function loadCoupleMoney(
  db: Database,
  params: { householdId: string; cycleId: string; actorMemberId: string },
): Promise<CoupleMoney> {
  const [members, rows] = await Promise.all([
    db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, params.householdId),
          eq(householdMembers.status, 'active'),
        ),
      ),
    db
      .select({
        memberId: transactions.memberId,
        type: transactions.type,
        total: sql<number>`sum(${transactions.amountCents})`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, params.householdId),
          eq(transactions.cycleId, params.cycleId),
        ),
      )
      .groupBy(transactions.memberId, transactions.type),
  ]);

  const buckets = new Map<string, MemberMoney>();
  for (const member of members) {
    buckets.set(member.id, emptyMoney(member.id, member.displayName, member.accentColor));
  }
  const shared = emptyMoney(null, 'Da casa', 'slate');

  const together = { incomeCents: 0, expenseCents: 0, reservedCents: 0, balanceCents: 0 };

  for (const row of rows) {
    const amount = Number(row.total ?? 0);
    // A member removed from the household leaves rows behind; they are still
    // the couple's money, so they fall into the shared bucket rather than
    // disappearing from the total.
    const bucket = (row.memberId && buckets.get(row.memberId)) || shared;

    // Five movement types, three directions. Lumping everything that is not
    // income into "gastou" counted an adjustment_in — money coming IN — as
    // spending, and buried reserves inside expenses where nobody could see
    // what had actually been set aside.
    if (row.type === 'income' || row.type === 'adjustment_in') {
      bucket.incomeCents += amount;
      together.incomeCents += amount;
    } else if (row.type === 'reserve') {
      bucket.reservedCents += amount;
      together.reservedCents += amount;
    } else {
      bucket.expenseCents += amount;
      together.expenseCents += amount;
    }
  }

  for (const bucket of [...buckets.values(), shared]) {
    bucket.balanceCents = bucket.incomeCents - bucket.expenseCents - bucket.reservedCents;
  }
  together.balanceCents =
    together.incomeCents - together.expenseCents - together.reservedCents;

  const mine =
    buckets.get(params.actorMemberId) ?? emptyMoney(params.actorMemberId, 'Você', 'rose');
  const partner =
    [...buckets.values()].find((bucket) => bucket.memberId !== params.actorMemberId) ?? null;

  const sharedHasMoney =
    shared.incomeCents > 0 || shared.expenseCents > 0 || shared.reservedCents > 0;

  return { mine, partner, shared: sharedHasMoney ? shared : null, together };
}
