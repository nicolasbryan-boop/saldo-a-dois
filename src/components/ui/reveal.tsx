'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Scroll reveal.
 *
 * One IntersectionObserver per element, disconnected after the first reveal —
 * no scroll listeners, no layout thrash. Under `prefers-reduced-motion` the
 * CSS keeps everything visible, so this stays a no-op.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Component = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  // A callback ref keeps the polymorphic `as` prop typeable: it accepts any
  // HTMLElement, which satisfies every concrete tag this renders as.
  const [node, setNode] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.classList.add('is-visible');
            observer.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return (
    <Component
      ref={setNode}
      className={cn('reveal', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Component>
  );
}
