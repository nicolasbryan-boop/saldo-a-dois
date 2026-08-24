import type { Metadata } from 'next';
import Link from 'next/link';
import { getAppContext } from '@/server/app-context';
import { loadSnapshot } from '@/domains/financial-engine/load';
import { listTransactions } from '@/domains/transactions/service';
import { listGoals } from '@/domains/goals/service';
import { formatBRL } from '@/lib/money';
import { formatDateBR, hourIn } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { Card, SectionTitle } from '@/components/ui/card';
import { EmptyState, ProgressBar, Badge } from '@/components/ui/primitives';
import { TransactionList } from '@/components/app/transaction-item';
import { QuickAddButton } from '@/components/app/quick-add';
import { branding } from '@/config';
import {
  ArrowUpRight,
  ArrowDownRight,
  PiggyBank,
  CalendarClock,
  AlertTriangle,
  Receipt,
  Target,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Hoje' };
export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const context = await getAppContext();

  const [snapshot, recent, goals] = await Promise.all([
    loadSnapshot(context.db, {
      householdId: context.household.id,
      cycle: context.cycle,
      timezone: context.household.timezone,
      today: context.today,
    }),
    listTransactions(context.db, context.household.id, { limit: 6 }),
    listGoals(context.db, context.household.id),
  ]);

  const hour = hourIn(context.household.timezone);
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const negative = snapshot.freeToSpendCents < 0;

  const spentRatio =
    snapshot.totals.expense + Math.max(0, snapshot.freeToSpendCents) > 0
      ? snapshot.totals.expense /
        (snapshot.totals.expense + Math.max(0, snapshot.freeToSpendCents))
      : 0;

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-medium text-ink-500">
          {greeting}, {context.member.displayName}.
        </p>
        <p className="mt-0.5 text-xs text-ink-400">
          Ciclo {context.cycle.label} · {formatDateBR(context.cycle.startDate)} a{' '}
          {formatDateBR(context.cycle.endDate)}
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* The number                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section
        className={cn(
          'relative overflow-hidden rounded-xl p-6 text-white shadow-lift sm:p-8',
          negative ? 'bg-[#7a1f22]' : 'bg-ink-900',
        )}
      >
        <h1 className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-white/60">
          Livre para gastar
        </h1>
        <p className="tabular animate-count mt-2 font-display text-[2.75rem] font-semibold leading-none sm:text-[3.5rem]">
          {formatBRL(snapshot.freeToSpendCents)}
        </p>

        {negative ? (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-white/10 px-3.5 py-3 text-sm leading-snug text-white/90">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            Vocês têm mais compromissos do que dinheiro disponível neste momento. O limite
            sugerido por dia é R$ 0,00.
          </p>
        ) : (
          <>
            <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-rose-400 transition-[width] duration-700"
                style={{ width: `${Math.min(100, Math.round(spentRatio * 100))}%` }}
              />
            </div>
            <p className="mt-3 text-sm font-medium text-white/75">
              <span className="tabular font-semibold text-white">
                {formatBRL(snapshot.dailyLimitCents)}
              </span>{' '}
              por dia até {formatDateBR(context.cycle.endDate)} ({snapshot.daysRemaining}{' '}
              {snapshot.daysRemaining === 1 ? 'dia' : 'dias'})
            </p>
          </>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Breakdown                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <SectionTitle>De onde vem esse número</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Metric
            label="Saldo atual"
            value={formatBRL(snapshot.currentBalanceCents)}
            hint={`Registrado no ${branding.name}`}
            icon={PiggyBank}
          />
          <Metric
            label="Comprometido"
            value={formatBRL(snapshot.pendingCommitmentsCents)}
            hint={
              snapshot.pendingBills.length === 1
                ? '1 conta em aberto'
                : `${snapshot.pendingBills.length} contas em aberto`
            }
            icon={Receipt}
            tone="out"
          />
          <Metric
            label="Reserva do ciclo"
            value={formatBRL(snapshot.reserveRemainingCents)}
            hint={`de ${formatBRL(snapshot.plannedReserveCents)} planejados`}
            icon={Target}
            tone="hold"
          />
          <Metric
            label="Próxima entrada"
            value={
              snapshot.nextIncome ? formatBRL(snapshot.nextIncome.amountCents) : 'Nenhuma'
            }
            hint={
              snapshot.nextIncome
                ? `${snapshot.nextIncome.name} · ${formatDateBR(snapshot.nextIncome.dueDate)}`
                : 'Nada previsto neste ciclo'
            }
            icon={CalendarClock}
            tone="in"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Next bill                                                           */}
      {/* ------------------------------------------------------------------ */}
      {snapshot.nextBill && (
        <Card className="flex items-center gap-4 p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-money-out-soft">
            <Receipt aria-hidden className="size-5 text-money-out" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Próxima conta
            </p>
            <p className="mt-0.5 truncate text-[0.9375rem] font-semibold text-ink-900">
              {snapshot.nextBill.name} — {formatBRL(snapshot.nextBill.amountCents)}
            </p>
            <p className="text-xs text-ink-500">
              vence em {formatDateBR(snapshot.nextBill.dueDate)}
            </p>
          </div>
          <Link
            href="/app/planejamento"
            className="shrink-0 rounded-md border border-ink-200 px-3.5 py-2 text-sm font-semibold text-ink-800 transition-colors hover:bg-cream-50"
          >
            Ver contas
          </Link>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Cycle summary                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <SectionTitle
          action={
            <Link href="/app/relatorio" className="text-sm font-semibold text-rose-600">
              Ver relatório
            </Link>
          }
        >
          Resumo do ciclo
        </SectionTitle>
        <Card>
          <dl className="grid grid-cols-3 divide-x divide-ink-200">
            <SummaryCell label="Receitas" value={formatBRL(snapshot.totals.income)} tone="in" />
            <SummaryCell label="Despesas" value={formatBRL(snapshot.totals.expense)} tone="out" />
            <SummaryCell label="Guardado" value={formatBRL(snapshot.totals.reserve)} tone="hold" />
          </dl>
        </Card>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Goals                                                               */}
      {/* ------------------------------------------------------------------ */}
      {goals.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link href="/app/planejamento" className="text-sm font-semibold text-rose-600">
                Ver metas
              </Link>
            }
          >
            Metas
          </SectionTitle>
          <div className="space-y-3">
            {goals.slice(0, 2).map((goal) => {
              const percent =
                goal.targetCents > 0
                  ? Math.min(100, Math.round((goal.currentCents / goal.targetCents) * 100))
                  : 0;
              return (
                <Card key={goal.id} className="p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[0.9375rem] font-semibold text-ink-900">
                      {goal.name}
                    </p>
                    <Badge tone={percent >= 100 ? 'positive' : 'neutral'}>{percent}%</Badge>
                  </div>
                  <p className="tabular mt-1 text-sm text-ink-600">
                    {formatBRL(goal.currentCents)} de {formatBRL(goal.targetCents)}
                  </p>
                  <ProgressBar
                    className="mt-3"
                    value={goal.currentCents}
                    max={goal.targetCents}
                    label={`Progresso da meta ${goal.name}`}
                  />
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Recent movements                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <SectionTitle
          action={
            <Link href="/app/movimentos" className="text-sm font-semibold text-rose-600">
              Ver todos
            </Link>
          }
        >
          Últimos movimentos
        </SectionTitle>

        {recent.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Vocês ainda não registraram nenhum gasto."
            description="Comece contando o que aconteceu com o dinheiro de vocês — pode ser pelo chat."
            action={
              <Link
                href="/app/chat"
                className="inline-flex h-12 items-center rounded-md bg-ink-900 px-5 text-[0.9375rem] font-semibold text-white"
              >
                Registrar primeiro gasto
              </Link>
            }
          />
        ) : (
          <TransactionList transactions={recent} today={context.today} />
        )}
      </section>

      <QuickAddButton members={context.members.map((m) => ({ id: m.id, name: m.displayName }))} />
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  tone?: 'neutral' | 'in' | 'out' | 'hold';
}) {
  const tones = {
    neutral: 'text-ink-900',
    in: 'text-money-in',
    out: 'text-ink-900',
    hold: 'text-[#8a5b02]',
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Icon aria-hidden className="size-3.5 text-ink-400" />
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-500">
          {label}
        </p>
      </div>
      <p className={cn('tabular mt-1.5 text-xl font-semibold', tones[tone])}>{value}</p>
      <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-snug text-ink-500">{hint}</p>
    </Card>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'in' | 'out' | 'hold';
}) {
  const Icon = tone === 'in' ? ArrowUpRight : tone === 'out' ? ArrowDownRight : PiggyBank;
  const colors = {
    in: 'text-money-in',
    out: 'text-ink-900',
    hold: 'text-[#8a5b02]',
  };

  return (
    <div className="px-4 py-5 text-center">
      <dt className="flex items-center justify-center gap-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-ink-500">
        <Icon aria-hidden className="size-3" />
        {label}
      </dt>
      <dd className={cn('tabular mt-1.5 text-base font-semibold sm:text-lg', colors[tone])}>
        {value}
      </dd>
    </div>
  );
}
