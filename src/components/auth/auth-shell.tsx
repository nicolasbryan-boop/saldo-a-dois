import Link from 'next/link';
import { Logo } from '@/components/marketing/logo';
import { branding } from '@/config';

/** Shared frame for every out-of-app page: sign in, checkout, invite. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="grain flex min-h-dvh flex-col bg-cream-100">
      <header className="px-5 pt-safe lg:px-8">
        <div className="mx-auto flex h-16 max-w-5xl items-center">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            aria-label={`${branding.name} — início`}
          >
            <Logo className="size-8" />
            <span className="font-display text-lg font-semibold tracking-[-0.02em] text-ink-900">
              {branding.name}
            </span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-8 lg:px-8">
        <div className={wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}>
          <div className="mb-7 text-center">
            <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[2rem]">
              {title}
            </h1>
            {subtitle && (
              <p className="mx-auto mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-ink-600">
                {subtitle}
              </p>
            )}
          </div>

          {children}

          {footer && <div className="mt-6 text-center text-sm text-ink-600">{footer}</div>}
        </div>
      </main>

      <footer className="px-5 pb-safe pt-4 lg:px-8">
        <p className="mx-auto max-w-5xl text-center text-xs text-ink-400">
          <Link href="/privacidade" className="link-underline">
            Privacidade
          </Link>
          {' · '}
          <Link href="/termos" className="link-underline">
            Termos
          </Link>
        </p>
      </footer>
    </div>
  );
}
