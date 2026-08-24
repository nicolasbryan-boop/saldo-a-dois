'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/money';

/**
 * Currency field built for thumbs.
 *
 * Typing is digit-by-digit from the right — "1", "12", "125", "1250" reads as
 * R$ 0,01 → 0,12 → 1,25 → 12,50 — which is how bank apps behave and avoids
 * every decimal-separator mistake. The value is held as integer cents and the
 * component never sees a float.
 */

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Amount in cents. */
  value: number;
  onValueChange: (cents: number) => void;
  invalid?: boolean;
  /** Rendered large, for the primary amount in a sheet. */
  emphasis?: boolean;
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    { value, onValueChange, invalid, emphasis = false, className, ...props },
    ref,
  ) {
    const display = formatAmount(value);

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 12);
      onValueChange(digits ? Number(digits) : 0);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      // Let the caret stay pinned to the right: editing is append/backspace.
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
      }
    }

    return (
      <div className="relative">
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-ink-500',
            emphasis ? 'text-xl' : 'text-[0.9375rem]',
          )}
        >
          R$
        </span>
        <input
          ref={ref}
          inputMode="numeric"
          // A numeric keypad on mobile, digits only.
          pattern="[0-9]*"
          autoComplete="off"
          className={cn(
            'w-full rounded-md border bg-white pl-11 pr-3.5 text-right tabular font-semibold text-ink-900',
            'transition-colors duration-150 disabled:bg-ink-100',
            emphasis ? 'h-16 text-2xl' : 'h-12 text-[0.9375rem]',
            invalid
              ? 'border-money-out'
              : 'border-ink-200 hover:border-ink-300 focus:border-rose-400',
            className,
          )}
          value={display}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={(event) => {
            const input = event.currentTarget;
            requestAnimationFrame(() => {
              input.setSelectionRange(input.value.length, input.value.length);
            });
            props.onFocus?.(event);
          }}
          aria-invalid={invalid || undefined}
          {...props}
        />
      </div>
    );
  },
);

/** Quick-amount chips shown above the keypad. */
export function AmountShortcuts({
  onPick,
  values = [1000, 2000, 5000, 10000],
  className,
}: {
  onPick: (cents: number) => void;
  values?: number[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {values.map((cents) => (
        <button
          key={cents}
          type="button"
          onClick={() => onPick(cents)}
          className="h-9 rounded-full border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-700 transition-colors hover:border-ink-300 hover:bg-cream-50"
        >
          + R$ {formatAmount(cents).replace(',00', '')}
        </button>
      ))}
    </div>
  );
}
