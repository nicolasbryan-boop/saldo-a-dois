import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { handle, jsonOk, readJson, rateLimit } from '@/server/api';
import { getRuntime } from '@/server/context';
import { getAuth } from '@/domains/auth/server';
import { getSessionUser } from '@/domains/auth/session';
import { checkoutSessions } from '@/db/schema';
import {
  getCheckoutSession,
  isCheckoutClaimable,
  activateSubscriptionForHousehold,
} from '@/domains/billing/subscription';
import { createHousehold, findHouseholdForUser, findUserByEmail } from '@/domains/households/service';
import { trackEvent } from '@/domains/analytics/audit';
import { errors } from '@/lib/errors';
import { getPlan } from '@/config';

export const dynamic = 'force-dynamic';

const schema = z.object({
  checkoutId: z.string().min(10).max(64),
  name: z.string().trim().min(2, 'Diga como podemos te chamar').max(80),
  password: z
    .string()
    .min(8, 'Use pelo menos 8 caracteres')
    .max(128, 'Senha muito longa'),
});

/**
 * Turns a paid checkout into an account.
 *
 * The gate is the row the webhook wrote: `status === 'paid'` and not yet
 * claimed. Nothing the browser sends can move that gate — the checkout id is
 * only a lookup key, and being able to guess it would still not make an unpaid
 * checkout claimable.
 */
export const POST = handle(async (request) => {
  await rateLimit(request, 'claim', { max: 12, windowSeconds: 600 });

  const body = await readJson(request, schema);
  const { db } = await getRuntime();

  const checkout = await getCheckoutSession(db, body.checkoutId);
  if (!checkout) throw errors.notFound('Compra não encontrada.');

  if (checkout.status === 'claimed') {
    throw errors.conflict('Esta compra já virou uma conta. Faça login para continuar.');
  }

  if (!isCheckoutClaimable(checkout)) {
    throw errors.conflict('Ainda não recebemos a confirmação do pagamento.');
  }

  const existingUser = await findUserByEmail(db, checkout.email);

  let userId: string;
  let setCookieHeaders: string[] = [];

  if (existingUser) {
    // The e-mail already has an account: only its owner may claim, proven by
    // an active session — never by knowing the checkout id.
    const session = await getSessionUser();
    if (!session || session.email.toLowerCase() !== checkout.email.toLowerCase()) {
      throw errors.conflict(
        'Já existe uma conta com esse e-mail. Entre com ela e volte a esta página para ativar a assinatura.',
      );
    }
    userId = session.id;
  } else {
    const auth = await getAuth();
    const response = await auth.api.signUpEmail({
      body: {
        name: body.name,
        email: checkout.email,
        password: body.password,
      },
      asResponse: true,
    });

    if (!response.ok) {
      throw errors.validation('Não conseguimos criar a conta. Confira a senha e tente de novo.');
    }

    setCookieHeaders = collectSetCookies(response);

    const created = await findUserByEmail(db, checkout.email);
    if (!created) throw errors.internal();
    userId = created.id;
  }

  // Idempotent: a retry after a network hiccup must not create a second space.
  let household = await findHouseholdForUser(db, userId);
  if (!household) {
    const firstName = body.name.trim().split(/\s+/)[0] ?? body.name.trim();
    const result = await createHousehold(db, {
      name: `Espaço de ${firstName}`,
      ownerUserId: userId,
      ownerDisplayName: firstName,
      cycleStartDay: 1,
    });
    household = result.household;
  }

  await activateSubscriptionForHousehold(db, {
    householdId: household.id,
    ownerUserId: userId,
    provider: checkout.provider,
    providerCustomerId: checkout.providerCustomerId,
    providerSubscriptionId: checkout.providerSubscriptionId,
    currentPeriodEnd: checkout.currentPeriodEnd,
    // The plan comes from the checkout row the webhook confirmed, not from
    // anything the browser sends at this step.
    planId: getPlan(checkout.planId).id,
  });

  await db
    .update(checkoutSessions)
    .set({ status: 'claimed', claimedByUserId: userId, claimedAt: new Date() })
    .where(eq(checkoutSessions.id, checkout.id));

  await trackEvent(db, {
    name: 'account_created',
    householdId: household.id,
    userId,
    props: { provider: checkout.provider, plan: checkout.planId },
  });

  const result = jsonOk({ ok: true, redirectTo: '/onboarding' });
  for (const cookie of setCookieHeaders) {
    result.headers.append('Set-Cookie', cookie);
  }
  return result;
});

/** Better Auth may set more than one cookie; keep all of them. */
function collectSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}
