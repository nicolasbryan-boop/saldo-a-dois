import { getRuntime, readEnv } from '@/server/context';

export const dynamic = 'force-dynamic';

/**
 * Liveness plus a credential sanity check.
 *
 * The check reports SHAPE, never value: whether a secret is present and
 * whether it looks like a credential at all. No length, no prefix, no
 * characters — nothing that helps anyone guess a secret, and nothing that is
 * not already obvious from whether payments work at all.
 *
 * This exists because a secret set by pressing Ctrl+V into a terminal prompt
 * lands as the literal control character 0x16, and the only symptom is the
 * gateway answering 400 with an empty body. That is close to undebuggable
 * from the outside, and it cost a deploy cycle to find.
 */

/** Missing, blank, absurdly short, or carrying control characters. */
function looksMalformed(value: string): boolean {
  if (!value) return true;
  if (value.trim().length < 8) return true;

  // Compared by code point so the check cannot itself be mangled by a stray
  // paste — which is the very failure it is here to catch.
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }

  return false;
}

export async function GET() {
  const { env } = await getRuntime();

  const provider = readEnv(env, 'PAYMENT_PROVIDER') || 'mock';

  const expected =
    provider === 'mercadopago'
      ? ['MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_PUBLIC_KEY', 'MERCADOPAGO_WEBHOOK_SECRET']
      : provider === 'stripe'
        ? [
            'STRIPE_SECRET_KEY',
            'STRIPE_WEBHOOK_SECRET',
            'STRIPE_PRICE_MONTHLY_ID',
            'STRIPE_PRICE_QUARTERLY_ID',
            'STRIPE_PRICE_YEARLY_ID',
          ]
        : [];

  const credentials = Object.fromEntries(
    expected.map((name) => {
      const raw = readEnv(env, name);

      if (looksMalformed(raw)) return [name, 'malformada'];

      // Surrounding whitespace makes an Authorization header invalid, and the
      // runtime drops it rather than failing loudly — the gateway then says
      // there is no authorization, which reads like a missing secret.
      if (raw !== raw.trim()) return [name, 'ok (com espaços em volta)'];

      // Mercado Pago access tokens and public keys always carry APP_USR- or
      // TEST-. The webhook secret is a plain random string with no prefix, so
      // the rule would be a false alarm there. Prefixes are the documented
      // public format, not secret material.
      const prefixed =
        provider === 'mercadopago' &&
        (name === 'MERCADOPAGO_ACCESS_TOKEN' || name === 'MERCADOPAGO_PUBLIC_KEY');

      if (prefixed && !raw.startsWith('APP_USR-') && !raw.startsWith('TEST-')) {
        return [name, 'não parece um token do Mercado Pago (falta APP_USR- ou TEST-)'];
      }

      return [name, 'ok'];
    }),
  );

  return Response.json({ ok: true, paymentProvider: provider, credentials });
}
