import { and, eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createLocalAccountIssuer } from '@better-auth/core/db';
import type { Database } from '@/db';
import {
  user as userTable,
  account as accountTable,
  partnerInvites,
  householdMembers,
} from '@/db/schema';
import { ids, secureToken, randomId } from '@/lib/ids';
import { errors } from '@/lib/errors';
import { pricing } from '@/config';
import {
  assertOwner,
  assertCanAddMember,
  addMember,
  findUserByEmail,
  findHouseholdForUser,
  type HouseholdRow,
} from './service';
import { writeAudit, trackEvent } from '@/domains/analytics/audit';
import { getEmailProvider, partnerInviteEmail } from '@/domains/notifications/email';

/**
 * PARTNER ONBOARDING
 * ==================
 * Two shapes, because the e-mail may or may not already have an account:
 *
 *  - `provisioned`: brand new e-mail. The owner sets a temporary password, we
 *    create the account with `must_change_password = true`, and the partner is
 *    forced to replace that password before reaching any app screen.
 *
 *  - `link`: the e-mail already belongs to someone. We NEVER touch that
 *    account's password or silently move them; we create a token they must
 *    accept while signed in as themselves.
 *
 * The password is hashed with Better Auth's own hasher, so the credential this
 * writes is byte-compatible with a normal sign-up. No plaintext is stored, and
 * no temporary password is ever written to a log or an audit row.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ProvisionResult =
  | { kind: 'provisioned'; email: string; name: string }
  | { kind: 'link'; email: string; name: string; inviteUrl: string; emailDelivered: boolean };

export interface ProvisionInput {
  name: string;
  email: string;
  temporaryPassword: string;
}

export async function invitePartner(
  db: Database,
  params: {
    household: HouseholdRow;
    actorUserId: string;
    actorName: string;
    appUrl: string;
    env?: Partial<CloudflareEnv>;
    input: ProvisionInput;
  },
): Promise<ProvisionResult> {
  const { household, actorUserId, input } = params;

  await assertOwner(db, actorUserId, household.id);
  await assertCanAddMember(db, household.id);

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!name) throw errors.validation('Informe o nome do seu parceiro.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw errors.validation('Informe um e-mail válido.');
  }
  if (input.temporaryPassword.length < 8) {
    throw errors.validation('A senha temporária precisa ter pelo menos 8 caracteres.');
  }

  const existing = await findUserByEmail(db, email);

  if (existing) {
    if (existing.id === actorUserId) {
      throw errors.validation('Esse é o seu próprio e-mail.');
    }

    const currentHousehold = await findHouseholdForUser(db, existing.id);
    if (currentHousehold?.id === household.id) {
      throw errors.conflict('Essa pessoa já faz parte do seu espaço.');
    }
    if (currentHousehold) {
      throw errors.conflict(
        'Esse e-mail já faz parte de outro espaço financeiro. A pessoa precisa sair de lá antes.',
      );
    }

    const token = secureToken();
    const now = new Date();

    await db.insert(partnerInvites).values({
      id: ids.invite(),
      householdId: household.id,
      email,
      name,
      token,
      status: 'pending',
      kind: 'link',
      invitedByUserId: actorUserId,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      createdAt: now,
    });

    const inviteUrl = `${params.appUrl}/convite/${token}`;
    const provider = getEmailProvider(db, params.env);
    const delivery = await provider.send(
      partnerInviteEmail(email, params.actorName, household.name, inviteUrl),
    );

    await writeAudit(db, {
      householdId: household.id,
      actorUserId,
      action: 'partner.invite_link_created',
      entity: 'partner_invite',
      meta: { kind: 'link' },
    });

    await trackEvent(db, {
      name: 'partner_invited',
      householdId: household.id,
      userId: actorUserId,
      props: { kind: 'link' },
    });

    return { kind: 'link', email, name, inviteUrl, emailDelivered: delivery.delivered };
  }

  // Brand new account, provisioned by the owner.
  const now = new Date();
  const userId = `usr_${randomId(20)}`;
  const passwordHash = await hashPassword(input.temporaryPassword);

  await db.insert(userTable).values({
    id: userId,
    name,
    email,
    emailVerified: false,
    mustChangePassword: true,
    isAdmin: false,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(accountTable).values({
    id: `acc_${randomId(20)}`,
    // Same issuer Better Auth writes on a normal e-mail sign-up, taken from
    // its own helper so the two can never drift apart.
    issuer: createLocalAccountIssuer('credential'),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
  });

  await addMember(db, {
    householdId: household.id,
    userId,
    displayName: name,
    role: 'partner',
    actorUserId,
  });

  await db.insert(partnerInvites).values({
    id: ids.invite(),
    householdId: household.id,
    email,
    name,
    token: secureToken(),
    status: 'accepted',
    kind: 'provisioned',
    invitedByUserId: actorUserId,
    acceptedByUserId: userId,
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    createdAt: now,
    acceptedAt: now,
  });

  await writeAudit(db, {
    householdId: household.id,
    actorUserId,
    action: 'partner.provisioned',
    entity: 'user',
    entityId: userId,
    // Deliberately no password material of any kind.
    meta: { kind: 'provisioned' },
  });

  await trackEvent(db, {
    name: 'partner_invited',
    householdId: household.id,
    userId: actorUserId,
    props: { kind: 'provisioned' },
  });

  return { kind: 'provisioned', email, name };
}

/**
 * Looks up an invite that can still be acted on.
 *
 * The expiry comparison lives here rather than in the page so the render stays
 * a pure function of its inputs.
 */
