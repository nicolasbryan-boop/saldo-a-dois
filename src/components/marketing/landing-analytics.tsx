'use client';

import * as React from 'react';

/**
 * Product analytics for the marketing page.
 *
 * Fires two events and nothing else: the page view, and the moment the pricing
 * block is actually seen. No third-party script, no cookie, no fingerprint —
 * the events land in our own `analytics_events` table.
 */
export function LandingAnalytics() {
  React.useEffect(() => {
    void track('landing_view');

    const pricing = document.getElementById('preco');
    if (!pricing || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void track('pricing_view');
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(pricing);
    return () => observer.disconnect();
  }, []);

  return null;
}

async function track(name: string): Promise<void> {
  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      keepalive: true,
    });
  } catch {
    // Analytics must never affect the page.
  }
}
