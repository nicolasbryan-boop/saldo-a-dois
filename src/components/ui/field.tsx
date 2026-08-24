'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { AlertCircle } from 'lucide-react';

const CONTROL =
  'w-full rounded-md border bg-white px-3.5 text-[0.9375rem] text-ink-900 ' +
  'placeholder:text-ink-400 transition-colors duration-150 ' +
  'disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-500';

const CONTROL_OK = 'border-ink-200 hover:border-ink-300 focus:border-rose-400';
const CONTROL_ERROR = 'border-money-out';

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  /** Renders the label for screen readers only. */
  hideLabel?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  hideLabel,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className={cn(
          'block text-sm font-semibold text-ink-800',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-money-out"
        >
          <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(CONTROL, 'h-12', invalid ? CONTROL_ERROR : CONTROL_OK, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          CONTROL,
          'min-h-24 py-3',
          invalid ? CONTROL_ERROR : CONTROL_OK,
          className,
        )}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        CONTROL,
        'h-12 appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' fill=\'none\' stroke=\'%23667085\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m4 6 4 4 4-4\'/%3E%3C/svg%3E")] bg-[length:16px] bg-[position:right_0.875rem_center] bg-no-repeat pr-10',
        invalid ? CONTROL_ERROR : CONTROL_OK,
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  );
});
