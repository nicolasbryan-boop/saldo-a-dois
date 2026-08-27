'use client';

import * as React from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

/**
 * Meta Pixel, for ad measurement.
 *
 * WHY THIS EXISTS: Meta counts a link click on its own side, but it can only
 * count a "landing page view" if something on the destination tells it the
 * page loaded. Without the pixel, a campaign shows clicks and a dash — which
 * reads like a broken site when nothing is broken.
 *
 * WHERE IT DOES NOT RUN: anywhere behind the login. Inside `/app` the URLs and
 * the rhythm of navigation describe how a couple handles their money, and none
 * of that belongs to an ad network. Marketing pages are what ads point at, so
 * marketing pages are all it measures.
 *
 * INERT without NEXT_PUBLIC_META_PIXEL_ID: no script, no requests, no cookies.
 */

/** Everything a signed-in person touches. The pixel never loads here. */
const PRIVATE_PREFIXES = [
  '/app',
  '/admin',
  '/onboarding',
  '/trocar-senha',
  '/convite',
  '/redefinir-senha',
];

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
  }
}

export function MetaPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();

  const isPrivate = PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Client-side navigation does not reload the page, so the snippet's own
  // PageView fires once and never again. Without this, only the first page of
  // a visit would ever be counted.
  React.useEffect(() => {
    if (isPrivate || !pixelId) return;
    window.fbq?.('track', 'PageView');
  }, [pathname, isPrivate, pixelId]);

  if (!pixelId || isPrivate) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');
fbq('track','PageView');`}
    </Script>
  );
}
