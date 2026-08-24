import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { user } from './auth';
import { households, householdMembers } from './households';

/**
 * MONEY RULE: every amount in this file is an INTEGER number of cents.
 * There is no floating point anywhere in the financial path.
 *
 * DATE RULE: columns ending in `Date`/`On` are TEXT 'YYYY-MM-DD' interpreted in
 * the household timezone (default America/Sao_Paulo). Columns ending in `At`
 * are epoch milliseconds. A due date must not drift because of UTC conversion,
 * which is why calendar dates are stored as plain local-date strings.
 */

export const financialCycles = sqliteTable(
  'financial_cycles',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** Inclusive local start date, e.g. 2026-08-05. */
    startDate: text('start_date').notNull(),
    /** Inclusive local end date, e.g. 2026-09-04. */
    endDate: text('end_date').notNull(),
    /** Human label, e.g. Agosto 2026. */
    label: text('label').notNull(),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    /** Money available at the first instant of the cycle. */
    openingBalanceCents: integer('opening_balance_cents').notNull().default(0),
    /** Snapshot written when the cycle is closed. */
    closingBalanceCents: integer('closing_balance_cents'),
    /** Reserve target for this cycle, copied from the household at creation. */
    plannedReserveCents: integer('planned_reserve_cents').notNull().default(0),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('financial_cycles_household_start_uq').on(t.householdId, t.startDate),
    index('financial_cycles_household_status_idx').on(t.householdId, t.status),
  ],
);

export const categoryKinds = ['expense', 'income', 'both'] as const;

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    /** Lucide icon name rendered by the UI. */
    icon: text('icon').notNull().default('Circle'),
    color: text('color').notNull().default('slate'),
    kind: text('kind', { enum: categoryKinds }).notNull().default('expense'),
    /** System categories are seeded per household and cannot be deleted. */
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('categories_household_slug_uq').on(t.householdId, t.slug),
    index('categories_household_idx').on(t.householdId),
  ],
);

/** Recurring money coming in (salary, allowance, fixed freelance). */
export const incomeSources = sqliteTable(
  'income_sources',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** Null means the household as a whole, not a specific person. */
    memberId: text('member_id').references(() => householdMembers.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    amountCents: integer('amount_cents').notNull(),
    /** 1-31; clamped to the last day of short months. */
    dayOfMonth: integer('day_of_month').notNull(),
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('income_sources_household_idx').on(t.householdId, t.active)],
);

/** Recurring bills (rent, energy, internet, school, gym, card...). */
export const recurringExpenses = sqliteTable(
  'recurring_expenses',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    memberId: text('member_id').references(() => householdMembers.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    amountCents: integer('amount_cents').notNull(),
    dayOfMonth: integer('day_of_month').notNull(),
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('recurring_expenses_household_idx').on(t.householdId, t.active)],
);

export const recurrenceSourceTypes = ['income', 'expense'] as const;

/**
 * One materialised occurrence of a recurring source inside one cycle.
 *
 * IDEMPOTENCY: the unique index on (source_type, source_id, cycle_id) is what
 * makes materializeDueRecurrences() safe to call on every dashboard load.
 * A duplicate materialisation collides at the database level.
 */
export const recurringInstances = sqliteTable(
  'recurring_instances',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => financialCycles.id, { onDelete: 'cascade' }),
    sourceType: text('source_type', { enum: recurrenceSourceTypes }).notNull(),
    sourceId: text('source_id').notNull(),
    name: text('name').notNull(),
    amountCents: integer('amount_cents').notNull(),
    dueDate: text('due_date').notNull(),
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    memberId: text('member_id').references(() => householdMembers.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: ['pending', 'settled', 'skipped'] })
      .notNull()
      .default('pending'),
    /** Set when the instance is settled into a real movement. */
    transactionId: text('transaction_id'),
    settledAt: integer('settled_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('recurring_instances_source_cycle_uq').on(
      t.sourceType,
      t.sourceId,
      t.cycleId,
    ),
    index('recurring_instances_household_cycle_idx').on(t.householdId, t.cycleId),
    index('recurring_instances_status_idx').on(t.householdId, t.status, t.dueDate),
  ],
);

/**
 * Movement types. amountCents is ALWAYS positive; direction comes from the
 * type, so no signed arithmetic can leak in from user input.
 *
 *   income         +  money arrived
 *   expense        -  money spent
 *   reserve        -  money set aside toward a goal
 *   adjustment_in  +  manual correction upward
 *   adjustment_out -  manual correction downward
 */
export const transactionTypes = [
  'income',
  'expense',
  'reserve',
  'adjustment_in',
  'adjustment_out',
] as const;
export type TransactionType = (typeof transactionTypes)[number];

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => financialCycles.id, { onDelete: 'cascade' }),
    /** Who the movement belongs to. Null means shared / household. */
    memberId: text('member_id').references(() => householdMembers.id, {
      onDelete: 'set null',
    }),
    type: text('type', { enum: transactionTypes }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    description: text('description').notNull(),
    /** Local calendar date 'YYYY-MM-DD'. */
    occurredOn: text('occurred_on').notNull(),
    /** Set when this movement settles a recurring instance. */
    recurringInstanceId: text('recurring_instance_id'),
    goalId: text('goal_id'),
    source: text('source', { enum: ['manual', 'assistant', 'recurrence', 'seed'] })
      .notNull()
      .default('manual'),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('transactions_household_cycle_idx').on(t.householdId, t.cycleId),
    index('transactions_household_date_idx').on(t.householdId, t.occurredOn),
    index('transactions_household_category_idx').on(t.householdId, t.categoryId),
    index('transactions_household_member_idx').on(t.householdId, t.memberId),
    uniqueIndex('transactions_recurring_instance_uq').on(t.recurringInstanceId),
  ],
);

export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetCents: integer('target_cents').notNull(),
    /** Denormalised running total of contributions, kept in sync by the service. */
    currentCents: integer('current_cents').notNull().default(0),
    /** Planned contribution per cycle. */
    monthlyPlanCents: integer('monthly_plan_cents').notNull().default(0),
    icon: text('icon').notNull().default('Target'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    achievedAt: integer('achieved_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('goals_household_idx').on(t.householdId, t.active)],
);

export const goalContributions = sqliteTable(
  'goal_contributions',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => financialCycles.id, { onDelete: 'cascade' }),
    /** The reserve movement that took the money out of the free balance. */
    transactionId: text('transaction_id').references(() => transactions.id, {
      onDelete: 'cascade',
    }),
    amountCents: integer('amount_cents').notNull(),
    occurredOn: text('occurred_on').notNull(),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('goal_contributions_household_cycle_idx').on(t.householdId, t.cycleId),
    index('goal_contributions_goal_idx').on(t.goalId),
  ],
);
