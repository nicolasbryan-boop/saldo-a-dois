/**
 * Development seed.
 *
 * Builds the demo couple by calling the REAL domain services against an
 * in-memory SQLite database, then dumps the resulting rows as SQL and applies
 * them to the local D1 with wrangler. That means the seed can never drift from
 * production logic: if `createTransaction` changes, the seed changes with it.
 *
 *   npm run db:seed              # writes into the local D1
 *   npm run db:seed -- --remote  # refused unless FORCE_REMOTE_SEED=1
 *
 * Never runs against production data by accident: `--remote` is explicitly
 * gated, because demo rows in a real database are a mess to undo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createLocalAccountIssuer } from '@better-auth/core/db';

import * as schema from '../src/db/schema';
import type { Database } from '../src/db';
import { randomId } from '../src/lib/ids';
import { todayIn } from '../src/lib/dates';
import { createHousehold, addMember } from '../src/domains/households/service';
import {
  ensureCurrentCycle,
  setOpeningBalance,
  setPlannedReserve,
} from '../src/domains/cycles/service';
import {
  createIncomeSource,
  createRecurringExpense,
  materializeDueRecurrences,
} from '../src/domains/recurrences/service';
import { createTransaction } from '../src/domains/transactions/service';
import { createGoal } from '../src/domains/goals/service';
import { activateSubscriptionForHousehold } from '../src/domains/billing/subscription';
import { loadSnapshot } from '../src/domains/financial-engine/load';
import { formatBRL } from '../src/lib/money';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const OUT_FILE_RELATIVE = '.wrangler/seed.sql';
const OUT_FILE = path.resolve(process.cwd(), OUT_FILE_RELATIVE);
const DB_NAME = 'saldo-a-dois-db';

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'demo123456';
const REMOTE = process.argv.includes('--remote');

/** Tables written by the seed, in foreign-key-safe order. */
const TABLE_ORDER = [
  'user',
  'account',
  'households',
  'household_members',
  'subscriptions',
  'categories',
  'financial_cycles',
  'income_sources',
  'recurring_expenses',
  'recurring_instances',
  'transactions',
  'goals',
  'goal_contributions',
  'audit_logs',
  'analytics_events',
] as const;

