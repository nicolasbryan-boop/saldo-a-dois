import type { MetadataRoute } from 'next';
import { branding } from '@/config';

/**
 * PWA manifest.
 *
 * `standalone` + the maskable icons are what make the installed app look and
 * behave like a native one on the home screen. `start_url` points at the app
 * itself, so opening from the icon lands on the dashboard rather than the
 * marketing page.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${branding.name} — ${branding.tagline}`,
    short_name: branding.shortName,
    description: branding.description,
    id: '/',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: branding.backgroundColor,
    theme_color: branding.themeColor,
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['finance', 'productivity', 'lifestyle'],
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Registrar um gasto',
        short_name: 'Novo gasto',
        url: '/app/chat',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Ver movimentos',
        short_name: 'Movimentos',
        url: '/app/movimentos',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
