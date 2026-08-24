import type { Metadata } from 'next';
import { getAppContext } from '@/server/app-context';
import { loadSnapshot } from '@/domains/financial-engine/load';
import { spendingByCategory, spendingByMember } from '@/domains/transactions/service';
import { findPreviousCycle, getCycleTotals } from '@/domains/cycles/service';
import { Card, SectionTitle } from '@/components/ui/card';
import { EmptyState, CategoryIcon, categoryChipClass } from '@/components/ui/primitives';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { BarChart3, TrendingDown, TrendingUp, Minus } from 'lucide-react';

export const metadata: Metadata = { title: 'Relatório' };
export const dynamic = 'force-dynamic';

export default async function ReportPage() {
  const context = await getAppContext();

  const [snapshot, byCategory, byMember, previous] = await Promise.all([
    loadSnapshot(context.db, {
      householdId: context.household.id,
      cycle: context.cycle,
      timezone: context.household.timezone,
      today: context.today,
    }),
    spendingByCategory(context.db, context.household.id, context.cycle.id),
    spendingByMember(context.db, context.household.id, context.cycle.id),
    findPreviousCycle(context.db, context.household.id, context.cycle.startDate),
  ]);

  const previousTotals = previous
    ? await getCycleTotals(context.db, context.household.id, previous.id)
    : null;

  const result =
    snapshot.totals.income - snapshot.totals.expense - snapshot.totals.reserve;

  const expenseDelta = previousTotals
    ? snapshot.totals.expense - previousTotals.expense
    : null;

  const biggest = byCategory[0]?.totalCents ?? 0;
  const hasData = snapshot.totals.expense > 0 || snapshot.totals.income > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">
          {context.cycle.label}
        </h1>
        <p className="text-xs text-ink-500">
          {formatDateBR(context.cycle.startDate)} a {formatDateBR(context.cycle.endDate)}
        </p>
      </div>

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="Ainda não há o que resumir."
          description="Assim que vocês registrarem entradas e gastos neste ciclo, o relatório aparece aqui."
        />
      ) : (
        <>
          <Card>
            <dl className="grid grid-cols-2 gap-px bg-ink-200 sm:grid-cols-4">
              <Stat label="Receberam" value={formatBRL(snapshot.totals.income)} tone="in" />
              <Stat label="Gastaram" value={formatBRL(snapshot.totals.expense)} tone="neutral" />
              <Stat label="Reservaram" value={formatBRL(snapshot.totals.reserve)} tone="hold" />
              <Stat
                label="Resultado"
                value={formatBRL(result)}
                tone={result >= 0 ? 'in' : 'out'}
              />
            </dl>
          </Card>

          {expenseDelta !== null && previous && (
            <Card className="flex items-center gap-3.5 p-5">
              <span
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-full',
                  expenseDelta < 0
                    ? 'bg-money-in-soft text-money-in'
                    : expenseDelta > 0
                      ? 'bg-money-out-soft text-money-out'
                      : 'bg-ink-100 text-ink-500',
                )}
              >
                {expenseDelta < 0 ? (
                  <TrendingDown aria-hidden className="size-5" />
                ) : expenseDelta > 0 ? (
                  <TrendingUp aria-hidden className="size-5" />
                ) : (
                  <Minus aria-hidden className="size-5" />
                )}
              </span>
              <p className="text-[0.9375rem] leading-snug text-ink-700">
                {expenseDelta === 0 ? (
                  <>Vocês gastaram exatamente o mesmo que em {previous.label}.</>
                ) : expenseDelta < 0 ? (
                  <>
                    Vocês gastaram{' '}
                    <strong className="text-money-in">
                      {formatBRL(Math.abs(expenseDelta))} a menos
                    </strong>{' '}
                    que em {previous.label}.
                  </>
                ) : (
                  <>
                    Vocês gastaram{' '}
                    <strong className="text-money-out">{formatBRL(expenseDelta)} a mais</strong>{' '}
                    que em {previous.label}.
                  </>
                )}
              </p>
            </Card>
          )}

          <section>
            <SectionTitle>Principais categorias</SectionTitle>
            {byCategory.length === 0 ? (
              <Card className="p-5 text-sm text-ink-600">
                Nenhum gasto categorizado neste ciclo.
              </Card>
            ) : (
              <Card className="p-5">
                <ul className="space-y-4">
                  {byCategory.slice(0, 8).map((category) => (
                    <li key={category.categoryId ?? 'sem-categoria'}>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'grid size-7 shrink-0 place-items-center rounded-full',
                            categoryChipClass(category.color),
                          )}
                        >
                          <CategoryIcon name={category.icon} className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium text-ink-800">
                          {category.name}
                        </span>
                        <span className="tabular shrink-0 text-[0.9375rem] font-semibold text-ink-900">
                          {formatBRL(category.totalCents)}
                        </span>
                      </div>
                      <div className="ml-9 mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full bg-ink-800"
                          style={{
                            width: `${biggest > 0 ? Math.round((category.totalCents / biggest) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          <section>
            <SectionTitle>Quem lançou o quê</SectionTitle>
            <Card className="divide-y divide-ink-100">
              {byMember.map((row) => (
                <div
                  key={row.memberId ?? 'casa'}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <span className="text-[0.9375rem] font-medium text-ink-800">
                    {row.memberId ? row.name : 'Casa / compartilhado'}
                  </span>
                  <span className="tabular text-[0.9375rem] font-semibold text-ink-900">
                    {formatBRL(row.totalCents)}
                  </span>
                </div>
              ))}
            </Card>
          </section>

          <p className="rounded-md bg-cream-100 px-4 py-3 text-xs leading-relaxed text-ink-600">
            Todos os valores vêm dos lançamentos registrados por vocês neste ciclo. Contas
            ainda não pagas aparecem como compromisso no painel, não como gasto aqui.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'in' | 'out' | 'hold' | 'neutral';
}) {
  const colors = {
    in: 'text-money-in',
    out: 'text-money-out',
    hold: 'text-[#8a5b02]',
    neutral: 'text-ink-900',
  };

  return (
    <div className="bg-white px-4 py-5">
      <dt className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-ink-500">
        {label}
      </dt>
      <dd className={cn('tabular mt-1.5 text-lg font-semibold', colors[tone])}>{value}</dd>
    </div>
  );
}
