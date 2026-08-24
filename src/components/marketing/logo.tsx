import { cn } from '@/lib/cn';

/**
 * Brand mark: two overlapping coins forming a heart-ish shape.
 * Inline SVG so it inherits colour and never costs a request.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      <rect width="32" height="32" rx="9" fill="var(--color-ink-900)" />
      <circle cx="12.5" cy="16" r="6.5" stroke="var(--color-rose-400)" strokeWidth="2.2" />
      <circle cx="19.5" cy="16" r="6.5" stroke="var(--color-cream-100)" strokeWidth="2.2" />
      <path
        d="M16 11.2c1.2 1.3 1.9 2.9 1.9 4.8s-.7 3.5-1.9 4.8c-1.2-1.3-1.9-2.9-1.9-4.8s.7-3.5 1.9-4.8Z"
        fill="var(--color-rose-500)"
      />
    </svg>
  );
}
