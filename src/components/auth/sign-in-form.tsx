'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { signIn } from '@/domains/auth/client';

export function SignInForm({ next = '/app' }: { next?: string }) {
  const router = useRouter();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn.email({ email: email.trim(), password });

    if (result.error) {
      // Deliberately generic: never reveal whether the e-mail exists.
      setError(
        result.error.status === 429
          ? 'Muitas tentativas. Aguarde um instante e tente de novo.'
          : 'E-mail ou senha incorretos.',
      );
      setLoading(false);
      return;
    }

    // A partner signing in with a temporary password is routed to the change
    // screen by the app layout; sending them to /app is enough.
    router.push(next.startsWith('/') ? next : '/app');
    router.refresh();
  }

  return (
    <Card className="p-6 sm:p-7">
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail" htmlFor="signin-email">
          <Input
            id="signin-email"
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

        <Field label="Senha" htmlFor="signin-password">
          <Input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>

        {error && (
          <p role="alert" className="text-sm font-medium text-money-out">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth loading={loading}>
          Entrar
        </Button>

        <p className="text-center text-sm">
          <Link href="/esqueci-senha" className="link-underline text-ink-600">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </Card>
  );
}
