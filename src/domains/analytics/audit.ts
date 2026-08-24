import type { Database } from '@/db';
import { auditLogs, analyticsEvents, errorLogs } from '@/db/schema';
import { ids } from '@/lib/ids';

/**
 * LOGGING POLICY
 * ==============
 * Never written to any of these tables: passwords, tokens, session cookies,
 * gateway payloads, API keys, or full transaction descriptions from the
 * assistant. Amounts may appear in audit meta because an audit trail without
 * the amount cannot answer "what changed".
 */

const REDACTED_KEYS = /^(password|token|secret|authorization|cookie|apikey|api_key)$/i;

function sanitize(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (REDACTED_KEYS.test(key)) continue;
    if (typeof value === 'string' && value.length > 200) {
      safe[key] = `${value.slice(0, 200)}…`;
    } else {
      safe[key] = value;
    }
  }
  return JSON.stringify(safe);
}

export interface AuditInput {
  householdId?: string | null;
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}

export async function writeAudit(db: Database, input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: ids.audit(),
      householdId: input.householdId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: sanitize(input.meta),
      createdAt: new Date(),
    });
  } catch (error) {
    // Auditing must never break the user's operation.
    console.error('[audit] falha ao registrar', (error as Error).message);
  }
}

export const ANALYTICS_EVENTS = [
  'landing_view',
  'pricing_view',
  'checkout_started',
  'checkout_success',
  'account_created',
  'onboarding_started',
  'onboarding_completed',
  'partner_invited',
  'partner_joined',
  'transaction_created',
  'transaction_updated',
  'transaction_deleted',
  'assistant_used',
  'goal_created',
  'recurring_created',
  'bill_settled',
  'pwa_installed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsInput {
  name: AnalyticsEventName;
  householdId?: string | null;
  userId?: string | null;
  /** Non-financial metadata only: counts, enum values, source labels. */
  props?: Record<string, string | number | boolean>;
}

export async function trackEvent(db: Database, input: AnalyticsInput): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
      id: ids.event(),
      name: input.name,
      householdId: input.householdId ?? null,
      userId: input.userId ?? null,
      props: sanitize(input.props),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('[analytics] falha ao registrar', (error as Error).message);
  }
}

export async function logError(
  db: Database,
  scope: string,
  error: unknown,
): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack ?? '' : '';
    await db.insert(errorLogs).values({
      id: ids.error(),
      scope,
      message: message.slice(0, 500),
      detail: stack.slice(0, 2000),
      createdAt: new Date(),
    });
  } catch {
    // Nothing else to do; the original error is already being handled.
  }
}
