import { z } from 'zod';
import { handle, jsonOk, readJson } from '@/server/api';
import { getRuntime } from '@/server/context';
import { requireActiveUser } from '@/domains/auth/session';
import { acceptInvite } from '@/domains/households/invites';

export const dynamic = 'force-dynamic';

const schema = z.object({ token: z.string().min(20).max(128) });

/**
 * Accepting an invite requires being signed in as the invited e-mail. The
 * token alone is not enough — it identifies the invite, it does not
 * authenticate anyone.
 */
export const POST = handle(async (request) => {
  const user = await requireActiveUser();
  const { db } = await getRuntime();
  const { token } = await readJson(request, schema);

  await acceptInvite(db, token, user.id, user.email);
  return jsonOk({ ok: true, redirectTo: '/app' });
});
