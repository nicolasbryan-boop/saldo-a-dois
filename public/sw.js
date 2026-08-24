/* eslint-disable no-restricted-globals */
/**
 * Saldo a Dois — service worker.
 *
 * CACHING POLICY (deliberately conservative, because this is money):
 *
 *   - App shell assets (icons, fonts, build output) are cached, because they
 *     are immutable and carry nothing private.
 *   - EVERY authenticated HTML page and EVERY /api response is network-only.
 *     A balance served from a stale cache is worse than an error message, and
 *     a cached financial response on a shared device is a privacy problem.
 *   - When the network fails for a navigation, an offline page is shown
 *     instead of stale numbers.
 *
 * Bumping CACHE_VERSION invalidates the previous shell cache on activate.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `sad-shell-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline';

const PRECACHE = [
  OFFLINE_URL,
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Never let one missing asset abort the whole install.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Assets that are safe to serve from cache: immutable and non-personal. */
function isShellAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

/** Anything that could contain a couple's financial data. */
function isPrivate(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/app') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/onboarding') ||
    url.pathname.startsWith('/checkout')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Third-party requests are none of this worker's business.
  if (url.origin !== self.location.origin) return;

  if (isPrivate(url)) {
    // Network only. On failure, a navigation gets the offline page; an API
    // call gets a clear error the client can show.
    event.respondWith(
      fetch(request).catch(async () => {
        if (request.mode === 'navigate') {
          const cached = await caches.match(OFFLINE_URL);
          if (cached) return cached;
        }
        return new Response(
          JSON.stringify({
            error: {
              code: 'offline',
              message: 'Sem conexão. Verifique a internet e tente de novo.',
            },
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    return;
  }

  if (isShellAsset(url)) {
    // Cache first: these are content-hashed or versioned.
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Public pages: network first, falling back to the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? Response.error();
      }),
    );
  }
});
