import { getRuntime, readEnv } from '@/server/context';

export const dynamic = 'force-dynamic';

/**
 * Liveness plus a credential sanity check.
 *
 * Reports SHAPE, never value: whether a secret is present and whether it could
 * be used at all. No length, no prefix, no characters — nothing that helps
 * anyone guess a secret.
 *
 * Deliberately limited to defects that are objectively wrong for ANY
 * credential: absent, blank, surrounded by whitespace, or carrying control
 * characters. It does NOT judge format.
 *
 * An earlier version asserted that Mercado Pago credentials must start with
 * APP_USR- or TEST-. That is a convention, not a documented guarantee, and a
 * health endpoint that calls a working credential invalid is worse than one
 * that says nothing: it sends you chasing the wrong thing. The authoritative
 * test of a credential is a real API call, not a prefix.
 *
 * The specific failure this exists to catch: a secret set by pressing Ctrl+V
 * into a terminal prompt lands as the literal control character 0x16, and the
 * only symptom is the gateway answering 400 with an empty body.
 */

type Verdict = 'ok' | 'ausente' | 'com espaços em volta' | 'contém caracteres inválidos';

function inspect(value: string): Verdict {
  if (!value) return 'ausente';

  // Surrounding whitespace makes an Authorization header invalid, and the
  // runtime drops it rather than failing loudly — the gateway then reports no
  // authorization at all, which reads like a missing secret.
  if (value !== value.trim()) return 'com espaços em volta';

  // Compared by code point so the check cannot itself be mangled by a stray
  // paste, which is the very failure it is here to catch.
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return 'contém caracteres inválidos';
  }

  return 'ok';
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
    expected.map((name) => [name, inspect(readEnv(env, name))]),
  );

  // E-mail is not optional in this product: the partner invite and the
  // password reset both depend on it, so a health check that ignores it hides
  // a broken flow.
  const emailProvider = readEnv(env, 'EMAIL_PROVIDER') || 'console';
  const email =
    emailProvider === 'resend'
      ? { provider: emailProvider, apiKey: inspect(readEnv(env, 'RESEND_API_KEY')) }
      : { provider: emailProvider, apiKey: 'não envia de verdade' };

  return Response.json({ ok: true, paymentProvider: provider, credentials, email });
}
