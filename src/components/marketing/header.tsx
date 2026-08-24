'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Menu, X } from 'lucide-react';
import { branding, getPlan } from '@/config';
import { formatBRL } from '@/lib/money';
import { Logo } from './logo';

const LINKS = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#livre', label: 'Dinheiro livre' },
  { href: '#para-dois', label: 'Para o casal' },
  { href: '#preco', label: 'Preço' },
  { href: '#faq', label: 'Dúvidas' },
];

/** Headline price on the CTA: the cheapest entry point, i.e. the monthly plan. */
const defaultPlan = getPlan(null);

export function MarketingHeader() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled
          ? 'border-b border-ink-200 bg-cream-100/85 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:h-18 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-sm"
          aria-label={`${branding.name} — início`}
        >
          <Logo className="size-8" />
          <span className="font-display text-lg font-semibold tracking-[-0.02em] text-ink-900">
            {branding.name}
          </span>
        </Link>

        <nav aria-label="Seções" className="hidden items-center gap-7 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/entrar"
            className="rounded-md px-4 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            Entrar
          </Link>
          <Link
            href="/checkout"
            className="rounded-md bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-ink-800"
          >
            Começar por {formatBRL(defaultPlan.priceCents)}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          className="grid size-11 place-items-center rounded-md text-ink-800 transition-colors hover:bg-ink-100 lg:hidden"
        >
          {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
        </button>
      </div>

      {open && (
        <div
          id="menu-mobile"
          className="border-t border-ink-200 bg-cream-100 px-5 pb-6 pt-2 lg:hidden"
        >
          <nav aria-label="Seções" className="flex flex-col">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-ink-200 py-3.5 text-[0.9375rem] font-medium text-ink-700"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-5 flex flex-col gap-2.5">
            <Link
              href="/checkout"
              onClick={() => setOpen(false)}
              className="flex h-12 items-center justify-center rounded-md bg-ink-900 text-[0.9375rem] font-semibold text-white"
            >
              Começar por {formatBRL(defaultPlan.priceCents)}
            </Link>
            <Link
              href="/entrar"
              onClick={() => setOpen(false)}
              className="flex h-12 items-center justify-center rounded-md border border-ink-200 bg-white text-[0.9375rem] font-semibold text-ink-800"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
