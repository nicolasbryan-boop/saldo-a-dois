import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { Card } from '@/components/ui/card';
import { Compass } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Página não encontrada',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <AuthShell title="Não encontramos esta página">
      <Card className="p-7 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-cream-200">
          <Compass aria-hidden className="size-5 text-ink-500" />
        </span>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-700">
          O endereço que você abriu não existe ou foi movido. Nada aconteceu com os dados
          de vocês.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/app"
            className="inline-flex h-12 items-center justify-center rounded-md bg-ink-900 px-6 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-ink-800"
          >
            Ir para o painel
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-md border border-ink-200 bg-white px-6 text-[0.9375rem] font-semibold text-ink-800 transition-colors hover:bg-cream-50"
          >
            Voltar ao início
          </Link>
        </div>
      </Card>
    </AuthShell>
  );
}
