'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Copy, Check, Trash2, Crown, Heart } from 'lucide-react';
import { Card, SectionTitle } from '@/components/ui/card';
import { CoupleSides, SharedGoals, type CoupleSidesProps } from './couple-sides';
import { Sheet, ConfirmSheet } from '@/components/ui/sheet';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
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
  /** Each person's money, side by side, plus the couple total. */
  sides: CoupleSidesProps;
  /** Goals belong to the household; both sides can add to them. */
  sharedGoals: React.ComponentProps<typeof SharedGoals>['goals'];
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

  const canInvite = props.isOwner && props.members.length < pricing.maxMembers;

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
          {props.members.length} de {pricing.maxMembers} pessoas · uma assinatura para
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
        <SectionTitle>O dinheiro de cada um</SectionTitle>
        <CoupleSides {...props.sides} />
        {/* Putting both sides next to each other is exactly where this needs
            saying: the split is here to plan together, not to audit. */}
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          Cada um lança o que é seu. Isso existe para vocês enxergarem o todo juntos, não
          para prestar contas um ao outro.
        </p>
      </section>

      <section>
        <SectionTitle>Metas do casal</SectionTitle>
        <SharedGoals goals={props.sharedGoals} />
      </section>

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
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<InviteResult | null>(null);

  React.useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      setName('');
      setEmail('');
      setError(null);
      setResult(null);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    setSaving(true);
    try {
      const response = await api.post<InviteResult>('/api/household/parceiro', {
        name: name.trim(),
        email: email.trim(),
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
        {(
          <div className="space-y-4">
            {/* Never claim to have sent something that did not go out. */}
            <p className="text-[0.9375rem] leading-relaxed text-ink-700">
              {result.emailDelivered === false ? (
                <>
                  O convite de <strong>{result.name}</strong> está pronto, mas não
                  conseguimos enviar o e-mail para {result.email}. Copie o link abaixo e
                  mande para ele(a) por onde preferir.
                </>
              ) : (
                <>
                  Enviamos o convite para <strong>{result.email}</strong>.
                </>
              )}
            </p>

            <p className="text-sm leading-relaxed text-ink-600">
              Ao abrir o link, {result.name} escolhe a própria senha e faz o próprio
              cadastro de receitas e gastos. Você não vê essa senha — nem precisa.
            </p>

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
      description="Enviamos um convite por e-mail. Ele(a) escolhe a própria senha."
      footer={
        <Button type="submit" form="invite-form" fullWidth size="lg" loading={saving}>
          Enviar convite
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

        {error && (
          <p role="alert" className="text-sm font-medium text-money-out">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

