import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db';
import { makeUser } from '../helpers/factory';
import type { Database } from '@/db';
import { subscriptions } from '@/db/schema';
import { createHousehold } from '@/domains/households/service';
import {
  createCheckoutSession,
  activateSubscriptionForHousehold,
  isSubscriptionActive,
} from '@/domains/billing/subscription';
import { getPlan, planList, periodEndFor, type PlanId } from '@/config';

/**
 * Buying each of the three plans must store that plan's price and give the
 * household a period as long as the plan promises. A yearly subscriber losing
 * access after a month would be the worst possible bug here.
 */

let handle: TestDb;
let db: Database;

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
});

afterEach(() => handle.close());

async function buy(planId: PlanId, currentPeriodEnd: Date | null = null) {
  const owner = await makeUser(db, { name: 'Ana' });
  const { household } = await createHousehold(db, {
    name: 'Ana & Lucas',
    ownerUserId: owner.id,
    ownerDisplayName: 'Ana',
  });

  const checkout = await createCheckoutSession(db, {
    email: owner.email,
    provider: 'mock',
    planId,
  });

  const subscription = await activateSubscriptionForHousehold(db, {
    householdId: household.id,
    ownerUserId: owner.id,
    provider: 'mock',
    providerCustomerId: null,
    providerSubscriptionId: `sub_${planId}`,
    currentPeriodEnd,
    planId,
  });

  return { checkout, subscription, householdId: household.id };
}

describe('checkout por plano', () => {
  for (const plan of planList) {
    it(`grava o preço oficial do plano ${plan.name}`, async () => {
      const { checkout } = await buy(plan.id);

      expect(checkout.planId).toBe(plan.id);
      expect(checkout.amountCents).toBe(plan.priceCents);
      expect(checkout.currency).toBe('BRL');
      expect(checkout.status).toBe('pending');
    });
  }

  it('usa o catálogo, não um valor vindo de fora', async () => {
    // Only the id travels; the price is always looked up server-side.
    const { checkout } = await buy('anual');
    expect(checkout.amountCents).toBe(22990);
    expect(checkout.amountCents).not.toBe(2090);
  });
});

describe('assinatura por plano', () => {
  for (const plan of planList) {
    it(`guarda plano e preço corretos para ${plan.name}`, async () => {
      const { subscription } = await buy(plan.id);

      expect(subscription.planId).toBe(plan.id);
      expect(subscription.priceCents).toBe(plan.priceCents);
      expect(subscription.status).toBe('active');
    });
  }

  it('dá ao anual um período de um ano quando o gateway não informa', async () => {
    const before = new Date();
    const { subscription } = await buy('anual', null);

    const periodEnd = subscription.currentPeriodEnd!;
    const elapsedDays = (periodEnd.getTime() - before.getTime()) / 86_400_000;

    expect(elapsedDays).toBeGreaterThan(360);
    expect(elapsedDays).toBeLessThan(370);
  });

  it('dá ao trimestral cerca de três meses, não um', async () => {
    const before = new Date();
    const { subscription } = await buy('trimestral', null);

    const elapsedDays =
      (subscription.currentPeriodEnd!.getTime() - before.getTime()) / 86_400_000;

    expect(elapsedDays).toBeGreaterThan(85);
    expect(elapsedDays).toBeLessThan(95);
  });

  it('respeita o período informado pelo gateway quando ele existe', async () => {
    const informed = new Date('2027-06-01T00:00:00Z');
    const { subscription } = await buy('mensal', informed);

    expect(subscription.currentPeriodEnd?.toISOString()).toBe(informed.toISOString());
  });

  it('mantém o acesso liberado durante todo o período do plano', async () => {
    const { subscription } = await buy('anual');

    const inSixMonths = periodEndFor(getPlan('trimestral'), new Date());
    inSixMonths.setUTCMonth(inSixMonths.getUTCMonth() + 3);

    expect(isSubscriptionActive(subscription, inSixMonths)).toBe(true);
  });

  it('bloqueia depois que o período do plano termina', async () => {
    const { subscription } = await buy('mensal');

    const wellAfter = new Date(subscription.currentPeriodEnd!.getTime() + 10 * 86_400_000);
    expect(isSubscriptionActive(subscription, wellAfter)).toBe(false);
  });
});

describe('troca de plano', () => {
  it('sobrescreve plano e preço ao reativar em outra cadência', async () => {
    const { householdId, subscription } = await buy('mensal');
    expect(subscription.planId).toBe('mensal');

    const owner = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.householdId, householdId))
      .limit(1);

    const updated = await activateSubscriptionForHousehold(db, {
      householdId,
      ownerUserId: owner[0]!.ownerUserId,
      provider: 'mock',
      providerCustomerId: null,
      providerSubscriptionId: 'sub_novo',
      currentPeriodEnd: null,
      planId: 'anual',
    });

    expect(updated.planId).toBe('anual');
    expect(updated.priceCents).toBe(22990);

    // Still exactly one subscription row for the household.
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.householdId, householdId));
    expect(rows).toHaveLength(1);
  });
});
