'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Home, MessageCircle, Wallet, Target, Heart } from 'lucide-react';

const ITEMS = [
  { href: '/app', label: 'Hoje', icon: Home, exact: true },
  { href: '/app/chat', label: 'Chat', icon: MessageCircle },
  { href: '/app/movimentos', label: 'Movimentos', icon: Wallet },
  { href: '/app/planejamento', label: 'Planos', icon: Target },
  { href: '/app/casal', label: 'Casal', icon: Heart },
];

function useActive(href: string, exact?: boolean) {
  const pathname = usePathname();
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Fixed bottom bar on phones, hidden from `lg` where the sidebar takes over. */
export function BottomNavigation() {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-cream-100/95 backdrop-blur-md pb-safe lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {ITEMS.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </ul>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  exact,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
}) {
  const active = useActive(href, exact);

  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          // 56px tall: comfortably above the 44px touch-target minimum.
          'flex h-14 flex-col items-center justify-center gap-1 text-[0.625rem] font-semibold transition-colors',
          active ? 'text-rose-600' : 'text-ink-500 hover:text-ink-800',
        )}
      >
        <Icon aria-hidden className={cn('size-5', active && 'fill-rose-100')} />
        {label}
      </Link>
    </li>
  );
}

/** Desktop sidebar rendered from `lg` up. */
export function SideNavigation() {
  return (
    <nav
      aria-label="Navegação principal"
      className="hidden w-56 shrink-0 lg:block"
    >
      <ul className="sticky top-24 space-y-1">
        {ITEMS.map((item) => (
          <SideItem key={item.href} {...item} />
        ))}
      </ul>
    </nav>
  );
}

function SideItem({
  href,
  label,
  icon: Icon,
  exact,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
}) {
  const active = useActive(href, exact);

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-md px-3.5 py-2.5 text-[0.9375rem] font-semibold transition-colors',
          active
            ? 'bg-white text-ink-900 shadow-soft'
            : 'text-ink-600 hover:bg-white/60 hover:text-ink-900',
        )}
      >
        <Icon aria-hidden className={cn('size-4.5', active && 'text-rose-500')} />
        {label}
      </Link>
    </li>
  );
}
