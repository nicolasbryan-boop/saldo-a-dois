import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import {
  ArrowDown,
  ArrowRight,
  Check,
  MessageCircle,
  Wallet,
  Target,
  Repeat,
  BarChart3,
  ShieldCheck,
  Lock,
  EyeOff,
  Smartphone,
  Users,
  Sparkles,
  CalendarClock,
} from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { PhoneMock } from './phone-mock';
import { DashboardMockScreen, ChatMockScreen, CoupleMockScreen } from './mock-screens';
import { branding, pricing } from '@/config';
import { formatBRL } from '@/lib/money';

const PRICE = formatBRL(pricing.plan.priceCents);

/* ========================================================================== */
/* Shared bits                                                                */
/* ========================================================================== */

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-xs font-bold uppercase tracking-[0.18em] text-rose-500',
        className,
      )}
    >
      {children}
    </p>
  );
}

function Section({
  id,
  children,
  className,
  tone = 'cream',
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  tone?: 'cream' | 'white' | 'ink';
}) {
  const tones = {
    cream: 'bg-cream-100 text-ink-900',
    white: 'bg-white text-ink-900',
    ink: 'bg-ink-900 text-white',
  };

  return (
    <section
      id={id}
      className={cn('scroll-mt-20 px-5 py-20 sm:py-24 lg:px-8 lg:py-28', tones[tone], className)}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/* ========================================================================== */
/* 2 — Hero                                                                    */
/* ========================================================================== */

export function Hero() {
  return (
    <section className="grain relative overflow-hidden bg-cream-100 px-5 pb-20 pt-10 lg:px-8 lg:pb-28 lg:pt-16">
      {/* Soft brand wash behind the headline */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 size-[34rem] rounded-full bg-rose-100/60 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-40 size-[26rem] rounded-full bg-[#e6f6f0]/70 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-600 shadow-soft">
            <span aria-hidden>{branding.glyph}</span>
            Feito para duas pessoas, uma conta só
          </span>

          <h1 className="mt-6 font-display text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-ink-900 text-balance-pretty sm:text-[3.25rem] lg:text-[3.75rem]">
            Vocês ganham dinheiro.
            <br />
            <span className="text-rose-500">Mas sabem quanto</span> realmente podem gastar?
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600 text-balance-pretty">
            Uma IA para organizar as finanças do casal e mostrar quanto do dinheiro está
            realmente livre depois das contas, gastos e metas.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#dor"
              className="group inline-flex h-14 items-center justify-center gap-2.5 rounded-lg bg-ink-900 px-7 text-base font-semibold text-white shadow-lift transition-colors hover:bg-ink-800"
            >
              Ver como funciona
              <ArrowDown
                aria-hidden
                className="size-4 transition-transform duration-300 group-hover:translate-y-0.5"
              />
            </a>
            <Link
              href="/entrar"
              className="inline-flex h-14 items-center justify-center rounded-lg border border-ink-200 bg-white px-7 text-base font-semibold text-ink-800 transition-colors hover:bg-cream-50"
            >
              Já sou assinante
            </Link>
          </div>

          <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <Check aria-hidden className="size-4 text-money-in" />
              Sem conectar banco
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check aria-hidden className="size-4 text-money-in" />
              Instala no celular
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check aria-hidden className="size-4 text-money-in" />
              Cancela quando quiser
            </span>
          </p>
        </div>

        <div className="animate-rise [animation-delay:120ms]">
          <PhoneMock label="Tela inicial do aplicativo mostrando o valor livre para gastar">
            <HeroScreen />
          </PhoneMock>
        </div>
      </div>
    </section>
  );
}

function HeroScreen() {
  return (
    <>
      <div className="flex items-center gap-2 text-[0.6875rem] font-semibold text-ink-600">
        <span aria-hidden>{branding.glyph}</span>
        <span>Ana &amp; Lucas</span>
      </div>

      <div className="mt-4 rounded-xl bg-ink-900 p-5 text-white shadow-lift">
        <p className="text-[0.5625rem] font-bold uppercase tracking-[0.2em] text-white/60">
          Livre para gastar
        </p>
        <p className="tabular mt-1.5 font-display text-[2.35rem] font-semibold leading-none">
          R$ 2.847,50
        </p>
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-[62%] rounded-full bg-rose-400" />
        </div>
        <p className="mt-2.5 text-[0.6875rem] font-medium text-white/70">
          R$ 94,91 por dia até o fim do ciclo
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <HeroRow
          label="Próxima conta"
          value="Aluguel — R$ 1.850,00"
          meta="vence dia 10"
          tone="out"
        />
        <HeroRow
          label="Próxima entrada"
          value="Salário — R$ 4.500,00"
          meta="entra dia 05"
          tone="in"
        />
      </div>

      <div className="mt-4 rounded-xl border border-ink-200 bg-white p-3">
        <p className="text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-ink-500">
          Você disse
        </p>
        <p className="mt-1.5 text-[0.75rem] font-medium text-ink-800">
          “Gastei 120 no mercado.”
        </p>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-cream-100 px-2.5 py-2">
          <span aria-hidden className="text-sm">🛒</span>
          <span className="flex-1 text-[0.6875rem] font-semibold text-ink-800">Mercado</span>
          <span className="tabular text-[0.6875rem] font-bold text-ink-900">− R$ 120,00</span>
        </div>
      </div>
    </>
  );
}

function HeroRow({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone: 'in' | 'out';
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-3 py-2.5">
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          tone === 'in' ? 'bg-money-in' : 'bg-money-out',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.5rem] font-bold uppercase tracking-[0.12em] text-ink-500">
          {label}
        </span>
        <span className="block truncate text-[0.75rem] font-semibold text-ink-900">{value}</span>
      </span>
      <span className="shrink-0 text-[0.5625rem] font-medium text-ink-500">{meta}</span>
    </div>
  );
}

/* ========================================================================== */
/* 3 + 4 — A dor / "onde foi parar nosso dinheiro?"                            */
/* ========================================================================== */

const SPENDING_TRAIL = [
  { label: 'Mercado', value: 'R$ 186' },
  { label: 'Gasolina', value: 'R$ 89' },
  { label: 'Pix pro amigo', value: 'R$ 150' },
  { label: 'Delivery', value: 'R$ 59' },
  { label: 'Cartão', value: 'R$ 740' },
  { label: 'Roupa', value: 'R$ 219' },
  { label: 'Farmácia', value: 'R$ 74' },
  { label: 'Uber', value: 'R$ 32' },
  { label: 'Padaria', value: 'R$ 28' },
  { label: 'Streaming', value: 'R$ 55' },
];

export function PainSection() {
  return (
    <Section id="dor" tone="white">
      <div className="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-16">
        <Reveal>
          <Eyebrow>Todo mês começa igual</Eyebrow>
          <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] text-ink-900 sm:text-[2.75rem]">
            “Esse mês a gente vai controlar.”
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-600">
            E aí a vida acontece. Mercado, gasolina, um Pix aqui, um delivery ali, a fatura
            do cartão, uma roupa, as contas, os pequenos gastos que ninguém anota.
          </p>

          <ul className="mt-7 flex flex-wrap gap-2">
            {SPENDING_TRAIL.map((item, index) => (
              <li
                key={item.label}
                className="reveal is-visible rounded-full border border-ink-200 bg-cream-100 px-3.5 py-1.5 text-sm font-medium text-ink-700"
                style={{ transitionDelay: `${index * 45}ms` }}
              >
                {item.label} <span className="tabular text-ink-500">{item.value}</span>
              </li>
            ))}
          </ul>

          <p className="mt-9 font-display text-[1.75rem] font-semibold leading-snug tracking-[-0.02em] text-ink-900 sm:text-[2.25rem]">
            Até chegar aquela pergunta:
            <br />
            <span className="text-rose-500">“Mas onde foi parar nosso dinheiro?”</span>
          </p>
        </Reveal>

        <Reveal delay={120}>
          <figure className="relative">
            <div className="overflow-hidden rounded-2xl shadow-hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/casal-contas.jpg"
                alt="Casal sentado à mesa da cozinha olhando contas e recibos"
                width={1200}
                height={892}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
            <figcaption className="absolute -bottom-6 left-1/2 w-[86%] -translate-x-1/2 rounded-xl border border-ink-200 bg-white p-4 shadow-lift">
              <p className="text-[0.9375rem] font-semibold leading-snug text-ink-900">
                O problema não é apenas saber quanto tem na conta.
              </p>
              <p className="mt-1 text-[0.9375rem] leading-snug text-ink-600">
                É saber quanto daquele dinheiro vocês realmente podem usar.
              </p>
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </Section>
  );
}

/* ========================================================================== */
/* 5 — O conceito de dinheiro livre                                            */
/* ========================================================================== */

const BREAKDOWN = [
  { label: 'No banco', value: 'R$ 8.450,00', tone: 'neutral' as const },
  { label: 'Contas que ainda faltam', value: '− R$ 3.700,00', tone: 'out' as const },
  { label: 'Meta do mês', value: '− R$ 1.000,00', tone: 'hold' as const },
  { label: 'Outros compromissos', value: '− R$ 602,50', tone: 'out' as const },
];

export function FreeMoneySection() {
  return (
    <Section id="livre" tone="cream">
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow>O coração do Saldo a Dois</Eyebrow>
        <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]">
          Não olhe apenas o saldo.
          <br />
          <span className="text-rose-500">Veja o que realmente está livre.</span>
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-600">
          O saldo da conta mente por omissão. Ele não conta que metade já tem dono.
        </p>
      </Reveal>

      <Reveal delay={100} className="mx-auto mt-12 max-w-lg">
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lift">
          <ul>
            {BREAKDOWN.map((row) => (
              <li
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-ink-100 px-6 py-4"
              >
                <span className="text-[0.9375rem] font-medium text-ink-600">{row.label}</span>
                <span
                  className={cn(
                    'tabular text-lg font-semibold',
                    row.tone === 'neutral' && 'text-ink-900',
                    row.tone === 'out' && 'text-money-out',
                    row.tone === 'hold' && 'text-[#8a5b02]',
                  )}
                >
                  {row.value}
                </span>
              </li>
            ))}
          </ul>

          <div className="bg-ink-900 px-6 py-7 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
              Livre para gastar
            </p>
            <p className="tabular mt-2 font-display text-[2.75rem] font-semibold leading-none sm:text-[3.25rem]">
              R$ 3.147,50
            </p>
            <p className="mt-3 text-sm text-white/70">
              É esse número que responde “dá pra pedir pizza hoje?”.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-sm leading-relaxed text-ink-500">
          E se ficar negativo, o app mostra negativo. Vocês precisam ver isso.
        </p>
      </Reveal>
    </Section>
  );
}

/* ========================================================================== */
/* 6 — Mockup do dashboard                                                     */
/* ========================================================================== */

export function DashboardSection() {
  return (
    <Section tone="ink" className="grain">
      <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <Eyebrow className="text-rose-400">O painel de vocês</Eyebrow>
          <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] text-white sm:text-[2.5rem]">
            Tudo o que importa cabe em uma tela.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            Abriu o app, já sabe: quanto tem, quanto já tem dono, quanto pode gastar hoje e
            o que entra em seguida. Sem planilha, sem gráfico que ninguém entende.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              ['Livre para gastar', 'A métrica principal, sempre no topo.'],
              ['Limite diário sugerido', 'O livre dividido pelos dias que faltam no ciclo.'],
              ['Próxima conta e próxima entrada', 'Para não ser pego de surpresa.'],
              ['Últimos movimentos', 'Quem lançou, quando e em qual categoria.'],
            ].map(([title, description]) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-rose-500/20">
                  <Check aria-hidden className="size-3 text-rose-400" />
                </span>
                <span>
                  <span className="block font-semibold text-white">{title}</span>
                  <span className="block text-[0.9375rem] text-white/60">{description}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <PhoneMock label="Painel do aplicativo com saldo, comprometido, meta e movimentos">
            <DashboardMockScreen />
          </PhoneMock>
        </Reveal>
      </div>
    </Section>
  );
}

