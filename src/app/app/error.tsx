'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Error boundary inside the app shell, so the header and navigation survive a
 * failure on one screen. It states plainly that nothing was changed.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[app] falha na tela', error.digest ?? error.message);
  }, [error]);

  return (
    <Card className="p-7 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-money-out-soft">
        <AlertTriangle aria-hidden className="size-5 text-money-out" />
      </span>

      <h1 className="mt-4 font-display text-lg font-semibold text-ink-900">
        Não conseguimos carregar esta tela
      </h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">
        Nenhum lançamento de vocês foi alterado. Pode tentar de novo.
      </p>

      {error.digest && (
        <p className="mt-4 font-mono text-xs text-ink-400">código: {error.digest}</p>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button onClick={reset}>Tentar de novo</Button>
        <Link
          href="/app"
          className="inline-flex h-12 items-center justify-center rounded-md border border-ink-200 bg-white px-5 text-[0.9375rem] font-semibold text-ink-800 transition-colors hover:bg-cream-50"
        >
          Voltar ao painel
        </Link>
      </div>
    </Card>
  );
}