function readMigrations(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .flatMap((file) =>
      fs
        .readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter(Boolean),
    );
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) return String(value.getTime());
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  if (REMOTE && process.env.FORCE_REMOTE_SEED !== '1') {
    console.error(
      'Recusando semear o banco remoto.\n' +
        'Dados de demonstração nunca devem ir para produção por acidente.\n' +
        'Se você tem certeza, rode com FORCE_REMOTE_SEED=1.',
    );
    process.exit(1);
  }

  const client = createClient({ url: ':memory:' });
  for (const statement of readMigrations()) {
    await client.execute(statement);
  }

  const db = drizzle(client, { schema }) as unknown as Database;
  const now = new Date();
  const today = todayIn('America/Sao_Paulo');

  console.log('Construindo o casal de demonstração com os serviços reais…\n');

  /* --- People ----------------------------------------------------------- */

  const passwordHash = await hashPassword(SEED_PASSWORD);

  async function makeUser(name: string, email: string) {
    const id = `usr_${randomId(20)}`;
    await db.insert(schema.user).values({
      id,
      name,
      email,
      emailVerified: true,
      mustChangePassword: false,
      isAdmin: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.account).values({
      id: `acc_${randomId(20)}`,
      issuer: createLocalAccountIssuer('credential'),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    return { id, name, email };
  }

  const ana = await makeUser('Ana', 'ana@exemplo.com');
  const lucas = await makeUser('Lucas', 'lucas@exemplo.com');

  /* --- Household -------------------------------------------------------- */

  const { household } = await createHousehold(db, {
    name: 'Ana & Lucas',
    ownerUserId: ana.id,
    ownerDisplayName: 'Ana',
    cycleStartDay: 5,
  });

  const lucasMember = await addMember(db, {
    householdId: household.id,
    userId: lucas.id,
    displayName: 'Lucas',
    role: 'partner',
    actorUserId: ana.id,
  });

  await activateSubscriptionForHousehold(db, {
    householdId: household.id,
    ownerUserId: ana.id,
    provider: 'mock',
    providerCustomerId: 'mock_cus_seed',
    providerSubscriptionId: 'mock_sub_seed',
    currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
  });

  /* --- Recurring income and bills --------------------------------------- */

  const members = await db
    .select()
    .from(schema.householdMembers)
    .where(eq(schema.householdMembers.householdId, household.id));

  const anaMember = members.find((member) => member.userId === ana.id)!;

  await createIncomeSource(db, household.id, ana.id, {
    name: 'Salário da Ana',
    amountCents: 450_000,
    dayOfMonth: 5,
    memberId: anaMember.id,
  });

  await createIncomeSource(db, household.id, ana.id, {
    name: 'Salário do Lucas',
    amountCents: 500_000,
    dayOfMonth: 5,
    memberId: lucasMember.id,
  });

  const BILLS: Array<[string, number, number, string]> = [
    ['Aluguel', 185_000, 10, 'moradia'],
    ['Energia', 32_000, 12, 'energia'],
    ['Internet', 12_000, 15, 'internet'],
    ['Escola', 80_000, 20, 'educacao'],
    ['Academia', 24_000, 25, 'assinaturas'],
  ];

  const categories = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.householdId, household.id));

  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));

  for (const [name, amountCents, dayOfMonth, slug] of BILLS) {
    await createRecurringExpense(db, household.id, ana.id, {
      name,
      amountCents,
      dayOfMonth,
      categoryId: categoryBySlug.get(slug) ?? null,
    });
  }

  /* --- Cycle ------------------------------------------------------------ */

  const householdRow = (
    await db.select().from(schema.households).where(eq(schema.households.id, household.id))
  )[0]!;

  const cycle = await ensureCurrentCycle(db, householdRow, today);
  await setOpeningBalance(db, household.id, cycle.id, 845_000);
  await setPlannedReserve(db, household.id, cycle.id, 100_000);

  await db
    .update(schema.households)
    .set({ monthlyReserveCents: 100_000, onboardingCompletedAt: now })
    .where(eq(schema.households.id, household.id));

  await materializeDueRecurrences(db, householdRow, cycle);

  /* --- Movements -------------------------------------------------------- */

  const anaActor = { household: householdRow, userId: ana.id, memberId: anaMember.id };
  const lucasActor = { household: householdRow, userId: lucas.id, memberId: lucasMember.id };

  const MOVEMENTS: Array<[typeof anaActor, string, number, string]> = [
    [anaActor, 'Mercado', 18_600, 'mercado'],
    [lucasActor, 'Gasolina', 8_900, 'transporte'],
    [anaActor, 'Delivery', 5_900, 'delivery'],
    [lucasActor, 'Farmácia', 7_400, 'saude'],
    [anaActor, 'Almoço', 4_200, 'alimentacao'],
    [lucasActor, 'Uber', 3_200, 'transporte'],
  ];

  for (const [actor, description, amountCents, slug] of MOVEMENTS) {
    await createTransaction(db, actor, {
      type: 'expense',
      amountCents,
      description,
      categoryId: categoryBySlug.get(slug) ?? null,
      occurredOn: today,
      source: 'seed',
    });
  }

  await createGoal(db, household.id, ana.id, {
    name: 'Reserva de emergência',
    targetCents: 2_000_000,
    currentCents: 650_000,
    monthlyPlanCents: 100_000,
  });

  /* --- Sanity check before writing anything out ------------------------- */

  // Re-read the cycle: opening balance and reserve target were written after
  // the row was first created, so the earlier object is stale.
  const freshCycle = (
    await db
      .select()
      .from(schema.financialCycles)
      .where(eq(schema.financialCycles.id, cycle.id))
  )[0]!;

  const snapshot = await loadSnapshot(db, {
    householdId: household.id,
    cycle: freshCycle,
    timezone: householdRow.timezone,
    today,
  });

  console.log('Casal:            Ana & Lucas');
  console.log('Ciclo:           ', `${cycle.startDate} → ${cycle.endDate}`);
  console.log('Saldo atual:     ', formatBRL(snapshot.currentBalanceCents));
  console.log('Comprometido:    ', formatBRL(snapshot.pendingCommitmentsCents));
  console.log('Reserva restante:', formatBRL(snapshot.reserveRemainingCents));
  console.log('Livre para gastar:', formatBRL(snapshot.freeToSpendCents));
  console.log('Limite diário:   ', formatBRL(snapshot.dailyLimitCents));
  console.log('');

  /* --- Dump to SQL ------------------------------------------------------ */

  const statements: string[] = ['PRAGMA defer_foreign_keys = true;'];

  // Wipe first so re-seeding is repeatable rather than additive.
  for (const table of [...TABLE_ORDER].reverse()) {
    statements.push(`DELETE FROM "${table}";`);
  }

  for (const table of TABLE_ORDER) {
    const result = await client.execute(`SELECT * FROM "${table}"`);
    for (const row of result.rows) {
      const columns = result.columns.map((column) => `"${column}"`).join(', ');
      const values = result.columns
        .map((column) => sqlValue((row as Record<string, unknown>)[column]))
        .join(', ');
      statements.push(`INSERT INTO "${table}" (${columns}) VALUES (${values});`);
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, statements.join('\n'));
  client.close();

  console.log(`SQL gerado: ${OUT_FILE} (${statements.length} instruções)`);

  /* --- Apply with wrangler ---------------------------------------------- */

  const args = [
    'wrangler',
    'd1',
    'execute',
    DB_NAME,
    REMOTE ? '--remote' : '--local',
    `--file=${OUT_FILE_RELATIVE}`,
    '--yes',
  ];

  try {
    execFileSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  } catch {
    console.error(
      '\nNão foi possível aplicar o seed com o wrangler.\n' +
        'Rode as migrations primeiro:  npm run db:migrate:local',
    );
    process.exit(1);
  }

  console.log('\nPronto. Entre com:');
  console.log(`  ana@exemplo.com    / ${SEED_PASSWORD}`);
  console.log(`  lucas@exemplo.com  / ${SEED_PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
