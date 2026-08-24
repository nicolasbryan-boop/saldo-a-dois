import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { Card } from '@/components/ui/card';
import { CloudOff } from 'lucide-react';

export const metadata: Metadata = { title: 'Sem conexão', robots: { index: false } };

/**
 * Shown by the service worker when a navigation fails offline.
 *
 * It deliberately shows no numbers: stale financial data would be worse than
 * saying plainly that the connection is down.
 */
export default function OfflinePage() {
  return (
    <AuthShell title="Você está sem conexão">
      <Card className="p-7 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-cream-200">
          <CloudOff aria-hidden className="size-5 text-ink-500" />
        </span>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-700">
          Não conseguimos falar com o servidor agora. Preferimos não mostrar números
          desatualizados sobre o dinheiro de vocês.
        </p>
        <p className="mt-3 text-sm text-ink-500">
          Assim que a internet voltar, é só recarregar a página.
        </p>
      </Card>
    </AuthShell>
  );
}
