import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/primitives';
import { Heart, PiggyBank } from 'lucide-react';

/**
 * "Minha parte" and "Parte do parceiro(a)", side by side, then the couple.
 *
 * Two columns on purpose: a couple reads their money by comparing, and a
 * stacked list makes comparing hard. Each side is a fixed set of three facts
 * in the same order, so the two columns line up row for row even when the
 * names are different lengths.
 *
 * Read-only. There is no affordance to edit the other person's side, because
 * the backend refuses it anyway.
 */

export interface SideMoney {
  memberId: string;
  displayName: string;
  accentColor: string;
  incomeCents: number;
  expenseCents: number;
  savedCents: number;
  /** Already discounts what was set aside. Do not recompute. */
  balanceCents: number;
}

export interface CoupleSidesProps {
  mine: SideMoney;
  partner: SideMoney | null;
  joint: {
    incomeCents: number;
    expenseCents: number;
    balanceCents: number;
    savedCents: number;
  };
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'in' | 'out' | 'hold';
}) {
  const colors = {
    in: 'text-money-in',
    out: 'text-money-out',
    hold: 'text-[#8a5b02]',
  };

  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-xs text-ink-500">{label}</span>
      <span className={cn('tabular text-sm font-semibold', colors[tone])}>{value}</span>
    </div>
  );
}

function Side({ money, caption }: { money: SideMoney; caption: string }) {
  // Comes from loadCoupleMoney, never recomputed here. Recomputing it as
  // income minus expense ignored what was set aside, so this screen showed a
  // different number than the movements screen for the same cycle.
  const balance = money.balanceCents;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Avatar name={money.displayName} accent={money.accentColor} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{money.displayName}</p>
          <p className="text-[11px] text-ink-500">{caption}</p>
        </div>
      </div>

      {/* Same three lines in the same order on both sides, so the columns
          stay row-aligned no matter how long a name is. */}
      <div className="flex flex-col gap-1.5">
        <Line label="Recebeu" value={formatBRL(money.incomeCents)} tone="in" />
        <Line label="Gastou" value={formatBRL(money.expenseCents)} tone="out" />
        <Line label="Guardou" value={formatBRL(money.savedCents)} tone="hold" />
      </div>

      <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-ink-100 pt-3">
        <span className="text-xs text-ink-500">Sobrou</span>
        <span
          className={cn(
            'tabular text-base font-bold',
            balance < 0 ? 'text-money-out' : 'text-ink-900',
          )}
        >
          {formatBRL(balance)}
        </span>
      </div>
    </Card>
  );
}

export function CoupleSides({ mine, partner, joint }: CoupleSidesProps) {
  return (
    <div className="space-y-3">
      {/* items-stretch so both cards take the height of the taller one. */}
      <div className="grid items-stretch gap-3 sm:grid-cols-2">
        <Side money={mine} caption="Minha parte" />

        {partner ? (
          <Side money={partner} caption="Parte do parceiro(a)" />
        ) : (
          <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-4 text-center">
            <Heart aria-hidden className="size-5 text-ink-300" />
            <p className="text-sm font-medium text-ink-600">Ainda só você por aqui</p>
            <p className="text-xs text-ink-500">
              Quando seu parceiro(a) entrar, a parte dele(a) aparece deste lado.
            </p>
          </Card>
        )}
      </div>

      <Card className="flex flex-col gap-3 bg-ink-900 p-4 text-white">
        <div className="flex items-center gap-2">
          <Heart aria-hidden className="size-4 text-brand-300" />
          <p className="text-sm font-semibold">Nós dois</p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <div className="min-w-0">
            <p className="text-[11px] text-white/60">Receita conjunta</p>
            <p className="tabular truncate text-sm font-semibold">
              {formatBRL(joint.incomeCents)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-white/60">Despesas</p>
            <p className="tabular truncate text-sm font-semibold">
              {formatBRL(joint.expenseCents)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-white/60">Guardado em metas</p>
            <p className="tabular truncate text-sm font-semibold text-brand-200">
              {formatBRL(joint.savedCents)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-white/60">Saldo do casal</p>
            <p
              className={cn(
                'tabular truncate text-sm font-bold',
                joint.balanceCents < 0 ? 'text-red-300' : 'text-brand-200',
              )}
            >
              {formatBRL(joint.balanceCents)}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Shared goals with each person's contribution, for the couple screen. */
export function SharedGoals({
  goals,
}: {
  goals: Array<{
    id: string;
    name: string;
    targetCents: number;
    savedCents: number;
    percent: number;
    contributors: Array<{
      memberId: string | null;
      displayName: string;
      accentColor: string;
      amountCents: number;
    }>;
  }>;
}) {
  if (goals.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <PiggyBank aria-hidden className="size-5 shrink-0 text-ink-300" />
        <p className="text-sm text-ink-600">
          Nenhuma meta ainda. As metas são do casal: os dois colocam e os dois acompanham.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {goals.map((goal) => (
        <Card key={goal.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-tight text-ink-900">
              {goal.name}
            </p>
            <span className="tabular shrink-0 text-sm font-bold text-ink-900">
              {goal.percent}%
            </span>
          </div>

          <p className="tabular mt-1 text-xs text-ink-500">
            {formatBRL(goal.savedCents)} de {formatBRL(goal.targetCents)}
          </p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-money-in transition-[width] duration-700"
              style={{ width: `${goal.percent}%` }}
            />
          </div>

          {goal.contributors.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-ink-100 pt-3">
              {goal.contributors.map((person) => (
                <div
                  key={person.memberId ?? person.displayName}
                  className="flex items-center gap-2"
                >
                  <Avatar name={person.displayName} accent={person.accentColor} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] text-ink-500">{person.displayName}</p>
                    <p className="tabular text-xs font-semibold text-ink-900">
                      {formatBRL(person.amountCents)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
