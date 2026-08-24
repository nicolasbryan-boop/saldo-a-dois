'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { X, Share, Plus } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'sad:install-dismissed';

/**
 * Offers "add to home screen".
 *
 * Chromium fires `beforeinstallprompt` and we can trigger the native dialog.
 * iOS Safari does not, so it gets the manual instructions instead — which is
 * the only honest option there.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = React.useState(false);

  // Only on the dashboard. Everywhere else it would sit on top of something
  // the person is trying to use — the chat composer, most obviously.
  const allowed = pathname === '/app';

  React.useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    function onPrompt(event: Event) {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    }

    window.addEventListener('beforeinstallprompt', onPrompt);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (isIos && isSafari) {
      const timer = window.setTimeout(() => setShowIosHint(true), 4000);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', onPrompt);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private browsing: just hide it for this session.
    }
    setDeferred(null);
    setShowIosHint(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      void fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'pwa_installed' }),
        keepalive: true,
      }).catch(() => {});
    }
    dismiss();
  }

  if (!allowed || (!deferred && !showIosHint)) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-lg border border-ink-200 bg-white p-4 shadow-lift animate-rise lg:bottom-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">
            Instale o app no celular
          </p>
          {deferred ? (
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              Abra direto da tela inicial, com ícone próprio e em tela cheia.
            </p>
          ) : (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-ink-600">
              Toque em
              <Share aria-hidden className="inline size-3.5" />
              <span className="font-semibold">Compartilhar</span>
              e depois em
              <Plus aria-hidden className="inline size-3.5" />
              <span className="font-semibold">Adicionar à Tela de Início</span>.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Agora não"
          className="-mr-1 -mt-1 grid size-8 place-items-center rounded-full text-ink-400 hover:bg-ink-100"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      {deferred && (
        <button
          type="button"
          onClick={install}
          className="mt-3 h-11 w-full rounded-md bg-ink-900 text-sm font-semibold text-white transition-colors hover:bg-ink-800"
        >
          Adicionar à tela inicial
        </button>
      )}
    </div>
  );
}
