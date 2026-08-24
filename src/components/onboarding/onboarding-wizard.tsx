'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Plus, Trash2, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { MoneyInput } from '@/components/ui/money-input';
import { Button } from '@/components/ui/button';
import { api, ApiClientError, type CategoryOption } from '@/lib/api-client';
import { formatBRL } from '@/lib/money';
import { branding } from '@/config';

/**
 * Six short steps instead of one long form.
 *
 * State lives in the browser and is submitted once at the end, so a half-filled
 * wizard never leaves a half-configured household behind. Suggested bills are
 * one tap each because typing five bills on a phone is the fastest way to lose
 * someone during setup.
 */

interface IncomeDraft {
  key: string;
  name: string;
  amountCents: number;
  dayOfMonth: number;
  memberId: string;
}

interface BillDraft {
  key: string;
  name: string;
  amountCents: number;
  dayOfMonth: number;
  categoryId: string;
}

const SUGGESTED_BILLS: Array<{ name: string; slug: string; day: number }> = [
  { name: 'Aluguel', slug: 'moradia', day: 10 },
  { name: 'Energia', slug: 'energia', day: 12 },
  { name: 'Internet', slug: 'internet', day: 15 },
  { name: 'Água', slug: 'moradia', day: 15 },
  { name: 'Escola', slug: 'educacao', day: 20 },
  { name: 'Academia', slug: 'assinaturas', day: 25 },
  { name: 'Cartão', slug: 'cartao', day: 8 },
  { name: 'Financiamento', slug: 'moradia', day: 5 },
  { name: 'Plano de saúde', slug: 'saude', day: 10 },
  { name: 'Streaming', slug: 'assinaturas', day: 20 },
];

const TOTAL_STEPS = 6;

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