/* ========================================================================== */
/* 7 — Como funciona                                                           */
/* ========================================================================== */

const STEPS = [
  {
    number: '01',
    title: 'Contem sobre vocês',
    description:
      'Quanto cada um ganha e quando recebe, as contas fixas, quanto querem guardar e quanto têm hoje. Leva uns três minutos.',
    icon: Users,
  },
  {
    number: '02',
    title: 'Depois é só conversar',
    description:
      '“Gastei 120 no mercado.” “Paguei 89 de gasolina.” “Recebi mais 500 hoje.” O assistente entende e registra.',
    icon: MessageCircle,
  },
  {
    number: '03',
    title: 'O aplicativo faz o resto',
    description:
      'Saldo, compromissos, despesas, metas, dinheiro livre e limite diário — recalculados a cada lançamento.',
    icon: Sparkles,
  },
];

export function HowItWorksSection() {
  return (
    <Section id="como-funciona" tone="white">
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow>Como funciona</Eyebrow>
        <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]">
          Três passos e vocês nunca mais perguntam onde o dinheiro foi.
        </h2>
      </Reveal>

      <ol className="mt-14 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Reveal as="li" key={step.number} delay={index * 110}>
            <div className="flex h-full flex-col rounded-2xl border border-ink-200 bg-cream-50 p-7 transition-shadow duration-300 hover:shadow-lift">
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-full bg-ink-900 text-white">
                  <step.icon aria-hidden className="size-5" />
                </span>
                <span className="font-display text-3xl font-semibold text-ink-200">
                  {step.number}
                </span>
              </div>
              <h3 className="mt-6 font-display text-xl font-semibold text-ink-900">
                {step.title}
              </h3>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-600">
                {step.description}
              </p>
            </div>
          </Reveal>
        ))}
      </ol>

      <Reveal delay={200} className="mt-14">
        <figure className="overflow-hidden rounded-2xl shadow-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/casal-cozinha.jpg"
            alt="Casal conversando na cozinha enquanto prepara uma refeição"
            width={1200}
            height={675}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </figure>
      </Reveal>
    </Section>
  );
}

