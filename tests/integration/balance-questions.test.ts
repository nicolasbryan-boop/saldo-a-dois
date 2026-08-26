import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { makeHousehold, makeUser, type TestHousehold } from '../helpers/factory';
import type { Database } from '@/db';
import { addMember } from '@/domains/households/service';
import { createTransaction, type ActorContext } from '@/domains/transactions/service';
import { loadCoupleMoney } from '@/domains/transactions/member-summary';
import { createGoal, contributeToGoal } from '@/domains/goals/service';
import { parseLocally } from '@/domains/assistant/parser';

/**
 * BALANCE QUESTIONS, AND ONE SOURCE FOR THE ANSWER
 * ================================================
 * The assistant could record money all day and then answer "não entendi" to
 * "quanto eu tenho?" — the simplest thing anyone asks it. These cover the
 * understanding half.
 *
 * The other half is that the chat, the dashboard, the couple screen and the
 * movements screen must agree. They all read `loadCoupleMoney`, so the tests
 * below pin the arithmetic in one place rather than per screen.
 */

let handle: TestDb;
let db: Database;
let couple: TestHousehold;
let partner: ActorContext;

const TODAY = '2026-08-23';

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

function parse(text: string) {
  return parseLocally(text, 'America/Sao_Paulo')?.action;
}

describe('o chat entende perguntas de saldo', () => {
  it('reconhece perguntas sobre a própria pessoa', () => {
    for (const frase of [
      'quanto eu tenho?',
      'quantos reais tenho?',
      'quanto ainda tenho?',
      'quanto tenho livre?',
    ]) {
      expect(parse(frase), frase).toMatchObject({
        type: 'query_person_balance',
        whose: 'me',
      });
    }
  });

  it('reconhece perguntas sobre o parceiro', () => {
    for (const frase of [
      'quanto o parceiro tem?',
      'quanto minha parceira tem?',
      'quanto minha esposa tem?',
    ]) {
      expect(parse(frase), frase).toMatchObject({
        type: 'query_person_balance',
        whose: 'partner',
      });
    }
  });

  it('reconhece perguntas sobre os dois', () => {
    for (const frase of ['quanto nós dois temos?', 'quanto o casal tem?', 'quanto temos juntos?']) {
      expect(parse(frase), frase).toMatchObject({
        type: 'query_person_balance',
        whose: 'both',
      });
    }
  });

  it('reconhece o pedido de comparação', () => {
    for (const frase of ['quanto cada um tem?', 'como está dividido?']) {
      expect(parse(frase), frase).toMatchObject({
        type: 'query_person_balance',
        whose: 'each',
      });
    }
  });

  it('não confunde com lançamento nem com pergunta de gasto', () => {
    expect(parse('gastei 40 no mercado')).toMatchObject({ type: 'create_expense' });
    expect(parse('quanto cada um gastou?')).toMatchObject({ type: 'query_member_spending' });
  });
});

