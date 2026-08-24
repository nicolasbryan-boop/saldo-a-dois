'use client';

import { useRouter } from 'next/navigation';
import { signOut } from '@/domains/auth/client';

export function SignOutButton({ label = 'Sair' }: { label?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        router.push('/entrar');
        router.refresh();
      }}
      className="link-underline text-sm font-medium text-ink-600"
    >
      {label}
    </button>
  );
}
