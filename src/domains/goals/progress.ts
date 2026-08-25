import { and, eq, desc, sql } from 'drizzle-orm';
import type { Database } from '@/db';
import { goals, goalContributions, householdMembers } from '@/db/schema';

/**
 * GOALS AS A COUPLE'S SHARED POT
 * ==============================
 * A goal belongs to the household, not to a person: both see it, both can add
 * to it, and the total is the sum of what both put in. What each person
 * contributed is still tracked, because "we saved R$ 900" and "you saved R$ 500
 * and I saved R$ 400" are different facts and a couple wants both.
 *
 * Attribution comes from `goal_contributions.created_by_user_id` joined back to
 * the membership. There is no `member_id` column on contributions and none is
 * needed: a user appears at most once per household, so the join is exact.
 *
 * Percentages are computed here rather than in the components so every screen
 * rounds the same way.
 */

export interface GoalContributor {
  memberId: string | null;
  displayName: string;
  accentColor: string;
  amountCents: number;
  /** Share of this goal's saved total, 0–100. */
  sharePercent: number;
}

export interface GoalProgress {
  id: string;
  name: string;
  icon: string;
  targetCents: number;
  savedCents: number;
  /** Capped at 100 — a goal can be overshot, a progress bar should not be. */
  percent: number;
  /** What is still missing. Zero once the goal is reached. */
  remainingCents: number;
  achieved: boolean;
  /** One entry per person who put money in, biggest first. */
  contributors: GoalContributor[];
}

export interface CoupleGoals {
  goals: GoalProgress[];
  totalTargetCents: number;
  totalSavedCents: number;
  /** What each person has put across every goal. Always one entry per member. */
  perMember: GoalContributor[];
}

function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

export async function loadCoupleGoals(
  db: Database,
  householdId: string,
): Promise<CoupleGoals> {
  const [goalRows, members, contributionRows] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.householdId, householdId), eq(goals.active, true)))
      .orderBy(desc(goals.createdAt)),

    db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.status, 'active'),
        ),
      ),

    db
      .select({
        goalId: goalContributions.goalId,
        userId: goalContributions.createdByUserId,
        total: sql<number>`sum(${goalContributions.amountCents})`,
      })
      .from(goalContributions)
      .where(eq(goalContributions.householdId, householdId))
      .groupBy(goalContributions.goalId, goalContributions.createdByUserId),
  ]);

  const memberByUser = new Map(members.map((member) => [member.userId, member]));

  /** Contributions whose author is no longer a member still count for the couple. */
  function describe(userId: string | null): Pick<
    GoalContributor,
    'memberId' | 'displayName' | 'accentColor'
  > {
    const member = userId ? memberByUser.get(userId) : undefined;
    if (!member) return { memberId: null, displayName: 'Do casal', accentColor: 'slate' };
    return {
      memberId: member.id,
      displayName: member.displayName,
      accentColor: member.accentColor,
    };
  }

  const byGoal = new Map<string, Map<string, number>>();
  for (const row of contributionRows) {
    const key = row.userId ?? '';
    const bucket = byGoal.get(row.goalId) ?? new Map<string, number>();
    bucket.set(key, (bucket.get(key) ?? 0) + Number(row.total ?? 0));
    byGoal.set(row.goalId, bucket);
  }

  const goalProgress: GoalProgress[] = goalRows.map((goal) => {
    const bucket = byGoal.get(goal.id) ?? new Map<string, number>();

    // `goals.current_cents` is the running total the service keeps in sync and
    // is what the rest of the app trusts, so the bar follows it. The
    // contributor rows only split that number between people.
    const savedCents = goal.currentCents;

    const contributors: GoalContributor[] = [...bucket.entries()]
      .map(([userId, amountCents]) => ({
        ...describe(userId || null),
        amountCents,
        sharePercent: percentOf(amountCents, savedCents),
      }))
      .sort((a, b) => b.amountCents - a.amountCents);

    return {
      id: goal.id,
      name: goal.name,
      icon: goal.icon,
      targetCents: goal.targetCents,
      savedCents,
      percent: percentOf(savedCents, goal.targetCents),
      remainingCents: Math.max(0, goal.targetCents - savedCents),
      achieved: savedCents >= goal.targetCents,
      contributors,
    };
  });

  const totalSavedCents = goalProgress.reduce((sum, goal) => sum + goal.savedCents, 0);

  // Every member appears, including one who has not put anything in yet — a
  // zero is information, an absent row reads as a rendering bug.
  const totalsByUser = new Map<string, number>();
  for (const row of contributionRows) {
    const key = row.userId ?? '';
    totalsByUser.set(key, (totalsByUser.get(key) ?? 0) + Number(row.total ?? 0));
  }

  const perMember: GoalContributor[] = members.map((member) => {
    const amountCents = totalsByUser.get(member.userId) ?? 0;
    totalsByUser.delete(member.userId);
    return {
      memberId: member.id,
      displayName: member.displayName,
      accentColor: member.accentColor,
      amountCents,
      sharePercent: percentOf(amountCents, totalSavedCents),
    };
  });

  // Anything left over came from someone no longer in the household.
  const orphaned = [...totalsByUser.values()].reduce((sum, value) => sum + value, 0);
  if (orphaned > 0) {
    perMember.push({
      memberId: null,
      displayName: 'Do casal',
      accentColor: 'slate',
      amountCents: orphaned,
      sharePercent: percentOf(orphaned, totalSavedCents),
    });
  }

  return {
    goals: goalProgress,
    totalTargetCents: goalProgress.reduce((sum, goal) => sum + goal.targetCents, 0),
    totalSavedCents,
    perMember,
  };
}

/**
 * Finds a goal from something a person typed in the chat.
 *
 * Deliberately conservative: an exact-ish match wins, and anything ambiguous
 * returns every candidate so the caller can ask instead of guessing. Putting
 * money in the wrong goal is worse than one extra question.
 */
export function matchGoalByName<T extends { id: string; name: string }>(
  candidates: T[],
  typed: string,
): { match: T | null; ambiguous: T[] } {
  const needle = normalise(typed);
  if (!needle) return { match: null, ambiguous: [] };

  const exact = candidates.filter((goal) => normalise(goal.name) === needle);
  if (exact.length === 1) return { match: exact[0]!, ambiguous: [] };
  if (exact.length > 1) return { match: null, ambiguous: exact };

  const partial = candidates.filter((goal) => {
    const name = normalise(goal.name);
    return name.includes(needle) || needle.includes(name);
  });

  if (partial.length === 1) return { match: partial[0]!, ambiguous: [] };
  return { match: null, ambiguous: partial };
}

/** Lowercase, unaccented, no filler words — "a Viagem!" and "viagem" match. */
function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(a|o|as|os|da|de|do|das|dos|para|pra|na|no|meta|reserva)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
