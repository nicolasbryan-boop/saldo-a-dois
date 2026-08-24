/**
 * Commercial configuration. Prices are always integer cents.
 *
 * This file is the single source of truth for what the product costs. Nothing
 * else in the codebase may hardcode a price, an interval or a plan name.
 */

export const planIds = ['mensal', 'trimestral', 'anual'] as const;
export type PlanId = (typeof planIds)[number];

export interface Plan {
  id: PlanId;
  /** Shown to the customer. */
  name: string;
  /** Total charged each billing cycle, in cents. */
  priceCents: number;
  /** Months covered by one charge. Drives the billing period. */
  intervalMonths: number;
  /** How the cadence reads in a sentence: "R$ 20,90 /mês". */
  intervalLabel: string;
  /** Environment variable holding this plan's Stripe Price ID. */
  stripePriceEnv: string;
  /** One line under the price on the plan card. */
  tagline: string;
}

const PLANS: Record<PlanId, Plan> = {
  mensal: {
    id: 'mensal',
    name: 'Mensal',
    priceCents: 2090,
    intervalMonths: 1,
    intervalLabel: 'mês',
    stripePriceEnv: 'STRIPE_PRICE_MONTHLY_ID',
    tagline: 'Sem compromisso. Cancele quando quiser.',
  },
  trimestral: {
    id: 'trimestral',
    name: 'Trimestral',
    priceCents: 6990,
    intervalMonths: 3,
    intervalLabel: 'trimestre',
    stripePriceEnv: 'STRIPE_PRICE_QUARTERLY_ID',
    tagline: 'Uma cobrança a cada três meses.',
  },
  anual: {
    id: 'anual',
    name: 'Anual',
    priceCents: 24990,
    intervalMonths: 12,
    intervalLabel: 'ano',
    stripePriceEnv: 'STRIPE_PRICE_YEARLY_ID',
    tagline: 'Uma cobrança por ano.',
  },
};

export const pricing = {
  currency: 'BRL',
  /** Hard product rule: a household is a couple. Not a per-plan setting. */
  maxMembers: 2,
  /** Selected when nothing else is specified. */
  defaultPlanId: 'mensal' as PlanId,
  plans: PLANS,
  /** Identical across plans — the plan only changes the billing cadence. */
  features: [
    '2 pessoas no mesmo espaço financeiro',
    'Assistente com IA para registrar gastos por conversa',
    'Lançamento de despesas e receitas',
    'Contas e receitas recorrentes',
    'Metas e reserva mensal',
    'Livre para gastar e limite diário',
    'Histórico completo e dashboard',
    'Aplicativo instalável no celular (PWA)',
    'Relatório mensal do casal',
  ],
} as const;

/** Plans in the order they should be shown. */
export const planList: Plan[] = planIds.map((id) => PLANS[id]);

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (planIds as readonly string[]).includes(value);
}

/** Falls back to the default plan rather than throwing on unknown input. */
export function getPlan(id: string | null | undefined): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS[pricing.defaultPlanId];
}

/**
 * What the plan costs per month, for comparison across cadences.
 *
 * Rounded to the cent, so it is an "equivalent to", never the charged amount.
 */
export function monthlyEquivalentCents(plan: Plan): number {
  return Math.round(plan.priceCents / plan.intervalMonths);
}

/**
 * How much the plan saves against paying monthly for the same period.
 *
 * NEGATIVE when the plan costs more than the monthly plan would over the same
 * months. Callers must not render a discount badge without checking the sign —
 * an invented saving is exactly the kind of thing this product does not do.
 */
export function savingsVsMonthlyCents(plan: Plan): number {
  const monthly = PLANS.mensal;
  return monthly.priceCents * plan.intervalMonths - plan.priceCents;
}

/** Billing period end for a plan, used when the gateway does not report one. */
export function periodEndFor(plan: Plan, from: Date = new Date()): Date {
  const date = new Date(from.getTime());
  const day = date.getUTCDate();

  // Anchor to day 1 before shifting so a 31st never overflows into the month
  // after next, then clamp back to the target month's length.
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + plan.intervalMonths);

  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();

  date.setUTCDate(Math.min(day, lastDay));
  return date;
}
