import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import type { Database } from '@/db';
import { user, session, account, verification } from '@/db/schema';
import { getRuntime, readEnv, isProduction, getAppUrl } from '@/server/context';
import { getEmailProvider, passwordResetEmail } from '@/domains/notifications/email';

/**
 * Better Auth instance factory.
 *
 * The D1 binding only exists inside a request, so the auth instance is built
 * per Worker environment and memoised against it. Nothing here is created at
 * module scope.
 */

const cache = new WeakMap<object, ReturnType<typeof buildAuth>>();

function buildAuth(db: Database, env: CloudflareEnv) {
  const secret = readEnv(env, 'BETTER_AUTH_SECRET');
  const production = isProduction(env);

  if (!secret) {
    if (production) {
      throw new Error(
        'BETTER_AUTH_SECRET não configurado. Defina o secret antes de subir para produção.',
      );
    }
    // Development only: a stable, obviously-fake secret beats a crash while
    // someone is still setting the project up.
    console.warn(
      '[auth] BETTER_AUTH_SECRET ausente — usando um secret de desenvolvimento. Não use isso em produção.',
    );
  }

  const options = {
    appName: 'Saldo a Dois',
    secret: secret || 'dev-only-insecure-secret-please-set-BETTER_AUTH_SECRET',
    baseURL: getAppUrl(env),
    basePath: '/api/auth',
    // CSRF: state-changing requests must come from one of these origins.
    // NEXT_PUBLIC_APP_URL and BETTER_AUTH_URL are allowed to differ (a proxy,
    // a preview domain), so both are trusted when both are set.
    trustedOrigins: Array.from(
      new Set(
        [readEnv(env, 'NEXT_PUBLIC_APP_URL'), readEnv(env, 'BETTER_AUTH_URL'), getAppUrl(env)]
          .filter(Boolean)
          .map((origin) => origin.replace(/\/+$/, '')),
      ),
    ),
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user: target, url }) => {
        const provider = getEmailProvider(db, env);
        await provider.send(passwordResetEmail(target.email, url, target.name));
      },
      onPasswordReset: async ({ user: target }) => {
        // A completed reset always clears the temporary-password flag.
        await db
          .update(user)
          .set({ mustChangePassword: false, updatedAt: new Date() })
          .where(eq(user.id, target.id));
      },
    },
    user: {
      additionalFields: {
        mustChangePassword: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
        },
        isAdmin: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
        },
      },
      deleteUser: { enabled: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    advanced: {
      useSecureCookies: production,
      defaultCookieAttributes: {
        sameSite: 'lax',
        httpOnly: true,
        path: '/',
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 60, max: 5 },
        '/forget-password': { window: 300, max: 5 },
        '/reset-password': { window: 300, max: 5 },
      },
    },
    plugins: [nextCookies()],
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

export type Auth = ReturnType<typeof buildAuth>;

export async function getAuth(): Promise<Auth> {
  const { db, env } = await getRuntime();
  const key = env as unknown as object;
  const existing = cache.get(key);
  if (existing) return existing;

  const instance = buildAuth(db, env);
  cache.set(key, instance);
  return instance;
}
