import { eq, and } from 'drizzle-orm';
import type { AppContext } from '@/server/app-context';
import type { AssistantAction } from './actions';
import { categoryLabel } from './parser';
import { formatBRL } from '@/lib/money';
import { formatDateBR, addDays, type LocalDate } from '@/lib/dates';
import { loadSnapshot } from '@/domains/financial-engine/load';
import { projectSpend } from '@/domains/financial-engine/engine';
import {
  createTransaction,
  spendingByCategory,
  spendingByMember,
  spentInCategory,
  totalSpentBetween,
} from '@/domains/transactions/service';
import { listGoals } from '@/domains/goals/service';
import { goals as goalsTable } from '@/db/schema';
import { findPreviousCycle } from '@/domains/cycles/service';
import { branding } from '@/config';

/**
 * ACTION EXECUTION
 * ================
 * Every number in every reply below is read from the database or computed by
 * the financial engine. The model contributed the intent and nothing else.
 *
 * Replies deliberately avoid advice ("você deveria...") and avoid claiming to
 * know anything about a real bank account.
 */

export interface AssistantReply {
  text: string;
  /** Set when the action created a movement, so the UI can offer "desfazer". */
  transactionId?: string;
  /** Headline metric to render as a chip under the bubble. */
  highlight?: { label: string; value: string; tone: 'positive' | 'negative' | 'neutral' };
}

const CATEGORY_EMOJI: Record<string, string> = {
  mercado: '🛒',
  alimentacao: '🍽️',
  delivery: '🛵',
  transporte: '⛽',
  moradia: '🏠',
  energia: '💡',
  internet: '📶',
  saude: '💊',
  educacao: '🎓',
  lazer: '🎬',
  roupa: '👕',
  assinaturas: '🔁',
  cartao: '💳',
  filhos: '🧸',
  pets: '🐾',
  viagem: '✈️',
  outros: '📌',
  salario: '💰',
  freela: '💼',
  'outras-entradas': '🏦',
};

function emoji(slug: string | null | undefined): string {
  return (slug && CATEGORY_EMOJI[slug]) || '📌';
}

function freeLine(freeCents: number): string {
  if (freeCents < 0) {
    return `Vocês estão **${formatBRL(freeCents)}** no vermelho: há mais compromissos do que dinheiro disponível neste ciclo.`;
  }
  return `Vocês têm **${formatBRL(freeCents)} livres** neste ciclo.`;
}

async function periodRange(
  context: AppContext,
  period: 'today' | 'week' | 'cycle' | 'month' | 'previous_cycle',
): Promise<{ from: LocalDate; to: LocalDate; label: string }> {
  const { cycle, today } = context;

  switch (period) {
    case 'today':
      return { from: today, to: today, label: 'hoje' };
    case 'week':
      return { from: addDays(today, -6), to: today, label: 'nos últimos 7 dias' };
    case 'previous_cycle': {
      const previous = await findPreviousCycle(context.db, context.household.id, cycle.startDate);
      if (!previous) {
        return { from: cycle.startDate, to: cycle.endDate, label: 'neste ciclo' };
      }
      return { from: previous.startDate, to: previous.endDate, label: `em ${previous.label}` };
    }
    case 'month':
    case 'cycle':
    default:
      return { from: cycle.startDate, to: cycle.endDate, label: 'neste ciclo' };
  }
}

