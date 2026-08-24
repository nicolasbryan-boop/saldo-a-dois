import { and, eq, isNull, asc } from 'drizzle-orm';
import { handle, jsonOk } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { categories } from '@/db/schema';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const context = await getAppContext();

  const items = await context.db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      kind: categories.kind,
    })
    .from(categories)
    .where(
      and(
        eq(categories.householdId, context.household.id),
        isNull(categories.archivedAt),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return jsonOk({ items });
});
