import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 shadow-soft',
  secondary:
    'bg-white text-ink-900 border border-ink-200 hover:border-ink-300 hover:bg-cream-50',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-money-out text-white hover:brightness-95 active:brightness-90',
  brand: 'bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-700 shadow-soft',
};

const SIZES: Record<Size, string> = {
  // Every size keeps a 40px+ touch target; md and lg clear 44px on mobile.
  sm: 'h-10 px-3.5 text-sm rounded-sm gap-1.5',
  md: 'h-12 px-5 text-[0.9375rem] rounded-md gap-2',
  lg: 'h-14 px-7 text-base rounded-lg gap-2.5',
};

const BASE =
  'inline-flex items-center justify-center font-semibold tracking-[-0.01em] ' +
  'transition-[background-color,border-color,color,transform,box-shadow] duration-150 ' +
  'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 ' +
  'select-none whitespace-nowrap';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends React.ComponentPropsWithoutRef<typeof Link> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {children}
    </Link>
  );
}
