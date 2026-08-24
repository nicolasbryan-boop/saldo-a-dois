import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { handle, jsonOk, readJson, rateLimit } from '@/server/api';
import { getRuntime } from '@/server/context';
import { getAuth } from '@/domains/auth/server';
import { requireUser } from '@/domains/auth/session';
import { user as userTable } from '@/db/schema';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const schema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual').max(128),
  newPassword: z
    .string()
    .min(8, 'A nova senha precisa ter pelo menos 8 caracteres')
    .max(128),
});

/**
 * Password change, also used by the forced flow after a partner signs in with
 * a temporary password.
 *
 * `revokeOtherSessions` matters here: once the new password is set, the
 * temporary one is dead and any session opened with it is dropped.
 */
export const POST = handle(async (request) => {
  await rateLimit(request, 'password-change', { max: 10, windowSeconds: 600 });

  // Deliberately requireUser, not requireActiveUser: someone with
  // must_change_password set is exactly who needs this endpoint.
  const user = await requireUser();
  const body = await readJson(request, schema);

  if (body.currentPassword === body.newPassword) {
    throw errors.validation('A nova senha precisa ser diferente da atual.');
  }

  const auth = await getAuth();

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch {
    throw errors.validation('Senha atual incorreta.');
  }

  const { db } = await getRuntime();
  await db
    .update(userTable)
    .set({ mustChangePassword: false, updatedAt: new Date() })
    .where(eq(userTable.id, user.id));

  return jsonOk({ ok: true });
});
