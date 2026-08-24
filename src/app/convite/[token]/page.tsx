import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { Card } from '@/components/ui/card';
import { AcceptInvite } from '@/components/auth/accept-invite';
import { getRuntime } from '@/server/context';
import { getSessionUser } from '@/domains/auth/session';
import { findUsableInvite } from '@/domains/households/invites';
import { households } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const metadata: Metadata = { title: 'Convite', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Invite landing page for an e-mail that already had an account.
 *
 * The token identifies the invite; it does not authenticate anyone. Accepting
 * requires being signed in as the invited address, checked on the server.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { db } = await getRuntime();

  const invite = await findUsableInvite(db, token);
  const user = await getSessionUser();

  if (!invite) {
    return (
      <AuthShell title="Convite indisponível">
        <Card className="p-7 text-center">
          <p className="text-[0.9375rem] leading-relaxed text-ink-700">
            Este convite não existe mais, já foi usado ou expirou. Peça um novo para quem
            criou o espaço.
          </p>
          <Link
            href="/entrar"
            className="mt-5 inline-flex h-12 items-center rounded-md bg-ink-900 px-6 text-[0.9375rem] font-semibold text-white"
          >
            Ir para o login
          </Link>
        </Card>
      </AuthShell>
    );
  }

  const household = (
    await db.select().from(households).where(eq(households.id, invite.householdId)).limit(1)
  )[0];

  if (!user) {
    return (
      <AuthShell
        title="Você foi convidado"
        subtitle={`Para entrar no espaço "${household?.name ?? ''}", faça login com ${invite.email}.`}
      >
        <Card className="p-7 text-center">
          <p className="text-[0.9375rem] leading-relaxed text-ink-700">
            Esse e-mail já tem uma conta. Entre com ela e você volta direto para cá.
          </p>
          <Link
            href={`/entrar?proximo=${encodeURIComponent(`/convite/${token}`)}`}
            className="mt-5 inline-flex h-12 items-center rounded-md bg-ink-900 px-6 text-[0.9375rem] font-semibold text-white"
          >
            Entrar na minha conta
          </Link>
        </Card>
      </AuthShell>
    );
  }

  const emailMatches = user.email.toLowerCase() === invite.email.toLowerCase();

  return (
    <AuthShell
      title="Convite para um espaço financeiro"
      subtitle={household ? `"${household.name}"` : undefined}
    >
      <Card className="p-7">
        {emailMatches ? (
          <>
            <p className="text-[0.9375rem] leading-relaxed text-ink-700">
              Ao aceitar, você passa a ver e lançar os movimentos deste espaço junto com{' '}
              quem convidou você.
            </p>
            <AcceptInvite token={token} />
          </>
        ) : (
          <>
            <p className="text-[0.9375rem] leading-relaxed text-ink-700">
              Este convite foi enviado para <strong>{invite.email}</strong>, mas você está
              conectado como <strong>{user.email}</strong>.
            </p>
            <p className="mt-3 text-sm text-ink-600">
              Saia desta conta e entre com o e-mail convidado.
            </p>
          </>
        )}
      </Card>
    </AuthShell>
  );
}
