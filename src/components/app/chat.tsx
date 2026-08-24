'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Send, Trash2, Sparkles } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { ConfirmSheet } from '@/components/ui/sheet';
import { branding } from '@/config';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actionType: string | null;
  createdAt: number;
}

interface AssistantTurnResponse {
  reply: {
    text: string;
    transactionId?: string;
    highlight?: { label: string; value: string; tone: 'positive' | 'negative' | 'neutral' };
  };
  actionType: string;
  resolvedBy: string;
}

const QUICK_ACTIONS = [
  'Quanto ainda posso gastar?',
  'Quais contas faltam pagar?',
  'Resumo do mês',
  'Quanto cada um gastou?',
];

/** Actions that changed data, so the server components need to re-render. */
const MUTATING = new Set(['create_expense', 'create_income', 'create_reserve']);

export function Chat({ initialMessages }: { initialMessages: ChatMessage[] }) {
  const router = useRouter();
  const toast = useToast();

  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const keyboardOffset = useKeyboardOffset();

  const scrollToEnd = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior });
    });
  }, []);

  React.useEffect(() => {
    scrollToEnd('auto');
  }, [scrollToEnd]);

  React.useEffect(() => {
    scrollToEnd();
  }, [messages, pending, scrollToEnd]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: trimmed,
      actionType: null,
      createdAt: Date.now(),
    };

    setMessages((current) => [...current, optimistic]);
    setInput('');
    setPending(true);

    try {
      const turn = await api.post<AssistantTurnResponse>('/api/assistant', {
        message: trimmed,
      });

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: turn.reply.text,
          actionType: turn.actionType,
          createdAt: Date.now(),
        },
      ]);

      if (MUTATING.has(turn.actionType)) router.refresh();
    } catch (error) {
      // Roll the optimistic bubble back so the transcript never shows a
      // message the server did not actually receive.
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setInput(trimmed);
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Não conseguimos enviar. Tente novamente.',
      );
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  async function clear() {
    try {
      await api.delete('/api/assistant');
      setMessages([]);
      setConfirmClear(false);
      toast.success('Conversa apagada.');
    } catch {
      toast.error('Não conseguimos apagar a conversa.');
    }
  }

  return (
    <div
      className="flex flex-col h-[calc(100dvh-11.5rem-var(--keyboard,0px))] lg:h-[calc(100dvh-7rem-var(--keyboard,0px))]"
      style={{ '--keyboard': `${keyboardOffset}px` } as React.CSSProperties}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink-900">Assistente</h1>
          <p className="text-xs text-ink-500">
            Interpreta o que vocês escrevem. As contas são feitas pelo {branding.name}.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            aria-label="Apagar conversa"
            className="grid size-10 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        )}
      </div>

      <div
        ref={listRef}
        className="scroll-soft flex-1 space-y-3 overflow-y-auto rounded-lg border border-ink-200 bg-white p-4"
      >
        {messages.length === 0 ? (
          <Welcome onPick={send} />
        ) : (
          messages.map((message) => <Bubble key={message.id} message={message} />)
        )}

        {pending && <TypingBubble />}
      </div>

      {messages.length > 0 && (
        <div className="scroll-soft mt-3 flex gap-2 overflow-x-auto pb-1">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => send(action)}
              disabled={pending}
              className="shrink-0 rounded-full border border-ink-200 bg-white px-3.5 py-2 text-xs font-medium text-ink-700 transition-colors hover:border-ink-300 hover:bg-cream-50 disabled:opacity-50"
            >
              {action}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="mt-3 flex items-end gap-2 rounded-xl border border-ink-200 bg-white p-2"
      >
        <label htmlFor="chat-input" className="sr-only">
          Mensagem para o assistente
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            const element = event.target;
            element.style.height = 'auto';
            element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
          }}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter makes a new line.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder="Conte o que aconteceu com seu dinheiro..."
          maxLength={500}
          className="max-h-[120px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[0.9375rem] text-ink-900 outline-none placeholder:text-ink-400"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          aria-label="Enviar"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ink-900 text-white transition-colors hover:bg-ink-800 disabled:opacity-40"
        >
          <Send aria-hidden className="size-4" />
        </button>
      </form>

      <ConfirmSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clear}
        title="Apagar a conversa?"
        message="O histórico do chat some. Os lançamentos que vocês já registraram continuam onde estão."
        confirmLabel="Apagar conversa"
        destructive
      />
    </div>
  );
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  const examples = [
    'Gastei 120 no mercado',
    'Paguei 89 de gasolina',
    'Recebi 4500 de salário',
    'Dá pra gastar 500 hoje?',
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-rose-100">
        <Sparkles aria-hidden className="size-5 text-rose-600" />
      </span>
      <p className="mt-4 font-display text-lg font-semibold text-ink-900">
        Conte o que aconteceu.
      </p>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-ink-600">
        Escreva como você falaria. Eu registro e recalculo quanto ainda dá para gastar.
      </p>

      <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="rounded-lg border border-ink-200 bg-cream-50 px-4 py-2.5 text-left text-sm font-medium text-ink-700 transition-colors hover:border-ink-300 hover:bg-cream-100"
          >
            “{example}”
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%] rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed sm:max-w-[75%]',
          isUser
            ? 'rounded-br-md bg-ink-900 text-white'
            : 'rounded-bl-md border border-ink-200 bg-cream-50 text-ink-800',
        )}
      >
        <RichText text={message.content} />
      </div>
    </div>
  );
}

/**
 * Minimal inline formatting for the assistant's replies.
 *
 * Only `**bold**` and `_italic_` are recognised and the text is rendered as
 * React nodes, never as HTML — the assistant's output is not trusted markup.
 */
function RichText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <>
      {lines.map((line, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {formatInline(line)}
        </React.Fragment>
      ))}
    </>
  );
}

function formatInline(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(
        <em key={key++} className="text-ink-500">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) parts.push(line.slice(lastIndex));
  return parts;
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div
        role="status"
        aria-label="Assistente escrevendo"
        className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-ink-200 bg-cream-50 px-4 py-3"
      >
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 rounded-full bg-ink-400"
            style={{
              animation: 'typing-dot 1.2s infinite',
              animationDelay: `${index * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * How much of the viewport the on-screen keyboard is covering.
 *
 * Without this the composer disappears under the iOS keyboard, which is the
 * single most common way a mobile chat feels broken.
 */
function useKeyboardOffset(): number {
  const [offset, setOffset] = React.useState(0);

  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function update() {
      if (!viewport) return;
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setOffset(covered > 80 ? covered : 0);
    }

    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return offset;
}
