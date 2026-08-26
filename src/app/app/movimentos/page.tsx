import type { Metadata } from 'next';
import { and, eq, isNull, asc } from 'drizzle-orm';
import { getAppContext } from '@/server/app-context';
import { listTransactions, countTransactions } from '@/domains/transactions/service';
import { getCycleTotals } from '@/domains/cycles/service';
import { categories as categoriesTable, transactionTypes } from '@/db/schema';
import { loadCoupleMoney } from '@/domains/transactions/member-summary';
import { MovementsView } from '@/components/app/movements-view';

export const metadata: Metadata = { title: 'Movimentos' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

type Params = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const context = await getAppContext();
  const params = await searchParams;

  const typeParam = single(params.type);
  const type = (transactionTypes as readonly string[]).includes(typeParam ?? '')
    ? (typeParam as (typeof transactionTypes)[number])
    : undefined;

  const memberId = single(params.memberId);
  const categoryId = single(params.categoryId);
  const from = single(params.from);
  const to = single(params.to);
  const offset = Math.max(0, Number(single(params.offset) ?? 0) || 0);

  const filters = {
    types: type ? [type] : undefined,
    memberIds: memberId ? [memberId] : undefined,
    categoryIds: categoryId ? [categoryId] : undefined,
    from,
    to,
    limit: PAGE_SIZE,
    offset,
  };

  const [transactions, total, cycleTotals, money, categoryRows] = await Promise.all([
    listTransactions(context.db, context.household.id, filters),
    countTransactions(context.db, context.household.id, filters),
    getCycleTotals(context.db, context.household.id, context.cycle.id),
    loadCoupleMoney(context.db, {
      householdId: context.household.id,
      cycleId: context.cycle.id,
      actorMemberId: context.actor.memberId,
    }),
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
    <MovementsView
      transactions={transactions}
      total={total}
      today={context.today}
      pageSize={PAGE_SIZE}
      cycleLabel={context.cycle.label}
      money={money}
      totals={{
        expense: cycleTotals.expense,
        income: cycleTotals.income,
        reserve: cycleTotals.reserve,
      }}
      members={context.members.map((member) => ({
        id: member.id,
        name: member.displayName,
      }))}
      categories={categoryRows}
    />
  );
}
