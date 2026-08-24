/**
 * Commercial configuration. Prices are always integer cents.
 */

export const pricing = {
  plan: {
    id: 'basico',
    name: 'Básico',
    priceCents: 2090,
    interval: 'month' as const,
    currency: 'BRL',
    /** Hard product rule: a household is a couple. */
    maxMembers: 2,
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
  },
} as const;

export type Plan = typeof pricing.plan;
