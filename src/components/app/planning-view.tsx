'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Check, CalendarDays, Target, Repeat, Wallet } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, SectionTitle } from '@/components/ui/card';
import { Sheet, ConfirmSheet } from '@/components/ui/sheet';
import { Field, Input, Select } from '@/components/ui/field';
import { MoneyInput } from '@/components/ui/money-input';
import { Button } from '@/components/ui/button';
import {
  EmptyState,
  ProgressBar,
  Badge,
  Avatar,
  CategoryIcon,
  categoryChipClass,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, type CategoryOption } from '@/lib/api-client';
import type { CoupleGoals } from '@/domains/goals/progress';
import { useResettableState } from '@/lib/use-resettable-state';
import { formatBRL } from '@/lib/money';
import { formatDateBR, type LocalDate } from '@/lib/dates';

export interface BillRow {
  id: string;
  name: string;
  amountCents: number;
  dayOfMonth: number;
  categoryId: string | null;
  active: boolean;
}

export interface IncomeRow {
  id: string;
  name: string;
  amountCents: number;
  dayOfMonth: number;
  memberId: string | null;
  active: boolean;
}

export interface GoalRow {
  id: string;
  name: string;
  targetCents: number;
  currentCents: number;
  monthlyPlanCents: number;
}

export interface InstanceRow {
  id: string;
  name: string;
  amountCents: number;
  dueDate: string;
  status: 'pending' | 'settled' | 'skipped';
  sourceType: 'income' | 'expense';
}

export interface PlanningViewProps {
  bills: BillRow[];
  incomes: IncomeRow[];
  goals: GoalRow[];
  /** Progresso e contribuição por pessoa, calculados no servidor. */
  coupleGoals: CoupleGoals;
  instances: InstanceRow[];
  categories: CategoryOption[];
  members: Array<{ id: string; name: string }>;
  household: {
    name: string;
    cycleStartDay: number;
    monthlyReserveCents: number;
  };
  cycle: { label: string; startDate: LocalDate; endDate: LocalDate };
  isOwner: boolean;
}

type Tab = 'metas' | 'ciclo' | 'contas' | 'receitas';

export function PlanningView(props: PlanningViewProps) {
  // Goals first: it answers "para onde estamos indo", which is what people
  // open this screen to see. Bills and income are maintenance.
  const [tab, setTab] = React.useState<Tab>('metas');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Planejamento</h1>
        <p className="text-sm text-ink-500">
          Para onde vocês estão indo, e o que se repete todo mês.
        </p>
      </div>

      <div className="scroll-soft -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {(
          [
            ['metas', 'Metas', Target],
            ['ciclo', 'Ciclo', CalendarDays],
            ['contas', 'Contas', Repeat],
            ['receitas', 'Receitas', Wallet],
          ] as Array<[Tab, string, React.ElementType]>
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors',
              tab === value
                ? 'bg-ink-900 text-white'
                : 'border border-ink-200 bg-white text-ink-700 hover:bg-cream-50',
            )}
          >
            <Icon aria-hidden className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'ciclo' && <CycleTab {...props} />}
      {tab === 'contas' && <BillsTab {...props} />}
      {tab === 'receitas' && <IncomesTab {...props} />}
      {tab === 'metas' && <GoalsTab {...props} />}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Cycle                                                                      */
/* ------------------------------------------------------------------------- */

