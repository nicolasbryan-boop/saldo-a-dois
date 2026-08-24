import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAppError } from '@/lib/errors';
import { requireAdmin } from '@/domains/auth/session';
import { getRuntime } from '@/server/context';
import { loadAdminMetrics, type AdminMetrics } from '@/domains/admin/metrics';
import { Card, SectionTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/primitives';
import { Logo } from '@/components/marketing/logo';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/cn';
import { ShieldCheck } from 'lucide-react';

export const metadata: Metadata = { title: 'Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const EVENT_LABELS: Record<string, string> = {
  landing_view: 'Visitas na landing',
  pricing_view: 'Viram o preço',
  checkout_started: 'Iniciaram o checkout',
  account_created: 'Criaram conta',
  onboarding_started: 'Começaram o onboarding',
  onboarding_completed: 'Concluíram o onboarding',
  partner_invited: 'Convidaram o parceiro',
  partner_joined: 'Parceiro entrou',
  transaction_created: 'Lançamentos criados',
  assistant_used: 'Usos do assistente',
  goal_created: 'Metas criadas',
  pwa_installed: 'Instalaram o app',
};

export default async function AdminPage() {
  let metrics: AdminMetrics;

  try {
    await requireAdmin();
    const { db } = await getRuntime();
    metrics = await loadAdminMetrics(db);
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === 'unauthenticated') redirect('/entrar?proximo=/admin');
      if (error.code === 'password_change_required') redirect('/trocar-senha');
      if (error.code === 'forbidden') redirect('/app');
    }
    throw error;
  }

  const biggestFunnel = Math.max(1, ...metrics.funnel.map((item) => item.count));

  return (
    <div className="min-h-dvh bg-cream-100">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 lg:px-8">
          <div className="flex items-center gap-2.5">
            <Logo className="size-7" />
            <span className="font-display text-lg font-semibold text-ink-900">Admin</span>
          </div>
          <Link href="/app" className="text-sm font-semibold text-rose-600">
            Voltar ao app
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-5 py-8 lg:px-8">
        <Card className="flex items-start gap-3.5 p-5">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-money-in" />
          <p className="text-sm leading-relaxed text-ink-700">
            Esta área mostra apenas números agregados. Nenhum lançamento, descrição, saldo
            ou mensagem de assistente de um casal específico é exibido aqui — nem existe
            rota para isso. Uma ferramenta de suporte que precise disso teria de ser
            desenhada à parte, com consentimento e auditoria.
          </p>
        </Card>

        <section>
          <SectionTitle>Pessoas e espaços</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Usuários" value={metrics.users.total} />
            <Stat label="Novos (7 dias)" value={metrics.users.last7Days} />
            <Stat label="Novos (30 dias)" value={metrics.users.last30Days} />
            <Stat label="Espaços" value={metrics.households.total} />
            <Stat label="Onboarding feito" value={metrics.households.onboarded} />
            <Stat label="Com parceiro" value={metrics.households.withPartner} />
            <Stat label="Checkouts iniciados" value={metrics.checkouts.started} />
            <Stat label="Checkouts pagos" value={metrics.checkouts.paid} />
          </div>
        </section>

        <section>
          <SectionTitle>Assinaturas</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Ativas" value={metrics.subscriptions.active} tone="in" />
            <Stat label="Pendentes" value={metrics.subscriptions.pending} />
            <Stat label="Em atraso" value={metrics.subscriptions.pastDue} tone="hold" />
            <Stat label="Canceladas" value={metrics.subscriptions.canceled} tone="out" />
            <Stat label="Expiradas" value={metrics.subscriptions.expired} tone="out" />
            <Stat
              label="Receita recorrente"
              value={formatBRL(metrics.subscriptions.mrrCents)}
              tone="in"
            />
          </div>
        </section>

        <section>
          <SectionTitle>Uso</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Lançamentos" value={metrics.activity.transactions} />
            <Stat label="Lançamentos (7 dias)" value={metrics.activity.transactionsLast7Days} />
            <Stat label="Mensagens ao assistente" value={metrics.assistant.messages} />
            <Stat label="Tokens de IA consumidos" value={metrics.assistant.tokensUsed} />
          </div>

          <Card className="mt-3 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-ink-800">
                Interpretação sem chamar IA
              </p>
              <Badge tone={metrics.assistant.localShare > 0.7 ? 'positive' : 'warning'}>
                {Math.round(metrics.assistant.localShare * 100)}%
              </Badge>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-money-in"
                style={{ width: `${Math.round(metrics.assistant.localShare * 100)}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-ink-500">
              {metrics.assistant.localCalls} resolvidas pelo parser local ·{' '}
              {metrics.assistant.aiCalls} enviadas ao modelo. Quanto maior a barra, menor o
              custo de IA.
            </p>
          </Card>
        </section>

        <section>
          <SectionTitle>Funil de produto</SectionTitle>
          <Card className="p-5">
            <ul className="space-y-3">
              {metrics.funnel.map((item) => (
                <li key={item.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink-700">
                      {EVENT_LABELS[item.name] ?? item.name}
                    </span>
                    <span className="tabular text-sm font-semibold text-ink-900">
                      {item.count}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-ink-700"
                      style={{ width: `${Math.round((item.count / biggestFunnel) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <SectionTitle>Erros recentes</SectionTitle>
          {metrics.errors.length === 0 ? (
            <Card className="p-5 text-sm text-ink-600">Nenhum erro registrado.</Card>
          ) : (
            <Card className="divide-y divide-ink-100">
              {metrics.errors.map((error) => (
                <div key={error.id} className="px-5 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs text-ink-500">{error.scope}</span>
                    <span className="text-xs text-ink-400">
                      {new Date(error.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-800">{error.message}</p>
                </div>
              ))}
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  tone?: 'neutral' | 'in' | 'out' | 'hold';
}) {
  const colors = {
    neutral: 'text-ink-900',
    in: 'text-money-in',
    out: 'text-money-out',
    hold: 'text-[#8a5b02]',
  };

  return (
    <Card className="p-4">
      <p className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </p>
      <p className={cn('tabular mt-1.5 text-xl font-semibold', colors[tone])}>{value}</p>
    </Card>
  );
}
