import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { makeHousehold, makeUser, type TestHousehold } from '../helpers/factory';
import type { Database } from '@/db';
import { addMember } from '@/domains/households/service';
import { createGoal, contributeToGoal, listGoals } from '@/domains/goals/service';
import { loadCoupleGoals } from '@/domains/goals/progress';
import { parseLocally } from '@/domains/assistant/parser';
import type { ActorContext } from '@/domains/transactions/service';

/**
 * GOALS AS A SHARED POT, AND THE CHAT THAT FEEDS THEM
 * ===================================================
 * A goal belongs to the couple: both see it, both add to it, and the split
 * between them stays visible.
 *
 * The chat half of this file guards a specific past bug: "guardei 200" used to
 * drop the money into whichever goal happened to be first in the list. Money
 * silently landing in the wrong goal is the failure this suite exists to stop.
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

describe('meta é do casal, com contribuição por pessoa', () => {
  it('soma os aportes dos dois e mostra quanto cada um colocou', async () => {
    const goal = await createGoal(db, couple.householdId, couple.ownerUserId, {
      name: 'Viagem',
      targetCents: 300_000,
    });

    await contributeToGoal(db, couple.actor, goal.id, 50_000, TODAY);
    await contributeToGoal(db, partner, goal.id, 40_000, TODAY);

    const { goals } = await loadCoupleGoals(db, couple.householdId);
    const viagem = goals.find((row) => row.id === goal.id)!;

    expect(viagem.savedCents).toBe(90_000);
    expect(viagem.targetCents).toBe(300_000);
    expect(viagem.percent).toBe(30);
    expect(viagem.remainingCents).toBe(210_000);

    const byName = Object.fromEntries(
      viagem.contributors.map((c) => [c.displayName, c.amountCents]),
    );
    expect(byName).toEqual({ Ana: 50_000, Lucas: 40_000 });
  });

  it('mostra a meta para os dois, não só para quem criou', async () => {
    await createGoal(db, couple.householdId, partner.userId, {
      name: 'Reserva de emergência',
      targetCents: 100_000,
    });

    // Same household, so the same goals — there is no per-person goal list.
    const visible = await listGoals(db, couple.householdId);
    expect(visible.map((g) => g.name)).toContain('Reserva de emergência');
  });

  it('inclui quem ainda não guardou nada, com zero', async () => {
    const goal = await createGoal(db, couple.householdId, couple.ownerUserId, {
      name: 'Carro',
      targetCents: 500_000,
    });
    await contributeToGoal(db, couple.actor, goal.id, 20_000, TODAY);

    const { perMember } = await loadCoupleGoals(db, couple.householdId);
    const lucas = perMember.find((m) => m.displayName === 'Lucas');

    // A zero is information. An absent row reads as a rendering bug.
    expect(lucas).toBeDefined();
    expect(lucas!.amountCents).toBe(0);
  });

  it('não deixa a barra passar de 100% quando a meta é superada', async () => {
    const goal = await createGoal(db, couple.householdId, couple.ownerUserId, {
      name: 'Presente',
      targetCents: 10_000,
    });
    await contributeToGoal(db, couple.actor, goal.id, 25_000, TODAY);

    const { goals } = await loadCoupleGoals(db, couple.householdId);
    const presente = goals.find((row) => row.id === goal.id)!;

    expect(presente.savedCents).toBe(25_000);
    expect(presente.percent).toBe(100);
    expect(presente.remainingCents).toBe(0);
    expect(presente.achieved).toBe(true);
  });

  it('soma o total do casal entre todas as metas', async () => {
    const a = await createGoal(db, couple.householdId, couple.ownerUserId, {
      name: 'Viagem',
      targetCents: 300_000,
    });
    const b = await createGoal(db, couple.householdId, couple.ownerUserId, {
      name: 'Reserva',
      targetCents: 100_000,
    });

    await contributeToGoal(db, couple.actor, a.id, 30_000, TODAY);
    await contributeToGoal(db, partner, b.id, 20_000, TODAY);

    const { totalSavedCents, totalTargetCents, perMember } = await loadCoupleGoals(
      db,
      couple.householdId,
    );

    expect(totalSavedCents).toBe(50_000);
    expect(totalTargetCents).toBe(400_000);

    const byName = Object.fromEntries(perMember.map((m) => [m.displayName, m.amountCents]));
    expect(byName).toEqual({ Ana: 30_000, Lucas: 20_000 });
  });
});

describe('chat entende para onde o dinheiro vai', () => {
  function parse(text: string) {
    return parseLocally(text, 'America/Sao_Paulo')?.action;
  }

  it('extrai a meta quando a pessoa diz qual', () => {
    expect(parse('guardar 100 para viagem')).toMatchObject({
      type: 'create_reserve',
      amountCents: 10_000,
      goalName: 'viagem',
    });

    expect(parse('adiciona 80 na meta viagem')).toMatchObject({
      type: 'create_reserve',
      amountCents: 8_000,
      goalName: 'viagem',
    });

    expect(parse('coloca 50 na meta da casa')).toMatchObject({
      type: 'create_reserve',
      amountCents: 5_000,
      goalName: 'casa',
    });
  });

  it('não inventa meta quando a pessoa não diz qual', () => {
    // This is the whole point: a bare "guardei 200" must carry no goal, so the
    // executor asks instead of picking one.
    expect(parse('guardei 200')).toMatchObject({
      type: 'create_reserve',
      amountCents: 20_000,
      goalName: null,
    });
  });

  it('entende criar meta, com e sem valor', () => {
    expect(parse('quero criar uma meta chamada reforma')).toMatchObject({
      type: 'create_goal',
      goalName: 'reforma',
      targetCents: null,
    });

    expect(parse('minha meta é juntar 2 mil para viagem')).toMatchObject({
      type: 'create_goal',
      goalName: 'viagem',
      targetCents: 200_000,
    });
  });

  it('não confunde gasto com reserva', () => {
    expect(parse('gastei 40 no mercado')).toMatchObject({ type: 'create_expense' });
  });
});

describe('guardar pelo chat aparece no histórico da meta', () => {
  it('registra o aporte com o dono certo', async () => {
    const goal = await createGoal(db, couple.householdId, couple.ownerUserId, {
      name: 'Viagem',
      targetCents: 300_000,
    });

    // What the assistant does for "guardar 100 para viagem" from the partner.
    await contributeToGoal(db, partner, goal.id, 10_000, TODAY);

    const { goals } = await loadCoupleGoals(db, couple.householdId);
    const viagem = goals.find((row) => row.id === goal.id)!;

    expect(viagem.savedCents).toBe(10_000);
    expect(viagem.contributors).toHaveLength(1);
    expect(viagem.contributors[0]!.displayName).toBe('Lucas');
    expect(viagem.contributors[0]!.sharePercent).toBe(100);
  });
});

describe('criar meta não vira despesa', () => {
  function parse(text: string) {
    return parseLocally(text, 'America/Sao_Paulo')?.action;
  }

  it('entende "criar meta X de Y" mesmo sem verbo de guardar', () => {
    // This used to be filed as a Moradia expense of R$ 5.000: the phrase has
    // no reserve verb, so it fell through to the spending branch and the word
    // "reforma" picked a category.
    expect(parse('criar meta reforma de 5 mil')).toMatchObject({
      type: 'create_goal',
      goalName: 'reforma',
      targetCents: 500_000,
    });

    expect(parse('criar meta viagem de 3 mil')).toMatchObject({
      type: 'create_goal',
      goalName: 'viagem',
      targetCents: 300_000,
    });
  });
});
