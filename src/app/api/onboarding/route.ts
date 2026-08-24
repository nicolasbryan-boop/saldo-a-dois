import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { handle, jsonOk, readJson, amountCentsSchema } from '@/server/api';
import { getBaseContext } from '@/server/app-context';
import { households, householdMembers } from '@/db/schema';
import { updateHousehold } from '@/domains/households/service';
import {
  ensureCurrentCycle,
  setOpeningBalance,
  setPlannedReserve,
} from '@/domains/cycles/service';
import {
  createIncomeSource,
  createRecurringExpense,
  materializeDueRecurrences,
} from '@/domains/recurrences/service';
import { createGoal } from '@/domains/goals/service';
import { isSubscriptionActive } from '@/domains/billing/subscription';
import { trackEvent } from '@/domains/analytics/audit';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Everything a person declares about their own money. Both roles send this.
 *
 * There is no member id in here on purpose: onboarding always writes to the
 * member doing it. Letting the browser name an owner would reopen the
 * boundary the transactions service exists to hold.
 */
const personalSchema = {
  incomes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        amountCents: amountCentsSchema,
        dayOfMonth: z.number().int().min(1).max(31),
      }),
    )
    .max(12),
  bills: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        amountCents: amountCentsSchema,
        dayOfMonth: z.number().int().min(1).max(31),
        categoryId: z.string().max(64).nullable().optional(),
      }),
    )
    .max(40),
  goal: z
    .object({
      name: z.string().trim().min(1).max(80),
      targetCents: amountCentsSchema,
    })
    .nullable()
    .optional(),
};

/** The owner also sets up the household itself: name, cycle day, balances. */
const ownerSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  householdName: z.string().trim().min(1, 'Dê um nome ao espaço').max(80),
  cycleStartDay: z.number().int().min(1).max(28),
  openingBalanceCents: z.number().int().min(0).max(10_000_000_000),
  monthlyReserveCents: z.number().int().min(0).max(10_000_000_000),
  ...personalSchema,
});

/** The partner joins a household that is already configured. */
const partnerSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  ...personalSchema,
});

/**
 * Applies one person's onboarding.
 *
 * Runs on the base context rather than the subscription-gated one: for the
 * owner the household exists but has not been set up yet. The subscription is
 * still required — it is just checked here explicitly instead of by the gate.
 *
 * Which branch runs is decided by the member's role on the server. The
 * browser does not get to claim it is the owner.
 */
export const POST = handle(async (request) => {
  const { db, user, household } = await getBaseContext();

  if (!household) throw errors.notFound('Você ainda não tem um espaço financeiro.');
  if (!isSubscriptionActive(household.subscription)) throw errors.subscriptionRequired();

  if (household.member.onboardingCompletedAt) {
    throw errors.conflict('Você já fez a sua configuração inicial.');
  }

  const isOwner = household.role === 'owner';
  const memberId = household.member.id;
  const now = new Date();

  const body = isOwner
    ? await readJson(request, ownerSchema)
    : await readJson(request, partnerSchema);

  let householdRow = household.household;

  if (isOwner) {
    const owner = body as z.infer<typeof ownerSchema>;

    await updateHousehold(db, householdRow.id, user.id, {
      name: owner.householdName,
      cycleStartDay: owner.cycleStartDay,
      monthlyReserveCents: owner.monthlyReserveCents,
    });

    const refreshed = (
      await db.select().from(households).where(eq(households.id, householdRow.id)).limit(1)
    )[0];
    if (!refreshed) throw errors.internal();
    householdRow = refreshed;
  } else if (!householdRow.onboardingCompletedAt) {
    // The cycle start day is not decided yet, so there is nothing to attach
    // the partner's bills to.
    throw errors.conflict('Quem criou o espaço ainda não terminou a configuração.');
  }

  if (body.displayName) {
    await db
      .update(householdMembers)
      .set({ displayName: body.displayName })
      .where(
        and(
          eq(householdMembers.id, memberId),
          eq(householdMembers.householdId, householdRow.id),
        ),
      );
  }

  // Every source declared here belongs to the person declaring it. That is the
  // whole point of onboarding being per member.
  for (const income of body.incomes) {
    await createIncomeSource(db, householdRow.id, user.id, {
      name: income.name,
      amountCents: income.amountCents,
      dayOfMonth: income.dayOfMonth,
      memberId,
    });
  }

  for (const bill of body.bills) {
    await createRecurringExpense(db, householdRow.id, user.id, {
      name: bill.name,
      amountCents: bill.amountCents,
      dayOfMonth: bill.dayOfMonth,
      categoryId: bill.categoryId ?? null,
      memberId,
    });
  }

  if (body.goal) {
    await createGoal(db, householdRow.id, user.id, {
      name: body.goal.name,
      targetCents: body.goal.targetCents,
      monthlyPlanCents: isOwner
        ? (body as z.infer<typeof ownerSchema>).monthlyReserveCents
        : 0,
    });
  }

  if (isOwner) {
    const owner = body as z.infer<typeof ownerSchema>;

    // The cycle is (re)built after the start day is known, then seeded with
    // the opening balance, the reserve target and this cycle's occurrences.
    const cycle = await ensureCurrentCycle(db, householdRow);
    await setOpeningBalance(db, householdRow.id, cycle.id, owner.openingBalanceCents);
    await setPlannedReserve(db, householdRow.id, cycle.id, owner.monthlyReserveCents);
    await materializeDueRecurrences(db, householdRow, cycle);

    await db
      .update(households)
      .set({ onboardingCompletedAt: now, updatedAt: now })
      .where(eq(households.id, householdRow.id));
  } else {
    // The household cycle already exists; the partner's new bills just need to
    // show up in it.
    const cycle = await ensureCurrentCycle(db, householdRow);
    await materializeDueRecurrences(db, householdRow, cycle);
  }

  await db
    .update(householdMembers)
    .set({ onboardingCompletedAt: now })
    .where(eq(householdMembers.id, memberId));

  await trackEvent(db, {
    name: 'onboarding_completed',
    householdId: householdRow.id,
    userId: user.id,
    props: { role: household.role, incomes: body.incomes.length, bills: body.bills.length },
  });

  return jsonOk({ ok: true, redirectTo: '/app' });
});
