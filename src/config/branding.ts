/**
 * Single source of truth for product identity.
 *
 * Everything user-visible about "who this product is" lives here so the brand
 * can be swapped without touching feature code. Nothing in this file may
 * import from a domain module.
 */

export const branding = {
  name: 'Saldo a Dois',
  shortName: 'Saldo a Dois',
  tagline: 'O dinheiro do casal, organizado.',
  description:
    'Uma IA para organizar as finanças do casal e mostrar quanto do dinheiro está realmente livre depois das contas, gastos e metas.',
  legalName: 'Saldo a Dois',
  supportEmail: 'suporte@saldoadois.app',
  domain: 'saldoadois.app',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  themeColor: '#0F1729',
  backgroundColor: '#FBF9F6',
  /** Emoji used as the household glyph across the app. */
  glyph: '❤️',
} as const;

export type Branding = typeof branding;
