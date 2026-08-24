import { Card, SectionTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/primitives';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/cn';
import type {
  AdminInsights,
  CustomerRow,
  SystemStatus,
} from '@/domains/admin/insights';

/**
 * The operational half of the admin panel: plans, growth, customers, system.
 *
 * Server component with a plain GET form for search, so it works with
 * JavaScript disabled and every state is a shareable URL.
 */

function Stat({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: number | string;
  tone?: 'neutral' | 'in' | 'out' | 'hold';
  hint?: string;
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
      {hint ? <p className="mt-1 text-[11px] text-ink-500">{hint}</p> : null}
    </Card>
  );
}

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-800">{label}</p>
        <p className="truncate text-xs text-ink-500">{detail}</p>
      </div>
      <Badge tone={ok ? 'positive' : 'warning'}>{ok ? 'OK' : 'Pendente'}</Badge>
    </div>
  );
}

export function AdminSections({
  insights,
  customers,
  system,
  search,
}: {
  insights: AdminInsights;
  customers: CustomerRow[];
  system: SystemStatus;
  search: string;
}) {
  const conversion =
    insights.payments.checkoutsStarted > 0
      ? Math.round(
          (insights.payments.checkoutsPaid / insights.payments.checkoutsStarted) * 100,
        )
      : 0;

  const peak = Math.max(
    1,
    ...insights.daily.map((point) => Math.max(point.signups, point.subscriptions)),
  );

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      <section>
        <SectionTitle>Planos</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {insights.plans.map((plan) => (
            <Card key={plan.planId} className="p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">{plan.name}</p>
                <span className="tabular text-xs text-ink-500">
                  {formatBRL(plan.priceCents)}
                </span>
              </div>
              <p className="tabular mt-2 text-2xl font-semibold text-ink-900">
                {plan.active}
              </p>
              <p className="text-[11px] text-ink-500">
                {plan.active === 1 ? 'assinatura ativa' : 'assinaturas ativas'} ·{' '}
                {formatBRL(plan.monthlyCents)}/mês
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section>
        <SectionTitle>Crescimento</SectionTitle>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Novos hoje" value={insights.usersToday} />
          <Stat
            label="Conversão checkout"
            value={`${conversion}%`}
            tone={conversion >= 30 ? 'in' : 'hold'}
            hint={`${insights.payments.checkoutsPaid} de ${insights.payments.checkoutsStarted}`}
          />
          <Stat label="Convites enviados" value={insights.invites.sent} />
          <Stat
            label="Convites aceitos"
            value={insights.invites.accepted}
            tone="in"
            hint={`${insights.invites.pending} pendentes`}
          />
          <Stat label="Casais completos" value={insights.couples.complete} tone="in" />
          <Stat
            label="Casais sozinhos"
            value={insights.couples.solo}
            hint="Ainda sem parceiro(a)"
          />
          <Stat
            label="Pagamentos falhos"
            value={insights.payments.failed}
            tone={insights.payments.failed > 0 ? 'out' : 'neutral'}
          />
        </div>

        <Card className="mt-3 p-5">
          <p className="text-sm font-semibold text-ink-800">Últimos 30 dias</p>
          <p className="mt-1 text-xs text-ink-500">
            Barra escura: cadastros. Barra rosa: assinaturas.
          </p>

          <div className="mt-4 flex h-24 items-end gap-[2px]">
            {insights.daily.map((point) => (
              <div
                key={point.day}
                className="flex flex-1 flex-col justify-end gap-[2px]"
                title={`${point.day}: ${point.signups} cadastros, ${point.subscriptions} assinaturas`}
              >
                <div
                  className="w-full rounded-sm bg-rose-400"
                  style={{ height: `${(point.subscriptions / peak) * 40}%` }}
                />
                <div
                  className="w-full rounded-sm bg-ink-700"
                  style={{ height: `${(point.signups / peak) * 60}%` }}
                />
              </div>
            ))}
          </div>

          <div className="mt-2 flex justify-between text-[10px] text-ink-400">
            <span>{insights.daily[0]?.day}</span>
            <span>{insights.daily[insights.daily.length - 1]?.day}</span>
          </div>
        </Card>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section>
        <SectionTitle>Clientes</SectionTitle>

        <form method="get" className="mb-3 flex gap-2">
          <input
            type="search"
            name="busca"
            defaultValue={search}
            placeholder="Buscar por nome ou e-mail"
            className="h-11 flex-1 rounded-md border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400"
          />
          <button
            type="submit"
            className="h-11 rounded-md bg-ink-900 px-5 text-sm font-semibold text-white"
          >
            Buscar
          </button>
        </form>

        {customers.length === 0 ? (
          <Card className="p-5 text-sm text-ink-600">
            {search ? `Nada encontrado para "${search}".` : 'Nenhum cliente ainda.'}
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-ink-200 text-[11px] uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">Plano</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Membros</th>
                  <th className="px-4 py-3 font-semibold">Cadastro</th>
                  <th className="px-4 py-3 font-semibold">Última atividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {customers.map((customer) => (
                  <tr key={customer.householdId}>
                    <td className="px-4 py-3 font-medium text-ink-900">{customer.name}</td>
                    <td className="px-4 py-3 text-ink-600">{customer.email}</td>
                    <td className="px-4 py-3 text-ink-700">{customer.planName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={customer.status === 'active' ? 'positive' : 'neutral'}>
                        {customer.status ?? 'sem assinatura'}
                      </Badge>
                    </td>
                    <td className="tabular px-4 py-3 text-ink-700">{customer.members}</td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {new Date(customer.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {customer.lastActivityAt
                        ? new Date(customer.lastActivityAt).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <p className="mt-2 text-xs text-ink-500">
          Sem senha e sem valores dos lançamentos. Esta tabela mostra o estado da conta,
          nunca o dinheiro do casal.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section>
        <SectionTitle>Sistema</SectionTitle>

        <Card className="divide-y divide-ink-100 p-0">
          <StatusRow
            label="Pagamento"
            ok={system.paymentConfigured}
            detail={
              system.missingPriceEnvs.length > 0
                ? `${system.paymentProvider} · faltam: ${system.missingPriceEnvs.join(', ')}`
                : `${system.paymentProvider} · modo ${system.paymentMode}`
            }
          />
          <StatusRow
            label="Banco de dados"
            ok={system.database === 'ok'}
            detail={system.database === 'ok' ? 'D1 respondendo' : 'Consulta falhou'}
          />
          <StatusRow
            label="Webhook"
            ok={system.webhookSecretSet}
            detail={
              system.webhookSecretSet
                ? system.lastWebhookAt
                  ? `Segredo configurado · último evento em ${new Date(system.lastWebhookAt).toLocaleString('pt-BR')}`
                  : 'Segredo configurado · nenhum evento recebido ainda'
                : 'Segredo de assinatura não configurado'
            }
          />
        </Card>

        <div className="mt-3">
          <p className="mb-2 text-sm font-semibold text-ink-800">
            Falhas de webhook/pagamento
          </p>
          {system.webhookFailures.length === 0 ? (
            <Card className="p-5 text-sm text-ink-600">Nenhuma falha registrada.</Card>
          ) : (
            <Card className="divide-y divide-ink-100 p-0">
              {system.webhookFailures.map((failure) => (
                <div key={failure.id} className="px-5 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs text-ink-500">
                      {failure.provider} · {failure.type}
                    </span>
                    <span className="text-xs text-ink-400">
                      {new Date(failure.at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {failure.note ? (
                    <p className="mt-1 text-sm text-ink-800">{failure.note}</p>
                  ) : null}
                </div>
              ))}
            </Card>
          )}
        </div>
      </section>
    </>
  );
}
