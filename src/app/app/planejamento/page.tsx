import type { Metadata } from 'next';
import { and, eq, isNull, asc } from 'drizzle-orm';
import { getAppContext } from '@/server/app-context';
import {
  listRecurringExpenses,
  listIncomeSources,
  listInstances,
} from '@/domains/recurrences/service';
import { listGoals } from '@/domains/goals/service';
import { loadCoupleGoals } from '@/domains/goals/progress';
import { categories as categoriesTable } from '@/db/schema';
import { PlanningView } from '@/components/app/planning-view';
import type { LocalDate } from '@/lib/dates';

export const metadata: Metadata = { title: 'Planejamento' };
export const dynamic = 'force-dynamic';

export default async function PlanningPage() {
  const context = await getAppContext();

  const [bills, incomes, goals, coupleGoals, instances, categoryRows] = await Promise.all([
    listRecurringExpenses(context.db, context.household.id),
    listIncomeSources(context.db, context.household.id),
    listGoals(context.db, context.household.id),
    loadCoupleGoals(context.db, context.household.id),
    listInstances(context.db, context.household.id, context.cycle.id, ['pending']),
    context.db
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
          eq(categoriesTable.householdId, context.household.id),
          isNull(categoriesTable.archivedAt),
        ),
      )
      .orderBy(asc(categoriesTable.sortOrder)),
  ]);

  return (
    <PlanningView
      bills={bills.map((bill) => ({
        id: bill.id,
        name: bill.name,
        amountCents: bill.amountCents,
        dayOfMonth: bill.dayOfMonth,
        categoryId: bill.categoryId,
        active: bill.active,
      }))}
      incomes={incomes.map((income) => ({
        id: income.id,
        name: income.name,
        amountCents: income.amountCents,
        dayOfMonth: income.dayOfMonth,
        memberId: income.memberId,
        active: income.active,
      }))}
      goals={goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        targetCents: goal.targetCents,
        currentCents: goal.currentCents,
        monthlyPlanCents: goal.monthlyPlanCents,
      }))}
      coupleGoals={coupleGoals}
      instances={instances.map((instance) => ({
        id: instance.id,
        name: instance.name,
        amountCents: instance.amountCents,
        dueDate: instance.dueDate,
        status: instance.status,
        sourceType: instance.sourceType,
      }))}
      categories={categoryRows}
      members={context.members.map((member) => ({
        id: member.id,
        name: member.displayName,
      }))}
      household={{
        name: context.household.name,
        cycleStartDay: context.household.cycleStartDay,
        monthlyReserveCents: context.household.monthlyReserveCents,
      }}
      cycle={{
        label: context.cycle.label,
        startDate: context.cycle.startDate as LocalDate,
        endDate: context.cycle.endDate as LocalDate,
      }}
      isOwner={context.role === 'owner'}
    />
  );
}
