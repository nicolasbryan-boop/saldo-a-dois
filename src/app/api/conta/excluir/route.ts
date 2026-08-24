import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { handle, jsonOk, readJson, rateLimit } from '@/server/api';
import { getRuntime } from '@/server/context';
import { getAuth } from '@/domains/auth/server';
import { requireUser } from '@/domains/auth/session';
import { households, householdMembers, user as userTable } from '@/db/schema';
import { loadContext } from '@/domains/households/service';
import { writeAudit } from '@/domains/analytics/audit';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const schema = z.object({
  password: z.string().min(1, 'Confirme sua senha').max(128),
  confirm: z.literal('EXCLUIR', { message: 'Digite EXCLUIR para confirmar' }),
});

/**
 * Account deletion.
 *
 * The owner deleting their account deletes the household too — every financial
 * row cascades from `households`, so nothing is orphaned. A partner deleting
 * their account only leaves the space; the couple's history stays with the
 * owner, which is whose space it is.
 */
export const POST = handle(async (request) => {
  await rateLimit(request, 'account-delete', { max: 5, windowSeconds: 900 });

  const user = await requireUser();
  const body = await readJson(request, schema);

  const auth = await getAuth();
  try {
    await auth.api.verifyPassword({
      body: { password: body.password },
      headers: await headers(),
    });
  } catch {
    throw errors.validation('Senha incorreta.');
  }

  const { db } = await getRuntime();
  const context = await loadContext(db, user.id);

  if (context) {
    if (context.role === 'owner') {
      await writeAudit(db, {
        householdId: context.household.id,
        actorUserId: user.id,
        action: 'household.deleted',
        entity: 'household',
        entityId: context.household.id,
      });
      await db.delete(households).where(eq(households.id, context.household.id));
    } else {
      await db
        .update(householdMembers)
        .set({ status: 'removed', removedAt: new Date() })
        .where(eq(householdMembers.id, context.member.id));
    }
  }

  await db.delete(userTable).where(eq(userTable.id, user.id));

  return jsonOk({ ok: true, redirectTo: '/' });
});
