import { z } from 'zod';
import { handle, jsonOk, readJson } from '@/server/api';
import { getRuntime } from '@/server/context';
import { acceptInviteWithNewAccount } from '@/domains/households/invites';

export const dynamic = 'force-dynamic';

const schema = z.object({
  token: z.string().min(20).max(128),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(128),
});

/**
 * Creates the partner's account from an invite token.
 *
 * No session is required — the token is the credential, and it only grants
 * what the invite already decided: this e-mail, this household. The response
 * returns the e-mail so the browser can sign in with the password the person
 * just chose; this route never mints a session itself, so Better Auth stays
 * the only thing that issues one.
 */
export const POST = handle(async (request) => {
  const { db } = await getRuntime();
  const body = await readJson(request, schema);

  const result = await acceptInviteWithNewAccount(db, {
    token: body.token,
    password: body.password,
  });

  return jsonOk({ ok: true, email: result.email }, { status: 201 });
});
