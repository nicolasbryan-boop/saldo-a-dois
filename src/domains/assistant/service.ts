import { and, eq, desc } from 'drizzle-orm';
import type { Database } from '@/db';
import { assistantMessages } from '@/db/schema';
import { ids } from '@/lib/ids';
import { errors } from '@/lib/errors';
import type { AppContext } from '@/server/app-context';
import { getRuntime } from '@/server/context';
import { getAiProvider } from './providers';
import { interpret } from './interpreter';
import { executeAction, type AssistantReply } from './executor';
import { isMutating } from './actions';
import { trackEvent } from '@/domains/analytics/audit';

export interface AssistantTurn {
  reply: AssistantReply;
  actionType: string;
  resolvedBy: string;
  tokensUsed: number;
}

const MAX_INPUT_LENGTH = 500;

/**
 * One conversational turn.
 *
 * The user's sentence is interpreted (locally when possible), the resulting
 * action is executed by the backend, and the reply is assembled from real
 * numbers. The transcript is stored so the chat survives a reload.
 */
export async function handleMessage(
  context: AppContext,
  rawInput: string,
): Promise<AssistantTurn> {
  const input = rawInput.trim();
  if (!input) throw errors.validation('Escreva alguma coisa primeiro.');
  if (input.length > MAX_INPUT_LENGTH) {
    throw errors.validation('Mensagem muito longa. Tente resumir.');
  }

  const { env } = await getRuntime();
  const provider = getAiProvider(env);

  const { action, resolvedBy, tokensUsed } = await interpret(input, {
    timezone: context.household.timezone,
    provider,
    // Names let the parser understand "quanto o Bruno tem?" — a relationship
    // word list can never cover the name a couple actually uses.
    members: context.members.map((member) => ({
      name: member.displayName,
      isSelf: member.id === context.member.id,
    })),
  });

  const reply = await executeAction(context, action);

  const now = new Date();
  await context.db.insert(assistantMessages).values([
    {
      id: ids.message(),
      householdId: context.household.id,
      userId: context.user.id,
      role: 'user',
      content: input,
      actionType: action.type,
      resolvedBy,
      tokensUsed,
      createdAt: now,
    },
    {
      id: ids.message(),
      householdId: context.household.id,
      userId: context.user.id,
      role: 'assistant',
      content: reply.text,
      actionType: action.type,
      resolvedBy,
      tokensUsed: 0,
      createdAt: new Date(now.getTime() + 1),
    },
  ]);

  await trackEvent(context.db, {
    name: 'assistant_used',
    householdId: context.household.id,
    userId: context.user.id,
    props: {
      action: action.type,
      resolvedBy,
      mutated: isMutating(action),
    },
  });

  return { reply, actionType: action.type, resolvedBy, tokensUsed };
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actionType: string | null;
  createdAt: number;
}

export async function listMessages(
  db: Database,
  householdId: string,
  limit = 40,
): Promise<StoredMessage[]> {
  const rows = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.householdId, householdId))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(limit);

  return rows
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      actionType: row.actionType,
      createdAt: row.createdAt.getTime(),
    }))
    .reverse();
}

export async function clearMessages(
  db: Database,
  householdId: string,
): Promise<void> {
  await db
    .delete(assistantMessages)
    .where(and(eq(assistantMessages.householdId, householdId)));
}
