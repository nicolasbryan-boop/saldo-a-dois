import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Heart, ArrowRight } from 'lucide-react';

/**
 * Shown only while the household is still a party of one.
 *
 * Deliberately quiet: someone who chose "convidar depois" already said no
 * once, and a dashboard that nags is a dashboard people stop opening.
 */
export function InvitePartnerCard() {
  return (
    <Card className="border-brand-200 bg-brand-50/60">
      <Link
        href="/app/casal"
        className="flex items-center gap-3 focus-visible:outline-none"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-brand-600 shadow-sm">
          <Heart className="size-4" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-900">
            Organizem juntos <span aria-hidden>❤️</span>
          </span>
          <span className="block text-xs text-ink-600">
            Convide seu parceiro(a) para lançar os gastos dele(a).
          </span>
        </span>

        <ArrowRight className="size-4 shrink-0 text-brand-600" aria-hidden />
      </Link>
    </Card>
  );
}
