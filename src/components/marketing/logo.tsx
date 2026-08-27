import { cn } from '@/lib/cn';

/**
 * Brand mark: a heart drawn with two open strokes that cross near the top.
 *
 * Two strokes, not one outline, because the product is about two people: each
 * half is its own gesture and they only make a heart together. Left half in
 * ink, right half in rose, overlapping — neither is complete alone.
 *
 * The two paths are exported so the PWA icon generator can draw the same
 * curves pixel by pixel. Keeping one set of control points is the only way the
 * favicon and the header mark cannot drift apart.
 *
 * Inline SVG so it inherits sizing, scales to any resolution and costs no
 * request.
 */

/** Left half: bottom point, up the left lobe, over and past the centre. */
export const LOGO_LEFT_PATH =
  'M16 27 C 8 20.5, 4 15.5, 4 11.8 C 4 8.2, 6.8 6, 9.6 6 C 12.3 6, 15 7.8, 17.2 11.2';

/** Right half: the mirror, crossing the first one. */
export const LOGO_RIGHT_PATH =
  'M16 27 C 24 20.5, 28 15.5, 28 11.8 C 28 8.2, 25.2 6, 22.4 6 C 19.7 6, 17 7.8, 14.8 11.2';

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      <path
        d={LOGO_LEFT_PATH}
        stroke="var(--color-ink-800)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d={LOGO_RIGHT_PATH}
        stroke="var(--color-rose-500)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
