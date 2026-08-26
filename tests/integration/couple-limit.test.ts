import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { makeHousehold, makeUser, type TestHousehold } from '../helpers/factory';
import type { Database } from '@/db';
import { AppError } from '@/lib/errors';
import { addMember, listMembers } from '@/domains/households/service';
import {
  invitePartner,
  acceptInvite,
  listPendingInvites,
} from '@/domains/households/invites';
import { pricing } from '@/config';

/**
 * ONE SUBSCRIPTION = EXACTLY TWO PEOPLE
 * =====================================
 * The buyer plus one partner. Never a third, by any route: a second invite, a
 * replayed link, a direct service call, or two acceptances landing at the same
 * instant.
 *
 * The last one is why `addMember` folds its capacity check into the INSERT.
 * A count followed by a separate insert leaves a window where two acceptances
 * both pass the check, and the household ends up with three people.
 */

let handle: TestDb;
let db: Database;
let couple: TestHousehold;

const APP_URL = 'https://exemplo.test';

beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  couple = await makeHousehold(db, { name: 'Ana & Lucas' });
});

afterEach(() => handle.close());

async function expectRefused(promise: Promise<unknown>) {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof AppError);
}

function invite(email: string, name = 'Convidado') {
  return invitePartner(db, {
    household: couple.actor.household,
    actorUserId: couple.ownerUserId,
    actorName: 'Ana',
    appUrl: APP_URL,
    input: { name, email },
  });
}

describe('caso 1 — espaço nasce com uma pessoa', () => {
  it('tem exatamente o proprietário', async () => {
    const members = await listMembers(db, couple.householdId);
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe('owner');
  });
});

describe('caso 2 — o proprietário convida uma pessoa', () => {
  it('cria um convite pendente', async () => {
    const result = await invite('parceiro@exemplo.test');

    expect(result.kind).toBe('link');
    const pending = await listPendingInvites(db, couple.householdId);
    expect(pending).toHaveLength(1);
  });
});

describe('caso 3 — segundo convite enquanto o primeiro está pendente', () => {
  it('é recusado', async () => {
    await invite('parceiro@exemplo.test');
    await expectRefused(invite('terceiro@exemplo.test', 'Terceiro'));

    // E não deixa um segundo convite para trás.
    const pending = await listPendingInvites(db, couple.householdId);
    expect(pending).toHaveLength(1);
  });
});

describe('caso 4 — o convidado aceita', () => {
  it('o casal passa a ter duas pessoas', async () => {
    const result = await invite('parceiro@exemplo.test');
    const token = (result as { inviteUrl: string }).inviteUrl.split('/').pop()!;

    const partner = await makeUser(db, { name: 'Lucas', email: 'parceiro@exemplo.test' });
    await acceptInvite(db, token, partner.id, partner.email);

    const members = await listMembers(db, couple.householdId);
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.role).sort()).toEqual(['owner', 'partner']);
  });
});

describe('caso 5 — convidar uma terceira pessoa com o casal completo', () => {
  it('é recusado', async () => {
    const result = await invite('parceiro@exemplo.test');
    const token = (result as { inviteUrl: string }).inviteUrl.split('/').pop()!;
    const partner = await makeUser(db, { name: 'Lucas', email: 'parceiro@exemplo.test' });
    await acceptInvite(db, token, partner.id, partner.email);

    await expectRefused(invite('terceiro@exemplo.test', 'Terceiro'));
    expect(await listMembers(db, couple.householdId)).toHaveLength(2);
  });
});

describe('caso 6 — link antigo reutilizado por outra pessoa', () => {
  it('é recusado, e o convite não serve duas vezes', async () => {
    const result = await invite('parceiro@exemplo.test');
    const token = (result as { inviteUrl: string }).inviteUrl.split('/').pop()!;

    const partner = await makeUser(db, { name: 'Lucas', email: 'parceiro@exemplo.test' });
    await acceptInvite(db, token, partner.id, partner.email);

    // Mesmo link, outra pessoa: o convite já foi usado.
    const outsider = await makeUser(db, { name: 'Carlos', email: 'carlos@exemplo.test' });
    await expectRefused(acceptInvite(db, token, outsider.id, outsider.email));

    // E o e-mail também não confere, que é a segunda barreira.
    expect(await listMembers(db, couple.householdId)).toHaveLength(2);
  });
});

describe('caso 7 — vaga extra pela camada de serviço', () => {
  it('addMember recusa a terceira pessoa', async () => {
    const result = await invite('parceiro@exemplo.test');
    const token = (result as { inviteUrl: string }).inviteUrl.split('/').pop()!;
    const partner = await makeUser(db, { name: 'Lucas', email: 'parceiro@exemplo.test' });
    await acceptInvite(db, token, partner.id, partner.email);

    // Chamada direta, sem passar por convite nenhum.
    const outsider = await makeUser(db, { name: 'Carlos', email: 'carlos@exemplo.test' });
    await expectRefused(
      addMember(db, {
        householdId: couple.householdId,
        userId: outsider.id,
        displayName: 'Carlos',
        role: 'partner',
        actorUserId: couple.ownerUserId,
      }),
    );

    expect(await listMembers(db, couple.householdId)).toHaveLength(2);
  });
});

describe('caso 8 — duas entradas ao mesmo tempo', () => {
  it('nunca resulta em três pessoas', async () => {
    const a = await makeUser(db, { name: 'Lucas', email: 'a@exemplo.test' });
    const b = await makeUser(db, { name: 'Carlos', email: 'b@exemplo.test' });

    // Disparadas juntas, sem await entre elas: é exatamente a janela que um
    // "conta e depois insere" deixa aberta.
    const results = await Promise.allSettled([
      addMember(db, {
        householdId: couple.householdId,
        userId: a.id,
        displayName: 'Lucas',
        role: 'partner',
        actorUserId: couple.ownerUserId,
      }),
      addMember(db, {
        householdId: couple.householdId,
        userId: b.id,
        displayName: 'Carlos',
        role: 'partner',
        actorUserId: couple.ownerUserId,
      }),
    ]);

    const members = await listMembers(db, couple.householdId);

    expect(members.length).toBeLessThanOrEqual(pricing.maxMembers);
    expect(members).toHaveLength(2);

    // Uma entrou, a outra foi recusada. Nunca as duas.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('a assinatura cobre o casal inteiro', () => {
  it('o parceiro entra sem assinatura própria', async () => {
    const result = await invite('parceiro@exemplo.test');
    const token = (result as { inviteUrl: string }).inviteUrl.split('/').pop()!;
    const partner = await makeUser(db, { name: 'Lucas', email: 'parceiro@exemplo.test' });

    const { householdId } = await acceptInvite(db, token, partner.id, partner.email);

    // Mesmo espaço, mesma assinatura — não existe cobrança por pessoa.
    expect(householdId).toBe(couple.householdId);
    const members = await listMembers(db, householdId);
    expect(members).toHaveLength(2);
  });

  it('o parceiro entra como partner, nunca como owner', async () => {
    const result = await invite('parceiro@exemplo.test');
    const token = (result as { inviteUrl: string }).inviteUrl.split('/').pop()!;
    const partner = await makeUser(db, { name: 'Lucas', email: 'parceiro@exemplo.test' });
    await acceptInvite(db, token, partner.id, partner.email);

    const members = await listMembers(db, couple.householdId);
    const joined = members.find((m) => m.userId === partner.id)!;
    expect(joined.role).toBe('partner');
  });
});
