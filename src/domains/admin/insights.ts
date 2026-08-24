import { sql, eq, and, gte, desc, like, or, count } from 'drizzle-orm';
import type { Database } from '@/db';
import {
  user as userTable,
  households,
  householdMembers,
  subscriptions,
  checkoutSessions,
  paymentEvents,
  partnerInvites,
  transactions,
  errorLogs,
} from '@/db/schema';
import { planIds, getPlan, type PlanId } from '@/config';
import { readEnv } from '@/server/context';

/**
 * ADMIN INSIGHTS
 * ==============
 * The second half of the admin panel: per-plan counts, daily growth, invite
 * funnel, a searchable customer list and a live system check.
 *
 * Same rule as `metrics.ts`: aggregates only, except the customer table, which
 * shows account-level facts (name, e-mail, plan, status, member count) and
 * deliberately no financial detail. An operator can see that a couple has 47
 * movements; never what any of them says or is worth.
 */

const DAY_MS = 86_400_000;

/** Midnight today, in the operator's terms. Good enough for a "new today". */
function startOfToday(now: Date): Date {
  const copy = new Date(now.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export interface PlanBreakdown {
  planId: PlanId;
  name: string;
  priceCents: number;
  active: number;
  /** Active subscriptions on this plan, normalised to a monthly figure. */
  monthlyCents: number;
}

export interface DailyPoint {
  /** 'YYYY-MM-DD'. */
  day: string;
  signups: number;
  subscriptions: number;
}

export interface CustomerRow {
  householdId: string;
  name: string;
  email: string;
  planId: string | null;
  planName: string | null;
  status: string | null;
  createdAt: number;
  members: number;
  lastActivityAt: number | null;
}

export interface SystemStatus {
  /** 'stripe' | 'mercadopago' | 'mock' — whatever PAYMENT_PROVIDER says. */
  paymentProvider: string;
  /**
   * Test vs live, read from the key prefix. The key itself never leaves the
   * Worker and is never returned here.
   */
  paymentMode: 'teste' | 'produção' | 'não configurado';
  paymentConfigured: boolean;
  /** Which plan Price IDs are actually set. */
  missingPriceEnvs: string[];
  webhookSecretSet: boolean;
  database: 'ok' | 'falha';
  /** Webhook deliveries we rejected or failed to process. */
  webhookFailures: Array<{
    id: string;
    provider: string;
    type: string;
    note: string | null;
    at: number;
  }>;
  lastWebhookAt: number | null;
}

export interface AdminInsights {
  usersToday: number;
  plans: PlanBreakdown[];
  daily: DailyPoint[];
  invites: { sent: number; accepted: number; pending: number };
  couples: { complete: number; solo: number };
  payments: { failed: number; checkoutsStarted: number; checkoutsPaid: number };
}

export async function loadAdminInsights(
  db: Database,
  now: Date = new Date(),
): Promise<AdminInsights> {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const today = startOfToday(now);

  const [
    todayRows,
    planRows,
    signupRows,
    subscriptionRows,
    inviteRows,
    memberCountRows,
    failedRows,
    checkoutRows,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(userTable)
      .where(gte(userTable.createdAt, today)),

    db
      .select({
        planId: subscriptions.planId,
        n: count(),
      })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'))
      .groupBy(subscriptions.planId),

    db
      .select({
        day: sql<string>`date(${userTable.createdAt} / 1000, 'unixepoch')`,
        n: count(),
      })
      .from(userTable)
      .where(gte(userTable.createdAt, since30))
      .groupBy(sql`1`),

    db
      .select({
        day: sql<string>`date(${subscriptions.createdAt} / 1000, 'unixepoch')`,
        n: count(),
      })
      .from(subscriptions)
      .where(gte(subscriptions.createdAt, since30))
      .groupBy(sql`1`),

    db
      .select({ status: partnerInvites.status, n: count() })
      .from(partnerInvites)
      .groupBy(partnerInvites.status),

    db
      .select({
        householdId: householdMembers.householdId,
        n: count(),
      })
      .from(householdMembers)
      .where(eq(householdMembers.status, 'active'))
      .groupBy(householdMembers.householdId),

    db
      .select({ n: count() })
      .from(paymentEvents)
      .where(eq(paymentEvents.status, 'failed')),

    db
      .select({ status: checkoutSessions.status, n: count() })
      .from(checkoutSessions)
      .groupBy(checkoutSessions.status),
  ]);

  const activeByPlan = new Map(planRows.map((row) => [row.planId, Number(row.n)]));

  const plans: PlanBreakdown[] = planIds.map((id) => {
    const plan = getPlan(id);
    const active = activeByPlan.get(id) ?? 0;
    return {
      planId: id,
      name: plan.name,
      priceCents: plan.priceCents,
      active,
      // A yearly subscriber is not 229,90 of monthly revenue.
      monthlyCents: Math.round((plan.priceCents / plan.intervalMonths) * active),
    };
  });

  // One row per day for the last 30, including the days nothing happened —
  // a sparse series makes a flat week look like a busy one.
  const signupsByDay = new Map(signupRows.map((row) => [row.day, Number(row.n)]));
  const subsByDay = new Map(subscriptionRows.map((row) => [row.day, Number(row.n)]));

  const daily: DailyPoint[] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const day = new Date(now.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
    daily.push({
      day,
      signups: signupsByDay.get(day) ?? 0,
      subscriptions: subsByDay.get(day) ?? 0,
    });
  }

  const inviteBy = (status: string) =>
    Number(inviteRows.find((row) => row.status === status)?.n ?? 0);

  const checkoutBy = (status: string) =>
    Number(checkoutRows.find((row) => row.status === status)?.n ?? 0);

  const complete = memberCountRows.filter((row) => Number(row.n) >= 2).length;

  return {
    usersToday: Number(todayRows[0]?.n ?? 0),
    plans,
    daily,
    invites: {
      sent: inviteRows.reduce((sum, row) => sum + Number(row.n), 0),
      accepted: inviteBy('accepted'),
      pending: inviteBy('pending'),
    },
    couples: { complete, solo: memberCountRows.length - complete },
    payments: {
      failed: Number(failedRows[0]?.n ?? 0),
      checkoutsStarted: checkoutRows.reduce((sum, row) => sum + Number(row.n), 0),
      // 'claimed' means paid and already turned into an account.
      checkoutsPaid: checkoutBy('paid') + checkoutBy('claimed'),
    },
  };
}

/**
 * Customer list.
 *
 * One row per household, keyed on the owner's account. The search matches name
 * or e-mail so support can find someone from a support ticket.
 */
export async function listCustomers(
  db: Database,
  options: { search?: string; limit?: number } = {},
): Promise<CustomerRow[]> {
  const limit = Math.min(options.limit ?? 50, 200);
  const term = options.search?.trim().toLowerCase();

  const base = db
    .select({
      householdId: households.id,
      name: userTable.name,
      email: userTable.email,
      createdAt: households.createdAt,
      planId: subscriptions.planId,
      status: subscriptions.status,
    })
    .from(households)
    .innerJoin(householdMembers, and(
      eq(householdMembers.householdId, households.id),
      eq(householdMembers.role, 'owner'),
    ))
    .innerJoin(userTable, eq(userTable.id, householdMembers.userId))
    .leftJoin(subscriptions, eq(subscriptions.householdId, households.id));

  const rows = await (term
    ? base.where(
        or(
          like(sql`lower(${userTable.name})`, `%${term}%`),
          like(sql`lower(${userTable.email})`, `%${term}%`),
        ),
      )
    : base
  )
    .orderBy(desc(households.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.householdId);

  const [memberRows, activityRows] = await Promise.all([
    db
      .select({ householdId: householdMembers.householdId, n: count() })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.status, 'active'),
          sql`${householdMembers.householdId} in ${ids}`,
        ),
      )
      .groupBy(householdMembers.householdId),

    db
      .select({
        householdId: transactions.householdId,
        last: sql<number>`max(${transactions.createdAt})`,
      })
      .from(transactions)
      .where(sql`${transactions.householdId} in ${ids}`)
      .groupBy(transactions.householdId),
  ]);

  const members = new Map(memberRows.map((row) => [row.householdId, Number(row.n)]));
  const activity = new Map(activityRows.map((row) => [row.householdId, Number(row.last)]));

  return rows.map((row) => ({
    householdId: row.householdId,
    name: row.name,
    email: row.email,
    planId: row.planId,
    planName: row.planId ? getPlan(row.planId).name : null,
    status: row.status,
    createdAt: row.createdAt.getTime(),
    members: members.get(row.householdId) ?? 0,
    lastActivityAt: activity.get(row.householdId) ?? null,
  }));
}

