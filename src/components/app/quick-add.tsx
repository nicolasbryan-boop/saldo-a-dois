'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Field, Input, Select } from '@/components/ui/field';
import { MoneyInput, AmountShortcuts } from '@/components/ui/money-input';
import { Button } from '@/components/ui/button';
import { SegmentedControl, CategoryIcon, categoryChipClass } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, type CategoryOption } from '@/lib/api-client';
import { cn } from '@/lib/cn';

type Mode = 'expense' | 'income' | 'reserve';

export interface QuickAddProps {
  members: Array<{ id: string; name: string }>;
  /** Renders as a floating action button when true (the default). */
  floating?: boolean;
  trigger?: React.ReactNode;
}

/**
 * The fastest path to a movement: one amount, one category, done.
 * Everything else has a sensible default so the common case is two taps.
 */
export function QuickAddButton({ members, floating = true, trigger }: QuickAddProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Registrar movimento"
          className={cn(
            'grid size-14 place-items-center rounded-full bg-rose-500 text-white shadow-lift transition-transform active:scale-95 hover:bg-rose-600',
            floating &&
              'fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 lg:bottom-6 lg:right-6',
          )}
        >
          <Plus aria-hidden className="size-6" />
        </button>
      )}

      <QuickAddSheet open={open} onClose={() => setOpen(false)} members={members} />
    </>
  );
}

export function QuickAddSheet({
  open,
  onClose,
  members,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  members: Array<{ id: string; name: string }>;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = React.useState<Mode>('expense');
  const [amountCents, setAmountCents] = React.useState(0);
  const [description, setDescription] = React.useState('');
  const [categoryId, setCategoryId] = React.useState<string>('');
  const [memberId, setMemberId] = React.useState<string>('');
  const [occurredOn, setOccurredOn] = React.useState('');
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || categories.length > 0) return;
    api
      .get<{ items: CategoryOption[] }>('/api/categories')
      .then((data) => setCategories(data.items))
      .catch(() => setCategories([]));
  }, [open, categories.length]);

  React.useEffect(() => {
    if (open) return;
    // Reset after the sheet closes so the next open starts clean.
    const timer = window.setTimeout(() => {
      setAmountCents(0);
      setDescription('');
      setCategoryId('');
      setOccurredOn('');
      setError(null);
      setMode('expense');
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  const relevant = categories.filter((category) =>
    mode === 'income'
      ? category.kind === 'income' || category.kind === 'both'
      : category.kind === 'expense' || category.kind === 'both',
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (amountCents <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }

    const fallbackDescription =
      description.trim() ||
      relevant.find((category) => category.id === categoryId)?.name ||
      (mode === 'income' ? 'Entrada' : mode === 'reserve' ? 'Guardado' : 'Gasto');

    setSaving(true);
    try {
      await api.post('/api/transactions', {
        type: mode,
        amountCents,
        description: fallbackDescription,
        categoryId: mode === 'reserve' ? null : categoryId || null,
        memberId: memberId || undefined,
        occurredOn: occurredOn || undefined,
      });

      toast.success(
        mode === 'income'
          ? 'Entrada registrada.'
          : mode === 'reserve'
            ? 'Valor guardado.'
            : 'Gasto registrado.',
      );
      onSaved?.();
      onClose();
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Não conseguimos salvar. Tente novamente.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Registrar movimento"
      description="Só o valor já basta. O resto é opcional."
      footer={
        <Button type="submit" form="quick-add-form" fullWidth size="lg" loading={saving}>
          {mode === 'income' ? 'Registrar entrada' : mode === 'reserve' ? 'Guardar' : 'Registrar gasto'}
        </Button>
      }
    >
      <form id="quick-add-form" onSubmit={submit} className="space-y-5">
        <SegmentedControl
          ariaLabel="Tipo de movimento"
          value={mode}
          onChange={(value) => setMode(value)}
          options={[
            { value: 'expense', label: 'Gasto' },
            { value: 'income', label: 'Entrada' },
            { value: 'reserve', label: 'Guardar' },
          ]}
        />

        <Field label="Valor" htmlFor="quick-amount">
          <MoneyInput
            id="quick-amount"
            data-autofocus
            emphasis
            value={amountCents}
            onValueChange={setAmountCents}
            invalid={Boolean(error) && amountCents <= 0}
          />
        </Field>

        <AmountShortcuts onPick={(cents) => setAmountCents((value) => value + cents)} />

        {mode !== 'reserve' && relevant.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink-800">Categoria</legend>
            <div className="flex flex-wrap gap-2">
              {relevant.map((category) => {
                const active = category.id === categoryId;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryId(active ? '' : category.id)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-all',
                      active
                        ? 'ring-2 ring-ink-900 ring-offset-1'
                        : 'opacity-90 hover:opacity-100',
                      categoryChipClass(category.color),
                    )}
                  >
                    <CategoryIcon name={category.icon} className="size-3.5" />
                    {category.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <Field label="Descrição (opcional)" htmlFor="quick-description">
          <Input
            id="quick-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: mercado do mês"
            maxLength={140}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data" htmlFor="quick-date" hint="Deixe vazio para hoje">
            <Input
              id="quick-date"
              type="date"
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </Field>

          <Field label="De quem" htmlFor="quick-member">
            <Select
              id="quick-member"
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
            >
              <option value="">Eu</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-money-out">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
