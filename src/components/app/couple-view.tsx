'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Copy, Check, Trash2, Crown, Heart } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, SectionTitle } from '@/components/ui/card';
import { Sheet, ConfirmSheet } from '@/components/ui/sheet';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { formatBRL } from '@/lib/money';
import { branding, pricing } from '@/config';

export interface CoupleMember {
  id: string;
  userId: string;
  name: string;
  role: 'owner' | 'partner';
  accentColor: string;
  spentCents: number;
}

export interface CoupleViewProps {
  householdName: string;
  members: CoupleMember[];
  sharedSpentCents: number;
  reservedCents: number;
  cycleLabel: string;
  isOwner: boolean;
  currentMemberId: string;
  pendingInvites: Array<{ id: string; email: string; name: string; token: string }>;
  /** Only present outside production, where e-mail may not be configured. */
  appUrl: string;
}

export function CoupleView(props: CoupleViewProps) {
  const router = useRouter();
  const toast = useToast();

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<CoupleMember | null>(null);
  const [removingBusy, setRemovingBusy] = React.useState(false);

  async function removePartner() {
    if (!removing) return;
    setRemovingBusy(true);
    try {
      await api.delete(`/api/household/parceiro/${removing.id}`);
      toast.success(`${removing.name} saiu do espaço.`);
      setRemoving(null);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Não conseguimos remover.',
      );
    } finally {
      setRemovingBusy(false);
    }
  }

  const canInvite = props.isOwner && props.members.length < pricing.plan.maxMembers;
  const totalSpent =
    props.members.reduce((sum, member) => sum + member.spentCents, 0) +
    props.sharedSpentCents;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Casal</h1>
        <p className="text-xs text-ink-500">Organizem juntos. Ciclo {props.cycleLabel}.</p>
      </div>

      <Card className="p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
          Espaço financeiro
        </p>
        <p className="mt-1 flex items-center gap-2 font-display text-xl font-semibold text-ink-900">
          <span aria-hidden>{branding.glyph}</span>
          {props.householdName}
        </p>
        <p className="mt-1 text-sm text-ink-600">
          {props.members.length} de {pricing.plan.maxMembers} pessoas · uma assinatura para
          os dois
        </p>
      </Card>

      {canInvite && (
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="flex w-full items-center gap-4 rounded-lg border-2 border-dashed border-rose-300 bg-rose-50 p-5 text-left transition-colors hover:bg-rose-100"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-rose-500 text-white">
            <UserPlus aria-hidden className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-semibold text-rose-700">
              Adicionar meu parceiro
            </span>
            <span className="block text-sm leading-snug text-rose-700/80">
              Ele entra no celular dele e vê exatamente o mesmo espaço.
            </span>
          </span>
        </button>
      )}

      <section>
        <SectionTitle>Quem está aqui</SectionTitle>
        <div className="space-y-3">
          {props.members.map((member) => (
            <Card key={member.id} className="flex items-center gap-3.5 p-4">
              <Avatar name={member.name} accent={member.accentColor} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-semibold text-ink-900">
                  {member.name}
                  {member.id === props.currentMemberId && (
                    <span className="text-xs font-medium text-ink-400">(você)</span>
                  )}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                  {member.role === 'owner' ? (
                    <>
                      <Crown aria-hidden className="size-3" />
                      Criou o espaço
                    </>
                  ) : (
                    <>
                      <Heart aria-hidden className="size-3" />
                      Parceiro
                    </>
                  )}
                </p>
                <p className="tabular mt-1.5 text-[0.9375rem] font-semibold text-ink-900">
                  {formatBRL(member.spentCents)}{' '}
                  <span className="text-xs font-normal text-ink-500">gastos no ciclo</span>
                </p>
              </div>

              {props.isOwner && member.role === 'partner' && (
                <button
                  type="button"
                  onClick={() => setRemoving(member)}
                  aria-label={`Remover ${member.name}`}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-money-out-soft hover:text-money-out"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              )}
            </Card>
          ))}
        </div>
      </section>

      {props.pendingInvites.length > 0 && (
        <section>
          <SectionTitle>Convite pendente</SectionTitle>
          {props.pendingInvites.map((invite) => (
            <Card key={invite.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{invite.name}</p>
                  <p className="truncate text-xs text-ink-500">{invite.email}</p>
                </div>
                <Badge tone="warning">Aguardando</Badge>
              </div>
              <CopyLink url={`${props.appUrl}/convite/${invite.token}`} />
            </Card>
          ))}
        </section>
      )}

      <section>
        <SectionTitle>Gastos do ciclo</SectionTitle>
        <Card className="p-5">
          <div className="space-y-4">
            {props.members.map((member) => (
              <SpendBar
                key={member.id}
                label={member.name}
                value={member.spentCents}
                total={totalSpent}
                accent={member.accentColor}
              />
            ))}
            <SpendBar
              label="Casa / compartilhado"
              value={props.sharedSpentCents}
              total={totalSpent}
              accent="slate"
            />
          </div>

          <div className="mt-5 flex items-baseline justify-between border-t border-ink-100 pt-4">
            <span className="text-sm font-medium text-ink-600">Guardado no ciclo</span>
            <span className="tabular font-semibold text-[#8a5b02]">
              {formatBRL(props.reservedCents)}
            </span>
          </div>
        </Card>

        <p className="mt-3 rounded-md bg-cream-100 px-4 py-3 text-xs leading-relaxed text-ink-600">
          Estes números existem para vocês decidirem juntos, não para prestar contas um ao
          outro. A conta é do casal.
        </p>
      </section>

      {props.members.length === 1 && !props.isOwner && (
        <EmptyState
          icon={UserPlus}
          title="Só quem criou o espaço pode convidar."
          description="Peça para a pessoa que assinou adicionar você ou outra pessoa ao espaço."
        />
      )}

      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <ConfirmSheet
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={removePartner}
        loading={removingBusy}
        title={`Remover ${removing?.name ?? ''}?`}
        message="A pessoa perde o acesso a este espaço. Os lançamentos que ela fez continuam no histórico de vocês, e a conta dela não é apagada."
        confirmLabel="Remover do espaço"
        destructive
      />
    </div>
  );
}

function SpendBar({
  label,
  value,
  total,
  accent,
}: {
  label: string;
  value: number;
  total: number;
  accent: string;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  const colors: Record<string, string> = {
    rose: 'bg-rose-500',
    sky: 'bg-[#3b93d9]',
    amber: 'bg-amber-500',
    emerald: 'bg-money-in',
    violet: 'bg-[#7c5cd6]',
    slate: 'bg-ink-400',
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium text-ink-800">{label}</span>
        <span className="tabular shrink-0 text-sm font-semibold text-ink-900">
          {formatBRL(value)}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className={cn('h-full rounded-full transition-[width] duration-700', colors[accent] ?? colors.slate)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard denied: the link is visible in the field anyway.
        }
      }}
      className="mt-3 flex w-full items-center gap-2 rounded-md border border-ink-200 bg-cream-50 px-3 py-2.5 text-left text-xs"
    >
      <span className="min-w-0 flex-1 truncate font-mono text-ink-600">{url}</span>
      {copied ? (
        <Check aria-hidden className="size-4 shrink-0 text-money-in" />
      ) : (
        <Copy aria-hidden className="size-4 shrink-0 text-ink-500" />
      )}
      <span className="sr-only">Copiar link do convite</span>
    </button>
  );
}

