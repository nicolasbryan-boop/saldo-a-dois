import { sql, eq, gte, desc } from 'drizzle-orm';
import type { Database } from '@/db';
import {
  user as userTable,
  households,
  subscriptions,
  transactions,
  assistantMessages,
  analyticsEvents,
  errorLogs,
  checkoutSessions,
  householdMembers,
} from '@/db/schema';

/**
 * ADMIN METRICS
 * =============
 * Aggregates only. Nothing here reads a single couple's transactions,
 * descriptions, balances or assistant messages — an operator can see how many
 * movements exist, never what they say.
 *
 * A support tool that needs per-household data would have to be designed
 * separately, with explicit consent and its own audit trail.
 */

export interface AdminMetrics {
  users: { total: number; last7Days: number; last30Days: number };
  households: { total: number; onboarded: number; withPartner: number };
  subscriptions: {
    active: number;
    pending: number;
    pastDue: number;
    canceled: number;
    expired: number;
    mrrCents: number;
  };
  checkouts: { started: number; paid: number; claimed: number };
  activity: { transactions: number; transactionsLast7Days: number };
  assistant: {
    messages: number;
    aiCalls: number;
    localCalls: number;
    tokensUsed: number;
    localShare: number;
  };
  funnel: Array<{ name: string; count: number }>;
  errors: Array<{ id: string; scope: string; message: string; createdAt: number }>;
}

async function scalar(promise: Promise<Array<{ value: number | null }>>): Promise<number> {
  const rows = await promise;
  return Number(rows[0]?.value ?? 0);
}

export async function loadAdminMetrics(db: Database): Promise<AdminMetrics> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000);
  const thirtyDaysAgo = new Date(now - 30 * 86_400_000);

  const [
    totalUsers,
    users7,
    users30,
    totalHouseholds,
    onboardedHouseholds,
    memberCounts,
    subscriptionRows,
    checkoutRows,
    totalTransactions,
    transactions7,
    assistantRows,
    funnelRows,
    recentErrors,
  ] = await Promise.all([
    scalar(db.select({ value: sql<number>`count(*)` }).from(userTable)),
    scalar(
      db
        .select({ value: sql<number>`count(*)` })
        .from(userTable)
        .where(gte(userTable.createdAt, sevenDaysAgo)),
    ),
    scalar(
      db
        .select({ value: sql<number>`count(*)` })
        .from(userTable)
        .where(gte(userTable.createdAt, thirtyDaysAgo)),
    ),
    scalar(db.select({ value: sql<number>`count(*)` }).from(households)),
    scalar(
      db
        .select({ value: sql<number>`count(*)` })
        .from(households)
        .where(sql`${households.onboardingCompletedAt} is not null`),
    ),
    db
      .select({
        householdId: householdMembers.householdId,
        total: sql<number>`count(*)`,
      })
      .from(householdMembers)
      .where(eq(householdMembers.status, 'active'))
      .groupBy(householdMembers.householdId),
    db
      .select({
        status: subscriptions.status,
        total: sql<number>`count(*)`,
        priceSum: sql<number>`sum(${subscriptions.priceCents})`,
      })
      .from(subscriptions)
      .groupBy(subscriptions.status),
    db
      .select({ status: checkoutSessions.status, total: sql<number>`count(*)` })
      .from(checkoutSessions)
      .groupBy(checkoutSessions.status),
    scalar(db.select({ value: sql<number>`count(*)` }).from(transactions)),
    scalar(
      db
        .select({ value: sql<number>`count(*)` })
        .from(transactions)
        .where(gte(transactions.createdAt, sevenDaysAgo)),
    ),
    db
      .select({
        resolvedBy: assistantMessages.resolvedBy,
        total: sql<number>`count(*)`,
        tokens: sql<number>`sum(${assistantMessages.tokensUsed})`,
      })
      .from(assistantMessages)
      .where(eq(assistantMessages.role, 'user'))
      .groupBy(assistantMessages.resolvedBy),
    db
      .select({ name: analyticsEvents.name, total: sql<number>`count(*)` })
      .from(analyticsEvents)
      .groupBy(analyticsEvents.name),
    db
      .select({
        id: errorLogs.id,
        scope: errorLogs.scope,
        message: errorLogs.message,
        createdAt: errorLogs.createdAt,
      })
      .from(errorLogs)
      .orderBy(desc(errorLogs.createdAt))
      .limit(15),
  ]);

  const byStatus = (status: string) =>
    Number(subscriptionRows.find((row) => row.status === status)?.total ?? 0);

  const activeMrr = Number(
    subscriptionRows.find((row) => row.status === 'active')?.priceSum ?? 0,
  );

  const localMessages = assistantRows
    .filter((row) => row.resolvedBy === 'rules')
    .reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const aiMessages = assistantRows
    .filter((row) => row.resolvedBy && row.resolvedBy !== 'rules')
    .reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const tokensUsed = assistantRows.reduce((sum, row) => sum + Number(row.tokens ?? 0), 0);
  const totalMessages = localMessages + aiMessages;

  const checkoutBy = (status: string) =>
    Number(checkoutRows.find((row) => row.status === status)?.total ?? 0);

  const FUNNEL_ORDER = [
    'landing_view',
    'pricing_view',
    'checkout_started',
    'account_created',
    'onboarding_started',
    'onboarding_completed',
    'partner_invited',
    'partner_joined',
    'transaction_created',
    'assistant_used',
    'goal_created',
    'pwa_installed',
  ];

  return {
    users: { total: totalUsers, last7Days: users7, last30Days: users30 },
    households: {
      total: totalHouseholds,
      onboarded: onboardedHouseholds,
      withPartner: memberCounts.filter((row) => Number(row.total) >= 2).length,
    },
    subscriptions: {
      active: byStatus('active'),
      pending: byStatus('pending'),
      pastDue: byStatus('past_due'),
      canceled: byStatus('canceled'),
      expired: byStatus('expired'),
      mrrCents: activeMrr,
    },
    checkouts: {
      started: checkoutRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
      paid: checkoutBy('paid'),
      claimed: checkoutBy('claimed'),
    },
    activity: { transactions: totalTransactions, transactionsLast7Days: transactions7 },
    assistant: {
      messages: totalMessages,
      aiCalls: aiMessages,
      localCalls: localMessages,
      tokensUsed,
      localShare: totalMessages > 0 ? localMessages / totalMessages : 1,
    },
    funnel: FUNNEL_ORDER.map((name) => ({
      name,
      count: Number(funnelRows.find((row) => row.name === name)?.total ?? 0),
    })),
    errors: recentErrors.map((row) => ({
      id: row.id,
      scope: row.scope,
      message: row.message,
      createdAt: row.createdAt.getTime(),
    })),
  };
}
