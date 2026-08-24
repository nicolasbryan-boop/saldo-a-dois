import { and, eq, asc } from 'drizzle-orm';
import type { Database } from '@/db';
import {
  households,
  householdMembers,
  subscriptions,
  user as userTable,
  type HouseholdMemberRole,
} from '@/db/schema';
import { ids } from '@/lib/ids';
import { errors } from '@/lib/errors';
import { DEFAULT_TIMEZONE } from '@/lib/dates';
import { pricing } from '@/config';
import { seedHouseholdCategories } from './categories';
import { writeAudit } from '@/domains/analytics/audit';

/**
 * TENANT ISOLATION
 * ================
 * A household id is never accepted from the client. Every read and write
 * resolves the household from the authenticated user's membership row, and
 * `assertMembership` is the only door into a household by id (used by internal
 * callers and by the tests that prove cross-household access is refused).
 */

export type HouseholdRow = typeof households.$inferSelect;
export type HouseholdMemberRow = typeof householdMembers.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;

export interface HouseholdContext {
  household: HouseholdRow;
  /** The membership row of the acting user. */
  member: HouseholdMemberRow;
  members: HouseholdMemberRow[];
  role: HouseholdMemberRole;
  subscription: SubscriptionRow | null;
}

export const ACCENT_COLORS = ['rose', 'sky', 'amber', 'emerald', 'violet'] as const;

/** Active membership of `userId` in `householdId`, or null. */
export async function getMembership(
  db: Database,
  userId: string,
  householdId: string,
): Promise<HouseholdMemberRow | null> {
  const rows = await db
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.userId, userId),
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.status, 'active'),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Throws 403 when the user is not an active member. This is the single
 * authorization primitive for tenant data.
 */
export async function assertMembership(
  db: Database,
  userId: string,
  householdId: string,
): Promise<HouseholdMemberRow> {
  const membership = await getMembership(db, userId, householdId);
  if (!membership) throw errors.forbidden();
  return membership;
}

export async function assertOwner(
  db: Database,
  userId: string,
  householdId: string,
): Promise<HouseholdMemberRow> {
  const membership = await assertMembership(db, userId, householdId);
  if (membership.role !== 'owner') {
    throw errors.forbidden('Apenas quem criou o espaço pode fazer isso.');
  }
  return membership;
}

/** The household the user currently belongs to, or null if they have none. */
export async function findHouseholdForUser(
  db: Database,
  userId: string,
): Promise<HouseholdRow | null> {
  const rows = await db
    .select({ household: households })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(
      and(eq(householdMembers.userId, userId), eq(householdMembers.status, 'active')),
    )
    .orderBy(asc(householdMembers.joinedAt))
    .limit(1);

  return rows[0]?.household ?? null;
}

export async function loadContext(
  db: Database,
  userId: string,
): Promise<HouseholdContext | null> {
  const household = await findHouseholdForUser(db, userId);
  if (!household) return null;

  const members = await listMembers(db, household.id);
  const member = members.find((m) => m.userId === userId);
  if (!member) return null;

  const subscription = await getSubscription(db, household.id);

  return { household, member, members, role: member.role, subscription };
}

export async function requireContext(
  db: Database,
  userId: string,
): Promise<HouseholdContext> {
  const context = await loadContext(db, userId);
  if (!context) {
    throw errors.notFound('Você ainda não tem um espaço financeiro.');
  }
  return context;
}

export async function listMembers(
  db: Database,
  householdId: string,
): Promise<HouseholdMemberRow[]> {
  return db
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.status, 'active'),
      ),
    )
    .orderBy(asc(householdMembers.joinedAt));
}

export async function getSubscription(
  db: Database,
  householdId: string,
): Promise<SubscriptionRow | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.householdId, householdId))
    .limit(1);
  return rows[0] ?? null;
}

export interface CreateHouseholdInput {
  name: string;
  ownerUserId: string;
  ownerDisplayName: string;
  cycleStartDay?: number;
  timezone?: string;
}

