import type { Metadata, Viewport } from 'next';
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google';
import { branding } from '@/config';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker-registration';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  // Variable font: weight is left to the axis, plus the optical-size and
  // softness axes that give Fraunces its warmth at display sizes.
  axes: ['SOFT', 'opsz'],
});

const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  ),
  title: {
    default: `${branding.name} — ${branding.tagline}`,
    template: `%s · ${branding.name}`,
  },
  description: branding.description,
  applicationName: branding.name,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: branding.shortName,
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: `/icons/icon.svg?v=${branding.iconVersion}`, type: 'image/svg+xml' },
      {
        url: `/icons/icon-192.png?v=${branding.iconVersion}`,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: `/icons/icon-512.png?v=${branding.iconVersion}`,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      { url: `/icons/apple-touch-icon.png?v=${branding.iconVersion}`, sizes: '180x180' },
    ],
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: branding.name,
    title: `${branding.name} — ${branding.tagline}`,
    description: branding.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${branding.name} — ${branding.tagline}`,
    description: branding.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: branding.themeColor,
  width: 'device-width',
  initialScale: 1,
  // The app is installed to the home screen; let it use the whole display.
  viewportFit: 'cover',
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