function CycleTab({ household, cycle, instances }: PlanningViewProps) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = React.useState(false);
  const [startDay, setStartDay] = React.useState(household.cycleStartDay);
  const [reserve, setReserve] = React.useState(household.monthlyReserveCents);
  const [name, setName] = React.useState(household.name);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const pending = instances.filter((instance) => instance.status === 'pending');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/household', {
        name: name.trim(),
        cycleStartDay: startDay,
        monthlyReserveCents: reserve,
      });
      toast.success('Ciclo atualizado.');
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não conseguimos salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
              Ciclo financeiro
            </p>
            <p className="mt-1 font-display text-xl font-semibold text-ink-900">
              {cycle.label}
            </p>
            <p className="mt-0.5 text-sm text-ink-600">
              {formatDateBR(cycle.startDate)} a {formatDateBR(cycle.endDate)}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Pencil aria-hidden className="size-3.5" />
            Ajustar
          </Button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-100 pt-5">
          <div>
            <dt className="text-xs font-semibold text-ink-500">Começa todo dia</dt>
            <dd className="mt-1 text-lg font-semibold text-ink-900">
              {household.cycleStartDay}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-500">Reserva por ciclo</dt>
            <dd className="tabular mt-1 text-lg font-semibold text-ink-900">
              {formatBRL(household.monthlyReserveCents)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 rounded-md bg-cream-100 px-3.5 py-3 text-xs leading-relaxed text-ink-600">
          Quando o ciclo vira, nada é apagado: o ciclo atual é fechado com o saldo do
          momento e esse saldo abre o próximo. O histórico continua inteiro.
        </p>
      </Card>

      <section>
        <SectionTitle>Contas deste ciclo</SectionTitle>
        {pending.length === 0 ? (
          <EmptyState
            icon={Check}
            title="Nenhuma conta em aberto."
            description="Tudo o que estava previsto para este ciclo já foi registrado."
          />
        ) : (
          <ul className="divide-y divide-ink-200 overflow-hidden rounded-lg border border-ink-200 bg-white">
            {pending.map((instance) => (
              <InstanceItem key={instance.id} instance={instance} />
            ))}
          </ul>
        )}
      </section>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Ajustar o ciclo"
        description="Isso muda quando o mês financeiro de vocês começa."
        footer={
          <Button type="submit" form="cycle-form" fullWidth loading={saving}>
            Salvar
          </Button>
        }
      >
        <form id="cycle-form" onSubmit={save} className="space-y-4">
          <Field label="Nome do espaço" htmlFor="cycle-name">
            <Input
              id="cycle-name"
              data-autofocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </Field>

          <Field
            label="O mês financeiro começa no dia"
            htmlFor="cycle-day"
            hint="Normalmente o dia do salário principal. Vai até 28 para não variar de mês para mês."
          >
            <Select
              id="cycle-day"
              value={String(startDay)}
              onChange={(event) => setStartDay(Number(event.target.value))}
            >
              {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  Dia {day}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Quanto querem guardar por ciclo"
            htmlFor="cycle-reserve"
            hint="Esse valor sai do que aparece como livre para gastar."
          >
            <MoneyInput id="cycle-reserve" value={reserve} onValueChange={setReserve} />
          </Field>

          {error && (
            <p role="alert" className="text-sm font-medium text-money-out">
              {error}
            </p>
          )}
        </form>
      </Sheet>
    </div>
  );
}

