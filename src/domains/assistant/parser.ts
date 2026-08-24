import { parseMoneyToCents } from '@/lib/money';
import { todayIn, addDays, type LocalDate } from '@/lib/dates';
import { deaccent, normalizeText } from '@/lib/text';
import type { AssistantAction } from './actions';

/**
 * DETERMINISTIC PARSER — runs before any model call.
 *
 * Most of what a couple types is short and shaped like "mercado 120" or
 * "gastei 89 de gasolina". Those never need an LLM, and every question about
 * balances, limits, bills or totals is answered from the database, never by a
 * model. This keeps AI spend near zero and, more importantly, keeps the
 * numbers deterministic.
 *
 * Returns `null` when it is not confident, which is the only case that
 * escalates to the AI provider.
 */

export interface ParseResult {
  action: AssistantAction;
  confidence: 'high' | 'medium';
}

/** Keyword -> category slug. Order matters: longer/more specific first. */
const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(supermercado|mercado|feira|hortifruti|acougue|açougue|compras do mes|compras do mês)\b/, 'mercado'],
  [/\b(ifood|i food|delivery|rappi|pizza|hamburguer|hambúrguer|lanche em casa)\b/, 'delivery'],
  [/\b(almoco|almoço|janta|jantar|restaurante|padaria|cafe|café|lanche|bar|churrasco|marmita)\b/, 'alimentacao'],
  [/\b(gasolina|combustivel|combustível|alcool|álcool|etanol|uber|99|taxi|táxi|onibus|ônibus|metro|metrô|estacionamento|pedagio|pedágio|passagem de onibus|ipva|mecanico|mecânico|oficina|pneu)\b/, 'transporte'],
  [/\b(aluguel|condominio|condomínio|iptu|prestacao da casa|prestação da casa|financiamento da casa|reforma|movel|móvel|moveis|móveis)\b/, 'moradia'],
  [/\b(luz|energia|conta de luz|eletrica|elétrica|enel|cemig|light|copel)\b/, 'energia'],
  [/\b(internet|wifi|wi-fi|fibra|vivo fibra|banda larga|telefone|celular|plano de celular)\b/, 'internet'],
  [/\b(farmacia|farmácia|remedio|remédio|medico|médico|dentista|consulta|exame|plano de saude|plano de saúde|psicologa|psicóloga|psicologo|psicólogo|terapia)\b/, 'saude'],
  [/\b(escola|faculdade|mensalidade|curso|livro|material escolar|creche|ingles|inglês)\b/, 'educacao'],
  [/\b(cinema|show|festa|balada|passeio|parque|jogo|game|lazer|streaming de filme)\b/, 'lazer'],
  [/\b(roupa|roupas|tenis|tênis|sapato|calcado|calçado|camisa|vestido|calca|calça|shopping)\b/, 'roupa'],
  [/\b(netflix|spotify|assinatura|assinaturas|prime|disney|hbo|max|youtube premium|icloud|academia|gym)\b/, 'assinaturas'],
  [/\b(cartao|cartão|fatura|nubank|inter|itau|itaú|bradesco|santander)\b/, 'cartao'],
  [/\b(filho|filha|filhos|fralda|escolinha|brinquedo|pediatra)\b/, 'filhos'],
  [/\b(pet|racao|ração|veterinario|veterinário|cachorro|gato|petshop|pet shop)\b/, 'pets'],
  [/\b(viagem|hotel|passagem aerea|passagem aérea|airbnb|hospedagem|ferias|férias)\b/, 'viagem'],
  [/\b(presente|presentes)\b/, 'outros'],
];

const INCOME_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(salario|salário|pagamento do mes|pagamento do mês|holerite|contracheque)\b/, 'salario'],
  [/\b(freela|freelance|freelas|bico|extra|servico extra|serviço extra|comissao|comissão|venda)\b/, 'freela'],
  [/\b(pix recebido|recebi um pix|reembolso|restituicao|restituição|13o|décimo terceiro|decimo terceiro|ferias|férias|bonus|bônus|rendimento|aluguel recebido)\b/, 'outras-entradas'],
];

const EXPENSE_VERBS =
  /\b(gastei|gastamos|paguei|pagamos|comprei|compramos|torrei|saiu|gasto de|despesa de|passei no cartao|passei no cartão)\b/;

const INCOME_VERBS =
  /\b(recebi|recebemos|entrou|caiu|ganhei|ganhamos|entrada de|recebimento de|me pagaram)\b/;

