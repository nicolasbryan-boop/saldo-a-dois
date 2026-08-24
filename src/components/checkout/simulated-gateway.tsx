'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api-client';

export function SimulatedGateway({
  checkoutId,
  alreadyPaid,
}: {
  checkoutId: string;
  alreadyPaid: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function approve() {
    setError(null);
    setLoading(true);
    try {
      await api.post(`/api/checkout/simulado/${checkoutId}`);
      router.push(`/checkout/retorno/${checkoutId}`);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : 'Não conseguimos simular o pagamento.',
      );
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <Button size="lg" fullWidth loading={loading} onClick={approve}>
        {alreadyPaid ? 'Continuar' : 'Aprovar pagamento'}
      </Button>

      <Button
        variant="ghost"
        fullWidth
        onClick={() => router.push('/checkout?cancelado=1')}
        disabled={loading}
      >
        Cancelar
      </Button>

      {error && (
        <p role="alert" className="text-sm font-medium text-money-out">
          {error}
        </p>
      )}
    </div>
  );
}