function InstanceItem({ instance }: { instance: InstanceRow }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function settle() {
    setBusy(true);
    try {
      await api.post(`/api/recorrencias/${instance.id}/quitar`, {});
      toast.success(
        instance.sourceType === 'income' ? 'Entrada registrada.' : 'Conta registrada como paga.',
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Não conseguimos registrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold',
            instance.sourceType === 'income'
              ? 'bg-money-in-soft text-[#0b7a55]'
              : 'bg-cream-200 text-ink-600',
          )}
        >
          {instance.dueDate.slice(8, 10)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-semibold text-ink-900">
            {instance.name}
          </span>
          <span className="block text-xs text-ink-500">
            {instance.sourceType === 'income' ? 'entra' : 'vence'} em{' '}
            {formatDateBR(instance.dueDate as LocalDate)}
          </span>
        </span>
        <span className="tabular shrink-0 text-[0.9375rem] font-bold text-ink-900">
          {formatBRL(instance.amountCents)}
        </span>
        <div className="hidden shrink-0 sm:block">
          <Button size="sm" variant="secondary" onClick={settle} loading={busy}>
            {instance.sourceType === 'income' ? 'Recebi' : 'Paguei'}
          </Button>
        </div>
      </div>

      <div className="mt-2.5 sm:hidden">
        <Button size="sm" variant="secondary" fullWidth onClick={settle} loading={busy}>
          {instance.sourceType === 'income' ? 'Recebi' : 'Paguei'}
        </Button>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------------- */
/* Bills                                                                      */
/* ------------------------------------------------------------------------- */

function BillsTab({ bills, categories }: PlanningViewProps) {
  const [editing, setEditing] = React.useState<BillRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  const total = bills.reduce((sum, bill) => sum + bill.amountCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
            Total por ciclo
          </p>
          <p className="tabular mt-0.5 text-xl font-semibold text-ink-900">
            {formatBRL(total)}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus aria-hidden className="size-4" />
          Nova conta
        </Button>
      </div>

      {bills.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nenhuma conta cadastrada."
          description="Aluguel, luz, internet, escola. Cadastre uma vez e ela aparece em todo ciclo."
          action={<Button onClick={() => setCreating(true)}>Cadastrar primeira conta</Button>}
        />
      ) : (
        <ul className="divide-y divide-ink-200 overflow-hidden rounded-lg border border-ink-200 bg-white">
          {bills.map((bill) => {
            const category = categories.find((item) => item.id === bill.categoryId);
            return (
              <li key={bill.id}>
                <button
                  type="button"
                  onClick={() => setEditing(bill)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-cream-50"
                >
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-full',
                      categoryChipClass(category?.color),
                    )}
                  >
                    <CategoryIcon name={category?.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-semibold text-ink-900">
                      {bill.name}
                    </span>
                    <span className="block text-xs text-ink-500">
                      todo dia {bill.dayOfMonth}
                      {category ? ` · ${category.name}` : ''}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-[0.9375rem] font-bold text-ink-900">
                    {formatBRL(bill.amountCents)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <RecurringSheet
        kind="expense"
        open={creating || Boolean(editing)}
        editing={editing}
        categories={categories}
        members={[]}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Incomes                                                                    */
/* ------------------------------------------------------------------------- */

function IncomesTab({ incomes, members, categories }: PlanningViewProps) {
  const [editing, setEditing] = React.useState<IncomeRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  const total = incomes.reduce((sum, income) => sum + income.amountCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
            Entra por ciclo
          </p>
          <p className="tabular mt-0.5 text-xl font-semibold text-money-in">
            {formatBRL(total)}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus aria-hidden className="size-4" />
          Nova receita
        </Button>
      </div>

      {incomes.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma receita cadastrada."
          description="Salário, pró-labore, aluguel recebido. O que entra todo mês na mesma data."
          action={<Button onClick={() => setCreating(true)}>Cadastrar receita</Button>}
        />
      ) : (
        <ul className="divide-y divide-ink-200 overflow-hidden rounded-lg border border-ink-200 bg-white">
          {incomes.map((income) => (
            <li key={income.id}>
              <button
                type="button"
                onClick={() => setEditing(income)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-cream-50"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-money-in-soft text-[#0b7a55]">
                  <Wallet aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-semibold text-ink-900">
                    {income.name}
                  </span>
                  <span className="block text-xs text-ink-500">
                    todo dia {income.dayOfMonth}
                    {income.memberId
                      ? ` · ${members.find((m) => m.id === income.memberId)?.name ?? ''}`
                      : ''}
                  </span>
                </span>
                <span className="tabular shrink-0 text-[0.9375rem] font-bold text-money-in">
                  {formatBRL(income.amountCents)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <RecurringSheet
        kind="income"
        open={creating || Boolean(editing)}
        editing={editing}
        categories={categories}
        members={members}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Shared recurring form                                                      */
/* ------------------------------------------------------------------------- */

function RecurringSheet({
  kind,
  open,
  editing,
  categories,
  members,
  onClose,
}: {
  kind: 'expense' | 'income';
  open: boolean;
  editing: BillRow | IncomeRow | null;
  categories: CategoryOption[];
  members: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const endpoint = kind === 'expense' ? '/api/planejamento/contas' : '/api/planejamento/receitas';

  // Form state belongs to one opening of the sheet for one item, so it resets
  // the moment a different item (or "new") is opened.
  const formKey = `${open ? 'open' : 'closed'}:${editing?.id ?? 'novo'}`;

  const [name, setName] = useResettableState(editing?.name ?? '', formKey);
  const [amountCents, setAmountCents] = useResettableState(editing?.amountCents ?? 0, formKey);
  const [dayOfMonth, setDayOfMonth] = useResettableState(
    editing?.dayOfMonth ?? (kind === 'income' ? 5 : 10),
    formKey,
  );
  const [categoryId, setCategoryId] = useResettableState(
    editing && 'categoryId' in editing ? (editing.categoryId ?? '') : '',
    formKey,
  );
  const [memberId, setMemberId] = useResettableState(
    editing && 'memberId' in editing ? (editing.memberId ?? '') : '',
    formKey,
  );
  const [error, setError] = useResettableState<string | null>(null, formKey);
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const relevantCategories = categories.filter((category) =>
    kind === 'income'
      ? category.kind === 'income' || category.kind === 'both'
      : category.kind === 'expense' || category.kind === 'both',
  );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Dê um nome para este item.');
      return;
    }
    if (amountCents <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        amountCents,
        dayOfMonth,
        ...(kind === 'expense'
          ? { categoryId: categoryId || null }
          : { memberId: memberId || null }),
      };

      if (editing) {
        await api.patch(`${endpoint}/${editing.id}`, payload);
        toast.success('Atualizado.');
      } else {
        await api.post(endpoint, payload);
        toast.success(kind === 'expense' ? 'Conta cadastrada.' : 'Receita cadastrada.');
      }

      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não conseguimos salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.delete(`${endpoint}/${editing.id}`);
      toast.success('Removido.');
      setConfirmDelete(false);
      onClose();
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : 'Não conseguimos remover.');
    } finally {
      setSaving(false);
    }
  }

  const title = editing
    ? kind === 'expense'
      ? 'Editar conta'
      : 'Editar receita'
    : kind === 'expense'
      ? 'Nova conta'
      : 'Nova receita';

  return (
    <>
      <Sheet
        open={open && !confirmDelete}
        onClose={onClose}
        title={title}
        description={
          kind === 'expense'
            ? 'Ela vai aparecer em todo ciclo, na data escolhida.'
            : 'Ela vai aparecer como próxima entrada em todo ciclo.'
        }
        footer={
          <div className="flex gap-2">
            {editing && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                Excluir
              </Button>
            )}
            <Button type="submit" form="recurring-form" fullWidth loading={saving}>
              Salvar
            </Button>
          </div>
        }
      >
        <form id="recurring-form" onSubmit={save} className="space-y-4">
          <Field label="Nome" htmlFor="recurring-name">
            <Input
              id="recurring-name"
              data-autofocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === 'expense' ? 'Ex.: Aluguel' : 'Ex.: Salário'}
              maxLength={80}
            />
          </Field>

          <Field label="Valor" htmlFor="recurring-amount">
            <MoneyInput
              id="recurring-amount"
              emphasis
              value={amountCents}
              onValueChange={setAmountCents}
            />
          </Field>

          <Field
            label={kind === 'expense' ? 'Vence todo dia' : 'Entra todo dia'}
            htmlFor="recurring-day"
            hint="Em meses mais curtos, o dia é ajustado para o último dia do mês."
          >
            <Select
              id="recurring-day"
              value={String(dayOfMonth)}
              onChange={(event) => setDayOfMonth(Number(event.target.value))}
            >
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  Dia {day}
                </option>
              ))}
            </Select>
          </Field>

          {kind === 'expense' ? (
            <Field label="Categoria" htmlFor="recurring-category">
              <Select
                id="recurring-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Sem categoria</option>
                {relevantCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="De quem" htmlFor="recurring-member">
              <Select
                id="recurring-member"
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
              >
                <option value="">Casa / compartilhado</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-money-out">
              {error}
            </p>
          )}
        </form>
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={saving}
        title="Remover?"
        message="As ocorrências ainda não pagas somem deste e dos próximos ciclos. O que já foi registrado continua no histórico."
        confirmLabel="Remover"
        destructive
      />
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Goals                                                                      */
/* ------------------------------------------------------------------------- */

function GoalsTab({ goals, coupleGoals, cycle, household }: PlanningViewProps) {
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<GoalRow | null>(null);
  const [contributing, setContributing] = React.useState<GoalRow | null>(null);

  const byId = new Map(goals.map((goal) => [goal.id, goal]));

  return (
    <div className="space-y-4">
      {/* Cycle summary and what the couple plans to set aside. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-semibold text-ink-800">{cycle.label}</p>
          <p className="text-xs text-ink-500">
            {formatDateBR(cycle.startDate)} — {formatDateBR(cycle.endDate)}
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-ink-100 pt-4">
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Pretendem guardar</dt>
            <dd className="tabular mt-1 truncate text-base font-semibold text-ink-900">
              {formatBRL(household.monthlyReserveCents)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Já guardado</dt>
            <dd className="tabular mt-1 truncate text-base font-semibold text-money-in">
              {formatBRL(coupleGoals.totalSavedCents)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Somando as metas</dt>
            <dd className="tabular mt-1 truncate text-base font-semibold text-ink-900">
              {formatBRL(coupleGoals.totalTargetCents)}
            </dd>
          </div>
        </dl>

        {coupleGoals.perMember.length > 1 && coupleGoals.totalSavedCents > 0 ? (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-ink-100 pt-4">
            {coupleGoals.perMember.map((member) => (
              <div key={member.memberId ?? member.displayName} className="flex items-center gap-2">
                <Avatar name={member.displayName} accent={member.accentColor} size="sm" />
                <div>
                  <p className="text-xs text-ink-500">{member.displayName}</p>
                  <p className="tabular text-sm font-semibold text-ink-900">
                    {formatBRL(member.amountCents)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          As metas são do casal: os dois colocam, os dois acompanham.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus aria-hidden className="size-4" />
          Nova
        </Button>
      </div>

      {coupleGoals.goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta ainda."
          description="Reserva de emergência, viagem, entrada do apartamento. Escolham uma para começar."
          action={<Button onClick={() => setCreating(true)}>Criar primeira meta</Button>}
        />
      ) : (
        <div className="space-y-3">
          {coupleGoals.goals.map((goal) => (
            <Card key={goal.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 break-words font-display text-lg font-semibold leading-tight text-ink-900">
                  {goal.name}
                </p>
                <Badge tone={goal.achieved ? 'positive' : 'neutral'}>{goal.percent}%</Badge>
              </div>

              <p className="tabular mt-1 text-sm text-ink-600">
                {formatBRL(goal.savedCents)} de {formatBRL(goal.targetCents)}
                {goal.remainingCents > 0 ? (
                  <span className="text-ink-500"> · faltam {formatBRL(goal.remainingCents)}</span>
                ) : null}
              </p>

              <ProgressBar
                className="mt-4"
                value={goal.savedCents}
                max={goal.targetCents}
                label={`Progresso da meta ${goal.name}`}
              />

              {goal.contributors.length > 0 ? (
                <ul className="mt-4 space-y-2 border-t border-ink-100 pt-4">
                  {goal.contributors.map((person) => (
                    <li
                      key={person.memberId ?? person.displayName}
                      className="flex items-center gap-2.5"
                    >
                      <Avatar name={person.displayName} accent={person.accentColor} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-700">
                        {person.displayName}
                      </span>
                      <span className="tabular shrink-0 text-sm font-semibold text-ink-900">
                        {formatBRL(person.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 border-t border-ink-100 pt-4 text-sm text-ink-500">
                  Ninguém guardou nada aqui ainda.
                </p>
              )}

              {/* mt-auto keeps the buttons on the bottom edge of every card,
                  so a row of cards with different names still lines up. */}
              <div className="mt-auto flex gap-2 pt-4">
                <Button
                  size="sm"
                  fullWidth
                  onClick={() => setContributing(byId.get(goal.id) ?? null)}
                >
                  Guardar agora
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing(byId.get(goal.id) ?? null)}
                  aria-label={`Editar ${goal.name}`}
                >
                  <Pencil aria-hidden className="size-3.5" />
                  Editar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <GoalSheet
        open={creating || Boolean(editing)}
        editing={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ContributeSheet goal={contributing} onClose={() => setContributing(null)} />
    </div>
  );
}

function GoalSheet({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: GoalRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const formKey = `${open ? 'open' : 'closed'}:${editing?.id ?? 'nova'}`;

  const [name, setName] = useResettableState(editing?.name ?? '', formKey);
  const [targetCents, setTargetCents] = useResettableState(editing?.targetCents ?? 0, formKey);
  const [monthlyPlanCents, setMonthlyPlanCents] = useResettableState(
    editing?.monthlyPlanCents ?? 0,
    formKey,
  );
  const [currentCents, setCurrentCents] = useResettableState(
    editing?.currentCents ?? 0,
    formKey,
  );
  const [error, setError] = useResettableState<string | null>(null, formKey);
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Dê um nome para a meta.');
      return;
    }
    if (targetCents <= 0) {
      setError('Informe quanto vocês querem juntar.');
      return;
    }

    setSaving(true);
    try {
      const payload = { name: name.trim(), targetCents, monthlyPlanCents, currentCents };
      if (editing) {
        await api.patch(`/api/goals/${editing.id}`, payload);
        toast.success('Meta atualizada.');
      } else {
        await api.post('/api/goals', payload);
        toast.success('Meta criada.');
      }
      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não conseguimos salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.delete(`/api/goals/${editing.id}`);
      toast.success('Meta removida.');
      setConfirmDelete(false);
      onClose();
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : 'Não conseguimos remover.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Sheet
        open={open && !confirmDelete}
        onClose={onClose}
        title={editing ? 'Editar meta' : 'Nova meta'}
        footer={
          <div className="flex gap-2">
            {editing && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                Excluir
              </Button>
            )}
            <Button type="submit" form="goal-form" fullWidth loading={saving}>
              Salvar
            </Button>
          </div>
        }
      >
        <form id="goal-form" onSubmit={save} className="space-y-4">
          <Field label="Nome da meta" htmlFor="goal-name">
            <Input
              id="goal-name"
              data-autofocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Reserva de emergência"
              maxLength={80}
            />
          </Field>

          <Field label="Objetivo" htmlFor="goal-target">
            <MoneyInput
              id="goal-target"
              emphasis
              value={targetCents}
              onValueChange={setTargetCents}
            />
          </Field>

          <Field
            label="Aporte planejado por ciclo"
            htmlFor="goal-plan"
            hint="Quanto vocês pretendem guardar todo mês para esta meta."
          >
            <MoneyInput
              id="goal-plan"
              value={monthlyPlanCents}
              onValueChange={setMonthlyPlanCents}
            />
          </Field>

          <Field
            label="Já guardado"
            htmlFor="goal-current"
            hint="Se vocês já tinham algo separado, informe aqui."
          >
            <MoneyInput
              id="goal-current"
              value={currentCents}
              onValueChange={setCurrentCents}
            />
          </Field>

          {error && (
            <p role="alert" className="text-sm font-medium text-money-out">
              {error}
            </p>
          )}
        </form>
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={saving}
        title="Excluir a meta?"
        message="A meta some. Os valores já guardados continuam no histórico de movimentos."
        confirmLabel="Excluir"
        destructive
      />
    </>
  );
}

function ContributeSheet({ goal, onClose }: { goal: GoalRow | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();

  // Defaults to the planned contribution for whichever goal was opened.
  const [amountCents, setAmountCents] = useResettableState(
    goal?.monthlyPlanCents || 0,
    goal?.id ?? null,
  );
  const [error, setError] = useResettableState<string | null>(null, goal?.id ?? null);
  const [saving, setSaving] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!goal) return;

    if (amountCents <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }

    setSaving(true);
    try {
      await api.post(`/api/goals/${goal.id}/aportes`, { amountCents });
      toast.success('Valor guardado.');
      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não conseguimos registrar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={Boolean(goal)}
      onClose={onClose}
      title="Guardar para a meta"
      description={goal?.name}
      footer={
        <Button type="submit" form="contribute-form" fullWidth loading={saving}>
          Guardar
        </Button>
      }
    >
      <form id="contribute-form" onSubmit={save} className="space-y-4">
        <Field label="Quanto vocês guardaram" htmlFor="contribute-amount">
          <MoneyInput
            id="contribute-amount"
            data-autofocus
            emphasis
            value={amountCents}
            onValueChange={setAmountCents}
          />
        </Field>

        <p className="rounded-md bg-cream-100 px-3.5 py-3 text-xs leading-relaxed text-ink-600">
          O saldo cai por esse valor e a reserva pendente do ciclo cai junto, então o
          “livre para gastar” não muda: guardar não é gastar, mas também não é sobra.
        </p>

        {error && (
          <p role="alert" className="text-sm font-medium text-money-out">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------- */
/* Categories                                                                 */
/* ------------------------------------------------------------------------- */

