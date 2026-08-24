/**
 * Config consumed by `npx @better-auth/cli generate`.
 *
 * The runtime auth instance is built per request (the D1 binding only exists
 * inside one), which the CLI cannot load. This file mirrors the same options
 * against a throwaway in-memory database purely so the CLI can derive the
 * expected table shape and we can diff it against src/db/schema/auth.ts.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../src/db/schema';

const db = drizzle(createClient({ url: ':memory:' }), { schema });

export const auth = betterAuth({
  appName: 'Saldo a Dois',
  secret: 'schema-generation-only-secret-0123456789',
  baseURL: 'http://localhost:3000',
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false },
      isAdmin: { type: 'boolean', required: false, defaultValue: false, input: false },
    },
    deleteUser: { enabled: true },
  },
});
