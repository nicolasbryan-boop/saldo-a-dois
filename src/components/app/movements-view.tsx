'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Filter, Receipt, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Sheet, ConfirmSheet } from '@/components/ui/sheet';
import { Field, Input, Select } from '@/components/ui/field';
import { MoneyInput } from '@/components/ui/money-input';
import { Button } from '@/components/ui/button';
import { EmptyState, Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { TransactionList, type TransactionItemData } from './transaction-item';
import { BalanceCards } from './balance-cards';
import type { CoupleMoney } from '@/domains/transactions/member-summary';
import { QuickAddButton } from './quick-add';
import { api, ApiClientError, type CategoryOption } from '@/lib/api-client';
import { useResettableState } from '@/lib/use-resettable-state';
import { formatBRL } from '@/lib/money';
import type { LocalDate } from '@/lib/dates';
import type { TransactionType } from '@/db/schema';

export interface MovementsViewProps {
  transactions: TransactionItemData[];
  total: number;
  today: LocalDate;
  members: Array<{ id: string; name: string }>;
  categories: CategoryOption[];
  cycleLabel: string;
  totals: { expense: number; income: number; reserve: number };
  /** Per-person balances, from the same helper the other screens use. */
  money: CoupleMoney;
  pageSize: number;
}

const TYPE_TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Receitas' },
  { value: 'reserve', label: 'Guardado' },
];

export function MovementsView({
  transactions,
  total,
  today,
  members,
  categories,
  cycleLabel,
  money,
  totals,
  pageSize,
}: MovementsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TransactionItemData | null>(null);

  const activeType = params.get('type') ?? '';
  const activeMember = params.get('memberId') ?? '';
  const activeCategory = params.get('categoryId') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const offset = Number(params.get('offset') ?? 0);

  const activeFilterCount = [activeMember, activeCategory, from, to].filter(Boolean).length;

  const setParam = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      // Any filter change resets pagination.
      if (!('offset' in updates)) next.delete('offset');
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Movimentos</h1>
        <p className="text-xs text-ink-500">
          {total} {total === 1 ? 'movimento' : 'movimentos'} · ciclo {cycleLabel}
        </p>
      </div>

      {/* Who has what, before the totals: it is the question people open this
          screen with. */}
      <BalanceCards money={money} />

      <div className="grid grid-cols-3 gap-2">
        <Total label="Gastos" value={formatBRL(totals.expense)} tone="out" />
        <Total label="Receitas" value={formatBRL(totals.income)} tone="in" />
        <Total label="Guardado" value={formatBRL(totals.reserve)} tone="hold" />
      </div>

      <div className="flex items-center gap-2">
        <div className="scroll-soft flex flex-1 gap-1.5 overflow-x-auto">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setParam({ type: tab.value || null })}
              aria-pressed={activeType === tab.value}
              className={cn(
                'h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors',
                activeType === tab.value
                  ? 'bg-ink-900 text-white'
                  : 'border border-ink-200 bg-white text-ink-700 hover:bg-cream-50',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="relative grid size-10 shrink-0 place-items-center rounded-full border border-ink-200 bg-white text-ink-700 transition-colors hover:bg-cream-50"
          aria-label="Mais filtros"
        >
          <Filter aria-hidden className="size-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 grid size-4.5 place-items-center rounded-full bg-rose-500 text-[0.625rem] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeMember && (
            <Chip
              label={members.find((m) => m.id === activeMember)?.name ?? 'Pessoa'}
              onClear={() => setParam({ memberId: null })}
            />
          )}
          {activeCategory && (
            <Chip
              label={categories.find((c) => c.id === activeCategory)?.name ?? 'Categoria'}
              onClear={() => setParam({ categoryId: null })}
            />
          )}
          {(from || to) && (
            <Chip
              label={`${from || '…'} → ${to || '…'}`}
              onClear={() => setParam({ from: null, to: null })}
            />
          )}
          <button
            type="button"
            onClick={() => setParam({ memberId: null, categoryId: null, from: null, to: null })}
            className="text-xs font-semibold text-rose-600"
          >
            Limpar tudo
          </button>
        </div>
      )}

      {transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            activeFilterCount > 0 || activeType
              ? 'Nada por aqui com esses filtros.'
              : 'Vocês ainda não registraram nenhum gasto.'
          }
          description={
            activeFilterCount > 0 || activeType
              ? 'Tente ampliar o período ou remover algum filtro.'
              : 'Assim que vocês lançarem o primeiro movimento, ele aparece nesta lista.'
          }
        />
      ) : (
        <>
          <TransactionList
            transactions={transactions}
            today={today}
            onSelect={(id) =>
              setEditing(transactions.find((transaction) => transaction.id === id) ?? null)
            }
          />

          {total > pageSize && (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={offset === 0}
                onClick={() => setParam({ offset: String(Math.max(0, offset - pageSize)) })}
              >
                Anteriores
              </Button>
              <span className="text-xs text-ink-500">
                {offset + 1}–{Math.min(offset + pageSize, total)} de {total}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset + pageSize >= total}
                onClick={() => setParam({ offset: String(offset + pageSize) })}
              >
                Próximos
              </Button>
            </div>
          )}
        </>
      )}

      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        members={members}
        categories={categories}
        values={{ memberId: activeMember, categoryId: activeCategory, from, to }}
        onApply={(values) =>
          setParam({
            memberId: values.memberId || null,
            categoryId: values.categoryId || null,
            from: values.from || null,
            to: values.to || null,
          })
        }
      />

      <EditSheet
        transaction={editing}
        members={members}
        categories={categories}
        onClose={() => setEditing(null)}
      />

      <QuickAddButton members={members} />
    </div>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone: 'in' | 'out' | 'hold' }) {
  const colors = {
    in: 'text-money-in',
    out: 'text-ink-900',
    hold: 'text-[#8a5b02]',
  };

  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-3 text-center">
      <p className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </p>
      <p className={cn('tabular mt-1 text-sm font-bold sm:text-base', colors[tone])}>{value}</p>
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 py-1 pl-3 pr-1.5 text-xs font-medium text-ink-700">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remover filtro ${label}`}
        className="grid size-5 place-items-center rounded-full hover:bg-ink-200"
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  );
}