export async function createHousehold(
  db: Database,
  input: CreateHouseholdInput,
): Promise<{ household: HouseholdRow; member: HouseholdMemberRow }> {
  const existing = await findHouseholdForUser(db, input.ownerUserId);
  if (existing) {
    throw errors.conflict('Você já faz parte de um espaço financeiro.');
  }

  const now = new Date();
  const householdId = ids.household();
  const memberId = ids.member();
  const cycleStartDay = clampCycleDay(input.cycleStartDay ?? 1);

  await db.insert(households).values({
    id: householdId,
    name: input.name,
    ownerUserId: input.ownerUserId,
    cycleStartDay,
    timezone: input.timezone ?? DEFAULT_TIMEZONE,
    currency: pricing.currency,
    monthlyReserveCents: 0,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(householdMembers).values({
    id: memberId,
    householdId,
    userId: input.ownerUserId,
    role: 'owner',
    displayName: input.ownerDisplayName,
    accentColor: 'rose',
    status: 'active',
    joinedAt: now,
  });

  await seedHouseholdCategories(db, householdId, now);

  await writeAudit(db, {
    householdId,
    actorUserId: input.ownerUserId,
    action: 'household.created',
    entity: 'household',
    entityId: householdId,
  });

  const household = (
    await db.select().from(households).where(eq(households.id, householdId)).limit(1)
  )[0];
  const member = (
    await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, memberId))
      .limit(1)
  )[0];

  if (!household || !member) throw errors.internal();
  return { household, member };
}

export interface UpdateHouseholdInput {
  name?: string;
  cycleStartDay?: number;
  monthlyReserveCents?: number;
}

export async function updateHousehold(
  db: Database,
  householdId: string,
  actorUserId: string,
  input: UpdateHouseholdInput,
): Promise<HouseholdRow> {
  await assertMembership(db, actorUserId, householdId);

  const patch: Partial<typeof households.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.cycleStartDay !== undefined) patch.cycleStartDay = clampCycleDay(input.cycleStartDay);
  if (input.monthlyReserveCents !== undefined) {
    patch.monthlyReserveCents = Math.max(0, Math.round(input.monthlyReserveCents));
  }

  await db.update(households).set(patch).where(eq(households.id, householdId));

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'household.updated',
    entity: 'household',
    entityId: householdId,
    meta: { fields: Object.keys(input) },
  });

  const rows = await db.select().from(households).where(eq(households.id, householdId)).limit(1);
  const row = rows[0];
  if (!row) throw errors.notFound();
  return row;
}

/** Enforces the hard product rule: a Básico household holds two people. */
export async function assertCanAddMember(
  db: Database,
  householdId: string,
): Promise<void> {
  const members = await listMembers(db, householdId);
  if (members.length >= pricing.maxMembers) {
    throw errors.memberLimitReached();
  }
}

export async function addMember(
  db: Database,
  params: {
    householdId: string;
    userId: string;
    displayName: string;
    role: HouseholdMemberRole;
    actorUserId: string;
  },
): Promise<HouseholdMemberRow> {
  await assertCanAddMember(db, params.householdId);

  const already = await db
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, params.householdId),
        eq(householdMembers.userId, params.userId),
      ),
    )
    .limit(1);

  const now = new Date();

  if (already[0]) {
    // Re-activating a previously removed member instead of duplicating them.
    await db
      .update(householdMembers)
      .set({ status: 'active', removedAt: null, displayName: params.displayName, joinedAt: now })
      .where(eq(householdMembers.id, already[0].id));
    const refreshed = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, already[0].id))
      .limit(1);
    if (!refreshed[0]) throw errors.internal();
    return refreshed[0];
  }

  const memberId = ids.member();
  await db.insert(householdMembers).values({
    id: memberId,
    householdId: params.householdId,
    userId: params.userId,
    role: params.role,
    displayName: params.displayName,
    accentColor: 'sky',
    status: 'active',
    joinedAt: now,
  });

  await writeAudit(db, {
    householdId: params.householdId,
    actorUserId: params.actorUserId,
    action: 'household.member_added',
    entity: 'household_member',
    entityId: memberId,
    meta: { role: params.role },
  });

  const rows = await db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.id, memberId))
    .limit(1);
  if (!rows[0]) throw errors.internal();
  return rows[0];
}

export async function removeMember(
  db: Database,
  householdId: string,
  actorUserId: string,
  memberId: string,
): Promise<void> {
  await assertOwner(db, actorUserId, householdId);

  const rows = await db
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.id, memberId),
        eq(householdMembers.householdId, householdId),
      ),
    )
    .limit(1);

  const target = rows[0];
  if (!target) throw errors.notFound('Pessoa não encontrada neste espaço.');
  if (target.role === 'owner') {
    throw errors.conflict('Não é possível remover quem criou o espaço.');
  }

  await db
    .update(householdMembers)
    .set({ status: 'removed', removedAt: new Date() })
    .where(eq(householdMembers.id, memberId));

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'household.member_removed',
    entity: 'household_member',
    entityId: memberId,
  });
}

export async function findUserByEmail(db: Database, email: string) {
  const rows = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

export function clampCycleDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, Math.round(day)));
}

/**
 * The cycle start day is capped at 28 on purpose: days 29-31 do not exist in
 * every month, and a cycle boundary that silently moves is worse than one that
 * is predictable. Bill due dates keep the full 1-31 range and are clamped per
 * month instead.
 */
