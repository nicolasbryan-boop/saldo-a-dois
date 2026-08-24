import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { handle, jsonOk, readJson, amountCentsSchema } from '@/server/api';
import { getBaseContext } from '@/server/app-context';
import { households } from '@/db/schema';
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

const schema = z.object({
  householdName: z.string().trim().min(1, 'Dê um nome ao espaço').max(80),
  cycleStartDay: z.number().int().min(1).max(28),
  openingBalanceCents: z.number().int().min(0).max(10_000_000_000),
  monthlyReserveCents: z.number().int().min(0).max(10_000_000_000),
  incomes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        amountCents: amountCentsSchema,
        dayOfMonth: z.number().int().min(1).max(31),
        memberId: z.string().max(64).nullable().optional(),
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
});

/**
 * Applies the whole onboarding in one request.
 *
 * Runs on the base context rather than the subscription-gated one: the
 * household exists but has not been set up yet. The subscription is still
 * required — it is just checked here explicitly instead of by the app gate.
 */
export const POST = handle(async (request) => {
  const { db, user, household } = await getBaseContext();

  if (!household) throw errors.notFound('Você ainda não tem um espaço financeiro.');
  if (!isSubscriptionActive(household.subscription)) throw errors.subscriptionRequired();
  if (household.role !== 'owner') {
    throw errors.forbidden('Só quem criou o espaço faz a configuração inicial.');
  }

  const body = await readJson(request, schema);

  await updateHousehold(db, household.household.id, user.id, {
    name: body.householdName,
    cycleStartDay: body.cycleStartDay,
    monthlyReserveCents: body.monthlyReserveCents,
  });

  const refreshed = (
    await db.select().from(households).where(eq(households.id, household.household.id)).limit(1)
  )[0];
  if (!refreshed) throw errors.internal();

  for (const income of body.incomes) {
    await createIncomeSource(db, refreshed.id, user.id, {
      name: income.name,
      amountCents: income.amountCents,
      dayOfMonth: income.dayOfMonth,
      memberId: income.memberId ?? household.member.id,
    });
  }

  for (const bill of body.bills) {
    await createRecurringExpense(db, refreshed.id, user.id, {
      name: bill.name,
      amountCents: bill.amountCents,
      dayOfMonth: bill.dayOfMonth,
      categoryId: bill.categoryId ?? null,
    });
  }

  if (body.goal) {
    await createGoal(db, refreshed.id, user.id, {
      name: body.goal.name,
      targetCents: body.goal.targetCents,
      monthlyPlanCents: body.monthlyReserveCents,
    });
  }

  // The cycle is (re)built after the start day is known, then seeded with the
  // opening balance, the reserve target and this cycle's occurrences.
  const cycle = await ensureCurrentCycle(db, refreshed);
  await setOpeningBalance(db, refreshed.id, cycle.id, body.openingBalanceCents);
  await setPlannedReserve(db, refreshed.id, cycle.id, body.monthlyReserveCents);
  await materializeDueRecurrences(db, refreshed, cycle);

  await db
    .update(households)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(households.id, refreshed.id));

  await trackEvent(db, {
    name: 'onboarding_completed',
    householdId: refreshed.id,
    userId: user.id,
    props: { incomes: body.incomes.length, bills: body.bills.length },
  });

  return jsonOk({ ok: true, redirectTo: '/app' });
});
