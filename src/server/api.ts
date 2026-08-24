import { z } from 'zod';
import { AppError, errors, isAppError } from '@/lib/errors';
import { getRuntime } from './context';
import { logError } from '@/domains/analytics/audit';

/**
 * HTTP boundary helpers.
 *
 * Everything a route returns goes through `handle`, so a thrown AppError maps
 * to the right status with a message that is safe to show, and an unexpected
 * error never leaks a stack trace to the client.
 */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
} as const;

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers ?? {}) },
  });
}

export function jsonError(error: AppError): Response {
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
  return Response.json(body, { status: error.status, headers: NO_STORE });
}

export function handle(
  handler: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>,
) {
  return async (
    request: Request,
    context: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (isAppError(error)) return jsonError(error);

      // Unexpected: record it server-side, tell the client nothing specific.
      console.error('[api] erro inesperado', (error as Error)?.message);
      try {
        const { db } = await getRuntime();
        await logError(db, new URL(request.url).pathname, error);
      } catch {
        // The database itself may be the thing that failed.
      }
      return jsonError(errors.internal());
    }
  };
}

/** Parses and validates a JSON body, turning Zod issues into field errors. */
export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw errors.validation('Corpo da requisição inválido.');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }
    throw errors.validation('Confira os dados informados.', details);
  }

  return result.data;
}

/**
 * Per-IP fixed-window rate limit backed by D1.
 *
 * Cheap and good enough for the endpoints that matter here (checkout creation,
 * assistant messages). Better Auth applies its own limits to the auth routes.
 */
export async function rateLimit(
  request: Request,
  bucket: string,
  options: { max: number; windowSeconds: number },
): Promise<void> {
  const { env } = await getRuntime();
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';

  const windowStart =
    Math.floor(Date.now() / (options.windowSeconds * 1000)) * options.windowSeconds;
  const key = `rl:${bucket}:${ip}:${windowStart}`;

  const result = await env.DB.prepare(
    `INSERT INTO rate_limits (key, hits, expires_at)
     VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET hits = hits + 1
     RETURNING hits`,
  )
    .bind(key, (windowStart + options.windowSeconds) * 1000)
    .first<{ hits: number }>();

  if ((result?.hits ?? 0) > options.max) {
    throw errors.rateLimited();
  }
}

/** Removes expired counters. Called opportunistically, never on the hot path. */
export async function pruneRateLimits(): Promise<void> {
  const { env } = await getRuntime();
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?1')
    .bind(Date.now())
    .run();
}

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD');

export const amountCentsSchema = z
  .number()
  .int('Informe um valor válido')
  .positive('O valor precisa ser maior que zero')
  .max(10_000_000_000, 'Valor acima do limite');
