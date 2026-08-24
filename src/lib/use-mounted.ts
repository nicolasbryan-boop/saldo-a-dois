'use client';

import { useSyncExternalStore } from 'react';

/** No-op subscribe: the answer never changes after hydration. */
function subscribe(): () => void {
  return () => {};
}

/**
 * True once the component is running in the browser.
 *
 * Used by the portal-based components (sheets, toasts), which cannot render on
 * the server because there is no `document`. `useSyncExternalStore` gives the
 * server and client snapshots directly, so this needs no state and no effect —
 * setting state in an effect just to learn "am I mounted" causes an extra
 * render pass and is what `react-hooks/set-state-in-effect` warns about.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
