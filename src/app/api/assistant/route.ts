import { z } from 'zod';
import { handle, jsonOk, readJson, rateLimit } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { handleMessage, listMessages, clearMessages } from '@/domains/assistant/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  message: z.string().trim().min(1, 'Escreva alguma coisa').max(500),
});

export const GET = handle(async () => {
  const context = await getAppContext();
  return jsonOk({ messages: await listMessages(context.db, context.household.id) });
});

export const POST = handle(async (request) => {
  // Guards both cost and abuse: the AI fallback is the only paid path here.
  await rateLimit(request, 'assistant', { max: 40, windowSeconds: 300 });

  const context = await getAppContext();
  const { message } = await readJson(request, schema);
  const turn = await handleMessage(context, message);

  return jsonOk(turn);
});

export const DELETE = handle(async () => {
  const context = await getAppContext();
  await clearMessages(context.db, context.household.id);
  return jsonOk({ ok: true });
});
