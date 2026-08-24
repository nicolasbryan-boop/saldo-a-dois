import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/money';
import { relativeDateLabelBR, type LocalDate } from '@/lib/dates';
import { CategoryIcon, categoryChipClass } from '@/components/ui/primitives';
import type { TransactionType } from '@/db/schema';

export interface TransactionItemData {
  id: string;
  type: TransactionType;
  amountCents: number;
  description: string;
  occurredOn: string;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  memberName: string | null;
}

const DIRECTION: Record<TransactionType, 'in' | 'out'> = {
  income: 'in',
  expense: 'out',
  reserve: 'out',
  adjustment_in: 'in',
  adjustment_out: 'out',
};

const TYPE_LABEL: Record<TransactionType, string> = {
  income: 'Entrada',
  expense: 'Gasto',
  reserve: 'Guardado',
  adjustment_in: 'Ajuste',
  adjustment_out: 'Ajuste',
};

export function TransactionItem({
  transaction,
  today,
  onClick,
  className,
}: {
  transaction: TransactionItemData;
  today: LocalDate;
  onClick?: () => void;
  className?: string;
}) {
  const direction = DIRECTION[transaction.type];
  const isReserve = transaction.type === 'reserve';

  const content = (
    <>
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full',
          isReserve
            ? 'bg-money-hold-soft text-[#8a5b02]'
            : categoryChipClass(transaction.categoryColor),
        )}
      >
        <CategoryIcon
          name={isReserve ? 'PiggyBank' : transaction.categoryIcon}
          className="size-4.5"
        />
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[0.9375rem] font-semibold text-ink-900">
          {transaction.description}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-500">
          {[
            transaction.categoryName ?? TYPE_LABEL[transaction.type],
            transaction.memberName,
            relativeDateLabelBR(transaction.occurredOn as LocalDate, today),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>

      <span
        className={cn(
          'tabular shrink-0 text-[0.9375rem] font-bold',
          direction === 'in' ? 'text-money-in' : 'text-ink-900',
        )}
      >
        {direction === 'in' ? '+ ' : '− '}
        {formatBRL(transaction.amountCents)}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div className={cn('flex items-center gap-3 px-4 py-3', className)}>{content}</div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cream-50 active:bg-cream-100',
        className,
      )}
    >
      {content}
    </button>
  );
}

/** Grouped list with hairline separators. */
export function TransactionList({
  transactions,
  today,
  onSelect,
  className,
}: {
  transactions: TransactionItemData[];
  today: LocalDate;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  return (
    <ul className={cn('divide-y divide-ink-200 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-soft', className)}>
      {transactions.map((transaction) => (
        <li key={transaction.id}>
          <TransactionItem
            transaction={transaction}
            today={today}
            onClick={onSelect ? () => onSelect(transaction.id) : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
