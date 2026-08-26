import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/primitives';
import { Heart, UserPlus } from 'lucide-react';
import type { CoupleMoney } from '@/domains/transactions/member-summary';

/**
 * "Meu saldo", "Parceiro(a)", "Juntos".
 *
 * Fed by `loadCoupleMoney`, the same helper behind the dashboard and the
 * couple screen. Two screens computing the same cycle their own way would
 * eventually disagree, and a couple seeing two different numbers for their own
 * money stops trusting both.
 *
 * A balance here is income minus expenses minus what was set aside: money
 * inside a goal is still theirs, but it is not spendable, and a card that
 * ignored it would overstate what is available.
 */

function Amount({ cents }: { cents: number }) {
  return (
    <p
      className={cn(
        'tabular mt-1 truncate text-lg font-bold',
        cents < 0 ? 'text-money-out' : 'text-ink-900',
      )}
    >
      {formatBRL(cents)}
    </p>
  );
}

export function BalanceCards({ money }: { money: CoupleMoney }) {
  const { mine, partner, together } = money;

  return (
    <div className="grid items-stretch gap-3 sm:grid-cols-3">
      <Card className="flex min-w-0 flex-col p-4">
        <div className="flex items-center gap-2">
          <Avatar name={mine.displayName} accent={mine.accentColor} size="sm" />
          <p className="truncate text-xs font-semibold text-ink-600">Meu saldo</p>
        </div>
        <Amount cents={mine.balanceCents} />
        <p className="mt-auto pt-2 text-[11px] text-ink-500">
          {formatBRL(mine.incomeCents)} entrou · {formatBRL(mine.expenseCents)} saiu
        </p>
      </Card>

      {partner ? (
        <Card className="flex min-w-0 flex-col p-4">
          <div className="flex items-center gap-2">
            <Avatar name={partner.displayName} accent={partner.accentColor} size="sm" />
            <p className="truncate text-xs font-semibold text-ink-600">
              {partner.displayName}
            </p>
          </div>
          <Amount cents={partner.balanceCents} />
          <p className="mt-auto pt-2 text-[11px] text-ink-500">
            {formatBRL(partner.incomeCents)} entrou · {formatBRL(partner.expenseCents)} saiu
          </p>
        </Card>
      ) : (
        <Card className="flex min-w-0 flex-col justify-center border-dashed p-4">
          <div className="flex items-center gap-2">
            <UserPlus aria-hidden className="size-4 shrink-0 text-ink-300" />
            <p className="truncate text-xs font-semibold text-ink-600">Parceiro(a)</p>
          </div>
          <p className="mt-1 text-sm text-ink-500">Ainda sem parceiro(a)</p>
          <p className="mt-auto pt-2 text-[11px] text-ink-400">
            Quando entrar, o saldo dele(a) aparece aqui.
          </p>
        </Card>
      )}

      <Card className="flex min-w-0 flex-col bg-ink-900 p-4 text-white">
        <div className="flex items-center gap-2">
          <Heart aria-hidden className="size-4 shrink-0 text-brand-300" />
          <p className="truncate text-xs font-semibold text-white/70">Juntos</p>
        </div>
        <p
          className={cn(
            'tabular mt-1 truncate text-lg font-bold',
            together.balanceCents < 0 ? 'text-red-300' : 'text-brand-200',
          )}
        >
          {formatBRL(together.balanceCents)}
        </p>
        <p className="mt-auto pt-2 text-[11px] text-white/60">
          {together.reservedCents > 0
            ? `${formatBRL(together.reservedCents)} guardados em metas`
            : 'Soma dos dois, incluindo o que é da casa'}
        </p>
      </Card>
    </div>
  );
}
