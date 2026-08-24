import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';
import { getSessionUser } from '@/domains/auth/session';
import { formatBRL } from '@/lib/money';
import { getPlan } from '@/config';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user) redirect('/app');

  const params = await searchParams;
  const raw = params.proximo;
  const next = typeof raw === 'string' && raw.startsWith('/') ? raw : '/app';

  return (
    <AuthShell
      title="Que bom ver vocês de novo"
      subtitle="Entre para ver quanto ainda dá para gastar neste ciclo."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link href="/checkout" className="link-underline font-semibold text-ink-900">
            Assinar a partir de {formatBRL(getPlan(null).priceCents)}/mês
          </Link>
        </>
      }
    >
      <SignInForm next={next} />
    </AuthShell>
  );
}
