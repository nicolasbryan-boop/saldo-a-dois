'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps the couple in sync.
 *
 * Two people share one space, so a movement added on the other phone should
 * show up here without a manual reload. Refreshing on focus and on
 * reconnect covers that without polling — and without caching financial data
 * anywhere it could go stale.
 */
export function AppRefresh() {
  const router = useRouter();

  React.useEffect(() => {
    let lastRefresh = Date.now();

    function maybeRefresh() {
      // Don't hammer the server when someone flicks between tabs.
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefresh < 20_000) return;
      lastRefresh = Date.now();
      router.refresh();
    }

    document.addEventListener('visibilitychange', maybeRefresh);
    window.addEventListener('online', maybeRefresh);

    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh);
      window.removeEventListener('online', maybeRefresh);
    };
  }, [router]);

  return <OfflineBanner />;
}

function OfflineBanner() {
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-money-hold px-4 py-2 text-center text-xs font-semibold text-white"
    >
      Você está sem internet. Os números podem estar desatualizados.
    </div>
  );
}
