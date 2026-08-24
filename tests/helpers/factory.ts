import type { Database } from '@/db';
import { user as userTable, households } from '@/db/schema';
import { ids, randomId } from '@/lib/ids';
import { createHousehold } from '@/domains/households/service';
import { ensureCurrentCycle, setOpeningBalance, type CycleRow } from '@/domains/cycles/service';
import { activateSubscriptionForHousehold } from '@/domains/billing/subscription';
import type { ActorContext } from '@/domains/transactions/service';
import type { LocalDate } from '@/lib/dates';
import { eq } from 'drizzle-orm';

/** Builders that mirror what the real signup + onboarding flow produces. */

export async function makeUser(
  db: Database,
  overrides: { name?: string; email?: string } = {},
): Promise<{ id: string; name: string; email: string }> {
  const id = `usr_${randomId(16)}`;
  const name = overrides.name ?? 'Ana';
  const email = overrides.email ?? `${randomId(10)}@exemplo.test`;
  const now = new Date();

  await db.insert(userTable).values({
    id,
    name,
    email,
    emailVerified: false,
    mustChangePassword: false,
    isAdmin: false,
    createdAt: now,
    updatedAt: now,
  });

  return { id, name, email };
}

export interface TestHousehold {
  householdId: string;
  ownerUserId: string;
  ownerMemberId: string;
  cycle: CycleRow;
  actor: ActorContext;
}

export async function makeHousehold(
  db: Database,
  options: {
    name?: string;
    cycleStartDay?: number;
    openingBalanceCents?: number;
    monthlyReserveCents?: number;
    today?: LocalDate;
    withSubscription?: boolean;
  } = {},
): Promise<TestHousehold> {
  const owner = await makeUser(db, { name: 'Ana' });

  const { household, member } = await createHousehold(db, {
    name: options.name ?? 'Ana & Lucas',
    ownerUserId: owner.id,
    ownerDisplayName: 'Ana',
    cycleStartDay: options.cycleStartDay ?? 5,
  });

  if (options.monthlyReserveCents !== undefined) {
    await db
      .update(households)
      .set({ monthlyReserveCents: options.monthlyReserveCents })
      .where(eq(households.id, household.id));
  }

  const refreshed = (
    await db.select().from(households).where(eq(households.id, household.id)).limit(1)
  )[0]!;

  const cycle = await ensureCurrentCycle(db, refreshed, options.today);

  if (options.openingBalanceCents !== undefined) {
    await setOpeningBalance(db, household.id, cycle.id, options.openingBalanceCents);
  }

  if (options.monthlyReserveCents !== undefined) {
    await db
      .update(households)
      .set({ monthlyReserveCents: options.monthlyReserveCents })
      .where(eq(households.id, household.id));
  }

  if (options.withSubscription !== false) {
    await activateSubscriptionForHousehold(db, {
      householdId: household.id,
      ownerUserId: owner.id,
      provider: 'mock',
      providerCustomerId: `cus_${ids.subscription()}`,
      providerSubscriptionId: `sub_${ids.subscription()}`,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    });
  }

  const finalCycle = (await ensureCurrentCycle(db, refreshed, options.today))!;

  return {
    householdId: household.id,
    ownerUserId: owner.id,
    ownerMemberId: member.id,
    cycle: finalCycle,
    actor: { household: refreshed, userId: owner.id, memberId: member.id },
  };
}

/** Reloads a household row so tests see service-side mutations. */
export async function reloadHousehold(db: Database, householdId: string) {
  const rows = await db.select().from(households).where(eq(households.id, householdId)).limit(1);
  return rows[0]!;
}
