import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { user } from './auth';
import { households } from './households';

export const subscriptionStatuses = [
  'pending',
  'active',
  'past_due',
  'canceled',
  'expired',
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id'),
    status: text('status', { enum: subscriptionStatuses }).notNull(),
    planId: text('plan_id').notNull(),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('BRL'),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp_ms' }),
    cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' })
      .notNull()
      .default(false),
    canceledAt: integer('canceled_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('subscriptions_household_uq').on(t.householdId),
    index('subscriptions_status_idx').on(t.status),
    index('subscriptions_provider_sub_idx').on(t.providerSubscriptionId),
  ],
);

/**
 * A purchase that happened before an account existed. The browser only ever
 * learns the row id; payment status is written exclusively by the verified
 * webhook, never by a return URL.
 */
export const checkoutSessions = sqliteTable(
  'checkout_sessions',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    /** Filled in by the verified webhook, never by the browser. */
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id'),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp_ms' }),
    status: text('status', { enum: ['pending', 'paid', 'claimed', 'expired', 'failed'] })
      .notNull()
      .default('pending'),
    planId: text('plan_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('BRL'),
    claimedByUserId: text('claimed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
    claimedAt: integer('claimed_at', { mode: 'timestamp_ms' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('checkout_sessions_email_idx').on(t.email),
    index('checkout_sessions_provider_ref_idx').on(t.providerRef),
    index('checkout_sessions_status_idx').on(t.status),
  ],
);

/**
 * Idempotency ledger for gateway webhooks. `providerEventId` is unique, so a
 * replayed delivery collides on insert and is skipped instead of applied twice.
 */
export const paymentEvents = sqliteTable(
  'payment_events',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    type: text('type').notNull(),
    householdId: text('household_id').references(() => households.id, {
      onDelete: 'set null',
    }),
    checkoutSessionId: text('checkout_session_id').references(() => checkoutSessions.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: ['processed', 'ignored', 'failed'] }).notNull(),
    /** Short, non-sensitive note. Never the raw gateway payload. */
    note: text('note'),
    receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('payment_events_provider_event_uq').on(t.provider, t.providerEventId),
    index('payment_events_household_idx').on(t.householdId),
  ],
);