interface InviteResult {
  kind: 'provisioned' | 'link';
  email: string;
  name: string;
  inviteUrl?: string;
  emailDelivered?: boolean;
}

function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<InviteResult | null>(null);

  React.useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      setName('');
      setEmail('');
      setPassword('');
      setError(null);
      setResult(null);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  function suggestPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    setPassword(Array.from(bytes, (byte) => chars[byte % chars.length]).join(''));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha temporária precisa ter pelo menos 8 caracteres.');
      return;
    }

    setSaving(true);
    try {
      const response = await api.post<InviteResult>('/api/household/parceiro', {
        name: name.trim(),
        email: email.trim(),
        temporaryPassword: password,
      });
      setResult(response);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não conseguimos convidar.');
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={result.kind === 'provisioned' ? 'Pronto!' : 'Convite criado'}
        footer={
          <Button
            fullWidth
            onClick={() => {
              onClose();
              router.refresh();
            }}
          >
            Entendi
          </Button>
        }
      >
        {result.kind === 'provisioned' ? (
          <div className="space-y-4">
            <p className="text-[0.9375rem] leading-relaxed text-ink-700">
              A conta de <strong>{result.name}</strong> foi criada. Passe estes dados para
              ele(a) entrar no próprio celular:
            </p>

            <div className="space-y-2 rounded-lg border border-ink-200 bg-cream-50 p-4">
              <Row label="E-mail" value={result.email} />
              <Row label="Senha temporária" value={password} mono />
            </div>

            <p className="rounded-md bg-money-hold-soft px-3.5 py-3 text-xs leading-relaxed text-[#8a5b02]">
              No primeiro acesso o app obriga a trocar essa senha. Depois disso a senha
              temporária deixa de funcionar — então não precisa guardá-la.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[0.9375rem] leading-relaxed text-ink-700">
              Esse e-mail já tem uma conta no {branding.name}, então não criamos outra nem
              mexemos na senha dela. Ela precisa aceitar o convite estando logada.
            </p>
            {result.emailDelivered === false && (
              <p className="rounded-md bg-money-hold-soft px-3.5 py-3 text-xs leading-relaxed text-[#8a5b02]">
                O envio de e-mail ainda não está configurado neste ambiente, então nenhuma
                mensagem foi enviada de verdade. Mande o link abaixo por conta própria.
              </p>
            )}
            {result.inviteUrl && <CopyLink url={result.inviteUrl} />}
          </div>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Adicionar meu parceiro"
      description="Ele entra com o próprio e-mail e a própria senha."
      footer={
        <Button type="submit" form="invite-form" fullWidth size="lg" loading={saving}>
          Criar acesso
        </Button>
      }
    >
      <form id="invite-form" onSubmit={submit} className="space-y-4">
        <Field label="Nome" htmlFor="invite-name">
          <Input
            id="invite-name"
            data-autofocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Lucas"
            autoComplete="off"
            maxLength={80}
            required
          />
        </Field>

        <Field label="E-mail" htmlFor="invite-email">
          <Input
            id="invite-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="lucas@exemplo.com"
            autoComplete="off"
            required
          />
        </Field>

        <Field
          label="Senha temporária"
          htmlFor="invite-password"
          hint="Ele será obrigado a trocar no primeiro acesso."
        >
          <div className="flex gap-2">
            <Input
              id="invite-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              minLength={8}
              maxLength={128}
              required
              className="font-mono"
            />
            <Button type="button" variant="secondary" onClick={suggestPassword}>
              Gerar
            </Button>
          </div>
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs font-semibold text-ink-500">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-sm font-semibold text-ink-900',
          mono && 'font-mono',
        )}
      >
        {value}
      </span>
    </div>
  );
}
