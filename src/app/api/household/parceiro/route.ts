import { z } from 'zod';
import { handle, jsonOk, readJson } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { getRuntime, getAppUrl, isProduction } from '@/server/context';
import { invitePartner, listPendingInvites } from '@/domains/households/invites';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(80),
  email: z.email('Informe um e-mail válido').max(160),
  // No password field: the partner chooses their own on the invite page, so
  // nobody — not even the person inviting — ever knows it.
});

export const GET = handle(async () => {
  const context = await getAppContext();
  return jsonOk({ invites: await listPendingInvites(context.db, context.household.id) });
});

export const POST = handle(async (request) => {
  const context = await getAppContext();
  const { env } = await getRuntime();
  const body = await readJson(request, schema);

  const result = await invitePartner(context.db, {
    household: context.household,
    actorUserId: context.user.id,
    actorName: context.member.displayName,
    appUrl: getAppUrl(env),
    env,
    input: body,
  });

  // In production the link normally travels by e-mail and is not echoed back,
  // so it exists in one place only.
  //
  // When delivery FAILS, withholding it strands the owner: the invite exists,
  // nothing was sent, and there is nothing to pass along. Returning it then is
  // not a leak — it goes to the authenticated owner who just created it, which
  // is the same person the e-mail would have reached.
  if (result.kind === 'link' && isProduction(env) && result.emailDelivered) {
    return jsonOk({
      kind: result.kind,
      email: result.email,
      name: result.name,
      emailDelivered: true,
    });
  }

  return jsonOk(result, { status: 201 });
});
