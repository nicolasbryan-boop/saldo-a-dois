'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Kept out of development on purpose: a worker that caches the dev server is
 * a reliable way to spend an afternoon debugging a stale bundle.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.error('[pwa] não foi possível registrar o service worker', error);
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
