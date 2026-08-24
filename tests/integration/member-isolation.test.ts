import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { makeHousehold, makeUser, type TestHousehold } from '../helpers/factory';
import type { Database } from '@/db';
import { AppError } from '@/lib/errors';
import { addMember } from '@/domains/households/service';
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  listTransactions,
  type ActorContext,
} from '@/domains/transactions/service';

/**
 * MEMBER ISOLATION INSIDE ONE COUPLE
 * ==================================
 * Tenant isolation already covers household A against household B. This file
 * covers the harder boundary: two people who legitimately share a household.
 *
 * They see the same dashboard. They must not be able to move each other's
 * money. Hiding the buttons is not the mechanism — every assertion here calls
 * the service layer directly, with no UI involved.
 */

let handle: TestDb;
let db: Database;
let couple: TestHousehold;
let partner: ActorContext;

const TODAY = '2026-08-23';

async function expectForbidden(promise: Promise<unknown>) {
  await expect(promise).rejects.toSatisfy(
    (error: unknown) => error instanceof AppError && error.code === 'forbidden',
  );
}

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;

  couple = await makeHousehold(db, { name: 'Ana & Lucas', today: TODAY });

  const partnerUser = await makeUser(db, { name: 'Lucas' });
  const partnerMember = await addMember(db, {
    householdId: couple.householdId,
    userId: partnerUser.id,
    displayName: 'Lucas',
    role: 'partner',
    actorUserId: couple.ownerUserId,
  });

  partner = {
    household: couple.actor.household,
    userId: partnerUser.id,
    memberId: partnerMember.id,
  };
});

afterEach(() => handle.close());

/** A movement each, so every test starts with both sides represented. */
async function seedOneEach() {
  const hers = await createTransaction(db, couple.actor, {
    type: 'expense',
    amountCents: 12_000,
    description: 'Salão',
    occurredOn: TODAY,
  });
  const his = await createTransaction(db, partner, {
    type: 'expense',
    amountCents: 8_000,
    description: 'Barbeiro',
    occurredOn: TODAY,
  });
  return { hers, his };
}

describe('cada movimento nasce com dono', () => {
  it('atribui o movimento a quem lançou, sem precisar informar', async () => {
    const { hers, his } = await seedOneEach();

    expect(hers.memberId).toBe(couple.ownerMemberId);
    expect(his.memberId).toBe(partner.memberId);
  });

  it('recusa lançar em nome do parceiro', async () => {
    await expectForbidden(
      createTransaction(db, couple.actor, {
        type: 'expense',
        amountCents: 5_000,
        description: 'Gasto do Lucas',
        occurredOn: TODAY,
        // The browser is free to send this. The server is not free to obey.
        memberId: partner.memberId,
      }),
    );
  });

  it('aceita o próprio member id quando ele é enviado', async () => {
    const row = await createTransaction(db, partner, {
      type: 'income',
      amountCents: 400_000,
      description: 'Salário',
      occurredOn: TODAY,
      memberId: partner.memberId,
    });

    expect(row.memberId).toBe(partner.memberId);
  });
});

describe('um membro não mexe no dinheiro do outro', () => {
  it('recusa editar o movimento do parceiro', async () => {
    const { hers } = await seedOneEach();

    await expectForbidden(
      updateTransaction(db, partner, hers.id, { amountCents: 1 }),
    );
  });

  it('recusa excluir o movimento do parceiro', async () => {
    const { his } = await seedOneEach();

    await expectForbidden(deleteTransaction(db, couple.actor, his.id));
  });

  it('recusa transferir o próprio movimento para o parceiro', async () => {
    const { hers } = await seedOneEach();

    // Reassignment is how you would launder a movement across the boundary.
    await expectForbidden(
      updateTransaction(db, couple.actor, hers.id, { memberId: partner.memberId }),
    );
  });

  it('deixa cada um editar e excluir o que é seu', async () => {
    const { hers, his } = await seedOneEach();

    const edited = await updateTransaction(db, couple.actor, hers.id, {
      amountCents: 15_000,
    });
    expect(edited.amountCents).toBe(15_000);

    await deleteTransaction(db, partner, his.id);

    const left = await listTransactions(db, couple.householdId, {});
    expect(left.map((row) => row.id)).toEqual([hers.id]);
  });
});

describe('os dois enxergam o mesmo espaço', () => {
  it('lista os movimentos do casal para qualquer um dos dois', async () => {
    const { hers, his } = await seedOneEach();

    const rows = await listTransactions(db, couple.householdId, {});
    const ids = rows.map((row) => row.id).sort();

    expect(ids).toEqual([hers.id, his.id].sort());
  });

  it('separa por dono quando filtrado, para o painel "meu / do parceiro"', async () => {
    const { hers, his } = await seedOneEach();

    const mine = await listTransactions(db, couple.householdId, {
      memberIds: [couple.ownerMemberId],
    });
    const theirs = await listTransactions(db, couple.householdId, {
      memberIds: [partner.memberId],
    });

    expect(mine.map((r) => r.id)).toEqual([hers.id]);
    expect(theirs.map((r) => r.id)).toEqual([his.id]);
  });
});
