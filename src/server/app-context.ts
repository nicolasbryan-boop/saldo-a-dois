import { cache } from 'react';
import type { Database } from '@/db';
import { getRuntime } from './context';
import { requireActiveUser, type SessionUser } from '@/domains/auth/session';
import {
  loadContext,
  type HouseholdContext,
} from '@/domains/households/service';
import { ensureCurrentCycle, type CycleRow } from '@/domains/cycles/service';
import { materializeDueRecurrences } from '@/domains/recurrences/service';
import { isSubscriptionActive } from '@/domains/billing/subscription';
import { errors } from '@/lib/errors';
import { todayIn, type LocalDate } from '@/lib/dates';
import type { ActorContext } from '@/domains/transactions/service';

/**
 * The single entry point every authenticated surface uses.
 *
 * It resolves identity from the session cookie, then the household from that
 * identity. A household id is never read from a request body, query string or
 * header, which is what makes cross-tenant access impossible by construction
 * rather than by remembering to check.
 */

export interface AppContext extends HouseholdContext {
  db: Database;
  user: SessionUser;
  cycle: CycleRow;
  today: LocalDate;
  /** Shape expected by the transaction and goal services. */
  actor: ActorContext;
}

/** Per-request memoisation: several components may ask for the same context. */
const resolve = cache(async (): Promise<AppContext> => {
  const user = await requireActiveUser();
  const { db } = await getRuntime();

  const household = await loadContext(db, user.id);
  if (!household) {
    throw errors.notFound('Você ainda não tem um espaço financeiro.');
  }

  if (!isSubscriptionActive(household.subscription)) {
    throw errors.subscriptionRequired();
  }

  // Onboarding is what decides the cycle start day. Creating a cycle before
  // that would materialise one on the provisional day and leave a stale,
  // overlapping cycle behind the moment the real day is chosen.
  if (!household.household.onboardingCompletedAt) {
    throw errors.onboardingRequired();
  }

  const cycle = await ensureCurrentCycle(db, household.household);
  await materializeDueRecurrences(db, household.household, cycle);

  return {
    ...household,
    db,
    user,
    cycle,
    today: todayIn(household.household.timezone),
    actor: {
      household: household.household,
      userId: user.id,
      memberId: household.member.id,
    },
  };
});

export function getAppContext(): Promise<AppContext> {
  return resolve();
}

/**
 * Context without the subscription gate — used by the onboarding and billing
 * surfaces themselves, which must remain reachable while a subscription is
 * being set up. It still requires a real session and a real membership.
 */
export async function getBaseContext(): Promise<{
  db: Database;
  user: SessionUser;
  household: HouseholdContext | null;
}> {
  const user = await requireActiveUser();
  const { db } = await getRuntime();
  const household = await loadContext(db, user.id);
  return { db, user, household };
}
