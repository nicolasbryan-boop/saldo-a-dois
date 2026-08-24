import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createDb, type Database } from '@/db';

/**
 * Access to the Cloudflare runtime from server code.
 *
 * Bindings (D1, Workers AI) only exist per-request, so nothing at module scope
 * may hold onto them. Configuration values are read from the Worker `env`
 * first and fall back to `process.env`, which is what `next dev` populates
 * from .env.local.
 */

export type AppEnvName = 'development' | 'preview' | 'production';

export interface RuntimeContext {
  env: CloudflareEnv;
  db: Database;
  waitUntil: (promise: Promise<unknown>) => void;
}

export async function getRuntime(): Promise<RuntimeContext> {
  const { env, ctx } = await getCloudflareContext({ async: true });

  if (!env.DB) {
    throw new Error(
      'Binding D1 "DB" ausente. Rode as migrations locais e confira wrangler.jsonc.',
    );
  }

  return {
    env,
    db: createDb(env.DB),
    waitUntil: (promise) => {
      try {
        ctx.waitUntil(promise);
      } catch {
        // Outside a request context (build-time evaluation) there is nothing
        // to defer to; swallow rather than break the render.
        void promise.catch(() => {});
      }
    },
  };
}

export async function getDb(): Promise<Database> {
  return (await getRuntime()).db;
}

/** Reads a configuration value from the Worker env, then process.env. */
export function readEnv(env: Partial<CloudflareEnv> | undefined, key: string): string {
  const fromBinding = env ? (env as Record<string, unknown>)[key] : undefined;
  if (typeof fromBinding === 'string' && fromBinding.length > 0) return fromBinding;
  const fromProcess = process.env[key];
  return typeof fromProcess === 'string' ? fromProcess : '';
}

export function getAppEnv(env?: Partial<CloudflareEnv>): AppEnvName {
  const value = readEnv(env, 'APP_ENV');
  if (value === 'production' || value === 'preview') return value;
  return 'development';
}

export function isProduction(env?: Partial<CloudflareEnv>): boolean {
  return getAppEnv(env) === 'production';
}

export function getAppUrl(env?: Partial<CloudflareEnv>): string {
  const explicit =
    readEnv(env, 'NEXT_PUBLIC_APP_URL') || readEnv(env, 'BETTER_AUTH_URL');
  if (explicit) return explicit.replace(/\/$/, '');
  return 'http://localhost:3000';
}

export function getAdminEmails(env?: Partial<CloudflareEnv>): string[] {
  return readEnv(env, 'ADMIN_EMAILS')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
