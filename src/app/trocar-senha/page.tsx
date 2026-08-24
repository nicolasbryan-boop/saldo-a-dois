import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { ForcedPasswordChange } from '@/components/auth/forced-password-change';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { requireUser } from '@/domains/auth/session';

export const metadata: Metadata = { title: 'Definir nova senha' };
export const dynamic = 'force-dynamic';

/**
 * Where a partner lands on their first sign-in.
 *
 * The owner chose their temporary password, so it is a shared secret by
 * definition. This screen is the only thing reachable until it is replaced,
 * and replacing it revokes every session opened with the old one.
 */
export default async function ForcePasswordChangePage() {
  const user = await requireUser();
  if (!user.mustChangePassword) redirect('/app');

  return (
    <AuthShell
      title={`Bem-vindo(a), ${user.name.split(' ')[0]}!`}
      subtitle="Antes de começar, crie uma senha só sua. A senha temporária deixa de funcionar agora."
      footer={<SignOutButton label="Sair" />}
    >
      <ForcedPasswordChange />
    </AuthShell>
  );
}
