import * as React from 'react';
import { cn } from '@/lib/cn';
import { PhoneStatusBar, PhoneNavMock } from './phone-mock';
import { branding } from '@/config';

/**
 * Static reproductions of real app screens, used inside the phone frames.
 * Every figure here matches the example scenario used across the landing copy,
 * so the marketing numbers and the product numbers tell the same story.
 */

export function DashboardMockScreen() {
  return (
    <>
      <PhoneStatusBar />
      <div className="flex items-center gap-2 text-[0.6875rem] font-semibold text-ink-600">
        <span aria-hidden>{branding.glyph}</span>
        <span>Ana &amp; Lucas</span>
      </div>
      <p className="mt-0.5 text-[0.8125rem] font-medium text-ink-500">Boa noite, Ana.</p>

      <div className="mt-3 rounded-xl bg-ink-900 p-4 text-white shadow-lift">
        <p className="text-[0.5625rem] font-bold uppercase tracking-[0.18em] text-white/60">
          Livre para gastar
        </p>
        <p className="tabular mt-1 font-display text-[2rem] font-semibold leading-none">
          R$ 2.847,50
        </p>
        <p className="mt-2 text-[0.6875rem] font-medium text-white/70">
          R$ 94,91/dia até 04/09
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniStat label="Saldo atual" value="R$ 8.450,00" />
        <MiniStat label="Comprometido" value="R$ 4.602,50" tone="out" />
        <MiniStat label="Meta do mês" value="R$ 1.000,00" tone="hold" />
        <MiniStat label="Próxima entrada" value="R$ 4.500 · 05" tone="in" />
      </div>

      <p className="mt-4 text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-ink-500">
        Últimos movimentos
      </p>
      <div className="mt-1.5 space-y-px overflow-hidden rounded-lg border border-ink-200 bg-white">
        <MockRow icon="🛒" title="Mercado" meta="Ana · Hoje" amount="− R$ 186,00" />
        <MockRow icon="⛽" title="Gasolina" meta="Lucas · Ontem" amount="− R$ 89,00" />
        <MockRow icon="💰" title="Salário" meta="Ana · 05/08" amount="+ R$ 4.500,00" positive />
      </div>

      <PhoneNavMock />
    </>
  );
}

export function ChatMockScreen() {
  return (
    <>
      <PhoneStatusBar time="21:07" />
      <div className="flex items-center justify-between">
        <p className="font-display text-base font-semibold text-ink-900">Assistente</p>
        <span className="rounded-full bg-money-in-soft px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wider text-[#0b7a55]">
          online
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        <Bubble side="user">Gastei 186 no mercado.</Bubble>
        <Bubble side="assistant">
          🛒 Mercado registrado: <strong>R$ 186,00</strong>.
          <br />
          <br />
          Vocês têm <strong>R$ 2.661,50 livres</strong> neste ciclo.
        </Bubble>
        <Bubble side="user">Dá pra gastar 500 em uma roupa hoje?</Bubble>
        <Bubble side="assistant">
          Se vocês gastarem R$ 500 hoje, ficam com <strong>R$ 2.161,50</strong> livres até
          04/09.
        </Bubble>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-2">
        <span className="flex-1 text-[0.6875rem] text-ink-400">
          Conte o que aconteceu com seu dinheiro…
        </span>
        <span aria-hidden className="grid size-6 place-items-center rounded-full bg-ink-900 text-[0.625rem] text-white">
          ↑
        </span>
      </div>
    </>
  );
}

export function CoupleMockScreen() {
  return (
    <>
      <PhoneStatusBar time="09:12" />
      <p className="text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-ink-500">
        Espaço financeiro
      </p>
      <p className="mt-1 flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
        <span aria-hidden>{branding.glyph}</span> Ana &amp; Lucas
      </p>

      <div className="mt-3 space-y-2">
        <PersonRow name="Ana" role="Dona do espaço" amount="R$ 620,00" accent="rose" />
        <PersonRow name="Lucas" role="Parceiro" amount="R$ 840,00" accent="sky" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniStat label="Casa / compartilhado" value="R$ 1.960,00" />
        <MiniStat label="Guardado no mês" value="R$ 1.000,00" tone="hold" />
      </div>

      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
        <p className="text-[0.6875rem] font-semibold leading-relaxed text-rose-700">
          Aqui não tem cobrança. Cada um lança o que gastou e os dois enxergam a mesma
          conta.
        </p>
      </div>

      <PhoneNavMock active="Casal" />
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* ------------------------------------------------------------------------- */

function MiniStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'in' | 'out' | 'hold';
}) {
  const tones = {
    neutral: 'text-ink-900',
    in: 'text-money-in',
    out: 'text-ink-900',
    hold: 'text-[#8a5b02]',
  };

  return (
    <div className="rounded-lg border border-ink-200 bg-white px-2.5 py-2">
      <p className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-ink-500">
        {label}
      </p>
      <p className={cn('tabular mt-0.5 text-[0.8125rem] font-bold', tones[tone])}>{value}</p>
    </div>
  );
}

function MockRow({
  icon,
  title,
  meta,
  amount,
  positive = false,
}: {
  icon: string;
  title: string;
  meta: string;
  amount: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-ink-100 px-2.5 py-2 last:border-0">
      <span aria-hidden className="grid size-7 place-items-center rounded-full bg-cream-200 text-[0.6875rem]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.6875rem] font-semibold text-ink-900">
          {title}
        </span>
        <span className="block truncate text-[0.5625rem] text-ink-500">{meta}</span>
      </span>
      <span
        className={cn(
          'tabular text-[0.6875rem] font-bold',
          positive ? 'text-money-in' : 'text-ink-900',
        )}
      >
        {amount}
      </span>
    </div>
  );
}

function PersonRow({
  name,
  role,
  amount,
  accent,
}: {
  name: string;
  role: string;
  amount: string;
  accent: 'rose' | 'sky';
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-ink-200 bg-white px-2.5 py-2">
      <span
        aria-hidden
        className={cn(
          'grid size-8 place-items-center rounded-full text-[0.6875rem] font-bold',
          accent === 'rose' ? 'bg-rose-100 text-rose-700' : 'bg-[#e6f1fb] text-[#1f5f95]',
        )}
      >
        {name.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.75rem] font-semibold text-ink-900">{name}</span>
        <span className="block text-[0.5625rem] text-ink-500">{role}</span>
      </span>
      <span className="tabular text-[0.75rem] font-bold text-ink-900">{amount}</span>
    </div>
  );
}

export function Bubble({
  side,
  children,
}: {
  side: 'user' | 'assistant';
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex', side === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[86%] rounded-2xl px-3 py-2 text-[0.6875rem] leading-relaxed',
          side === 'user'
            ? 'rounded-br-md bg-ink-900 text-white'
            : 'rounded-bl-md border border-ink-200 bg-white text-ink-800',
        )}
      >
        {children}
      </div>
    </div>
  );
}
