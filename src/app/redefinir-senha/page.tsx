import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = { title: 'Redefinir senha' };
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.token;
  const token = typeof raw === 'string' ? raw : '';

  return (
    <AuthShell title="Crie uma nova senha" subtitle="Depois disso, é só entrar normalmente.">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
