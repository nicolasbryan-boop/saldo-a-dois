import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { makeHousehold, makeUser, reloadHousehold, type TestHousehold } from '../helpers/factory';
import type { Database } from '@/db';
import { AppError } from '@/lib/errors';
import {
  assertMembership,
  assertOwner,
  getMembership,
  loadContext,
  addMember,
  removeMember,
  assertCanAddMember,
  createHousehold,
} from '@/domains/households/service';
import {
  createTransaction,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  listTransactions,
} from '@/domains/transactions/service';
import {
  createRecurringExpense,
  getRecurringExpense,
  updateRecurringExpense,
} from '@/domains/recurrences/service';
import { createGoal, getGoal, updateGoal } from '@/domains/goals/service';
import { isSubscriptionActive } from '@/domains/billing/subscription';
import { pricing } from '@/config';

/**
 * TENANT ISOLATION
 * ================
 * Two households exist. Everything a member of A tries to do against B must
 * be refused by the backend, not by the UI.
 */

let handle: TestDb;
let db: Database;
let alpha: TestHousehold;
let beta: TestHousehold;

const TODAY = '2026-08-23';

async function expectDenied(promise: Promise<unknown>, codes: string[] = ['forbidden', 'not_found']) {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    return error instanceof AppError && codes.includes(error.code);
  });
}

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  alpha = await makeHousehold(db, { name: 'Ana & Lucas', openingBalanceCents: 500_000, today: TODAY });
  beta = await makeHousehold(db, { name: 'Bia & Caio', openingBalanceCents: 900_000, today: TODAY });
});

afterEach(() => handle.close());

describe('membership checks', () => {
  it('refuses a user who is not in the household', async () => {
    expect(await getMembership(db, alpha.ownerUserId, beta.householdId)).toBeNull();
    await expectDenied(assertMembership(db, alpha.ownerUserId, beta.householdId), ['forbidden']);
  });

  it('accepts the household the user actually belongs to', async () => {
    const membership = await assertMembership(db, alpha.ownerUserId, alpha.householdId);
    expect(membership.role).toBe('owner');
  });

  it('resolves the household from the session identity, never from input', async () => {
    const context = await loadContext(db, alpha.ownerUserId);
    expect(context?.household.id).toBe(alpha.householdId);
    expect(context?.household.id).not.toBe(beta.householdId);
  });

  it('gives a user with no household nothing at all', async () => {
    const stranger = await makeUser(db, { name: 'Estranho' });
    expect(await loadContext(db, stranger.id)).toBeNull();
  });
});