export function OnboardingWizard({
  ownerName,
  ownerMemberId,
  categories,
}: {
  ownerName: string;
  ownerMemberId: string;
  categories: CategoryOption[];
}) {
  const router = useRouter();

  const [step, setStep] = React.useState(1);
  const [householdName, setHouseholdName] = React.useState('');
  const [incomes, setIncomes] = React.useState<IncomeDraft[]>([
    { key: newKey(), name: 'Salário', amountCents: 0, dayOfMonth: 5, memberId: ownerMemberId },
  ]);
  const [openingBalanceCents, setOpeningBalanceCents] = React.useState(0);
  const [bills, setBills] = React.useState<BillDraft[]>([]);
  const [reserveCents, setReserveCents] = React.useState(0);
  const [goalName, setGoalName] = React.useState('Reserva de emergência');
  const [goalTargetCents, setGoalTargetCents] = React.useState(0);
  // Until someone picks a day, the cycle follows the biggest salary. Deriving
  // it during render keeps the suggestion live as incomes are typed, with no
  // effect and no intermediate render showing the wrong day.
  const [chosenCycleStartDay, setChosenCycleStartDay] = React.useState<number | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const incomeTotal = incomes.reduce((sum, income) => sum + income.amountCents, 0);
  const billsTotal = bills.reduce((sum, bill) => sum + bill.amountCents, 0);
  const potentiallyFree = incomeTotal - billsTotal - reserveCents;

  const suggestedCycleStartDay = React.useMemo(() => {
    const biggest = [...incomes]
      .filter((income) => income.amountCents > 0)
      .sort((a, b) => b.amountCents - a.amountCents)[0];
    return biggest ? Math.min(28, biggest.dayOfMonth) : 1;
  }, [incomes]);

  const cycleStartDay = chosenCycleStartDay ?? suggestedCycleStartDay;

  function categoryIdFor(slug: string): string {
    return categories.find((category) => category.slug === slug)?.id ?? '';
  }

  function toggleSuggestedBill(name: string, slug: string, day: number) {
    setBills((current) => {
      const existing = current.find((bill) => bill.name === name);
      if (existing) return current.filter((bill) => bill.name !== name);
      return [
        ...current,
        { key: newKey(), name, amountCents: 0, dayOfMonth: day, categoryId: categoryIdFor(slug) },
      ];
    });
  }

  function canAdvance(): boolean {
    if (step === 1) return householdName.trim().length > 0;
    if (step === 2) return incomes.some((income) => income.amountCents > 0);
    return true;
  }

  async function finish() {
    setError(null);
    setSaving(true);

    try {
      await api.post('/api/onboarding', {
        householdName: householdName.trim(),
        cycleStartDay,
        openingBalanceCents,
        monthlyReserveCents: reserveCents,
        incomes: incomes
          .filter((income) => income.amountCents > 0 && income.name.trim())
          .map((income) => ({
            name: income.name.trim(),
            amountCents: income.amountCents,
            dayOfMonth: income.dayOfMonth,
            memberId: income.memberId || null,
          })),
        bills: bills
          .filter((bill) => bill.amountCents > 0 && bill.name.trim())
          .map((bill) => ({
            name: bill.name.trim(),
            amountCents: bill.amountCents,
            dayOfMonth: bill.dayOfMonth,
            categoryId: bill.categoryId || null,
          })),
        goal:
          reserveCents > 0 && goalTargetCents > 0 && goalName.trim()
            ? { name: goalName.trim(), targetCents: goalTargetCents }
            : null,
      });

      router.push('/app');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Não conseguimos salvar. Tente novamente.',
      );
      setSaving(false);
    }
  }

  return (
    <div className="w-full">
      <Progress step={step} />

      <Card className="mt-6 p-6 sm:p-8">
        {step === 1 && (
          <Step
            title="Vamos organizar a vida financeira de vocês."
            description="Primeiro, como vocês querem chamar este espaço?"
          >
            <Field label="Nome do espaço" htmlFor="ob-name" hint="Ex.: Ana & Lucas">
              <Input
                id="ob-name"
                autoFocus
                value={householdName}
                onChange={(event) => setHouseholdName(event.target.value)}
                placeholder={`${ownerName} & ...`}
                maxLength={80}
              />
            </Field>

            <p className="mt-5 rounded-md bg-cream-100 px-4 py-3 text-sm leading-relaxed text-ink-600">
              Vocês vão poder adicionar a outra pessoa logo depois. A assinatura já cobre
              as duas.
            </p>
          </Step>
        )}

        {step === 2 && (
          <Step
            title="Quanto entra por mês?"
            description="Salário, pró-labore, aluguel recebido. O que cai todo mês na mesma data."
          >
            <div className="space-y-4">
              {incomes.map((income, index) => (
                <div key={income.key} className="rounded-lg border border-ink-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
                      Receita {index + 1}
                    </p>
                    {incomes.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setIncomes((current) => current.filter((item) => item.key !== income.key))
                        }
                        aria-label={`Remover receita ${index + 1}`}
                        className="grid size-8 place-items-center rounded-full text-ink-400 hover:bg-money-out-soft hover:text-money-out"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 space-y-3">
                    <Field label="Nome" htmlFor={`income-name-${income.key}`}>
                      <Input
                        id={`income-name-${income.key}`}
                        value={income.name}
                        onChange={(event) =>
                          setIncomes((current) =>
                            current.map((item) =>
                              item.key === income.key
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Ex.: Salário da Ana"
                        maxLength={80}
                      />
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Valor" htmlFor={`income-amount-${income.key}`}>
                        <MoneyInput
                          id={`income-amount-${income.key}`}
                          value={income.amountCents}
                          onValueChange={(cents) =>
                            setIncomes((current) =>
                              current.map((item) =>
                                item.key === income.key ? { ...item, amountCents: cents } : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Dia que recebe" htmlFor={`income-day-${income.key}`}>
                        <Select
                          id={`income-day-${income.key}`}
                          value={String(income.dayOfMonth)}
                          onChange={(event) =>
                            setIncomes((current) =>
                              current.map((item) =>
                                item.key === income.key
                                  ? { ...item, dayOfMonth: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                            <option key={day} value={day}>
                              Dia {day}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() =>
                  setIncomes((current) => [
                    ...current,
                    {
                      key: newKey(),
                      name: '',
                      amountCents: 0,
                      dayOfMonth: 5,
                      memberId: ownerMemberId,
                    },
                  ])
                }
              >
                <Plus aria-hidden className="size-4" />
                Adicionar outra receita
              </Button>
            </div>

            {incomeTotal > 0 && (
              <p className="mt-5 rounded-md bg-money-in-soft px-4 py-3 text-sm font-semibold text-[#0b7a55]">
                Entram {formatBRL(incomeTotal)} por mês.
              </p>
            )}
          </Step>
        )}

        {step === 3 && (
          <Step
            title="Quanto vocês têm disponível hoje?"
            description="O dinheiro que está na conta agora, somando o que vocês consideram disponível."
          >
            <Field
              label="Saldo de hoje"
              htmlFor="ob-balance"
              hint="Se não souber exato, um valor aproximado já resolve. Dá para ajustar depois."
            >
              <MoneyInput
                id="ob-balance"
                autoFocus
                emphasis
                value={openingBalanceCents}
                onValueChange={setOpeningBalanceCents}
              />
            </Field>

            <p className="mt-5 rounded-md bg-cream-100 px-4 py-3 text-sm leading-relaxed text-ink-600">
              O {branding.name} não se conecta ao banco. Esse valor é o ponto de partida
              que vocês informam, e a partir dele tudo é calculado com os lançamentos de
              vocês.
            </p>
          </Step>
        )}

        {step === 4 && (
          <Step
            title="Quais contas se repetem todo mês?"
            description="Toque nas que vocês têm e preencha o valor. Dá para editar tudo depois."
          >
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_BILLS.map((suggestion) => {
                const active = bills.some((bill) => bill.name === suggestion.name);
                return (
                  <button
                    key={suggestion.name}
                    type="button"
                    onClick={() =>
                      toggleSuggestedBill(suggestion.name, suggestion.slug, suggestion.day)
                    }
                    aria-pressed={active}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                      active
                        ? 'border-ink-900 bg-ink-900 text-white'
                        : 'border-ink-200 bg-white text-ink-700 hover:bg-cream-50',
                    )}
                  >
                    {active && <Check aria-hidden className="size-3.5" />}
                    {suggestion.name}
                  </button>
                );
              })}
            </div>

            {bills.length > 0 && (
              <div className="mt-6 space-y-3">
                {bills.map((bill) => (
                  <div
                    key={bill.key}
                    className="rounded-lg border border-ink-200 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        aria-label="Nome da conta"
                        value={bill.name}
                        onChange={(event) =>
                          setBills((current) =>
                            current.map((item) =>
                              item.key === bill.key ? { ...item, name: event.target.value } : item,
                            ),
                          )
                        }
                        className="h-10 flex-1 border-0 px-0 text-[0.9375rem] font-semibold focus:ring-0"
                        maxLength={80}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setBills((current) => current.filter((item) => item.key !== bill.key))
                        }
                        aria-label={`Remover ${bill.name}`}
                        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-money-out-soft hover:text-money-out"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Valor" htmlFor={`bill-amount-${bill.key}`}>
                        <MoneyInput
                          id={`bill-amount-${bill.key}`}
                          value={bill.amountCents}
                          onValueChange={(cents) =>
                            setBills((current) =>
                              current.map((item) =>
                                item.key === bill.key ? { ...item, amountCents: cents } : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Vence dia" htmlFor={`bill-day-${bill.key}`}>
                        <Select
                          id={`bill-day-${bill.key}`}
                          value={String(bill.dayOfMonth)}
                          onChange={(event) =>
                            setBills((current) =>
                              current.map((item) =>
                                item.key === bill.key
                                  ? { ...item, dayOfMonth: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                            <option key={day} value={day}>
                              Dia {day}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              fullWidth
              className="mt-4"
              onClick={() =>
                setBills((current) => [
                  ...current,
                  {
                    key: newKey(),
                    name: '',
                    amountCents: 0,
                    dayOfMonth: 10,
                    categoryId: categoryIdFor('outros'),
                  },
                ])
              }
            >
              <Plus aria-hidden className="size-4" />
              Adicionar outra conta
            </Button>

            {billsTotal > 0 && (
              <p className="mt-5 rounded-md bg-cream-100 px-4 py-3 text-sm font-semibold text-ink-800">
                Contas fixas: {formatBRL(billsTotal)} por mês.
              </p>
            )}
          </Step>
        )}

        {step === 5 && (
          <Step
            title="Quanto vocês querem guardar por mês?"
            description="Esse valor sai do dinheiro livre, então vocês param de guardar só o que sobra."
          >
            <Field label="Reserva mensal" htmlFor="ob-reserve">
              <MoneyInput
                id="ob-reserve"
                autoFocus
                emphasis
                value={reserveCents}
                onValueChange={setReserveCents}
              />
            </Field>

            {reserveCents > 0 && (
              <div className="mt-6 space-y-4 border-t border-ink-100 pt-6">
                <p className="text-sm font-semibold text-ink-800">
                  Quer transformar isso numa meta?
                </p>

                <Field label="Nome da meta" htmlFor="ob-goal-name">
                  <Input
                    id="ob-goal-name"
                    value={goalName}
                    onChange={(event) => setGoalName(event.target.value)}
                    maxLength={80}
                  />
                </Field>

                <Field
                  label="Objetivo total"
                  htmlFor="ob-goal-target"
                  hint="Deixe em zero para pular a meta por enquanto."
                >
                  <MoneyInput
                    id="ob-goal-target"
                    value={goalTargetCents}
                    onValueChange={setGoalTargetCents}
                  />
                </Field>
              </div>
            )}
          </Step>
        )}

        {step === 6 && (
          <Step
            title="É isso. Olha só como fica."
            description="Estes são os números iniciais do ciclo de vocês."
          >
            <div className="overflow-hidden rounded-lg border border-ink-200">
              <SummaryRow label="Renda mensal" value={formatBRL(incomeTotal)} tone="in" />
              <SummaryRow label="Contas fixas" value={`− ${formatBRL(billsTotal)}`} tone="out" />
              <SummaryRow label="Reserva" value={`− ${formatBRL(reserveCents)}`} tone="hold" />
              <div className="bg-ink-900 px-5 py-6 text-white">
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-white/60">
                  Potencialmente livre por mês
                </p>
                <p className="tabular mt-1.5 font-display text-[2.25rem] font-semibold leading-none">
                  {formatBRL(potentiallyFree)}
                </p>
              </div>
            </div>

            <Field
              label="O mês financeiro de vocês começa no dia"
              htmlFor="ob-cycle"
              hint="Sugerimos o dia do maior salário. Dá para mudar quando quiser."
              className="mt-6"
            >
              <Select
                id="ob-cycle"
                value={String(cycleStartDay)}
                onChange={(event) => setChosenCycleStartDay(Number(event.target.value))}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    Dia {day}
                  </option>
                ))}
              </Select>
            </Field>

            {potentiallyFree < 0 && (
              <p className="mt-5 rounded-md bg-money-out-soft px-4 py-3 text-sm leading-relaxed text-[#8a2a2a]">
                Pelos números informados, as contas e a reserva passam da renda do mês. O
                app vai mostrar isso do jeito que é — e vocês decidem o que ajustar.
              </p>
            )}

            {error && (
              <p role="alert" className="mt-4 text-sm font-medium text-money-out">
                {error}
              </p>
            )}
          </Step>
        )}

        <div className="mt-8 flex items-center gap-3">
          {step > 1 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((value) => value - 1)}
              disabled={saving}
            >
              <ArrowLeft aria-hidden className="size-4" />
              Voltar
            </Button>
          )}

          {step < TOTAL_STEPS ? (
            <Button
              type="button"
              size="lg"
              fullWidth
              onClick={() => setStep((value) => value + 1)}
              disabled={!canAdvance()}
            >
              Continuar
              <ArrowRight aria-hidden className="size-4" />
            </Button>
          ) : (
            <Button type="button" size="lg" fullWidth loading={saving} onClick={finish}>
              <Sparkles aria-hidden className="size-4" />
              Ir para meu painel
            </Button>
          )}
        </div>
      </Card>

      {step > 1 && step < TOTAL_STEPS && (
        <p className="mt-4 text-center text-sm">
          <button
            type="button"
            onClick={() => setStep(TOTAL_STEPS)}
            className="link-underline text-ink-500"
          >
            Pular para o final
          </button>
        </p>
      )}
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-ink-500">
        <span>
          Passo {step} de {TOTAL_STEPS}
        </span>
        <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-label="Progresso da configuração"
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-200"
      >
        <div
          className="h-full rounded-full bg-rose-500 transition-[width] duration-500"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Step({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-display text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink-900">
        {title}
      </h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">{description}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'in' | 'out' | 'hold';
}) {
  const colors = {
    in: 'text-money-in',
    out: 'text-money-out',
    hold: 'text-[#8a5b02]',
  };

  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-100 bg-white px-5 py-4">
      <span className="text-[0.9375rem] font-medium text-ink-600">{label}</span>
      <span className={cn('tabular text-lg font-semibold', colors[tone])}>{value}</span>
    </div>
  );
}
