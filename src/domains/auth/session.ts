import { headers } from 'next/headers';
import { getAuth } from './server';
import { errors } from '@/lib/errors';
import { getRuntime, getAdminEmails } from '@/server/context';

/**
 * Server-side session access.
 *
 * Everything that touches household data goes through `requireUser()` first.
 * There is no client-supplied identity anywhere in the authorization path.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  mustChangePassword: boolean;
  isAdmin: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const auth = await getAuth();
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) return null;

  const raw = result.user as {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    mustChangePassword?: boolean | null;
    isAdmin?: boolean | null;
  };

  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    image: raw.image ?? null,
    mustChangePassword: Boolean(raw.mustChangePassword),
    isAdmin: Boolean(raw.isAdmin),
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw errors.unauthenticated();
  return user;
}

/**
 * A user with a temporary password may only reach the password-change flow.
 * Every other authenticated entry point calls this.
 */
export async function requireActiveUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.mustChangePassword) throw errors.passwordChangeRequired();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireActiveUser();
  const { env } = await getRuntime();
  const allowed = getAdminEmails(env);
  const isAllowed = user.isAdmin || allowed.includes(user.email.toLowerCase());
  if (!isAllowed) throw errors.forbidden('Área restrita.');
  return user;
}

export async function isAdminUser(user: SessionUser): Promise<boolean> {
  const { env } = await getRuntime();
  return user.isAdmin || getAdminEmails(env).includes(user.email.toLowerCase());
}
