import { and, eq } from 'drizzle-orm';
import type { Database } from '@/db';
import { subscriptions, checkoutSessions, paymentEvents } from '@/db/schema';
import type { SubscriptionStatus } from '@/db/schema';
import { ids } from '@/lib/ids';
import { errors } from '@/lib/errors';
import { getPlan, periodEndFor, pricing, type PlanId } from '@/config';
import { writeAudit } from '@/domains/analytics/audit';
import type { WebhookOutcome } from './provider';

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type CheckoutRow = typeof checkoutSessions.$inferSelect;

/** Grace so a clock skew at the exact renewal instant does not lock a couple out. */
const GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * The only definition of "may use the paid product".
 *
 * `past_due` still gets in until the period end: the money problem is with the
 * card, and locking someone out of their own budget mid-cycle is not the way
 * to fix that. `canceled` keeps access to the end of the paid period.
 */
export function isSubscriptionActive(
  subscription: Pick<SubscriptionRow, 'status' | 'currentPeriodEnd'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;

  const withinPeriod =
    !subscription.currentPeriodEnd ||
    subscription.currentPeriodEnd.getTime() + GRACE_MS > now.getTime();

  switch (subscription.status) {
    case 'active':
      return withinPeriod;
    case 'past_due':
      return withinPeriod;
    case 'canceled':
      // Cancelled but paid through the end of the period.
      return Boolean(subscription.currentPeriodEnd) && withinPeriod;
    case 'pending':
    case 'expired':
    default:
      return false;
  }
}

export function subscriptionLabel(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':
      return 'Ativa';
    case 'pending':
      return 'Aguardando pagamento';
    case 'past_due':
      return 'Pagamento pendente';
    case 'canceled':
      return 'Cancelada';
    case 'expired':
      return 'Expirada';
  }
}

/* ------------------------------------------------------------------------ */
/* Checkout sessions                                                         */
/* ------------------------------------------------------------------------ */

const CHECKOUT_TTL_MS = 2 * 60 * 60 * 1000;

export async function createCheckoutSession(
  db: Database,
  params: { email: string; provider: string; planId: PlanId },
): Promise<CheckoutRow> {
  const now = new Date();
  const id = ids.checkout();
  const plan = getPlan(params.planId);

  // The amount is taken from our own catalogue, never from the request. The
  // browser picks WHICH plan; it does not get to say what that plan costs.
  await db.insert(checkoutSessions).values({
    id,
    email: params.email.toLowerCase().trim(),
    provider: params.provider,
    status: 'pending',
    planId: plan.id,
    amountCents: plan.priceCents,
    currency: pricing.currency,
    expiresAt: new Date(now.getTime() + CHECKOUT_TTL_MS),
    createdAt: now,
  });

  const rows = await db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, id))
    .limit(1);
  if (!rows[0]) throw errors.internal();
  return rows[0];
}

export async function getCheckoutSession(
  db: Database,
  id: string,
): Promise<CheckoutRow | null> {
  const rows = await db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function attachProviderRef(
  db: Database,
  id: string,
  providerRef: string,
): Promise<void> {
  await db
    .update(checkoutSessions)
    .set({ providerRef })
    .where(eq(checkoutSessions.id, id));
}

/**
 * Whether the browser may proceed to account creation.
 *
 * The answer comes from the row the webhook wrote — never from a query string,
 * a redirect parameter or anything else the browser could have made up.
 */
export function isCheckoutClaimable(checkout: CheckoutRow | null, now = new Date()): boolean {
  if (!checkout) return false;
  if (checkout.status !== 'paid') return false;
  if (checkout.claimedByUserId) return false;
  void now;
  return true;
}

/* ------------------------------------------------------------------------ */
/* Webhook application                                                       */
/* ------------------------------------------------------------------------ */

export interface ApplyWebhookResult {
  applied: boolean;
  reason: 'processed' | 'duplicate' | 'ignored' | 'unknown_target';
}

/**
 * Applies a verified webhook exactly once.
 *
 * IDEMPOTENCY: the (provider, provider_event_id) unique index is claimed
 * BEFORE any state changes. A replayed delivery loses the insert race and
 * returns `duplicate` without touching the subscription.
 */
export async function applyWebhook(
  db: Database,
  provider: string,
  outcome: WebhookOutcome,
): Promise<ApplyWebhookResult> {
  const now = new Date();

  const claimed = await claimEvent(db, provider, outcome.eventId, outcome.kind);
  if (!claimed) return { applied: false, reason: 'duplicate' };

  if (outcome.kind === 'ignored') {
    await finishEvent(db, provider, outcome.eventId, 'ignored', outcome.type);
    return { applied: false, reason: 'ignored' };
  }

  if (outcome.kind === 'checkout_paid') {
    const checkout = await getCheckoutSession(db, outcome.checkoutId);
    if (!checkout) {
      await finishEvent(db, provider, outcome.eventId, 'failed', 'checkout inexistente');
      return { applied: false, reason: 'unknown_target' };
    }

    if (checkout.status === 'pending') {
      await db
        .update(checkoutSessions)
        .set({
          status: 'paid',
          paidAt: now,
          providerRef: outcome.providerRef || checkout.providerRef,
          providerCustomerId: outcome.customerId,
          providerSubscriptionId: outcome.subscriptionId,
          currentPeriodEnd: outcome.currentPeriodEnd,
        })
        .where(eq(checkoutSessions.id, checkout.id));
    }

    // The account does not exist yet at this point. The subscription row is
    // created when the buyer claims the checkout and the household is built.
    await db
      .update(paymentEvents)
      .set({ checkoutSessionId: checkout.id, status: 'processed', note: 'checkout pago' })
      .where(
        and(
          eq(paymentEvents.provider, provider),
          eq(paymentEvents.providerEventId, outcome.eventId),
        ),
      );

    return { applied: true, reason: 'processed' };
  }

  // subscription_updated
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, outcome.subscriptionId))
    .limit(1);

  const subscription = rows[0];
  if (!subscription) {
    await finishEvent(db, provider, outcome.eventId, 'ignored', 'assinatura desconhecida');
    return { applied: false, reason: 'unknown_target' };
  }

  await db
    .update(subscriptions)
    .set({
      status: outcome.status,
      currentPeriodEnd: outcome.currentPeriodEnd ?? subscription.currentPeriodEnd,
      cancelAtPeriodEnd: outcome.cancelAtPeriodEnd,
      canceledAt: outcome.status === 'canceled' ? now : subscription.canceledAt,
      updatedAt: now,
    })
    .where(eq(subscriptions.id, subscription.id));

  await db
    .update(paymentEvents)
    .set({ householdId: subscription.householdId, status: 'processed', note: outcome.status })
    .where(
      and(
        eq(paymentEvents.provider, provider),
        eq(paymentEvents.providerEventId, outcome.eventId),
      ),
    );

  await writeAudit(db, {
    householdId: subscription.householdId,
    action: 'subscription.webhook',
    entity: 'subscription',
    entityId: subscription.id,
    meta: { status: outcome.status },
  });

  return { applied: true, reason: 'processed' };
}

