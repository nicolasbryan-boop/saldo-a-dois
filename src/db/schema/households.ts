import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { user } from './auth';

/**
 * `households` is the tenant boundary. Every financial row in this database
 * carries a household_id and every read path filters on a household the
 * authenticated session was proven to belong to.
 */
export const households = sqliteTable(
  'households',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Day of month the financial cycle starts (1-31, clamped per month). */
    cycleStartDay: integer('cycle_start_day').notNull().default(1),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    currency: text('currency').notNull().default('BRL'),
    /** Reserve target per cycle, in cents. */
    monthlyReserveCents: integer('monthly_reserve_cents').notNull().default(0),
    onboardingCompletedAt: integer('onboarding_completed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('households_owner_idx').on(t.ownerUserId)],
);

export const householdMemberRoles = ['owner', 'partner'] as const;
export type HouseholdMemberRole = (typeof householdMemberRoles)[number];

export const householdMembers = sqliteTable(
  'household_members',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: householdMemberRoles }).notNull(),
    displayName: text('display_name').notNull(),
    /** Token name from the palette, used for the avatar chip. */
    accentColor: text('accent_color').notNull().default('rose'),
    status: text('status', { enum: ['active', 'removed'] })
      .notNull()
      .default('active'),
    /**
     * Onboarding is per person, not per household: each member declares their
     * own income and their own fixed costs. Null means this member has not
     * done it yet, which is what gates the wizard.
     */
    onboardingCompletedAt: integer('onboarding_completed_at', { mode: 'timestamp_ms' }),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
    removedAt: integer('removed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    // A user appears at most once per household.
    uniqueIndex('household_members_household_user_uq').on(t.householdId, t.userId),
    index('household_members_household_idx').on(t.householdId),
    index('household_members_user_idx').on(t.userId),
  ],
);

export const partnerInvites = sqliteTable(
  'partner_invites',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** Random token used by an existing-account holder to accept the invite. */
    token: text('token').notNull().unique(),
    status: text('status', { enum: ['pending', 'accepted', 'revoked', 'expired'] })
      .notNull()
      .default('pending'),
    /**
     * 'provisioned' = owner created the partner account with a temporary
     * password. 'link' = the e-mail already had an account and must accept.
     */
    kind: text('kind', { enum: ['provisioned', 'link'] }).notNull(),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    acceptedByUserId: text('accepted_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('partner_invites_household_idx').on(t.householdId),
    index('partner_invites_email_idx').on(t.email),
  ],
);