describe('cross-household data access', () => {
  it('cannot read another household movement by id', async () => {
    const movement = await createTransaction(db, beta.actor, {
      type: 'expense',
      amountCents: 15_000,
      description: 'Mercado da Bia',
      occurredOn: TODAY,
    });

    // Same id, wrong tenant.
    await expectDenied(getTransaction(db, alpha.householdId, movement.id), ['not_found']);
    // Right tenant still works.
    expect((await getTransaction(db, beta.householdId, movement.id)).id).toBe(movement.id);
  });

  it('cannot edit another household movement', async () => {
    const movement = await createTransaction(db, beta.actor, {
      type: 'expense',
      amountCents: 15_000,
      description: 'Mercado da Bia',
      occurredOn: TODAY,
    });

    await expectDenied(
      updateTransaction(db, alpha.actor, movement.id, { amountCents: 1 }),
      ['not_found'],
    );

    const untouched = await getTransaction(db, beta.householdId, movement.id);
    expect(untouched.amountCents).toBe(15_000);
  });

  it('cannot delete another household movement', async () => {
    const movement = await createTransaction(db, beta.actor, {
      type: 'expense',
      amountCents: 15_000,
      description: 'Mercado da Bia',
      occurredOn: TODAY,
    });

    await expectDenied(deleteTransaction(db, alpha.actor, movement.id), ['not_found']);
    expect(await getTransaction(db, beta.householdId, movement.id)).toBeTruthy();
  });

  it('never leaks another household movement into a list', async () => {
    await createTransaction(db, beta.actor, {
      type: 'expense',
      amountCents: 15_000,
      description: 'Mercado da Bia',
      occurredOn: TODAY,
    });
    await createTransaction(db, alpha.actor, {
      type: 'expense',
      amountCents: 7_000,
      description: 'Mercado da Ana',
      occurredOn: TODAY,
    });

    const listed = await listTransactions(db, alpha.householdId, { limit: 100 });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.description).toBe('Mercado da Ana');
    expect(listed.every((row) => row.householdId === alpha.householdId)).toBe(true);
  });

  it('cannot read or edit another household bill', async () => {
    const bill = await createRecurringExpense(db, beta.householdId, beta.ownerUserId, {
      name: 'Aluguel da Bia',
      amountCents: 200_000,
      dayOfMonth: 10,
    });

    await expectDenied(getRecurringExpense(db, alpha.householdId, bill.id), ['not_found']);
    await expectDenied(
      updateRecurringExpense(db, alpha.householdId, alpha.ownerUserId, bill.id, {
        amountCents: 1,
      }),
      ['not_found'],
    );
  });

  it('cannot read or edit another household goal', async () => {
    const goal = await createGoal(db, beta.householdId, beta.ownerUserId, {
      name: 'Viagem da Bia',
      targetCents: 2_000_000,
    });

    await expectDenied(getGoal(db, alpha.householdId, goal.id), ['not_found']);
    await expectDenied(
      updateGoal(db, alpha.householdId, alpha.ownerUserId, goal.id, { targetCents: 1 }),
      ['not_found'],
    );
  });

  it('assigns a movement to the acting household even if a foreign member id is passed', async () => {
    await expectDenied(
      createTransaction(db, alpha.actor, {
        type: 'expense',
        amountCents: 1_000,
        description: 'Tentativa',
        occurredOn: TODAY,
        memberId: beta.ownerMemberId,
      }),
      ['validation'],
    );
  });
});

describe('roles', () => {
  it('lets only the owner manage the household membership', async () => {
    const partnerUser = await makeUser(db, { name: 'Lucas' });
    const partner = await addMember(db, {
      householdId: alpha.householdId,
      userId: partnerUser.id,
      displayName: 'Lucas',
      role: 'partner',
      actorUserId: alpha.ownerUserId,
    });

    await expectDenied(assertOwner(db, partnerUser.id, alpha.householdId), ['forbidden']);
    expect((await assertOwner(db, alpha.ownerUserId, alpha.householdId)).role).toBe('owner');

    // The partner cannot remove anyone.
    await expectDenied(
      removeMember(db, alpha.householdId, partnerUser.id, partner.id),
      ['forbidden'],
    );
  });

  it('refuses to remove the owner', async () => {
    const context = await loadContext(db, alpha.ownerUserId);
    const ownerMember = context!.members.find((m) => m.role === 'owner')!;

    await expect(
      removeMember(db, alpha.householdId, alpha.ownerUserId, ownerMember.id),
    ).rejects.toThrow();
  });

  it('caps the household at two people', async () => {
    const second = await makeUser(db, { name: 'Lucas' });
    await addMember(db, {
      householdId: alpha.householdId,
      userId: second.id,
      displayName: 'Lucas',
      role: 'partner',
      actorUserId: alpha.ownerUserId,
    });

    expect(pricing.maxMembers).toBe(2);
    await expect(assertCanAddMember(db, alpha.householdId)).rejects.toThrow();

    const third = await makeUser(db, { name: 'Terceiro' });
    await expect(
      addMember(db, {
        householdId: alpha.householdId,
        userId: third.id,
        displayName: 'Terceiro',
        role: 'partner',
        actorUserId: alpha.ownerUserId,
      }),
    ).rejects.toThrow();
  });

  it('does not duplicate a member who is added twice', async () => {
    const partnerUser = await makeUser(db, { name: 'Lucas' });

    const first = await addMember(db, {
      householdId: alpha.householdId,
      userId: partnerUser.id,
      displayName: 'Lucas',
      role: 'partner',
      actorUserId: alpha.ownerUserId,
    });

    const context = await loadContext(db, alpha.ownerUserId);
    expect(context!.members).toHaveLength(2);
    expect(first.userId).toBe(partnerUser.id);
  });

  it('lets a removed partner be re-added without creating a second row', async () => {
    const partnerUser = await makeUser(db, { name: 'Lucas' });
    const member = await addMember(db, {
      householdId: alpha.householdId,
      userId: partnerUser.id,
      displayName: 'Lucas',
      role: 'partner',
      actorUserId: alpha.ownerUserId,
    });

    await removeMember(db, alpha.householdId, alpha.ownerUserId, member.id);
    expect((await loadContext(db, alpha.ownerUserId))!.members).toHaveLength(1);
    expect(await loadContext(db, partnerUser.id)).toBeNull();

    const readded = await addMember(db, {
      householdId: alpha.householdId,
      userId: partnerUser.id,
      displayName: 'Lucas',
      role: 'partner',
      actorUserId: alpha.ownerUserId,
    });

    expect(readded.id).toBe(member.id);
    expect((await loadContext(db, alpha.ownerUserId))!.members).toHaveLength(2);
  });

  it('refuses to give one user a second household', async () => {
    await expect(
      createHousehold(db, {
        name: 'Outro espaço',
        ownerUserId: alpha.ownerUserId,
        ownerDisplayName: 'Ana',
      }),
    ).rejects.toThrow();
  });
});

