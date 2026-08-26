import { z } from 'zod';
import { MAX_AMOUNT_CENTS } from '@/lib/money';

/**
 * THE ONLY THING THE MODEL IS ALLOWED TO PRODUCE.
 *
 * The assistant never returns prose that the product trusts, never touches the
 * database and never computes a balance. It returns one of these actions, the
 * action is validated by a schema, and the backend does the rest. Anything the
 * schema rejects becomes `unknown`, which mutates nothing.
 */

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD');

const amountCents = z
  .number()
  .int('Valor deve ser inteiro em centavos')
  .positive('Valor deve ser maior que zero')
  .max(MAX_AMOUNT_CENTS, 'Valor acima do limite permitido');

const description = z.string().trim().min(1).max(140);

/** Who the movement belongs to, resolved to a member id by the executor. */
const whose = z.enum(['me', 'partner', 'shared']).optional();

export const periodSchema = z
  .enum(['today', 'week', 'cycle', 'month', 'previous_cycle'])
  .default('cycle');

export const assistantActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_expense'),
    amountCents,
    categorySlug: z.string().trim().max(40).nullable().optional(),
    description,
    date: localDate.optional(),
    whose,
  }),
  z.object({
    type: z.literal('create_income'),
    amountCents,
    categorySlug: z.string().trim().max(40).nullable().optional(),
    description,
    date: localDate.optional(),
    whose,
  }),
  z.object({
    type: z.literal('create_reserve'),
    amountCents,
    description,
    date: localDate.optional(),
    /**
     * Which goal receives the money, as the person typed it. Resolved to a
     * real goal by the executor, which asks when it cannot be sure — money
     * landing in the wrong goal is worse than one extra question.
     */
    goalName: z.string().trim().max(80).nullable().optional(),
  }),
  z.object({
    type: z.literal('create_goal'),
    goalName: z.string().trim().min(1).max(80),
    /** Null when the person named a goal but no target yet. */
    targetCents: amountCents.nullable().optional(),
  }),
  z.object({ type: z.literal('query_free_balance') }),
  z.object({ type: z.literal('query_balance') }),
  z.object({ type: z.literal('query_daily_limit') }),
  z.object({
    type: z.literal('query_category_spending'),
    categorySlug: z.string().trim().max(40),
    period: periodSchema,
  }),
  z.object({
    type: z.literal('query_total_spending'),
    period: periodSchema,
  }),
  z.object({ type: z.literal('query_pending_bills') }),
  z.object({ type: z.literal('query_summary') }),
  z.object({ type: z.literal('query_member_spending') }),
  z.object({ type: z.literal('query_goals') }),
  z.object({
    type: z.literal('query_person_balance'),
    /**
     * Whose balance the question is about. 'each' asks for the comparison,
     * which is a different answer from any single balance.
     */
    whose: z.enum(['me', 'partner', 'both', 'each']),
  }),
  z.object({
    type: z.literal('simulate_spend'),
    amountCents,
    description: description.optional(),
  }),
  z.object({ type: z.literal('help') }),
  z.object({ type: z.literal('unknown') }),
]);

export type AssistantAction = z.infer<typeof assistantActionSchema>;
export type AssistantActionType = AssistantAction['type'];

export const UNKNOWN_ACTION: AssistantAction = { type: 'unknown' };

/** Actions that write to the database. Everything else is read-only. */
export const MUTATING_ACTIONS: AssistantActionType[] = [
  'create_expense',
  'create_income',
  'create_reserve',
  'create_goal',
];

export function isMutating(action: AssistantAction): boolean {
  return MUTATING_ACTIONS.includes(action.type);
}

/**
 * Shape the LLM is asked for.
 *
 * Amounts are requested in reais as a plain number because models are far more
 * reliable at "86.5" than at "8650", and the conversion to integer cents is
 * done here where a rounding rule can be stated once.
 */
export const llmActionSchema = z.object({
  type: z.string(),
  amount: z.union([z.number(), z.string()]).nullable().optional(),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  period: z.string().nullable().optional(),
  whose: z.string().nullable().optional(),
  /** Goal the person named, for create_reserve and create_goal. */
  goal: z.string().nullable().optional(),
  /** Target amount in reais, for create_goal. */
  target: z.union([z.number(), z.string()]).nullable().optional(),
});

export type LlmAction = z.infer<typeof llmActionSchema>;
