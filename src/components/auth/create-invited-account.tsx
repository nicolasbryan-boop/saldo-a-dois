'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api-client';
import { signIn } from '@/domains/auth/client';

/**
 * The partner sets their own password from the invite link.
 *
 * Two steps on purpose: the server creates the account from the token, then
 * the browser signs in normally with the password just chosen. Better Auth
 * stays the only thing that issues a session, and no temporary password is
 * ever generated, shown or sent.
 */
export function CreateInvitedAccount({
  token,
  email,
  name,
}: {
  token: string;
  email: string;
  name: string;
}) {
  const router = useRouter();

  const [password, setPassword] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirmation.length > 0 && confirmation !== password;
  const canSubmit = password.length >= 8 && confirmation === password && !loading;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post('/api/convite/criar-conta', { token, password });
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Não conseguimos criar sua conta. Tente de novo.',
      );
      setLoading(false);
      return;
    }

    const result = await signIn.email({ email, password });

    if (result.error) {
      // The account exists at this point, so send them to sign in by hand
      // rather than leaving them staring at a dead form.
      router.push('/entrar');
      return;
    }

    // Straight into their own onboarding.
    router.push('/onboarding');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <p className="text-sm text-ink-600">
        Você vai entrar como <strong>{email}</strong>. Escolha uma senha só sua — quem
        convidou você não vê essa senha.
      </p>

      <Field
        label="Sua senha"
        htmlFor="senha"
        error={tooShort ? 'Use pelo menos 8 caracteres.' : undefined}
      >
        <Input
          id="senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      <Field
        label="Repita a senha"
        htmlFor="senha-confirmacao"
        error={mismatch ? 'As senhas não são iguais.' : undefined}
      >
        <Input
          id="senha-confirmacao"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          required
        />
      </Field>

      <Button type="submit" size="lg" fullWidth loading={loading} disabled={!canSubmit}>
        Criar minha conta
      </Button>

      {error && (
        <p role="alert" className="text-sm font-medium text-money-out">
          {error}
        </p>
      )}

      <p className="text-center text-xs text-ink-500">
        Convite enviado para {name}.
      </p>
    </form>
  );
}