/**
 * Live system check.
 *
 * Reads the gateway key only to classify it as test or live from its prefix.
 * The value is never returned, logged or rendered.
 */
export async function loadSystemStatus(
  db: Database,
  env: Partial<CloudflareEnv>,
): Promise<SystemStatus> {
  const provider = readEnv(env, 'PAYMENT_PROVIDER') || 'mock';

  const stripeKey = readEnv(env, 'STRIPE_SECRET_KEY');
  const mpToken = readEnv(env, 'MERCADOPAGO_ACCESS_TOKEN');

  let paymentMode: SystemStatus['paymentMode'] = 'não configurado';
  if (provider === 'stripe' && stripeKey) {
    paymentMode = stripeKey.startsWith('sk_live_') ? 'produção' : 'teste';
  } else if (provider === 'mercadopago' && mpToken) {
    // Mercado Pago marks test credentials with a TEST- prefix.
    paymentMode = mpToken.startsWith('TEST-') ? 'teste' : 'produção';
  } else if (provider === 'mock') {
    paymentMode = 'teste';
  }

  const missingPriceEnvs = planIds
    .map((id) => getPlan(id).stripePriceEnv)
    .filter((name) => !readEnv(env, name));

  let database: SystemStatus['database'] = 'ok';
  let webhookFailures: SystemStatus['webhookFailures'] = [];
  let lastWebhookAt: number | null = null;

  try {
    const [failures, latest] = await Promise.all([
      db
        .select({
          id: paymentEvents.id,
          provider: paymentEvents.provider,
          type: paymentEvents.type,
          note: paymentEvents.note,
          at: paymentEvents.receivedAt,
        })
        .from(paymentEvents)
        .where(eq(paymentEvents.status, 'failed'))
        .orderBy(desc(paymentEvents.receivedAt))
        .limit(10),

      db
        .select({ at: paymentEvents.receivedAt })
        .from(paymentEvents)
        .orderBy(desc(paymentEvents.receivedAt))
        .limit(1),
    ]);

    webhookFailures = failures.map((row) => ({
      id: row.id,
      provider: row.provider,
      type: row.type,
      note: row.note,
      at: row.at.getTime(),
    }));
    lastWebhookAt = latest[0]?.at.getTime() ?? null;
  } catch {
    database = 'falha';
  }

  return {
    paymentProvider: provider,
    paymentMode,
    paymentConfigured:
      provider === 'stripe'
        ? Boolean(stripeKey) && missingPriceEnvs.length === 0
        : provider === 'mercadopago'
          ? Boolean(mpToken)
          : true,
    missingPriceEnvs,
    webhookSecretSet: Boolean(
      provider === 'mercadopago'
        ? readEnv(env, 'MERCADOPAGO_WEBHOOK_SECRET')
        : readEnv(env, 'STRIPE_WEBHOOK_SECRET'),
    ),
    database,
    webhookFailures,
    lastWebhookAt,
  };
}

/** Most recent unexpected errors, newest first. */
export async function listRecentErrors(db: Database, limit = 15) {
  return db
    .select({
      id: errorLogs.id,
      scope: errorLogs.scope,
      message: errorLogs.message,
      createdAt: errorLogs.createdAt,
    })
    .from(errorLogs)
    .orderBy(desc(errorLogs.createdAt))
    .limit(limit);
}
