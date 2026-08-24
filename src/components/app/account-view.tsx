'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, KeyRound, CreditCard, ShieldAlert, FileText } from 'lucide-react';
import { Card, SectionTitle } from '@/components/ui/card';
import { Sheet, ConfirmSheet } from '@/components/ui/sheet';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { signOut } from '@/domains/auth/client';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { branding, pricing } from '@/config';
import type { SubscriptionStatus } from '@/db/schema';

export interface AccountViewProps {
  user: { name: string; email: string };
  role: 'owner' | 'partner';
  householdName: string;
  subscription: {
    status: SubscriptionStatus;
    statusLabel: string;
    priceCents: number;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    provider: string;
  } | null;
}

export function AccountView({ user, role, householdName, subscription }: AccountViewProps) {
  const router = useRouter();
  const toast = useToast();

  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function logout() {
    await signOut();
    router.push('/entrar');
    router.refresh();
  }

  async function cancelSubscription() {
    setBusy(true);
    try {
      await api.post('/api/assinatura/cancelar');
      toast.success('Assinatura cancelada. O acesso vai até o fim do período pago.');
      setConfirmCancel(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Não conseguimos cancelar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Conta</h1>
        <p className="text-xs text-ink-500">Seus dados, assinatura e privacidade.</p>
      </div>

      <Card className="p-5">
        <p className="font-display text-lg font-semibold text-ink-900">{user.name}</p>
        <p className="mt-0.5 text-sm text-ink-600">{user.email}</p>
        <p className="mt-3 text-xs text-ink-500">
          {role === 'owner' ? 'Criou' : 'Faz parte d'}o espaço{' '}
          <strong className="text-ink-700">{householdName}</strong>
        </p>
      </Card>

      <section>
        <SectionTitle>Assinatura</SectionTitle>
        <Card className="p-5">
          {subscription ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink-900">Plano {pricing.plan.name}</p>
                  <p className="tabular mt-0.5 text-sm text-ink-600">
                    {formatBRL(subscription.priceCents)}/mês por casal
                  </p>
                </div>
                <Badge
                  tone={
                    subscription.status === 'active'
                      ? 'positive'
                      : subscription.status === 'past_due'
                        ? 'warning'
                        : 'negative'
                  }
                >
                  {subscription.statusLabel}
                </Badge>
              </div>

              {subscription.currentPeriodEnd && (
                <p className="mt-4 border-t border-ink-100 pt-4 text-sm text-ink-600">
                  {subscription.cancelAtPeriodEnd
                    ? `Acesso liberado até ${formatDateBR(subscription.currentPeriodEnd)}. Depois disso a assinatura encerra.`
                    : `Próxima cobrança em ${formatDateBR(subscription.currentPeriodEnd)}.`}
                </p>
              )}

              {subscription.provider === 'mock' && (
                <p className="mt-3 rounded-md bg-money-hold-soft px-3.5 py-2.5 text-xs leading-relaxed text-[#8a5b02]">
                  Esta assinatura foi criada pelo gateway simulado de desenvolvimento.
                  Nenhuma cobrança real aconteceu.
                </p>
              )}

              {role === 'owner' && !subscription.cancelAtPeriodEnd && (
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => setConfirmCancel(true)}
                >
                  <CreditCard aria-hidden className="size-4" />
                  Cancelar assinatura
                </Button>
              )}

              {role === 'partner' && (
                <p className="mt-4 text-xs leading-relaxed text-ink-500">
                  Quem criou o espaço cuida da assinatura. Você tem acesso completo às
                  finanças de vocês.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-600">Nenhuma assinatura ativa neste espaço.</p>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Segurança</SectionTitle>
        <Card className="divide-y divide-ink-100">
          <button
            type="button"
            onClick={() => setPasswordOpen(true)}
            className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-cream-50"
          >
            <KeyRound aria-hidden className="size-4.5 shrink-0 text-ink-500" />
            <span className="flex-1 text-[0.9375rem] font-semibold text-ink-900">
              Alterar minha senha
            </span>
          </button>

          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-cream-50"
          >
            <LogOut aria-hidden className="size-4.5 shrink-0 text-ink-500" />
            <span className="flex-1 text-[0.9375rem] font-semibold text-ink-900">Sair</span>
          </button>
        </Card>
      </section>

      <section>
        <SectionTitle>Privacidade</SectionTitle>
        <Card className="divide-y divide-ink-100">
          <Link
            href="/privacidade"
            className="flex w-full items-center gap-3.5 px-5 py-4 transition-colors hover:bg-cream-50"
          >
            <FileText aria-hidden className="size-4.5 shrink-0 text-ink-500" />
            <span className="flex-1 text-[0.9375rem] font-medium text-ink-800">
              Política de Privacidade
            </span>
          </Link>
          <Link
            href="/termos"
            className="flex w-full items-center gap-3.5 px-5 py-4 transition-colors hover:bg-cream-50"
          >
            <FileText aria-hidden className="size-4.5 shrink-0 text-ink-500" />
            <span className="flex-1 text-[0.9375rem] font-medium text-ink-800">
              Termos de Uso
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-money-out-soft"
          >
            <ShieldAlert aria-hidden className="size-4.5 shrink-0 text-money-out" />
            <span className="flex-1 text-[0.9375rem] font-semibold text-money-out">
              Excluir minha conta
            </span>
          </button>
        </Card>
      </section>

      <p className="pb-4 text-center text-xs text-ink-400">
        {branding.name} · organização financeira, não é banco
      </p>

      <PasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <DeleteAccountSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        isOwner={role === 'owner'}
      />

      <ConfirmSheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={cancelSubscription}
        loading={busy}
        title="Cancelar a assinatura?"
        message="Vocês continuam com acesso até o fim do período já pago. Depois disso o espaço fica bloqueado, mas os dados não são apagados."
        confirmLabel="Cancelar assinatura"
        destructive
      />
    </div>
  );
}

export function PasswordSheet({
  open,
  onClose,
  forced = false,
}: {
  open: boolean;
  onClose: () => void;
  forced?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [repeat, setRepeat] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== repeat) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/conta/senha', { currentPassword, newPassword });
      toast.success('Senha alterada.');
      setCurrentPassword('');
      setNewPassword('');
      setRepeat('');
      onClose();
      if (forced) router.push('/app');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não conseguimos alterar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Alterar senha"
      description="Ao trocar, as outras sessões abertas são encerradas."
      footer={
        <Button type="submit" form="password-form" fullWidth loading={saving}>
          Salvar nova senha
        </Button>
      }
    >
      <form id="password-form" onSubmit={submit} className="space-y-4">
        <Field label="Senha atual" htmlFor="current-password">
          <Input
            id="current-password"
            data-autofocus
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </Field>

        <Field label="Nova senha" htmlFor="new-password" hint="Pelo menos 8 caracteres.">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            required
          />
        </Field>

        <Field label="Repita a nova senha" htmlFor="repeat-password">
          <Input
            id="repeat-password"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            minLength={8}
            required
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm font-medium text-money-out">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

function DeleteAccountSheet({
  open,
  onClose,
  isOwner,
}: {
  open: boolean;
  onClose: () => void;
  isOwner: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      await api.post('/api/conta/excluir', { password, confirm });
      router.push('/');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não conseguimos excluir.');
      toast.error('Não foi possível excluir a conta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Excluir minha conta"
      description="Esta ação não pode ser desfeita."
      footer={
        <Button
          type="submit"
          form="delete-form"
          variant="danger"
          fullWidth
          loading={saving}
          disabled={confirm !== 'EXCLUIR'}
        >
          Excluir definitivamente
        </Button>
      }
    >
      <form id="delete-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-money-out/30 bg-money-out-soft p-4 text-sm leading-relaxed text-[#8a2a2a]">
          {isOwner ? (
            <>
              Você criou este espaço, então excluir sua conta também apaga o espaço
              financeiro inteiro: lançamentos, contas, metas e histórico das duas pessoas.
            </>
          ) : (
            <>
              Sua conta será apagada e você sai do espaço. O histórico do casal continua
              com quem criou o espaço.
            </>
          )}
        </div>

        <Field label="Sua senha" htmlFor="delete-password">
          <Input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>

        <Field
          label="Digite EXCLUIR para confirmar"
          htmlFor="delete-confirm"
          hint="Em letras maiúsculas."
        >
          <Input
            id="delete-confirm"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value.toUpperCase())}
            autoComplete="off"
            required
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm font-medium text-money-out">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