export async function executeAction(
  context: AppContext,
  action: AssistantAction,
): Promise<AssistantReply> {
  const { db, household, cycle } = context;

  switch (action.type) {
    /* ---------------------------------------------------------------- */
    /* Movements                                                         */
    /* ---------------------------------------------------------------- */
    case 'create_expense': {
      const transaction = await createTransaction(db, context.actor, {
        type: 'expense',
        amountCents: action.amountCents,
        description: action.description,
        categorySlug: action.categorySlug ?? 'outros',
        occurredOn: action.date as LocalDate | undefined,
        source: 'assistant',
      });

      const snapshot = await loadSnapshot(db, {
        householdId: household.id,
        cycle,
        timezone: household.timezone,
        today: context.today,
      });

      return {
        transactionId: transaction.id,
        highlight: {
          label: 'Livre para gastar',
          value: formatBRL(snapshot.freeToSpendCents),
          tone: snapshot.freeToSpendCents < 0 ? 'negative' : 'positive',
        },
        text: [
          `${emoji(action.categorySlug)} ${categoryLabel(action.categorySlug)} registrado: **${formatBRL(action.amountCents)}**.`,
          '',
          freeLine(snapshot.freeToSpendCents),
        ].join('\n'),
      };
    }

    case 'create_income': {
      const transaction = await createTransaction(db, context.actor, {
        type: 'income',
        amountCents: action.amountCents,
        description: action.description,
        categorySlug: action.categorySlug ?? 'outras-entradas',
        occurredOn: action.date as LocalDate | undefined,
        source: 'assistant',
      });

      const snapshot = await loadSnapshot(db, {
        householdId: household.id,
        cycle,
        timezone: household.timezone,
        today: context.today,
      });

      return {
        transactionId: transaction.id,
        highlight: {
          label: 'Livre para gastar',
          value: formatBRL(snapshot.freeToSpendCents),
          tone: snapshot.freeToSpendCents < 0 ? 'negative' : 'positive',
        },
        text: [
          `${emoji(action.categorySlug)} Entrada registrada: **${formatBRL(action.amountCents)}**.`,
          '',
          freeLine(snapshot.freeToSpendCents),
        ].join('\n'),
      };
    }

    case 'create_reserve': {
      const activeGoals = await listGoals(db, household.id);
      const target = activeGoals[0];

      const transaction = await createTransaction(db, context.actor, {
        type: 'reserve',
        amountCents: action.amountCents,
        description: target ? `Guardado: ${target.name}` : action.description,
        occurredOn: action.date as LocalDate | undefined,
        goalId: target?.id ?? null,
        source: 'assistant',
      });

      if (target) {
        await db
          .update(goalsTable)
          .set({
            currentCents: target.currentCents + action.amountCents,
            updatedAt: new Date(),
          })
          .where(and(eq(goalsTable.id, target.id), eq(goalsTable.householdId, household.id)));
      }

      const snapshot = await loadSnapshot(db, {
        householdId: household.id,
        cycle,
        timezone: household.timezone,
        today: context.today,
      });

      return {
        transactionId: transaction.id,
        text: [
          `🎯 Guardado: **${formatBRL(action.amountCents)}**${target ? ` para "${target.name}"` : ''}.`,
          '',
          `Reserva do ciclo: ${formatBRL(snapshot.reservedCents)} de ${formatBRL(snapshot.plannedReserveCents)}.`,
          freeLine(snapshot.freeToSpendCents),
        ].join('\n'),
      };
    }

    /* ---------------------------------------------------------------- */
    /* Questions — answered from the database, never by the model         */
    /* ---------------------------------------------------------------- */
    case 'query_free_balance': {
      const snapshot = await loadSnapshot(db, {
        householdId: household.id,
        cycle,
        timezone: household.timezone,
        today: context.today,
      });

      const lines = [freeLine(snapshot.freeToSpendCents)];

      if (snapshot.freeToSpendCents > 0) {
        lines.push(
          '',
          `Isso dá cerca de **${formatBRL(snapshot.dailyLimitCents)} por dia** até ${formatDateBR(cycle.endDate)}.`,
        );
      } else {
        lines.push('', 'O limite sugerido por dia é R$ 0,00 até a situação virar.');
      }

      lines.push(
        '',
        `Saldo registrado: ${formatBRL(snapshot.currentBalanceCents)} · Comprometido: ${formatBRL(snapshot.pendingCommitmentsCents)} · Reserva: ${formatBRL(snapshot.reserveRemainingCents)}.`,
      );

      return {
        text: lines.join('\n'),
        highlight: {
          label: 'Livre para gastar',
          value: formatBRL(snapshot.freeToSpendCents),
          tone: snapshot.freeToSpendCents < 0 ? 'negative' : 'positive',
        },
      };
    }

    case 'query_balance': {
      const snapshot = await loadSnapshot(db, {
        householdId: household.id,
        cycle,
        timezone: household.timezone,
        today: context.today,
      });

      return {
        text: [
          `Saldo registrado no ${branding.name}: **${formatBRL(snapshot.currentBalanceCents)}**.`,
          '',
          'Esse número vem dos lançamentos que vocês informaram aqui, não de uma conta bancária.',
        ].join('\n'),
        highlight: {
          label: 'Saldo atual',
          value: formatBRL(snapshot.currentBalanceCents),
          tone: snapshot.currentBalanceCents < 0 ? 'negative' : 'neutral',
        },
      };
    }

    case 'query_daily_limit': {
      const snapshot = await loadSnapshot(db, {
        householdId: household.id,
        cycle,
        timezone: household.timezone,
        today: context.today,
      });

      if (snapshot.freeToSpendCents <= 0) {
        return {
          text: [
            'O limite sugerido por dia é **R$ 0,00**.',
            '',
            freeLine(snapshot.freeToSpendCents),
          ].join('\n'),
        };
      }

      return {
        text: [
          `Dá para gastar cerca de **${formatBRL(snapshot.dailyLimitCents)} por dia**.`,
          '',
          `São ${snapshot.daysRemaining} dia(s) até ${formatDateBR(cycle.endDate)}, com ${formatBRL(snapshot.freeToSpendCents)} livres.`,
        ].join('\n'),
        highlight: {
          label: 'Por dia',
          value: formatBRL(snapshot.dailyLimitCents),
          tone: 'positive',
        },
      };
    }

    case 'query_category_spending': {
      const range = await periodRange(context, action.period);
      const total = await spentInCategory(
        db,
        household.id,
        action.categorySlug,
        range.from,
        range.to,
      );

      if (total === 0) {
        return {
          text: `Nenhum gasto registrado em ${categoryLabel(action.categorySlug)} ${range.label}.`,
        };
      }

      return {
        text: `${emoji(action.categorySlug)} Em ${categoryLabel(action.categorySlug)}, vocês gastaram **${formatBRL(total)}** ${range.label}.`,
        highlight: {
          label: categoryLabel(action.categorySlug),
          value: formatBRL(total),
          tone: 'neutral',
        },
      };
    }

    case 'query_total_spending': {
      const range = await periodRange(context, action.period);
      const total = await totalSpentBetween(db, household.id, range.from, range.to);

      if (total === 0) {
        return { text: `Nenhum gasto registrado ${range.label}.` };
      }

      const byCategory = await spendingByCategory(db, household.id, cycle.id);
      const top = byCategory.slice(0, 3);

      const lines = [`Vocês gastaram **${formatBRL(total)}** ${range.label}.`];

      if (action.period === 'cycle' && top.length > 0) {
        lines.push('', 'Onde foi:');
        for (const item of top) {
          lines.push(`• ${item.name}: ${formatBRL(item.totalCents)}`);
        }
      }

      return {
        text: lines.join('\n'),
        highlight: { label: 'Gasto', value: formatBRL(total), tone: 'neutral' },
      };
    }

    case 'query_pending_bills': {
      const snapshot = await loadSnapshot(db, {
        householdId: household.id,
        cycle,
        timezone: household.timezone,
        today: context.today,
      });

      if (snapshot.pendingBills.length === 0) {
        return { text: 'Nenhuma conta em aberto neste ciclo. Tudo em dia. ✅' };
      }

      const lines = [
        `Faltam **${snapshot.pendingBills.length} conta(s)**, somando **${formatBRL(snapshot.pendingCommitmentsCents)}**:`,
        '',
      ];

      for (const bill of snapshot.pendingBills.slice(0, 8)) {
        lines.push(`• ${bill.name} — ${formatBRL(bill.amountCents)} · vence ${formatDateBR(bill.dueDate)}`);
      }

      if (snapshot.pendingBills.length > 8) {
        lines.push(`• … e mais ${snapshot.pendingBills.length - 8}.`);
      }

      return {
        text: lines.join('\n'),
        highlight: {
          label: 'Comprometido',
          value: formatBRL(snapshot.pendingCommitmentsCents),
          tone: 'negative',
        },
      };
    }

    case 'query_summary': {
      const snapshot = await loadSnapshot(db, {
        householdId: household.id,
        cycle,
        timezone: household.timezone,
        today: context.today,
      });

      return {
        text: [
          `**${cycle.label}** · ${formatDateBR(cycle.startDate)} a ${formatDateBR(cycle.endDate)}`,
          '',
          `Entrou: ${formatBRL(snapshot.totals.income)}`,
          `Saiu: ${formatBRL(snapshot.totals.expense)}`,
          `Guardado: ${formatBRL(snapshot.totals.reserve)}`,
          `Contas em aberto: ${formatBRL(snapshot.pendingCommitmentsCents)}`,
          '',
          freeLine(snapshot.freeToSpendCents),
        ].join('\n'),
        highlight: {
          label: 'Livre para gastar',
          value: formatBRL(snapshot.freeToSpendCents),
          tone: snapshot.freeToSpendCents < 0 ? 'negative' : 'positive',
        },
      };
    }

    case 'query_member_spending': {
      const rows = await spendingByMember(db, household.id, cycle.id);

      if (rows.length === 0) {
        return { text: 'Ainda não há gastos registrados neste ciclo.' };
      }

      const lines = [`Gastos de ${cycle.label}:`, ''];
      for (const row of rows) {
        lines.push(`• ${row.name}: ${formatBRL(row.totalCents)}`);
      }
      lines.push('', 'A ideia aqui é organizar junto, não cobrar ninguém. 💛');

      return { text: lines.join('\n') };
    }

    case 'query_goals': {
      const list = await listGoals(db, household.id);

      if (list.length === 0) {
        return {
          text: 'Vocês ainda não criaram nenhuma meta. Dá para criar uma em Planejamento → Metas.',
        };
      }

      const lines = ['Metas de vocês:', ''];
      for (const goal of list) {
        const percent =
          goal.targetCents > 0
            ? Math.min(100, Math.round((goal.currentCents / goal.targetCents) * 100))
            : 0;
        lines.push(
          `• ${goal.name}: ${formatBRL(goal.currentCents)} de ${formatBRL(goal.targetCents)} (${percent}%)`,
        );
      }

      return { text: lines.join('\n') };
    }

    case 'simulate_spend': {
      const snapshot = await loadSnapshot(db, {
        householdId: household.id,
        cycle,
        timezone: household.timezone,
        today: context.today,
      });

      const projection = projectSpend(snapshot, action.amountCents);

      const lines = [
        `Se vocês gastarem **${formatBRL(action.amountCents)}**, ficam com **${formatBRL(projection.freeAfterCents)}** livres até ${formatDateBR(cycle.endDate)}.`,
      ];

      if (projection.fits) {
        lines.push('', `Isso daria cerca de ${formatBRL(projection.dailyLimitAfterCents)} por dia no que resta do ciclo.`);
      } else {
        lines.push('', 'Isso deixaria vocês com mais compromissos do que dinheiro disponível neste ciclo.');
      }

      lines.push('', '_É só uma projeção com base no que vocês registraram aqui._');

      return {
        text: lines.join('\n'),
        highlight: {
          label: 'Ficaria livre',
          value: formatBRL(projection.freeAfterCents),
          tone: projection.fits ? 'positive' : 'negative',
        },
      };
    }

    case 'help':
      return { text: helpText() };

    case 'unknown':
    default:
      return {
        text: [
          'Não consegui entender essa. 😅',
          '',
          'Tente algo como:',
          '• “Gastei 120 no mercado”',
          '• “Paguei 89 de gasolina”',
          '• “Recebi 4500 de salário”',
          '• “Quanto ainda posso gastar?”',
          '• “Quais contas faltam pagar?”',
        ].join('\n'),
      };
  }
}

function helpText(): string {
  return [
    'Eu registro o que vocês contam e faço as contas com os dados de vocês.',
    '',
    '**Para lançar:**',
    '• “Gastei 120 no mercado”',
    '• “Paguei 89 de gasolina ontem”',
    '• “Recebi 4500 de salário”',
    '• “Guardei 300”',
    '',
    '**Para consultar:**',
    '• “Quanto ainda posso gastar?”',
    '• “Quanto gastamos com mercado?”',
    '• “Quais contas faltam pagar?”',
    '• “Quanto cada um gastou?”',
    '• “Dá pra gastar 500 hoje?”',
  ].join('\n');
}