const RESERVE_VERBS =
  /\b(guardei|guardamos|separei|separamos|poupei|reservei|coloquei na reserva|guardar)\b/;

/** Amount patterns: R$ 1.234,56 | 1.234,56 | 120,50 | 120 | 1,5k */
const AMOUNT_RE =
  /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*(?:k|mil|reais|conto|pila))?/gi;

export const normalize = normalizeText;

export function inferCategory(text: string, kind: 'expense' | 'income'): string | null {
  const haystack = `${text} ${deaccent(text)}`;
  const table = kind === 'income' ? INCOME_KEYWORDS : CATEGORY_KEYWORDS;
  for (const [pattern, slug] of table) {
    if (pattern.test(haystack)) return slug;
  }
  return null;
}

interface AmountMatch {
  cents: number;
  raw: string;
  index: number;
}

function findAmount(text: string): AmountMatch | null {
  AMOUNT_RE.lastIndex = 0;
  let best: AmountMatch | null = null;

  for (const match of text.matchAll(AMOUNT_RE)) {
    const [raw, digits, suffix] = match;
    if (!digits) continue;

    // Skip things that are clearly a day-of-month or a bare year.
    const before = text.slice(Math.max(0, (match.index ?? 0) - 4), match.index ?? 0);
    if (/dia\s*$/.test(before)) continue;

    let cents = parseMoneyToCents(digits);
    if (cents === null || cents <= 0) continue;

    if (suffix && /k|mil/i.test(suffix)) cents *= 1000;

    // Prefer the largest plausible amount in the sentence.
    if (!best || cents > best.cents) {
      best = { cents, raw, index: match.index ?? 0 };
    }
  }

  return best;
}

function extractDate(text: string, timezone: string): LocalDate | undefined {
  const today = todayIn(timezone);
  if (/\bontem\b/.test(text)) return addDays(today, -1);
  if (/\banteontem\b/.test(text)) return addDays(today, -2);
  if (/\bhoje\b/.test(text)) return today;

  // dd/mm or dd/mm/yyyy
  const explicit = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (explicit) {
    const day = Number(explicit[1]);
    const month = Number(explicit[2]);
    const yearRaw = explicit[3];
    const year = yearRaw
      ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw)
      : Number(today.slice(0, 4));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return undefined;
}

/** Builds a short human description from the sentence, minus noise. */
function buildDescription(original: string, categorySlug: string | null, fallback: string): string {
  const cleaned = original
    .replace(AMOUNT_RE, ' ')
    .replace(
      /\b(gastei|gastamos|paguei|pagamos|comprei|compramos|recebi|recebemos|entrou|caiu|ganhei|guardei|separei|reais|conto|pila|hoje|ontem|anteontem|de|do|da|no|na|em|com|um|uma|meu|minha|nosso|nossa|r\$)\b/gi,
      ' ',
    )
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length >= 3) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  if (categorySlug) return fallback;
  return fallback;
}

const CATEGORY_LABELS: Record<string, string> = {
  mercado: 'Mercado',
  alimentacao: 'Alimentação',
  delivery: 'Delivery',
  transporte: 'Transporte',
  moradia: 'Moradia',
  energia: 'Energia',
  internet: 'Internet',
  saude: 'Saúde',
  educacao: 'Educação',
  lazer: 'Lazer',
  roupa: 'Roupa',
  assinaturas: 'Assinaturas',
  cartao: 'Cartão',
  filhos: 'Filhos',
  pets: 'Pets',
  viagem: 'Viagem',
  outros: 'Outros',
  salario: 'Salário',
  freela: 'Freela / Extra',
  'outras-entradas': 'Outras entradas',
};

export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return 'Outros';
  return CATEGORY_LABELS[slug] ?? 'Outros';
}

