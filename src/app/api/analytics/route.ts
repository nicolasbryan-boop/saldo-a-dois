import { z } from 'zod';
import { handle, jsonOk, readJson } from '@/server/api';
import { getRuntime } from '@/server/context';
import { trackEvent, ANALYTICS_EVENTS, type AnalyticsEventName } from '@/domains/analytics/audit';
import { getSessionUser } from '@/domains/auth/session';

export const dynamic = 'force-dynamic';

/**
 * Public analytics sink for the marketing page.
 *
 * Only names from the known list are accepted and no free-form payload is
 * stored, so this endpoint cannot be used to write arbitrary data.
 */
const schema = z.object({
  name: z.enum(ANALYTICS_EVENTS),
});

export const POST = handle(async (request) => {
  const { name } = await readJson(request, schema);
  const { db } = await getRuntime();
  const user = await getSessionUser().catch(() => null);

  await trackEvent(db, {
    name: name as AnalyticsEventName,
    userId: user?.id ?? null,
  });

  return jsonOk({ ok: true });
});
