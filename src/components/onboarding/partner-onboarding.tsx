'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { MoneyInput } from '@/components/ui/money-input';
import { Button } from '@/components/ui/button';
import { api, ApiClientError, type CategoryOption } from '@/lib/api-client';
import { formatBRL } from '@/lib/money';

/**
 * The partner's pass through onboarding.
 *
 * Deliberately its own component rather than a mode flag inside the owner
 * wizard: the owner's version also configures the household (name, cycle day,
 * opening balance) and is the flow that every existing user has already been
 * through. Adding branches to it to hide half its steps would put a working,
 * tested path at risk for no gain.
 *
 * One page instead of six steps, because there is much less to ask.
 */

interface Row {
  key: string;
  name: string;
  amountCents: number;
  dayOfMonth: number;
  categoryId?: string;
}

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function patch(
  setter: React.Dispatch<React.SetStateAction<Row[]>>,
  key: string,
  change: Partial<Row>,
) {
  setter((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
}

/** Hoisted: a component defined inside the render remounts on every
 * keystroke, which makes the input lose focus mid-typing. */
function RowList({
  rows,
  setter,
  withCategory,
  emptyLabel,
  expenseCategories,
}: {
  rows: Row[];
  setter: React.Dispatch<React.SetStateAction<Row[]>>;
  withCategory?: boolean;
  emptyLabel: string;
  expenseCategories: CategoryOption[];
}) {
  if (rows.length === 0) {
    return <p className="py-2 text-sm text-ink-500">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-end gap-2">
          <Field label="Nome" htmlFor={`nome-${row.key}`} className="min-w-[9rem] flex-1">
            <Input
              id={`nome-${row.key}`}
              value={row.name}
              onChange={(e) => patch(setter, row.key, { name: e.target.value })}
              placeholder="Ex.: Salário"
            />
          </Field>

          <Field label="Valor" htmlFor={`valor-${row.key}`} className="w-32">
            <MoneyInput
              id={`valor-${row.key}`}
              value={row.amountCents}
              onValueChange={(cents: number) =>
                patch(setter, row.key, { amountCents: cents })
              }
            />
          </Field>

          <Field label="Dia" htmlFor={`dia-${row.key}`} className="w-20">
            <Select
              id={`dia-${row.key}`}
              value={String(row.dayOfMonth)}
              onChange={(e) =>
                patch(setter, row.key, { dayOfMonth: Number(e.target.value) })
              }
            >
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </Select>
          </Field>

          {withCategory ? (
            <Field label="Categoria" htmlFor={`cat-${row.key}`} className="w-36">
              <Select
                id={`cat-${row.key}`}
                value={row.categoryId ?? ''}
                onChange={(e) =>
                  patch(setter, row.key, { categoryId: e.target.value || undefined })
                }
              >
                <option value="">Sem categoria</option>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <button
            type="button"
            onClick={() => setter((all) => all.filter((r) => r.key !== row.key))}
            className="mb-1 grid size-10 place-items-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
            aria-label={`Remover ${row.name || 'item'}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}


export function PartnerOnboarding({
  partnerName,
  householdName,
  categories,
}: {
  partnerName: string;
  householdName: string;
  categories: CategoryOption[];
}) {
  const router = useRouter();

  const [displayName, setDisplayName] = React.useState(partnerName);
  const [incomes, setIncomes] = React.useState<Row[]>([
    { key: newKey(), name: 'Salário', amountCents: 0, dayOfMonth: 5 },
  ]);
  const [bills, setBills] = React.useState<Row[]>([]);
  const [goalName, setGoalName] = React.useState('');
  const [goalCents, setGoalCents] = React.useState(0);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const expenseCategories = categories.filter((c) => c.kind !== 'income');

  const totalIncome = incomes.reduce((sum, row) => sum + row.amountCents, 0);
  const totalBills = bills.reduce((sum, row) => sum + row.amountCents, 0);
  const canSubmit = displayName.trim().length > 0 && totalIncome > 0 && !saving;

  async function submit() {
    setSaving(true);
    setError(null);

    try {
      await api.post('/api/onboarding', {
        displayName: displayName.trim(),
        incomes: incomes
          .filter((row) => row.amountCents > 0 && row.name.trim())
          .map((row) => ({
            name: row.name.trim(),
            amountCents: row.amountCents,
            dayOfMonth: row.dayOfMonth,
          })),
        bills: bills
          .filter((row) => row.amountCents > 0 && row.name.trim())
          .map((row) => ({
            name: row.name.trim(),
            amountCents: row.amountCents,
            dayOfMonth: row.dayOfMonth,
            categoryId: row.categoryId ?? null,
          })),
        goal:
          goalName.trim() && goalCents > 0
            ? { name: goalName.trim(), targetCents: goalCents }
            : null,
      });

      router.replace('/app');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Não conseguimos salvar. Tente de novo.',
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="border-brand-200 bg-brand-50/60">
        <p className="text-[0.9375rem] leading-relaxed text-ink-800">
          Você entrou no espaço <strong>{householdName}</strong>.{' '}
          <strong>
            Cadastre somente as suas receitas e os seus gastos.
          </strong>{' '}
          O que seu parceiro(a) já cadastrou continua sendo dele(a) — vocês veem o resumo
          dos dois juntos, mas cada um lança o que é seu.
        </p>
      </Card>

      <Card className="flex flex-col gap-4">
        <Field label="Como você quer aparecer no app" htmlFor="nome-parceiro">
          <Input
            id="nome-parceiro"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Seu nome"
            maxLength={80}
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink-900">Quanto você recebe</h2>
          <p className="text-sm text-ink-600">
            Salário e outras entradas suas, com o dia em que caem.
          </p>
        </div>

        <RowList
          rows={incomes}
          setter={setIncomes}
          expenseCategories={expenseCategories}
          emptyLabel="Nenhuma receita ainda."
        />

        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            setIncomes((rows) => [
              ...rows,
              { key: newKey(), name: '', amountCents: 0, dayOfMonth: 5 },
            ])
          }
        >
          <Plus className="size-4" aria-hidden /> Outra receita
        </Button>

        {totalIncome > 0 ? (
          <p className="text-sm text-ink-600">
            Total por mês:{' '}
            <strong className="tabular text-ink-900">{formatBRL(totalIncome)}</strong>
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink-900">Seus gastos fixos</h2>
          <p className="text-sm text-ink-600">
            As contas que você paga todo mês. Pode deixar em branco e adicionar depois.
          </p>
        </div>

        <RowList
          rows={bills}
          setter={setBills}
          withCategory
          expenseCategories={expenseCategories}
          emptyLabel="Nenhum gasto fixo ainda."
        />

        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            setBills((rows) => [
              ...rows,
              { key: newKey(), name: '', amountCents: 0, dayOfMonth: 10 },
            ])
          }
        >
          <Plus className="size-4" aria-hidden /> Adicionar gasto fixo
        </Button>

        {totalBills > 0 ? (
          <p className="text-sm text-ink-600">
            Total por mês:{' '}
            <strong className="tabular text-ink-900">{formatBRL(totalBills)}</strong>
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink-900">
            Uma meta sua <span className="font-normal text-ink-500">(opcional)</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Field label="O que você quer" htmlFor="meta-nome" className="min-w-[10rem] flex-1">
            <Input
              id="meta-nome"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder="Ex.: Curso de inglês"
              maxLength={80}
            />
          </Field>
          <Field label="Quanto custa" htmlFor="meta-valor" className="w-36">
            <MoneyInput id="meta-valor" value={goalCents} onValueChange={setGoalCents} />
          </Field>
        </div>
      </Card>

      {error ? (
        <p role="alert" className="text-sm font-medium text-[#a3282a]">
          {error}
        </p>
      ) : null}

      <Button type="button" onClick={submit} disabled={!canSubmit}>
        {saving ? 'Salvando...' : 'Entrar no app'}
        {saving ? null : <Check className="size-4" aria-hidden />}
      </Button>

      {totalIncome === 0 ? (
        <p className="text-center text-xs text-ink-500">
          Informe pelo menos uma receita para continuar.
        </p>
      ) : null}
    </div>
  );
}