function FiltersSheet({
  open,
  onClose,
  members,
  categories,
  values,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  members: Array<{ id: string; name: string }>;
  categories: CategoryOption[];
  values: { memberId: string; categoryId: string; from: string; to: string };
  onApply: (values: { memberId: string; categoryId: string; from: string; to: string }) => void;
}) {
  // The draft belongs to one opening of the sheet: reopening starts over from
  // whatever the URL currently says.
  const [draft, setDraft] = useResettableState(values, open);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtros"
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              const cleared = { memberId: '', categoryId: '', from: '', to: '' };
              setDraft(cleared);
              onApply(cleared);
              onClose();
            }}
          >
            Limpar
          </Button>
          <Button
            fullWidth
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Aplicar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Pessoa" htmlFor="filter-member">
          <Select
            id="filter-member"
            value={draft.memberId}
            onChange={(event) => setDraft({ ...draft, memberId: event.target.value })}
          >
            <option value="">Todas</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Categoria" htmlFor="filter-category">
          <Select
            id="filter-category"
            value={draft.categoryId}
            onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="De" htmlFor="filter-from">
            <Input
              id="filter-from"
              type="date"
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </Field>
          <Field label="Até" htmlFor="filter-to">
            <Input
              id="filter-to"
              type="date"
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

function EditSheet({
  transaction,
  members,
  categories,
  onClose,
}: {
  transaction: TransactionItemData | null;
  members: Array<{ id: string; name: string }>;
  categories: CategoryOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  // All form state belongs to the movement being edited, so it resets as soon
  // as a different row is opened — no stale value is ever rendered.
  const editingKey = transaction?.id ?? null;

  const [amountCents, setAmountCents] = useResettableState(
    transaction?.amountCents ?? 0,
    editingKey,
  );
  const [description, setDescription] = useResettableState(
    transaction?.description ?? '',
    editingKey,
  );
  const [occurredOn, setOccurredOn] = useResettableState(
    transaction?.occurredOn ?? '',
    editingKey,
  );
  const [categoryId, setCategoryId] = useResettableState(
    categories.find((category) => category.name === transaction?.categoryName)?.id ?? '',
    editingKey,
  );
  const [memberId, setMemberId] = useResettableState(
    members.find((member) => member.name === transaction?.memberName)?.id ?? '',
    editingKey,
  );
  const [error, setError] = useResettableState<string | null>(null, editingKey);
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!transaction) return;
    setError(null);

    if (amountCents <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/api/transactions/${transaction.id}`, {
        amountCents,
        description: description.trim() || transaction.description,
        occurredOn,
        categoryId: categoryId || null,
        memberId: memberId || null,
      });
      toast.success('Movimento atualizado. Os números foram recalculados.');
      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não conseguimos salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!transaction) return;
    setSaving(true);
    try {
      await api.delete(`/api/transactions/${transaction.id}`);
      toast.success('Movimento excluído. Os números foram recalculados.');
      setConfirmDelete(false);
      onClose();
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : 'Não conseguimos excluir.');
    } finally {
      setSaving(false);
    }
  }

  const typeLabel: Record<TransactionType, string> = {
    income: 'Entrada',
    expense: 'Gasto',
    reserve: 'Guardado',
    adjustment_in: 'Ajuste (entrada)',
    adjustment_out: 'Ajuste (saída)',
  };

  return (
    <>
      <Sheet
        open={Boolean(transaction) && !confirmDelete}
        onClose={onClose}
        title="Editar movimento"
        footer={
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
              aria-label="Excluir movimento"
            >
              Excluir
            </Button>
            <Button type="submit" form="edit-form" fullWidth loading={saving}>
              Salvar
            </Button>
          </div>
        }
      >
        {transaction && (
          <form id="edit-form" onSubmit={save} className="space-y-4">
            <Badge tone="neutral">{typeLabel[transaction.type]}</Badge>

            <Field label="Valor" htmlFor="edit-amount">
              <MoneyInput
                id="edit-amount"
                emphasis
                value={amountCents}
                onValueChange={setAmountCents}
                invalid={Boolean(error) && amountCents <= 0}
              />
            </Field>

            <Field label="Descrição" htmlFor="edit-description">
              <Input
                id="edit-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={140}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data" htmlFor="edit-date">
                <Input
                  id="edit-date"
                  type="date"
                  value={occurredOn}
                  onChange={(event) => setOccurredOn(event.target.value)}
                />
              </Field>

              <Field label="De quem" htmlFor="edit-member">
                <Select
                  id="edit-member"
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
            </div>

            {transaction.type !== 'reserve' && (
              <Field label="Categoria" htmlFor="edit-category">
                <Select
                  id="edit-category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
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
        )}
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={saving}
        title="Excluir este movimento?"
        message={
          transaction
            ? `“${transaction.description}” de ${formatBRL(transaction.amountCents)} será removido e o saldo será recalculado. Isso não pode ser desfeito.`
            : ''
        }
        confirmLabel="Excluir"
        destructive
      />
    </>
  );
}
