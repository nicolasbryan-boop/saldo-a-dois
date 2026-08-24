import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Device frame used for the product mockups on the marketing site.
 *
 * Pure CSS: no screenshots to go stale, no image to fail to load, and the
 * numbers inside are the same ones the real dashboard renders.
 */
export function PhoneMock({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'relative mx-auto w-full max-w-[300px] rounded-[2.5rem] border-[10px] border-ink-900 bg-ink-900',
        'shadow-hero',
        className,
      )}
    >
      {/* Dynamic-island style cutout */}
      <span
        aria-hidden
        className="absolute left-1/2 top-2.5 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-ink-950"
      />
      <div className="relative overflow-hidden rounded-[1.85rem] bg-cream-100">
        <div className="grain relative min-h-[520px] px-4 pb-6 pt-11">{children}</div>
      </div>
    </div>
  );
}

/** Status bar row so the mock reads as a real phone screen. */
export function PhoneStatusBar({ time = '20:41' }: { time?: string }) {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-3 flex items-center justify-between px-6 text-[0.625rem] font-bold text-ink-700"
    >
      <span>{time}</span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-3.5 rounded-[2px] border border-ink-700" />
        <span className="inline-block h-2 w-1 rounded-[1px] bg-ink-700" />
      </span>
    </div>
  );
}

/** The bottom navigation, drawn statically for the mockups. */
export function PhoneNavMock({ active = 'Hoje' }: { active?: string }) {
  const items = ['Hoje', 'Chat', 'Movimentos', 'Planos', 'Casal'];
  return (
    <div
      aria-hidden
      className="mt-4 flex items-center justify-between rounded-xl border border-ink-200 bg-white/90 px-2 py-2 backdrop-blur"
    >
      {items.map((item) => (
        <span
          key={item}
          className={cn(
            'flex flex-1 flex-col items-center gap-1 text-[0.5625rem] font-semibold',
            item === active ? 'text-rose-500' : 'text-ink-400',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              item === active ? 'bg-rose-500' : 'bg-ink-300',
            )}
          />
          {item}
        </span>
      ))}
    </div>
  );
}
