import {
  assistantActionSchema,
  llmActionSchema,
  UNKNOWN_ACTION,
  type AssistantAction,
} from './actions';
import { parseLocally, categoryLabel } from './parser';
import { parseMoneyToCents } from '@/lib/money';
import { todayIn } from '@/lib/dates';
import type { AiProvider } from './providers';

/**
 * Turns a sentence into a validated action.
 *
 * Order of attempts:
 *   1. Deterministic parser. Handles shorthand and every question.
 *   2. AI provider, but only to classify and extract — never to compute.
 *   3. `unknown`, which changes nothing.
 *
 * The model's output is parsed as JSON and then run through a Zod schema. If
 * it hallucinates a field, an action type, a negative amount or plain prose,
 * validation fails and the result is `unknown`.
 */

export interface InterpretResult {
  action: AssistantAction;
  resolvedBy: string;
  tokensUsed: number;
}

const ALLOWED_CATEGORY_SLUGS = new Set([
  'mercado',
  'alimentacao',
  'delivery',
  'transporte',
  'moradia',
  'energia',
  'internet',
  'saude',
  'educacao',
  'lazer',
  'roupa',
  'assinaturas',
  'cartao',
  'filhos',
  'pets',
  'viagem',
  'outros',
  'salario',
  'freela',
  'outras-entradas',
]);

export function buildSystemPrompt(today: string): string {
  return [
    'Você converte frases em português do Brasil sobre dinheiro do dia a dia em UMA ação JSON.',
    'Responda SOMENTE com JSON válido, sem texto antes ou depois, sem markdown.',
    '',
    'Formato:',
    '{"type": "...", "amount": <número em reais>, "category": "<slug>", "description": "<curta>", "date": "AAAA-MM-DD", "period": "today|week|cycle|previous_cycle", "goal": "<nome da meta>", "target": <valor alvo em reais>}',
    '',
    'Tipos possíveis:',
    '- create_expense: a pessoa gastou dinheiro',
    '- create_income: a pessoa recebeu dinheiro',
    '- create_reserve: a pessoa guardou/reservou dinheiro (use "goal" com o nome da meta, se ela disser)',
    '- create_goal: a pessoa quer criar uma meta nova (use "goal" e, se houver, "target")',
    '- query_free_balance: quanto ainda pode gastar',
    '- query_balance: qual o saldo',
    '- query_daily_limit: quanto por dia',
    '- query_category_spending: quanto gastou em uma categoria (exige category)',
    '- query_total_spending: quanto gastou no total',
    '- query_pending_bills: quais contas faltam',
    '- query_summary: resumo do período',
    '- query_member_spending: quanto cada pessoa gastou',
    '- query_goals: situação das metas',
    '- simulate_spend: "dá pra gastar X?" (exige amount)',
    '- help: a pessoa quer saber o que dá para fazer',
    '- unknown: não deu para entender, ou não é sobre dinheiro',
    '',
    `Slugs de categoria válidos: ${[...ALLOWED_CATEGORY_SLUGS].join(', ')}.`,
    '',
    'Regras rígidas:',
    '- "amount" é o valor em REAIS, número decimal. Ex.: "86,50" vira 86.5.',
    '- Nunca invente saldos, totais ou contas. Você apenas classifica a frase.',
    '- Se a frase não tiver valor e for um lançamento, use unknown.',
    `- Hoje é ${today}. Use essa data quando a frase não disser outra.`,
    '- "goal" é o nome da meta como a pessoa falou. Não invente meta: se ela não disser qual, deixe null.',
    '- "guardar/reservar/juntar/separar" é create_reserve. "criar meta/quero juntar para" é create_goal.',
    '- Na dúvida, responda {"type":"unknown"}.',
  ].join('\n');
}

/** Pulls the first JSON object out of a model response. */
function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Converts the model's loose shape into our strict action, or `unknown`. */
export function normalizeLlmAction(raw: unknown): AssistantAction {
  const parsedEnvelope = llmActionSchema.safeParse(raw);
  if (!parsedEnvelope.success) return UNKNOWN_ACTION;

  const value = parsedEnvelope.data;
  const type = value.type?.trim();

  const amountCents = toCents(value.amount);
  const categorySlug =
    value.category && ALLOWED_CATEGORY_SLUGS.has(value.category.trim())
      ? value.category.trim()
      : null;

  const description =
    value.description?.trim() ||
    (categorySlug ? categoryLabel(categorySlug) : 'Movimento');

  const period = normalizePeriod(value.period);

  const candidate: Record<string, unknown> = { type };

  switch (type) {
    case 'create_expense':
    case 'create_income':
      if (amountCents === null) return UNKNOWN_ACTION;
      candidate.amountCents = amountCents;
      candidate.categorySlug =
        categorySlug ?? (type === 'create_income' ? 'outras-entradas' : 'outros');
      candidate.description = description;
      if (value.date) candidate.date = value.date;
      break;

    case 'create_reserve':
      if (amountCents === null) return UNKNOWN_ACTION;
      candidate.amountCents = amountCents;
      candidate.description = description;
      // Left null when the person did not name a goal; the executor asks.
      candidate.goalName = value.goal?.trim() || null;
      if (value.date) candidate.date = value.date;
      break;

    case 'create_goal': {
      const goalName = value.goal?.trim();
      if (!goalName) return UNKNOWN_ACTION;
      candidate.goalName = goalName;
      candidate.targetCents = toCents(value.target) ?? amountCents ?? null;
      break;
    }

    case 'simulate_spend':
      if (amountCents === null) return UNKNOWN_ACTION;
      candidate.amountCents = amountCents;
      if (value.description) candidate.description = description;
      break;

    case 'query_category_spending':
      if (!categorySlug) return UNKNOWN_ACTION;
      candidate.categorySlug = categorySlug;
      candidate.period = period;
      break;

    case 'query_total_spending':
      candidate.period = period;
      break;

    default:
      break;
  }

  const result = assistantActionSchema.safeParse(candidate);
  return result.success ? result.data : UNKNOWN_ACTION;
}

function toCents(amount: number | string | null | undefined): number | null {
  if (amount === null || amount === undefined) return null;

  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return Math.round(amount * 100);
  }

  const cents = parseMoneyToCents(amount);
  return cents !== null && cents > 0 ? cents : null;
}

function normalizePeriod(
  period: string | null | undefined,
): 'today' | 'week' | 'cycle' | 'month' | 'previous_cycle' {
  switch (period) {
    case 'today':
    case 'week':
    case 'month':
    case 'previous_cycle':
      return period;
    default:
      return 'cycle';
  }
}

export async function interpret(
  input: string,
  options: { timezone: string; provider: AiProvider },
): Promise<InterpretResult> {
  const local = parseLocally(input, options.timezone);
  if (local) {
    return { action: local.action, resolvedBy: 'rules', tokensUsed: 0 };
  }

  if (!options.provider.available) {
    return { action: UNKNOWN_ACTION, resolvedBy: 'rules', tokensUsed: 0 };
  }

  try {
    const today = todayIn(options.timezone);
    const completion = await options.provider.complete({
      system: buildSystemPrompt(today),
      user: input.slice(0, 500),
    });

    const action = normalizeLlmAction(extractJson(completion.text));

    return {
      action,
      resolvedBy: options.provider.id,
      tokensUsed: completion.tokensUsed,
    };
  } catch (error) {
    // A model failure must never break the chat; it degrades to "unknown".
    console.error('[assistant] provedor de IA falhou:', (error as Error).message);
    return { action: UNKNOWN_ACTION, resolvedBy: options.provider.id, tokensUsed: 0 };
  }
}