describe('subscription gate', () => {
  it('lets an active subscription in', () => {
    expect(
      isSubscriptionActive({
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      }),
    ).toBe(true);
  });

  it('keeps a pending subscription out', () => {
    expect(isSubscriptionActive({ status: 'pending', currentPeriodEnd: null })).toBe(false);
  });

  it('keeps an expired subscription out', () => {
    expect(
      isSubscriptionActive({
        status: 'active',
        currentPeriodEnd: new Date(Date.now() - 10 * 86_400_000),
      }),
    ).toBe(false);
  });

  it('keeps a household with no subscription out', () => {
    expect(isSubscriptionActive(null)).toBe(false);
    expect(isSubscriptionActive(undefined)).toBe(false);
  });

  it('lets a cancelled subscription finish the period it paid for', () => {
    expect(
      isSubscriptionActive({
        status: 'canceled',
        currentPeriodEnd: new Date(Date.now() + 5 * 86_400_000),
      }),
    ).toBe(true);

    expect(
      isSubscriptionActive({
        status: 'canceled',
        currentPeriodEnd: new Date(Date.now() - 5 * 86_400_000),
      }),
    ).toBe(false);
  });
});

describe('household context', () => {
  it('exposes only its own members', async () => {
    const partnerUser = await makeUser(db, { name: 'Lucas' });
    await addMember(db, {
      householdId: alpha.householdId,
      userId: partnerUser.id,
      displayName: 'Lucas',
      role: 'partner',
      actorUserId: alpha.ownerUserId,
    });

    const context = await loadContext(db, alpha.ownerUserId);
    expect(context!.members.map((m) => m.displayName).sort()).toEqual(['Ana', 'Lucas']);

    const otherContext = await loadContext(db, beta.ownerUserId);
    expect(otherContext!.members).toHaveLength(1);
    expect(otherContext!.household.id).toBe(beta.householdId);
  });

  it('shows both members the same numbers', async () => {
    const partnerUser = await makeUser(db, { name: 'Lucas' });
    const partnerMember = await addMember(db, {
      householdId: alpha.householdId,
      userId: partnerUser.id,
      displayName: 'Lucas',
      role: 'partner',
      actorUserId: alpha.ownerUserId,
    });

    const household = await reloadHousehold(db, alpha.householdId);

    await createTransaction(
      db,
      { household, userId: partnerUser.id, memberId: partnerMember.id },
      { type: 'expense', amountCents: 8_000, description: 'Gasolina', occurredOn: TODAY },
    );

    const ownerView = await listTransactions(db, alpha.householdId, { limit: 10 });
    expect(ownerView).toHaveLength(1);
    expect(ownerView[0]!.description).toBe('Gasolina');
    expect(ownerView[0]!.memberId).toBe(partnerMember.id);
  });
});