/** Question intents. All of these are answered from the database. */
function parseQuestion(text: string): AssistantAction | null {
  const t = deaccent(text);

  if (/\b(ajuda|o que voce faz|o que vc faz|como funciona|comandos)\b/.test(t)) {
    return { type: 'help' };
  }

  // "dá pra gastar 500?" — a projection, not advice.
  if (
    /\b(da pra|d[ae] para|posso|consigo|vale a pena)\b/.test(t) &&
    /\bgastar\b/.test(t)
  ) {
    const amount = findAmount(text);
    if (amount) {
      return { type: 'simulate_spend', amountCents: amount.cents };
    }
    return { type: 'query_free_balance' };
  }

  if (/\b(quanto|quanta)\b/.test(t) && /\b(posso|podemos|da pra|sobra|resta|livre|ainda)\b/.test(t) && /\bgastar\b/.test(t)) {
    return { type: 'query_free_balance' };
  }

  if (/\b(livre para gastar|quanto esta livre|quanto ta livre|saldo livre)\b/.test(t)) {
    return { type: 'query_free_balance' };
  }

  if (/\b(limite diario|quanto por dia|por dia)\b/.test(t)) {
    return { type: 'query_daily_limit' };
  }

  if (/\b(saldo|quanto temos|quanto tem na conta|quanto sobrou na conta)\b/.test(t)) {
    return { type: 'query_balance' };
  }

  if (/\b(contas|boletos)\b/.test(t) && /\b(faltam|falta|pendentes|pagar|vencer|vencendo|abertas)\b/.test(t)) {
    return { type: 'query_pending_bills' };
  }

  if (/\b(quanto cada um|cada um gastou|quem gastou|gastos por pessoa)\b/.test(t)) {
    return { type: 'query_member_spending' };
  }

  if (/\b(resumo|balanco|balanço|relatorio|como estamos|como foi o mes)\b/.test(t)) {
    return { type: 'query_summary' };
  }

  if (/\b(metas|meta|reserva|guardado|poupanca|poupança)\b/.test(t) && /\b(quanto|como|qual|status|ver)\b/.test(t)) {
    return { type: 'query_goals' };
  }

  if (/\bquanto\b/.test(t) && /\b(gastei|gastamos|gasto|gastou)\b/.test(t)) {
    const period = detectPeriod(t);
    const category = inferCategory(text, 'expense');
    if (category) {
      return { type: 'query_category_spending', categorySlug: category, period };
    }
    return { type: 'query_total_spending', period };
  }

  return null;
}

function detectPeriod(text: string): 'today' | 'week' | 'cycle' | 'month' | 'previous_cycle' {
  if (/\b(hoje)\b/.test(text)) return 'today';
  if (/\b(semana|essa semana|nesta semana|ultimos 7|últimos 7)\b/.test(text)) return 'week';
  if (/\b(mes passado|mês passado|ciclo passado|ciclo anterior)\b/.test(text)) return 'previous_cycle';
  return 'cycle';
}

/**
 * Attempts a confident local interpretation.
 * `null` means "ask the model".
 */
export function parseLocally(input: string, timezone: string): ParseResult | null {
  const text = normalize(input);
  if (!text) return null;

  const question = parseQuestion(text);
  if (question) return { action: question, confidence: 'high' };

  const amount = findAmount(text);
  if (!amount) return null;

  const date = extractDate(text, timezone);
  const hasExpenseVerb = EXPENSE_VERBS.test(deaccent(text)) || EXPENSE_VERBS.test(text);
  const hasIncomeVerb = INCOME_VERBS.test(deaccent(text)) || INCOME_VERBS.test(text);
  const hasReserveVerb = RESERVE_VERBS.test(deaccent(text)) || RESERVE_VERBS.test(text);

  if (hasReserveVerb) {
    return {
      action: {
        type: 'create_reserve',
        amountCents: amount.cents,
        description: buildDescription(text, null, 'Guardado'),
        date,
      },
      confidence: 'high',
    };
  }

  if (hasIncomeVerb) {
    const categorySlug = inferCategory(text, 'income') ?? 'outras-entradas';
    return {
      action: {
        type: 'create_income',
        amountCents: amount.cents,
        categorySlug,
        description: buildDescription(text, categorySlug, categoryLabel(categorySlug)),
        date,
      },
      confidence: 'high',
    };
  }

  const expenseCategory = inferCategory(text, 'expense');

  if (hasExpenseVerb) {
    const slug = expenseCategory ?? 'outros';
    return {
      action: {
        type: 'create_expense',
        amountCents: amount.cents,
        categorySlug: slug,
        description: buildDescription(text, slug, categoryLabel(slug)),
        date,
      },
      confidence: expenseCategory ? 'high' : 'medium',
    };
  }

  // Bare shorthand: "mercado 120", "120 gasolina".
  if (expenseCategory) {
    const withoutAmount = text.replace(AMOUNT_RE, ' ').replace(/\s+/g, ' ').trim();
    // Only treat as shorthand when the sentence is essentially just the label.
    if (withoutAmount.split(' ').filter(Boolean).length <= 4) {
      return {
        action: {
          type: 'create_expense',
          amountCents: amount.cents,
          categorySlug: expenseCategory,
          description: buildDescription(text, expenseCategory, categoryLabel(expenseCategory)),
          date,
        },
        confidence: 'high',
      };
    }
  }

  return null;
}
