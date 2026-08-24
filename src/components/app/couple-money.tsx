import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Card, SectionTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/primitives';
import { Heart } from 'lucide-react';
import type { CoupleMoney, MemberMoney } from '@/domains/transactions/member-summary';

/**
 * "Meu dinheiro / Parceiro / Nós dois".
 *
 * Read-only on purpose: this panel reports, it never offers a way to edit the
 * partner's side, because the backend would refuse anyway.
 */

function Row({ label, value, tone }: { label: string; value: string; tone: 'in' | 'out' }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-ink-500">{label}</span>
      <span
        className={cn(
          'tabular text-sm font-semibold',
          tone === 'in' ? 'text-money-in' : 'text-money-out',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function PersonCard({ money, caption }: { money: MemberMoney; caption: string }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Avatar name={money.displayName} accent={money.accentColor} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{money.displayName}</p>
          <p className="text-[11px] text-ink-500">{caption}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Row label="Recebeu" value={formatBRL(money.incomeCents)} tone="in" />
        <Row label="Gastou" value={formatBRL(money.expenseCents)} tone="out" />
      </div>

      <div className="flex items-baseline justify-between gap-2 border-t border-ink-100 pt-2">
        <span className="text-xs text-ink-500">Saldo</span>
        <span
          className={cn(
            'tabular text-base font-bold',
            money.balanceCents < 0 ? 'text-money-out' : 'text-ink-900',
          )}
        >
          {formatBRL(money.balanceCents)}
        </span>
      </div>
    </Card>
  );
}

export function CoupleMoneyPanel({
  money,
  cycleLabel,
}: {
  money: CoupleMoney;
  cycleLabel: string;
}) {
  return (
    <section>
      <SectionTitle>Quem movimentou o quê</SectionTitle>
      <p className="-mt-1 mb-3 text-xs text-ink-500">
        Cada pessoa lança as suas receitas e os seus gastos. {cycleLabel}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <PersonCard money={money.mine} caption="Meu dinheiro" />

        {money.partner ? (
          <PersonCard money={money.partner} caption="Parceiro(a)" />
        ) : null}

        {money.shared ? <PersonCard money={money.shared} caption="Sem dono definido" /> : null}
      </div>

      <Card className="mt-3 flex flex-col gap-3 bg-ink-900 text-white">
        <div className="flex items-center gap-2">
          <Heart className="size-4 text-brand-300" aria-hidden />
          <p className="text-sm font-semibold">Nós dois</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[11px] text-white/60">Receita conjunta</p>
            <p className="tabular text-sm font-semibold">
              {formatBRL(money.together.incomeCents)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-white/60">Despesas</p>
            <p className="tabular text-sm font-semibold">
              {formatBRL(money.together.expenseCents)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-white/60">Saldo do casal</p>
            <p
              className={cn(
                'tabular text-sm font-bold',
                money.together.balanceCents < 0 ? 'text-red-300' : 'text-brand-200',
              )}
            >
              {formatBRL(money.together.balanceCents)}
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}
