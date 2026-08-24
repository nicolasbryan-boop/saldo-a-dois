import { z } from 'zod';
import { handle, jsonOk, readJson, localDateSchema, amountCentsSchema } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { settleInstance } from '@/domains/recurrences/service';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const schema = z.object({
  amountCents: amountCentsSchema.optional(),
  occurredOn: localDateSchema.optional(),
});

/** Marks a recurring occurrence as settled, creating the real movement. */
export const POST = handle(async (request, context) => {
  const app = await getAppContext();
  const { id } = await context.params;
  if (!id) throw errors.notFound();

  const body = await readJson(request, schema).catch(() => ({}) as z.infer<typeof schema>);
  await settleInstance(app.db, app.actor, id, body);

  return jsonOk({ ok: true });
});