export async function findUsableInvite(db: Database, token: string) {
  const invite = await findInviteByToken(db, token);
  if (!invite) return null;
  if (invite.status !== 'pending') return null;
  if (invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

export async function findInviteByToken(db: Database, token: string) {
  const rows = await db
    .select()
    .from(partnerInvites)
    .where(eq(partnerInvites.token, token))
    .limit(1);
  return rows[0] ?? null;
}

/** Attaches an already-signed-in user to the household that invited them. */
export async function acceptInvite(
  db: Database,
  token: string,
  userId: string,
  userEmail: string,
): Promise<{ householdId: string }> {
  const invite = await findInviteByToken(db, token);

  if (!invite || invite.status !== 'pending') {
    throw errors.notFound('Convite inválido ou já utilizado.');
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await db
      .update(partnerInvites)
      .set({ status: 'expired' })
      .where(eq(partnerInvites.id, invite.id));
    throw errors.conflict('Este convite expirou. Peça um novo.');
  }
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw errors.forbidden('Este convite foi enviado para outro e-mail.');
  }

  const currentHousehold = await findHouseholdForUser(db, userId);
  if (currentHousehold && currentHousehold.id !== invite.householdId) {
    throw errors.conflict('Você já faz parte de outro espaço financeiro.');
  }

  await assertCanAddMember(db, invite.householdId);

  await addMember(db, {
    householdId: invite.householdId,
    userId,
    displayName: invite.name,
    role: 'partner',
    actorUserId: userId,
  });

  await db
    .update(partnerInvites)
    .set({ status: 'accepted', acceptedByUserId: userId, acceptedAt: new Date() })
    .where(eq(partnerInvites.id, invite.id));

  await trackEvent(db, {
    name: 'partner_joined',
    householdId: invite.householdId,
    userId,
  });

  return { householdId: invite.householdId };
}

export async function revokePendingInvites(
  db: Database,
  householdId: string,
): Promise<void> {
  await db
    .update(partnerInvites)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(partnerInvites.householdId, householdId),
        eq(partnerInvites.status, 'pending'),
      ),
    );
}

export async function listPendingInvites(db: Database, householdId: string) {
  return db
    .select({
      id: partnerInvites.id,
      email: partnerInvites.email,
      name: partnerInvites.name,
      token: partnerInvites.token,
      createdAt: partnerInvites.createdAt,
      expiresAt: partnerInvites.expiresAt,
    })
    .from(partnerInvites)
    .where(
      and(
        eq(partnerInvites.householdId, householdId),
        eq(partnerInvites.status, 'pending'),
      ),
    );
}

/**
 * Removes the partner from the household. Their account keeps existing — this
 * is not an account deletion, and their own data elsewhere is untouched.
 */
export async function detachPartner(
  db: Database,
  householdId: string,
  actorUserId: string,
  memberId: string,
): Promise<void> {
  await assertOwner(db, actorUserId, householdId);

  const rows = await db
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.id, memberId),
        eq(householdMembers.householdId, householdId),
      ),
    )
    .limit(1);

  const member = rows[0];
  if (!member) throw errors.notFound('Pessoa não encontrada neste espaço.');
  if (member.role === 'owner') {
    throw errors.conflict('Não é possível remover quem criou o espaço.');
  }
  if (pricing.plan.maxMembers < 2) throw errors.internal();

  await db
    .update(householdMembers)
    .set({ status: 'removed', removedAt: new Date() })
    .where(eq(householdMembers.id, memberId));

  await writeAudit(db, {
    householdId,
    actorUserId,
    action: 'partner.removed',
    entity: 'household_member',
    entityId: memberId,
  });
}
