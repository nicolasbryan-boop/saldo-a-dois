'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

/**
 * Root error boundary.
 *
 * Deliberately shows no numbers and no technical detail: a screen that failed
 * to load must not leave a half-computed balance on screen, and the stack trace
 * belongs in the server logs, not in front of the person.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[ui] falha ao renderizar', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="grain flex min-h-dvh items-center justify-center bg-cream-100 px-5">
      <div className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-7 text-center shadow-soft">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-money-out-soft">
          <AlertTriangle aria-hidden className="size-5 text-money-out" />
        </span>

        <h1 className="mt-4 font-display text-xl font-semibold text-ink-900">
          Algo deu errado ao abrir esta tela
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">
          Nenhum lançamento de vocês foi alterado. Tente de novo — se continuar, volte em
          alguns minutos.
        </p>

        {error.digest && (
          <p className="mt-4 font-mono text-xs text-ink-400">código: {error.digest}</p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-12 items-center justify-center rounded-md bg-ink-900 px-6 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-ink-800"
          >
            Tentar de novo
          </button>
          <Link
            href="/app"
            className="inline-flex h-12 items-center justify-center rounded-md border border-ink-200 bg-white px-6 text-[0.9375rem] font-semibold text-ink-800 transition-colors hover:bg-cream-50"
          >
            Ir para o painel
          </Link>
        </div>
      </div>
    </div>
  );
}
