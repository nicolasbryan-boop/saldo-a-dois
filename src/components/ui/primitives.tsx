import * as React from 'react';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/money';
import { Sparkles, CloudOff, type LucideIcon } from 'lucide-react';
import { CATEGORY_ICONS, FALLBACK_ICON } from './category-icons';

/* ------------------------------------------------------------------------- */
/* Icon resolution                                                            */
/* ------------------------------------------------------------------------- */

/**
 * Categories store an icon name, so rendering one is a lookup in a fixed
 * registry. The registry is a module constant and the lookup is a plain
 * property read — no component is constructed here, and an unknown name falls
 * back instead of crashing the render.
 */
export function CategoryIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Icon = (name ? CATEGORY_ICONS[name] : undefined) ?? FALLBACK_ICON;
  return <Icon aria-hidden className={cn('size-4', className)} />;
}

const CHIP_TONES: Record<string, string> = {
  emerald: 'bg-[#e6f6f0] text-[#0b7a55]',
  amber: 'bg-[#fdf3e0] text-[#8a5b02]',
  orange: 'bg-[#feeee0] text-[#96500b]',
  sky: 'bg-[#e6f1fb] text-[#1f5f95]',
  indigo: 'bg-[#eceaff] text-[#4034a8]',
  yellow: 'bg-[#fdf6d9] text-[#7a5c00]',
  cyan: 'bg-[#e2f5f8] text-[#0e6474]',
  rose: 'bg-[#ffe9ee] text-[#a82c42]',
  violet: 'bg-[#f0eafc] text-[#5b3fb0]',
  fuchsia: 'bg-[#fbe9f8] text-[#8f2f80]',
  pink: 'bg-[#ffe8f1] text-[#a32b62]',
  purple: 'bg-[#f3eafd] text-[#67329f]',
  slate: 'bg-[#eef1f5] text-[#3f4b5b]',
  teal: 'bg-[#e2f5f2] text-[#0d6b5e]',
  lime: 'bg-[#eef7dd] text-[#4e6b12]',
  blue: 'bg-[#e6f0fd] text-[#1c5399]',
  stone: 'bg-[#f2f0ed] text-[#57534e]',
  green: 'bg-[#e7f6e8] text-[#1f7a34]',
};

export function categoryChipClass(color: string | null | undefined): string {
  return CHIP_TONES[color ?? 'stone'] ?? CHIP_TONES.stone!;
}

/* ------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* ------------------------------------------------------------------------- */

const ACCENT_RING: Record<string, string> = {
  rose: 'bg-rose-100 text-rose-700',
  sky: 'bg-[#e6f1fb] text-[#1f5f95]',
  amber: 'bg-[#fdf3e0] text-[#8a5b02]',
  emerald: 'bg-[#e6f6f0] text-[#0b7a55]',
  violet: 'bg-[#f0eafc] text-[#5b3fb0]',
};

export function Avatar({
  name,
  accent = 'rose',
  size = 'md',
  className,
}: {
  name: string;
  accent?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const sizes = {
    sm: 'size-7 text-[0.6875rem]',
    md: 'size-9 text-xs',
    lg: 'size-14 text-base',
  };

  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-bold tracking-wide',
        ACCENT_RING[accent] ?? ACCENT_RING.rose,
        sizes[size],
        className,
      )}
    >
      {initials || '?'}
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Badge                                                                      */
/* ------------------------------------------------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'brand';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    positive: 'bg-money-in-soft text-[#0b7a55]',
    negative: 'bg-money-out-soft text-[#a3282a]',
    warning: 'bg-money-hold-soft text-[#8a5b02]',
    brand: 'bg-rose-100 text-rose-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Money                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Renders an amount with a screen-reader-friendly label. Colour alone never
 * carries the meaning: the sign is always present in the text.
 */
export function Money({
  cents,
  tone = 'auto',
  className,
  signed = false,
}: {
  cents: number;
  tone?: 'auto' | 'in' | 'out' | 'neutral';
  className?: string;
  signed?: boolean;
}) {
  const resolved =
    tone === 'auto' ? (cents < 0 ? 'out' : cents > 0 ? 'in' : 'neutral') : tone;

  const colors = {
    in: 'text-money-in',
    out: 'text-money-out',
    neutral: 'text-ink-900',
  };

  // In signed mode the caller passes a positive amount and states the
  // direction; otherwise the sign already lives in the formatted string.
  const prefix = signed ? (resolved === 'out' ? '− ' : resolved === 'in' ? '+ ' : '') : '';
  const text = signed ? formatBRL(Math.abs(cents)) : formatBRL(cents);

  return (
    <span className={cn('tabular font-semibold', colors[resolved], className)}>
      {prefix}
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Progress                                                                   */
/* ------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  max,
  label,
  className,
  tone = 'brand',
}: {
  value: number;
  max: number;
  label?: string;
  className?: string;
  tone?: 'brand' | 'positive';
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-ink-100', className)}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700 ease-out',
          tone === 'brand' ? 'bg-rose-500' : 'bg-money-in',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Skeleton / empty / error                                                   */
/* ------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4 w-full', className)} />;
}

export function EmptyState({
  icon: Icon = Sparkles,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-ink-300 bg-cream-50 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-white shadow-soft">
        <Icon aria-hidden className="size-5 text-ink-500" />
      </span>
      <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-600">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Não conseguimos carregar',
  description = 'Verifique sua conexão e tente novamente.',
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-money-out/30 bg-money-out-soft px-6 py-10 text-center"
    >
      <CloudOff aria-hidden className="mb-3 size-6 text-money-out" />
      <p className="font-semibold text-ink-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-600">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Segmented control                                                          */
/* ------------------------------------------------------------------------- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex w-full gap-1 rounded-md border border-ink-200 bg-cream-100 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-9 flex-1 rounded-sm px-3 text-sm font-semibold transition-colors',
              active
                ? 'bg-white text-ink-900 shadow-soft'
                : 'text-ink-600 hover:text-ink-900',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
