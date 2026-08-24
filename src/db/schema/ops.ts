import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './auth';
import { households } from './households';

/**
 * Operational tables: assistant transcript, product analytics, audit trail and
 * the development e-mail outbox.
 *
 * LOGGING POLICY: nothing here stores secrets, tokens or password material.
 * Analytics props are deliberately limited to non-financial metadata.
 */

export const assistantMessages = sqliteTable(
  'assistant_messages',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    /** Resolved action type, e.g. create_expense / query_free_balance / unknown. */
    actionType: text('action_type'),
    /** 'rules' when the local parser handled it, otherwise the AI provider id. */
    resolvedBy: text('resolved_by'),
    /** Rough token usage reported by the provider; 0 for locally parsed turns. */
    tokensUsed: integer('tokens_used').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('assistant_messages_household_idx').on(t.householdId, t.createdAt),
  ],
);

export const analyticsEvents = sqliteTable(
  'analytics_events',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    householdId: text('household_id').references(() => households.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    /** Small JSON blob of non-financial metadata. */
    props: text('props'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('analytics_events_name_idx').on(t.name, t.createdAt),
    index('analytics_events_household_idx').on(t.householdId),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').references(() => households.id, {
      onDelete: 'set null',
    }),
    actorUserId: text('actor_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    /** Compact JSON describing what changed. Amounts allowed, no credentials. */
    meta: text('meta'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('audit_logs_household_idx').on(t.householdId, t.createdAt),
    index('audit_logs_actor_idx').on(t.actorUserId),
  ],
);

/**
 * Development outbox. When EMAIL_PROVIDER=console nothing is actually sent —
 * the message is written here so the flow can be exercised honestly instead of
 * pretending a real e-mail went out.
 */
export const emailOutbox = sqliteTable(
  'email_outbox',
  {
    id: text('id').primaryKey(),
    to: text('to').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    kind: text('kind').notNull(),
    provider: text('provider').notNull(),
    status: text('status', { enum: ['queued', 'sent', 'failed', 'not_configured'] })
      .notNull()
      .default('queued'),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('email_outbox_to_idx').on(t.to, t.createdAt)],
);

export const errorLogs = sqliteTable(
  'error_logs',
  {
    id: text('id').primaryKey(),
    scope: text('scope').notNull(),
    message: text('message').notNull(),
    /** Truncated stack. Request bodies are never stored. */
    detail: text('detail'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('error_logs_created_idx').on(t.createdAt)],
);

/**
 * Fixed-window rate-limit counters.
 *
 * Keyed by bucket + client IP + window start, so a row is naturally scoped to
 * one window and `expires_at` makes pruning trivial. Written with raw SQL
 * (INSERT ... ON CONFLICT DO UPDATE RETURNING) so counting is one round trip.
 */
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    hits: integer('hits').notNull().default(0),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('rate_limits_expires_idx').on(t.expiresAt)],
);
