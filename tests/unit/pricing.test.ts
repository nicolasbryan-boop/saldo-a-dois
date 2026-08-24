import { describe, it, expect } from 'vitest';
import {
  pricing,
  planIds,
  planList,
  getPlan,
  isPlanId,
  monthlyEquivalentCents,
  savingsVsMonthlyCents,
  periodEndFor,
} from '@/config';
import { formatBRL } from '@/lib/money';

/**
 * The catalogue is the single source of truth for what the product costs.
 * These are the official figures; a change here is a commercial decision.
 */
describe('catálogo de planos', () => {
  it('tem exatamente os três planos oficiais', () => {
    expect(planIds).toEqual(['mensal', 'trimestral', 'anual']);
    expect(planList).toHaveLength(3);
  });

  it('cobra os valores oficiais, em centavos inteiros', () => {
    expect(getPlan('mensal').priceCents).toBe(2090);
    expect(getPlan('trimestral').priceCents).toBe(5490);
    expect(getPlan('anual').priceCents).toBe(22990);

    for (const plan of planList) {
      expect(Number.isInteger(plan.priceCents)).toBe(true);
      expect(plan.priceCents).toBeGreaterThan(0);
    }
  });

  it('formata os preços do jeito brasileiro', () => {
    expect(formatBRL(getPlan('mensal').priceCents)).toBe('R$ 20,90');
    expect(formatBRL(getPlan('trimestral').priceCents)).toBe('R$ 54,90');
    expect(formatBRL(getPlan('anual').priceCents)).toBe('R$ 229,90');
  });

  it('cobre a quantidade de meses que promete', () => {
    expect(getPlan('mensal').intervalMonths).toBe(1);
    expect(getPlan('trimestral').intervalMonths).toBe(3);
    expect(getPlan('anual').intervalMonths).toBe(12);
  });

  it('aponta cada plano para a sua própria variável de Price ID', () => {
    expect(getPlan('mensal').stripePriceEnv).toBe('STRIPE_PRICE_MONTHLY_ID');
    expect(getPlan('trimestral').stripePriceEnv).toBe('STRIPE_PRICE_QUARTERLY_ID');
    expect(getPlan('anual').stripePriceEnv).toBe('STRIPE_PRICE_YEARLY_ID');

    const envs = planList.map((plan) => plan.stripePriceEnv);
    expect(new Set(envs).size).toBe(3);
  });

  it('mantém a regra de duas pessoas fora do plano', () => {
    expect(pricing.maxMembers).toBe(2);
  });
});

describe('validação de plano vindo de fora', () => {
  it('aceita só os ids do catálogo', () => {
    expect(isPlanId('mensal')).toBe(true);
    expect(isPlanId('anual')).toBe(true);
    expect(isPlanId('vitalicio')).toBe(false);
    expect(isPlanId('')).toBe(false);
    expect(isPlanId(null)).toBe(false);
    expect(isPlanId(2090)).toBe(false);
  });

  it('cai no plano padrão em vez de explodir com id desconhecido', () => {
    expect(getPlan('inexistente').id).toBe('mensal');
    expect(getPlan(null).id).toBe('mensal');
    expect(getPlan(undefined).id).toBe('mensal');
  });
});

describe('comparação entre planos', () => {
  it('calcula o equivalente mensal', () => {
    expect(monthlyEquivalentCents(getPlan('mensal'))).toBe(2090);
    // 54,90 / 3
    expect(monthlyEquivalentCents(getPlan('trimestral'))).toBe(1830);
    // 229,90 / 12 = 19,158..., arredondado ao centavo
    expect(monthlyEquivalentCents(getPlan('anual'))).toBe(1916);
  });

  it('nenhum plano custa mais por mês do que o próprio mensal', () => {
    // Não há escada monotônica: hoje o trimestral (R$ 18,30/mês) sai mais
    // barato por mês que o anual (R$ 19,16/mês). A regra que a UI depende é
    // apenas esta — todo plano de cadência longa tem que valer a pena contra
    // o mensal.
    const mensal = monthlyEquivalentCents(getPlan('mensal'));
    for (const plan of planList) {
      expect(monthlyEquivalentCents(plan)).toBeLessThanOrEqual(mensal);
    }
  });

  it('reporta a economia real do trimestral', () => {
    // 3 x 20,90 = 62,70, e o trimestral custa 54,90.
    expect(savingsVsMonthlyCents(getPlan('trimestral'))).toBe(780);
  });

  it('reporta a economia real do anual', () => {
    // 12 x 20,90 = 250,80, e o anual custa 229,90 — um mês de graça.
    expect(savingsVsMonthlyCents(getPlan('anual'))).toBe(2090);
    expect(savingsVsMonthlyCents(getPlan('anual'))).toBe(getPlan('mensal').priceCents);
  });

  it('não reporta economia no próprio plano mensal', () => {
    expect(savingsVsMonthlyCents(getPlan('mensal'))).toBe(0);
  });

  it('devolve economia negativa se um plano custar mais que o mensal', () => {
    // Guards the rule the UI depends on: a badge is only rendered when the
    // number is positive. If a future price is set above the monthly
    // equivalent, this must come back negative rather than silently pass.
    const caro = { ...getPlan('trimestral'), priceCents: 9900 };
    expect(savingsVsMonthlyCents(caro)).toBeLessThan(0);
  });
});

describe('fim do período de cobrança', () => {
  const from = new Date('2026-03-15T10:00:00Z');

  it('avança pela duração do plano', () => {
    expect(periodEndFor(getPlan('mensal'), from).toISOString().slice(0, 10)).toBe('2026-04-15');
    expect(periodEndFor(getPlan('trimestral'), from).toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(periodEndFor(getPlan('anual'), from).toISOString().slice(0, 10)).toBe('2027-03-15');
  });

  it('não transborda para o mês seguinte a partir do dia 31', () => {
    const endOfJanuary = new Date('2026-01-31T12:00:00Z');
    expect(periodEndFor(getPlan('mensal'), endOfJanuary).toISOString().slice(0, 10)).toBe(
      '2026-02-28',
    );
    expect(periodEndFor(getPlan('trimestral'), endOfJanuary).toISOString().slice(0, 10)).toBe(
      '2026-04-30',
    );
  });

  it('nunca devolve um período no passado', () => {
    for (const plan of planList) {
      expect(periodEndFor(plan, from).getTime()).toBeGreaterThan(from.getTime());
    }
  });
});
