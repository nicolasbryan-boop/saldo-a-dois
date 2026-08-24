import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '@/db/schema';
import type { Database } from '@/db';

/**
 * In-memory database for tests.
 *
 * The production binding is Cloudflare D1 and the test binding is libsql —
 * both are SQLite, and both run the SAME migration files from
 * `drizzle/migrations`. That is deliberate: a test that passes here has
 * exercised the real schema, indexes and unique constraints, including the
 * ones the idempotency and isolation guarantees depend on.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

function readMigrations(): string[] {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return files.flatMap((file) =>
    fs
      .readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean),
  );
}

export interface TestDb {
  db: Database;
  close: () => void;
}

export async function createTestDb(): Promise<TestDb> {
  const client = createClient({ url: ':memory:' });

  for (const statement of readMigrations()) {
    await client.execute(statement);
  }

  // Foreign keys are off by default in SQLite; the schema relies on them.
  await client.execute('PRAGMA foreign_keys = ON');

  const db = drizzle(client, { schema, logger: false });

  return {
    // Same SQLite dialect and same query builder; the driver differs only in
    // how statements are dispatched.
    db: db as unknown as Database,
    close: () => client.close(),
  };
}