/* ========================================================================== */
/* 8 + 9 — Demonstração do chat                                                */
/* ========================================================================== */

export function ChatSection() {
  return (
    <Section tone="cream">
      <div className="grid items-center gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <Reveal>
          <PhoneMock label="Conversa com o assistente registrando um gasto no mercado">
            <ChatMockScreen />
          </PhoneMock>
        </Reveal>

        <Reveal delay={120}>
          <Eyebrow>Conversa, não formulário</Eyebrow>
          <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]">
            Escreva como você falaria.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-600">
            Ninguém abre um app de finanças para preencher campo. Aqui você conta o que
            aconteceu e pronto.
          </p>

          <div className="mt-8 space-y-3">
            <ExampleLine input="Gastei 120 no mercado" output="🛒 Mercado · R$ 120,00" />
            <ExampleLine input="Paguei 87 de gasolina" output="⛽ Transporte · R$ 87,00" />
            <ExampleLine input="59 no iFood" output="🛵 Delivery · R$ 59,00" />
            <ExampleLine input="Recebi meu salário de 4500" output="💰 Salário · + R$ 4.500,00" />
          </div>

          <div className="mt-8 rounded-xl border border-ink-200 bg-white p-5">
            <p className="text-sm font-semibold text-ink-900">
              E a conta quem faz é o sistema, não a IA.
            </p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">
              A inteligência artificial serve para entender a frase. Todo cálculo de saldo,
              compromisso e limite roda no servidor, com os números que vocês registraram.
              Nenhum valor é inventado por um modelo.
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

function ExampleLine({ input, output }: { input: string; output: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ink-200 bg-white p-4 sm:flex-row sm:items-center sm:gap-4">
      <p className="flex-1 text-[0.9375rem] font-medium text-ink-800">“{input}”</p>
      <ArrowRight aria-hidden className="hidden size-4 shrink-0 text-ink-300 sm:block" />
      <p className="tabular shrink-0 rounded-full bg-cream-100 px-3 py-1.5 text-sm font-semibold text-ink-900">
        {output}
      </p>
    </div>
  );
}

/* ========================================================================== */
/* 10 — Dashboard do casal                                                     */
/* ========================================================================== */

export function CoupleDashboardSection() {
  return (
    <Section id="para-dois" tone="white">
      <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <Eyebrow>Um espaço, duas pessoas</Eyebrow>
          <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]">
            Os dois veem exatamente a mesma coisa.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-600">
            Um lança pelo celular dele, o outro vê no celular dela. Sem print de planilha no
            WhatsApp, sem “depois eu te falo quanto foi”.
          </p>

          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <p className="font-display text-lg font-semibold text-rose-700">
              Isso não é vigilância.
            </p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-rose-700/85">
              O Saldo a Dois mostra os gastos de cada um porque a conta é dos dois — não
              para ninguém ficar cobrando ninguém. A ideia é organizar junto.
            </p>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4">
            {[
              ['Gasto da Ana', 'R$ 1.240,00'],
              ['Gasto do Lucas', 'R$ 1.010,00'],
              ['Casa / compartilhado', 'R$ 2.960,00'],
              ['Guardado no mês', 'R$ 1.000,00'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-ink-200 bg-cream-50 p-4">
                <dt className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
                  {label}
                </dt>
                <dd className="tabular mt-1.5 text-xl font-semibold text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal delay={120}>
          <PhoneMock label="Tela do casal com gastos de cada pessoa e do espaço compartilhado">
            <CoupleMockScreen />
          </PhoneMock>
        </Reveal>
      </div>
    </Section>
  );
}

/* ========================================================================== */
/* 11 — Benefícios                                                             */
/* ========================================================================== */

const BENEFITS = [
  {
    icon: Wallet,
    title: 'Livre para gastar',
    description:
      'A única métrica que vocês precisam olhar antes de decidir qualquer coisa.',
  },
  {
    icon: CalendarClock,
    title: 'Limite por dia',
    description:
      'O dinheiro livre dividido pelos dias que faltam até a próxima entrada.',
  },
  {
    icon: MessageCircle,
    title: 'Lançamento por conversa',
    description: 'Escreveu, registrou. Sem menu, sem categoria obrigatória, sem fricção.',
  },
  {
    icon: Repeat,
    title: 'Contas que se repetem',
    description: 'Aluguel, luz, internet, escola. Cadastra uma vez, aparece todo ciclo.',
  },
  {
    icon: Target,
    title: 'Metas de verdade',
    description: 'Quanto querem juntar, quanto já juntaram e quanto falta este mês.',
  },
  {
    icon: BarChart3,
    title: 'Relatório do casal',
    description: 'O fechamento do mês, com comparação com o ciclo anterior.',
  },
  {
    icon: Smartphone,
    title: 'Instala no celular',
    description: 'Adicione à tela inicial e use como um aplicativo, com ícone próprio.',
  },
  {
    icon: ShieldCheck,
    title: 'Só de vocês',
    description: 'Cada casal enxerga apenas o próprio espaço. Sempre verificado no servidor.',
  },
];

export function BenefitsSection() {
  return (
    <Section tone="cream">
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow>O que vem junto</Eyebrow>
        <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]">
          Simples de usar. Sério por dentro.
        </h2>
      </Reveal>

      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map((benefit, index) => (
          <Reveal as="li" key={benefit.title} delay={(index % 4) * 80}>
            <div className="flex h-full flex-col rounded-xl border border-ink-200 bg-white p-6 transition-transform duration-300 hover:-translate-y-1">
              <benefit.icon aria-hidden className="size-5 text-rose-500" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink-900">
                {benefit.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {benefit.description}
              </p>
            </div>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}

/* ========================================================================== */
/* 12 — Contas e recorrências                                                  */
/* ========================================================================== */

const BILLS = [
  { name: 'Aluguel', day: '10', value: 'R$ 1.850,00', paid: false },
  { name: 'Energia', day: '12', value: 'R$ 320,00', paid: true },
  { name: 'Internet', day: '15', value: 'R$ 120,00', paid: false },
  { name: 'Escola', day: '20', value: 'R$ 800,00', paid: false },
  { name: 'Academia', day: '25', value: 'R$ 240,00', paid: false },
];

export function BillsSection() {
  return (
    <Section tone="white">
      <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <Eyebrow>Contas e recorrências</Eyebrow>
          <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.5rem]">
            O que ainda falta pagar já sai do dinheiro livre.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-600">
            Cadastre uma vez o aluguel, a luz, a internet, a escola. Todo ciclo elas
            reaparecem sozinhas, na data certa — e sem nunca duplicar.
          </p>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-500">
            Quando vocês marcam como paga, ela vira um movimento de verdade e sai da lista
            de compromissos.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lift">
            <div className="flex items-baseline justify-between border-b border-ink-200 bg-cream-50 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">
                Contas do ciclo
              </p>
              <p className="tabular text-sm font-bold text-money-out">− R$ 3.010,00</p>
            </div>
            <ul className="divide-y divide-ink-100">
              {BILLS.map((bill) => (
                <li key={bill.name} className="flex items-center gap-3 px-5 py-3.5">
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full text-[0.6875rem] font-bold',
                      bill.paid
                        ? 'bg-money-in-soft text-[#0b7a55]'
                        : 'bg-cream-200 text-ink-600',
                    )}
                  >
                    {bill.paid ? <Check aria-hidden className="size-3.5" /> : bill.day}
                  </span>
                  <span className="flex-1">
                    <span
                      className={cn(
                        'block text-[0.9375rem] font-semibold',
                        bill.paid ? 'text-ink-400 line-through' : 'text-ink-900',
                      )}
                    >
                      {bill.name}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {bill.paid ? 'Paga' : `Vence dia ${bill.day}`}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'tabular text-[0.9375rem] font-bold',
                      bill.paid ? 'text-ink-400' : 'text-ink-900',
                    )}
                  >
                    {bill.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ========================================================================== */
/* 13 — Metas                                                                  */
/* ========================================================================== */

export function GoalsSection() {
  return (
    <Section tone="cream">
      <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <div className="rounded-2xl border border-ink-200 bg-white p-7 shadow-lift">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">
                  Meta
                </p>
                <h3 className="mt-1 font-display text-2xl font-semibold text-ink-900">
                  Reserva de emergência
                </h3>
              </div>
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-rose-100">
                <Target aria-hidden className="size-5 text-rose-600" />
              </span>
            </div>

            <div className="mt-7 flex items-baseline gap-2">
              <span className="tabular font-display text-[2.25rem] font-semibold text-ink-900">
                R$ 6.500
              </span>
              <span className="text-sm font-medium text-ink-500">de R$ 20.000</span>
            </div>

            <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
              <div className="h-full w-[32.5%] rounded-full bg-rose-500" />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-ink-100 pt-5">
              <div>
                <dt className="text-xs font-semibold text-ink-500">Aporte planejado</dt>
                <dd className="tabular mt-1 text-lg font-semibold text-ink-900">
                  R$ 1.000/mês
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ink-500">Falta</dt>
                <dd className="tabular mt-1 text-lg font-semibold text-ink-900">R$ 13.500</dd>
              </div>
            </dl>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <Eyebrow>Metas</Eyebrow>
          <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.5rem]">
            Guardar deixa de ser “o que sobrar”.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-600">
            O quanto vocês querem guardar sai da conta antes, junto com as contas fixas. O
            que aparece como livre já é o dinheiro depois da reserva.
          </p>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-500">
            Uma observação honesta: uma meta aqui é organização de vocês, não uma conta
            separada em um banco. O Saldo a Dois não movimenta dinheiro.
          </p>
        </Reveal>
      </div>
    </Section>
  );
}

/* ========================================================================== */
/* 14 — Relatório mensal                                                       */
/* ========================================================================== */

const REPORT_CATEGORIES = [
  { name: 'Moradia', value: 'R$ 1.850', percent: 30 },
  { name: 'Mercado', value: 'R$ 1.200', percent: 20 },
  { name: 'Alimentação', value: 'R$ 740', percent: 12 },
  { name: 'Transporte', value: 'R$ 610', percent: 10 },
  { name: 'Educação', value: 'R$ 800', percent: 13 },
];

export function ReportSection() {
  return (
    <Section tone="white">
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow>Fechamento do mês</Eyebrow>
        <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]">
          No fim do ciclo, a conversa muda.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-600">
          Em vez de “onde foi parar?”, vira “foi aqui, e no mês que vem a gente ajusta
          isso”.
        </p>
      </Reveal>

      <Reveal delay={120} className="mx-auto mt-12 max-w-3xl">
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-cream-50 shadow-lift">
          <div className="border-b border-ink-200 bg-white px-7 py-5">
            <p className="font-display text-2xl font-semibold text-ink-900">Agosto</p>
            <p className="mt-1 text-sm text-ink-500">05/08 a 04/09</p>
          </div>

          <dl className="grid grid-cols-2 gap-px bg-ink-200 sm:grid-cols-4">
            {[
              ['Receberam', 'R$ 9.500', 'text-money-in'],
              ['Gastaram', 'R$ 6.120', 'text-ink-900'],
              ['Reservaram', 'R$ 1.000', 'text-[#8a5b02]'],
              ['Resultado', 'R$ 2.380', 'text-money-in'],
            ].map(([label, value, tone]) => (
              <div key={label} className="bg-white px-5 py-5">
                <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-500">
                  {label}
                </dt>
                <dd className={cn('tabular mt-1.5 text-xl font-semibold', tone)}>{value}</dd>
              </div>
            ))}
          </dl>

          <div className="px-7 py-7">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">
              Principais categorias
            </p>
            <ul className="mt-4 space-y-3.5">
              {REPORT_CATEGORIES.map((category) => (
                <li key={category.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.9375rem] font-medium text-ink-800">
                      {category.name}
                    </span>
                    <span className="tabular text-[0.9375rem] font-semibold text-ink-900">
                      {category.value}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-ink-800"
                      style={{ width: `${category.percent}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-6 rounded-lg bg-money-in-soft px-4 py-3 text-sm font-medium text-[#0b7a55]">
              Vocês gastaram R$ 310 a menos que no ciclo anterior.
            </p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/* ========================================================================== */
/* 15 — Segurança e privacidade                                                */
/* ========================================================================== */

const SECURITY = [
  {
    icon: Lock,
    title: 'Senha nunca guardada em texto',
    description:
      'Autenticação com hash seguro, sessão em cookie protegido e HTTPS obrigatório.',
  },
  {
    icon: EyeOff,
    title: 'Nada de conta bancária',
    description:
      'O Saldo a Dois não conecta banco, não faz Pix e não movimenta dinheiro. Os números vêm do que vocês registram.',
  },
  {
    icon: ShieldCheck,
    title: 'Cada casal no seu espaço',
    description:
      'Toda leitura e escrita confere no servidor se você faz parte daquele espaço. Não existe “passar o id na URL”.',
  },
];

export function SecuritySection() {
  return (
    <Section tone="ink" className="grain">
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow className="text-rose-400">Segurança e privacidade</Eyebrow>
        <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] text-white sm:text-[2.75rem]">
          É dinheiro. E é de vocês dois.
        </h2>
      </Reveal>

      <ul className="mt-14 grid gap-5 md:grid-cols-3">
        {SECURITY.map((item, index) => (
          <Reveal as="li" key={item.title} delay={index * 110}>
            <div className="h-full rounded-xl border border-white/10 bg-white/5 p-7">
              <item.icon aria-hidden className="size-5 text-rose-400" />
              <h3 className="mt-4 font-display text-lg font-semibold text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/65">
                {item.description}
              </p>
            </div>
          </Reveal>
        ))}
      </ul>

      <Reveal delay={200} className="mt-10 text-center">
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-white/50">
          Vocês podem apagar a conta e o espaço financeiro quando quiserem.{' '}
          <Link href="/privacidade" className="link-underline text-white/80">
            Política de Privacidade
          </Link>{' '}
          e{' '}
          <Link href="/termos" className="link-underline text-white/80">
            Termos de Uso
          </Link>
          .
        </p>
      </Reveal>
    </Section>
  );
}

/* ========================================================================== */
/* 16 — Feito para dois                                                        */
/* ========================================================================== */

export function MadeForTwoSection() {
  return (
    <Section tone="cream">
      <div className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <Reveal>
          <figure className="overflow-hidden rounded-2xl shadow-hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/casal-planejando.jpg"
              alt="Casal sorrindo na cozinha enquanto olha o notebook com uma xícara de café"
              width={900}
              height={1350}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </figure>
        </Reveal>

        <Reveal delay={120}>
          <Eyebrow>Feito para dois</Eyebrow>
          <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]">
            Dinheiro de casal não cabe em app individual.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-600">
            A maioria dos aplicativos financeiros foi feita para uma pessoa só. Aí o casal
            improvisa: uma planilha compartilhada, um caderno, um print no WhatsApp, e a
            conversa sempre volta pro mesmo lugar.
          </p>

          <ul className="mt-8 space-y-3.5">
            {[
              'Uma assinatura cobre as duas pessoas.',
              'Cada um entra com o próprio e-mail e a própria senha.',
              'Os dois lançam, os dois consultam, os dois enxergam o mesmo número.',
              'Quem criou o espaço cuida da assinatura e de quem tem acesso.',
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-money-in" />
                <span className="text-[1.0625rem] leading-snug text-ink-700">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}

/* ========================================================================== */
/* 17 — Preço                                                                  */
/* ========================================================================== */

export function PricingSection() {
  return (
    <Section id="preco" tone="white">
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow>Preço</Eyebrow>
        <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]">
          Um plano. Duas pessoas. Sem pegadinha.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-600">
          Menos que um delivery por mês para os dois pararem de brigar com planilha.
        </p>
      </Reveal>

      <Reveal delay={120} className="mx-auto mt-12 max-w-md">
        <div className="overflow-hidden rounded-2xl border-2 border-ink-900 bg-white shadow-hero">
          <div className="bg-ink-900 px-8 py-8 text-center text-white">
            <p className="font-display text-2xl font-semibold">{pricing.plan.name}</p>
            <p className="mt-4 flex items-baseline justify-center gap-1.5">
              <span className="tabular font-display text-[3.25rem] font-semibold leading-none">
                {PRICE}
              </span>
              <span className="text-base font-medium text-white/60">/mês</span>
            </p>
            <p className="mt-3 text-sm text-white/70">
              por casal · {pricing.plan.maxMembers} pessoas inclusas
            </p>
          </div>

          <ul className="space-y-3 px-8 py-8">
            {pricing.plan.features.map((feature) => (
              <li key={feature} className="flex gap-3">
                <Check aria-hidden className="mt-0.5 size-4.5 shrink-0 text-money-in" />
                <span className="text-[0.9375rem] leading-snug text-ink-700">{feature}</span>
              </li>
            ))}
          </ul>

          <div className="border-t border-ink-200 px-8 py-7">
            <Link
              href="/checkout"
              className="flex h-14 w-full items-center justify-center rounded-lg bg-rose-500 text-base font-semibold text-white shadow-soft transition-colors hover:bg-rose-600"
            >
              Começar por {PRICE}
            </Link>
            <p className="mt-4 text-center text-xs leading-relaxed text-ink-500">
              Cobrança mensal. Cancele quando quiser, direto no aplicativo.
            </p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/* ========================================================================== */
/* 18 — FAQ                                                                    */
/* ========================================================================== */

const FAQ = [
  {
    question: 'Preciso conectar minha conta bancária?',
    answer:
      'Não. O Saldo a Dois não se conecta a banco nenhum. Vocês informam quanto têm hoje, quanto entra e quanto sai, e o aplicativo cuida das contas. Isso significa que o saldo mostrado é o que vocês registraram aqui — não o extrato do banco.',
  },
  {
    question: 'Meu parceiro precisa pagar outra assinatura?',
    answer:
      `Não. Uma assinatura de ${PRICE} por mês cobre as duas pessoas do casal. Quem criou o espaço convida a outra pessoa, que entra com o próprio e-mail e a própria senha.`,
  },
  {
    question: 'Os dois conseguem usar ao mesmo tempo?',
    answer:
      'Sim. Cada um usa o próprio celular, com a própria conta. Um lançamento feito por uma pessoa aparece para a outra assim que ela abrir ou atualizar o aplicativo.',
  },
  {
    question: 'Posso cancelar?',
    answer:
      'Pode, a qualquer momento, direto no aplicativo. O acesso continua até o fim do período que já foi pago e não há multa nem fidelidade.',
  },
  {
    question: 'Funciona no celular?',
    answer:
      'Funciona, e foi desenhado pensando primeiro no celular. Também funciona no computador, com um layout adaptado para telas grandes.',
  },
  {
    question: 'Preciso baixar na App Store?',
    answer:
      'Não. O Saldo a Dois é um aplicativo web instalável (PWA): abra pelo navegador, escolha “Adicionar à tela de início” e ele passa a abrir como aplicativo, com ícone próprio e em tela cheia.',
  },
  {
    question: 'A IA movimenta meu dinheiro?',
    answer:
      'Não, e ela nem faz as contas. O papel da inteligência artificial é entender a frase que vocês escrevem e transformar em um lançamento. Todos os cálculos de saldo, compromissos e limite rodam no servidor, com regras fixas, sobre os dados que vocês registraram.',
  },
  {
    question: 'Meus dados ficam visíveis para outros usuários?',
    answer:
      'Não. Cada espaço financeiro é isolado, e toda leitura confere no servidor se a pessoa autenticada pertence àquele espaço. Nenhum outro casal consegue ver os seus lançamentos.',
  },
];

export function FaqSection() {
  return (
    <Section id="faq" tone="cream">
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow>Dúvidas</Eyebrow>
        <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]">
          O que as pessoas perguntam antes de começar.
        </h2>
      </Reveal>

      <div className="mx-auto mt-12 max-w-3xl space-y-3">
        {FAQ.map((item, index) => (
          <Reveal key={item.question} delay={Math.min(index, 4) * 60}>
            <details className="group rounded-xl border border-ink-200 bg-white transition-colors open:border-ink-300">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left">
                <span className="text-[1.0625rem] font-semibold text-ink-900">
                  {item.question}
                </span>
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-full border border-ink-200 text-ink-500 transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <div className="px-6 pb-6 text-[0.9375rem] leading-relaxed text-ink-600">
                {item.answer}
              </div>
            </details>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ========================================================================== */
/* 19 — CTA final                                                              */
/* ========================================================================== */

export function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden bg-ink-900 px-5 py-20 lg:px-8 lg:py-28">
      <div aria-hidden className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/casal-danca.jpg"
          alt=""
          width={1400}
          height={933}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-900/80 via-ink-900/90 to-ink-900" />
      </div>

      <Reveal className="relative mx-auto max-w-3xl text-center">
        <h2 className="font-display text-[2.25rem] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[3rem]">
          Chega de perguntar para onde o dinheiro foi.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
          Organizem juntos, acompanhem cada gasto e saibam quanto realmente podem usar.
        </p>
        <p className="mt-6 text-base font-semibold text-rose-300">
          {PRICE}/mês por casal.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/checkout"
            className="inline-flex h-14 w-full items-center justify-center rounded-lg bg-rose-500 px-8 text-base font-semibold text-white shadow-lift transition-colors hover:bg-rose-600 sm:w-auto"
          >
            Organizar nossas finanças
          </Link>
          <a
            href="#como-funciona"
            className="inline-flex h-14 w-full items-center justify-center rounded-lg border border-white/25 px-8 text-base font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
          >
            Rever como funciona
          </a>
        </div>

        <p className="mt-7 text-sm text-white/50">
          Sem conectar banco. Sem fidelidade. Cancele quando quiser.
        </p>
      </Reveal>
    </section>
  );
}

