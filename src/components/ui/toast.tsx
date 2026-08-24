'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useIsMounted } from '@/lib/use-mounted';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: React.ElementType; className: string }> = {
  success: { icon: CheckCircle2, className: 'border-l-money-in' },
  error: { icon: AlertTriangle, className: 'border-l-money-out' },
  info: { icon: Info, className: 'border-l-ink-400' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const mounted = useIsMounted();
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = React.useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, message, tone }].slice(-3));
      window.setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 4000);
    },
    [dismiss],
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      show,
      success: (message: string) => show(message, 'success'),
      error: (message: string) => show(message, 'error'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            // Announced without stealing focus.
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-6"
          >
            {items.map((item) => {
              const tone = TONE_STYLES[item.tone];
              const Icon = tone.icon;
              return (
                <div
                  key={item.id}
                  className={cn(
                    'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-ink-200 border-l-4 bg-white px-4 py-3 shadow-lift animate-rise',
                    tone.className,
                  )}
                >
                  <Icon aria-hidden className="mt-0.5 size-4.5 shrink-0 text-ink-600" />
                  <p className="flex-1 text-sm font-medium leading-snug text-ink-800">
                    {item.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    aria-label="Fechar aviso"
                    className="-mr-1 -mt-0.5 grid size-6 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  }
  return context;
}