/** Returns false when this event was already recorded. */
async function claimEvent(
  db: Database,
  provider: string,
  eventId: string,
  type: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: paymentEvents.id })
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.provider, provider),
        eq(paymentEvents.providerEventId, eventId),
      ),
    )
    .limit(1);

  if (existing[0]) return false;

  try {
    await db.insert(paymentEvents).values({
      id: ids.paymentEvent(),
      provider,
      providerEventId: eventId,
      type,
      status: 'processed',
      receivedAt: new Date(),
    });
    return true;
  } catch {
    // Lost the race against a concurrent delivery of the same event.
    return false;
  }
}

async function finishEvent(
  db: Database,
  provider: string,
  eventId: string,
  status: 'processed' | 'ignored' | 'failed',
  note: string,
): Promise<void> {
  await db
    .update(paymentEvents)
    .set({ status, note: note.slice(0, 120) })
    .where(
      and(
        eq(paymentEvents.provider, provider),
        eq(paymentEvents.providerEventId, eventId),
      ),
    );
}

/* ------------------------------------------------------------------------ */
/* Subscription lifecycle                                                    */
/* ------------------------------------------------------------------------ */

export async function activateSubscriptionForHousehold(
  db: Database,
  params: {
    householdId: string;
    ownerUserId: string;
    provider: string;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
    /** Plan actually bought. Decides the price stored and the period length. */
    planId: PlanId;
  },
): Promise<SubscriptionRow> {
  const now = new Date();
  const plan = getPlan(params.planId);

  // When the gateway does not report a period end, derive it from the plan.
  // A flat 31-day fallback would expire an annual subscriber after one month.
  const periodEnd = params.currentPeriodEnd ?? periodEndFor(plan, now);

  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.householdId, params.householdId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(subscriptions)
      .set({
        status: 'active',
        provider: params.provider,
        providerCustomerId: params.providerCustomerId,
        providerSubscriptionId: params.providerSubscriptionId,
        planId: plan.id,
        priceCents: plan.priceCents,
        currency: pricing.currency,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing[0].id));

    const refreshed = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, existing[0].id))
      .limit(1);
    if (!refreshed[0]) throw errors.internal();
    return refreshed[0];
  }

  const id = ids.subscription();
  await db.insert(subscriptions).values({
    id,
    householdId: params.householdId,
    ownerUserId: params.ownerUserId,
    provider: params.provider,
    providerCustomerId: params.providerCustomerId,
    providerSubscriptionId: params.providerSubscriptionId,
    status: 'active',
    planId: plan.id,
    priceCents: plan.priceCents,
    currency: pricing.currency,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
  });

  await writeAudit(db, {
    householdId: params.householdId,
    actorUserId: params.ownerUserId,
    action: 'subscription.activated',
    entity: 'subscription',
    entityId: id,
    meta: { provider: params.provider, planId: plan.id, priceCents: plan.priceCents },
  });

  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .limit(1);
  if (!rows[0]) throw errors.internal();
  return rows[0];
}

export async function markCancelAtPeriodEnd(
  db: Database,
  householdId: string,
  actorUserId: string,
): Promise<void> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.householdId, householdId))
    .limit(1);

  const subscription = rows[0];
  if (!subscription) throw errors.notFound('Assinatura não encontrada.');

  await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: true, canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(subscriptions.id, subscription.id));

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'subscription.cancel_requested',
    entity: 'subscription',
    entityId: subscription.id,
  });
}
