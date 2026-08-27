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
  /**
   * Bumped whenever the brand mark changes.
   *
   * Browsers keep favicons in a store of their own and ignore cache headers
   * for them — Chrome will happily show a mark from weeks ago even after a
   * hard reload. Changing the URL is the only reliable way to replace one.
   */
  iconVersion: '2',
  /** Emoji used as the household glyph across the app. */
  glyph: '❤️',
} as const;

export type Branding = typeof branding;
