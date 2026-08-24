'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { requestPasswordReset } from '@/domains/auth/client';
import { MailCheck } from 'lucide-react';

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const result = await requestPasswordReset({
      email: email.trim(),
      redirectTo: '/redefinir-senha',
    });

    setLoading(false);

    if (result.error && result.error.status === 429) {
      setError('Muitas tentativas. Aguarde alguns minutos.');
      return;
    }

    // Always the same outcome, so this page cannot be used to discover which
    // e-mail addresses have accounts.
    setSent(true);
  }

  if (sent) {
    return (
      <Card className="p-7 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-money-in-soft">
          <MailCheck aria-hidden className="size-5 text-money-in" />
        </span>
        <p className="mt-4 font-display text-lg font-semibold text-ink-900">
          Se existir uma conta, o link já está a caminho.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          Confira a caixa de entrada de <strong>{email}</strong>. O link vale por 1 hora.
        </p>
        <p className="mt-4 rounded-md bg-cream-100 px-4 py-3 text-xs leading-relaxed text-ink-500">
          Em desenvolvimento nenhum e-mail sai de verdade: a mensagem fica registrada no
          log do servidor e na tabela email_outbox.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-7">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Seu e-mail" htmlFor="forgot-email">
          <Input
            id="forgot-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@exemplo.com"
            required
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm font-medium text-money-out">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth loading={loading}>
          Enviar link de redefinição
        </Button>
      </form>
    </Card>
  );
}
