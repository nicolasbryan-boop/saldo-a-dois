import { handle, jsonOk } from '@/server/api';
import { getRuntime, readEnv } from '@/server/context';
import { requireAdmin } from '@/domains/auth/session';
import { resolveSender } from '@/domains/notifications/email';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Which sending domains this Resend key actually sees as verified.
 *
 * Exists because "the domain is verified" and "Resend rejects the domain" can
 * both be true at once — of a different domain, a pending verification, or a
 * key belonging to another Resend account. Guessing between those costs a
 * deploy cycle each time; asking Resend costs one request.
 *
 * Admin-only: it calls a third party, so it must not be reachable by anyone
 * who feels like burning the API quota. Domain names are not secret — they
 * appear in every message sent — but the key never leaves the Worker.
 */
export const GET = handle(async () => {
  await requireAdmin();

  const { env } = await getRuntime();
  const apiKey = readEnv(env, 'RESEND_API_KEY').trim();

  if (!apiKey) throw errors.notConfigured('RESEND_API_KEY não configurada.');

  const sender = resolveSender(env);

  const response = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = payload as { name?: string; message?: string } | null;
    return jsonOk({
      remetenteConfigurado: sender.domain,
      erro: `HTTP ${response.status}${body?.message ? ` — ${body.message}` : ''}`,
      dominios: [],
    });
  }

  const data = (payload as { data?: Array<Record<string, unknown>> } | null)?.data ?? [];

  const dominios = data.map((row) => ({
    nome: String(row.name ?? ''),
    status: String(row.status ?? ''),
    regiao: String(row.region ?? ''),
  }));

  return jsonOk({
    remetenteConfigurado: sender.domain,
    usandoPadraoDoCodigo: sender.usingFallback,
    // The answer the whole question turns on.
    remetenteEstaVerificado: dominios.some(
      (d) => d.nome.toLowerCase() === sender.domain.toLowerCase() && d.status === 'verified',
    ),
    dominios,
  });
});