describe('o saldo por pessoa fecha a conta', () => {
  it('desconta gastos e o que foi guardado', async () => {
    await createTransaction(db, couple.actor, {
      type: 'income',
      amountCents: 500_000,
      description: 'Salário da Ana',
      occurredOn: TODAY,
    });
    await createTransaction(db, couple.actor, {
      type: 'expense',
      amountCents: 120_000,
      description: 'Mercado',
      occurredOn: TODAY,
    });

    const goal = await createGoal(db, couple.householdId, couple.ownerUserId, {
      name: 'Viagem',
      targetCents: 300_000,
    });
    await contributeToGoal(db, couple.actor, goal.id, 80_000, TODAY);

    const money = await loadCoupleMoney(db, {
      householdId: couple.householdId,
      cycleId: couple.cycle.id,
      actorMemberId: couple.ownerMemberId,
    });

    expect(money.mine.incomeCents).toBe(500_000);
    expect(money.mine.expenseCents).toBe(120_000);
    expect(money.mine.reservedCents).toBe(80_000);
    // Money in a goal is not spendable, so it comes out of the balance.
    expect(money.mine.balanceCents).toBe(300_000);
  });

  it('conta uma entrada de ajuste como entrada, não como gasto', async () => {
    await createTransaction(db, couple.actor, {
      type: 'adjustment_in',
      amountCents: 10_000,
      description: 'Correção de saldo',
      occurredOn: TODAY,
    });

    const money = await loadCoupleMoney(db, {
      householdId: couple.householdId,
      cycleId: couple.cycle.id,
      actorMemberId: couple.ownerMemberId,
    });

    expect(money.mine.incomeCents).toBe(10_000);
    expect(money.mine.expenseCents).toBe(0);
    expect(money.mine.balanceCents).toBe(10_000);
  });

  it('separa o saldo de cada um e soma o do casal', async () => {
    await createTransaction(db, couple.actor, {
      type: 'income',
      amountCents: 400_000,
      description: 'Salário da Ana',
      occurredOn: TODAY,
    });
    await createTransaction(db, partner, {
      type: 'income',
      amountCents: 300_000,
      description: 'Salário do Lucas',
      occurredOn: TODAY,
    });
    await createTransaction(db, partner, {
      type: 'expense',
      amountCents: 50_000,
      description: 'Barbeiro',
      occurredOn: TODAY,
    });

    const money = await loadCoupleMoney(db, {
      householdId: couple.householdId,
      cycleId: couple.cycle.id,
      actorMemberId: couple.ownerMemberId,
    });

    expect(money.mine.balanceCents).toBe(400_000);
    expect(money.partner!.displayName).toBe('Lucas');
    expect(money.partner!.balanceCents).toBe(250_000);
    expect(money.together.balanceCents).toBe(650_000);
  });

  it('põe o movimento sem dono no total do casal, fora dos cards individuais', async () => {
    await createTransaction(db, couple.actor, {
      type: 'income',
      amountCents: 100_000,
      description: 'Salário',
      occurredOn: TODAY,
    });

    // A row with no owner: the couple's, not one person's.
    await db.run(
      (await import('drizzle-orm')).sql`
        UPDATE transactions SET member_id = NULL
        WHERE household_id = ${couple.householdId} AND type = 'income'
      `,
    );

    const money = await loadCoupleMoney(db, {
      householdId: couple.householdId,
      cycleId: couple.cycle.id,
      actorMemberId: couple.ownerMemberId,
    });

    expect(money.mine.balanceCents).toBe(0);
    expect(money.shared?.balanceCents).toBe(100_000);
    // The couple total is summed from the rows, so nothing goes missing.
    expect(money.together.balanceCents).toBe(100_000);
  });

  it('sem parceiro, o total do casal é o saldo da única pessoa', async () => {
    const solo = await makeHousehold(db, { name: 'Sozinha', today: TODAY });
    await createTransaction(db, solo.actor, {
      type: 'income',
      amountCents: 200_000,
      description: 'Salário',
      occurredOn: TODAY,
    });

    const money = await loadCoupleMoney(db, {
      householdId: solo.householdId,
      cycleId: solo.cycle.id,
      actorMemberId: solo.ownerMemberId,
    });

    expect(money.partner).toBeNull();
    expect(money.mine.balanceCents).toBe(200_000);
    expect(money.together.balanceCents).toBe(200_000);
  });
});

describe('o chat reconhece as pessoas pelo nome', () => {
  const membros = [
    { name: 'Ana Silva', isSelf: true },
    { name: 'Bruno', isSelf: false },
  ];

  function parseComNomes(text: string) {
    return parseLocally(text, 'America/Sao_Paulo', membros)?.action;
  }

  it('entende o nome do parceiro', () => {
    // No list of words like "esposa" can cover the name a couple actually
    // uses, so the parser is given the household's names.
    expect(parseComNomes('quanto o Bruno tem?')).toMatchObject({
      type: 'query_person_balance',
      whose: 'partner',
    });
  });

  it('entende o próprio nome como a própria pessoa', () => {
    expect(parseComNomes('quanto a Ana tem?')).toMatchObject({
      type: 'query_person_balance',
      whose: 'me',
    });
  });

  it('continua entendendo sem nomes informados', () => {
    expect(parseLocally('quanto o parceiro tem?', 'America/Sao_Paulo')?.action).toMatchObject({
      type: 'query_person_balance',
      whose: 'partner',
    });
  });
});
