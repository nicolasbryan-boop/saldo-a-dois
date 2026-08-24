import { z } from 'zod';
import { handle, jsonOk, readJson, localDateSchema, amountCentsSchema } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { contributeToGoal } from '@/domains/goals/service';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const schema = z.object({
  amountCents: amountCentsSchema,
  occurredOn: localDateSchema.optional(),
});

/**
 * Records money set aside toward a goal. This creates a `reserve` movement,
 * so the balance drops and the remaining reserve drops by the same amount —
 * "livre para gastar" is unchanged, which is the honest outcome.
 */
export const POST = handle(async (request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  const body = await readJson(request, schema);
  await contributeToGoal(app.db, app.actor, id, body.amountCents, body.occurredOn);

  return jsonOk({ ok: true }, { status: 201 });
});
