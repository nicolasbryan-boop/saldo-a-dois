import { Skeleton } from '@/components/ui/primitives';
import { Card } from '@/components/ui/card';

/**
 * Skeleton for the authenticated area.
 *
 * It mirrors the real layout so navigation does not shift when the data lands,
 * and it shows shapes rather than placeholder numbers — a fake balance, even
 * for a fraction of a second, is exactly what this product must not do.
 */
export default function AppLoading() {
  return (
    <div className="space-y-7" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>

      <div className="rounded-xl bg-ink-900 p-6 sm:p-8">
        <Skeleton className="h-3 w-32 bg-white/15" />
        <Skeleton className="mt-3 h-11 w-56 bg-white/15" />
        <Skeleton className="mt-5 h-1.5 w-full bg-white/10" />
        <Skeleton className="mt-3 h-3 w-48 bg-white/15" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className="p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2.5 h-6 w-28" />
            <Skeleton className="mt-2 h-3 w-20" />
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="mx-auto h-3 w-16" />
              <Skeleton className="mx-auto h-5 w-20" />
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-px overflow-hidden rounded-lg border border-ink-200 bg-white">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
