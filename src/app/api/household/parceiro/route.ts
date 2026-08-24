import { z } from 'zod';
import { handle, jsonOk, readJson } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { getRuntime, getAppUrl, isProduction } from '@/server/context';
import { invitePartner, listPendingInvites } from '@/domains/households/invites';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(80),
  email: z.email('Informe um e-mail válido').max(160),
  temporaryPassword: z
    .string()
    .min(8, 'A senha temporária precisa ter pelo menos 8 caracteres')
    .max(128),
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

  // The invite link is only echoed back outside production, where e-mail
  // delivery may not be configured. In production the link travels by e-mail.
  if (result.kind === 'link' && isProduction(env)) {
    return jsonOk({ kind: result.kind, email: result.email, name: result.name, emailDelivered: result.emailDelivered });
  }

  return jsonOk(result, { status: 201 });
});
