'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api-client';

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function accept() {
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<{ redirectTo: string }>('/api/convite', { token });
      router.push(result.redirectTo);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : 'Não conseguimos aceitar o convite.',
      );
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <Button size="lg" fullWidth loading={loading} onClick={accept}>
        Aceitar convite
      </Button>

      {error && (
        <p role="alert" className="text-sm font-medium text-money-out">
          {error}
        </p>
      )}
    </div>
  );
}
