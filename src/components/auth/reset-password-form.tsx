'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { resetPassword } from '@/domains/auth/client';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();

  const [password, setPassword] = React.useState('');
  const [repeat, setRepeat] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== repeat) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }

    setLoading(true);
    const result = await resetPassword({ newPassword: password, token });
    setLoading(false);

    if (result.error) {
      setError('Este link expirou ou já foi usado. Peça um novo.');
      return;
    }

    setDone(true);
  }

  if (!token) {
    return (
      <Card className="p-7 text-center">
        <p className="font-display text-lg font-semibold text-ink-900">Link inválido.</p>
        <p className="mt-2 text-sm text-ink-600">
          Este endereço não traz um token de redefinição.
        </p>
        <Link
          href="/esqueci-senha"
          className="mt-5 inline-flex h-12 items-center rounded-md bg-ink-900 px-5 text-[0.9375rem] font-semibold text-white"
        >
          Pedir um novo link
        </Link>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="p-7 text-center">
        <p className="font-display text-lg font-semibold text-ink-900">Senha alterada.</p>
        <p className="mt-2 text-sm text-ink-600">Agora é só entrar com a nova senha.</p>
        <Button className="mt-5" fullWidth onClick={() => router.push('/entrar')}>
          Ir para o login
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-7">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova senha" htmlFor="reset-password" hint="Pelo menos 8 caracteres.">
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </Field>

        <Field label="Repita a nova senha" htmlFor="reset-repeat">
          <Input
            id="reset-repeat"
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

        <Button type="submit" size="lg" fullWidth loading={loading}>
          Salvar nova senha
        </Button>
      </form>
    </Card>
  );
}
