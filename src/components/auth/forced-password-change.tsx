'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api-client';

export function ForcedPasswordChange() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [repeat, setRepeat] = React.useState('');
  const [loading, setLoading] = React.useState(false);
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

    setLoading(true);
    try {
      await api.post('/api/conta/senha', { currentPassword, newPassword });
      router.push('/app');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Não conseguimos alterar a senha. Tente novamente.',
      );
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 sm:p-7">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Senha temporária"
          htmlFor="temp-password"
          hint="A que a pessoa que criou o espaço passou para você."
        >
          <Input
            id="temp-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </Field>

        <Field label="Nova senha" htmlFor="forced-new" hint="Pelo menos 8 caracteres.">
          <Input
            id="forced-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            required
          />
        </Field>

        <Field label="Repita a nova senha" htmlFor="forced-repeat">
          <Input
            id="forced-repeat"
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
          Criar minha senha e entrar
        </Button>
      </form>
    </Card>
  );
}
