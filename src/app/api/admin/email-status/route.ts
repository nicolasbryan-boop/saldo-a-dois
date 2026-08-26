import { desc } from 'drizzle-orm';
import { handle, jsonOk } from '@/server/api';
import { getRuntime, readEnv } from '@/server/context';
import { requireAdmin } from '@/domains/auth/session';
import { emailOutbox } from '@/db/schema';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * What actually happened to the last messages we sent.
 *
 * `sent` in our own table only records that Resend accepted the request. It
 * says nothing about whether anyone received the message — a bounce, a spam
 * rejection or a silent drop all look identical from our side. This asks
 * Resend for the real outcome of each message we have an id for.
 *
 * Admin-only, and deliberately conservative about what it returns: the
 * recipient is masked and the body — which carries invite tokens and password
 * reset links — is never included.
 */

function maskEmail(value: string): string {
  const [local, domain] = value.split('@');
  if (!domain) return '***';
  return `${(local ?? '').slice(0, 3)}***@${domain}`;
}

export const GET = handle(async () => {
  await requireAdmin();

  const { db, env } = await getRuntime();
  const apiKey = readEnv(env, 'RESEND_API_KEY').trim();
  if (!apiKey) throw errors.notConfigured('RESEND_API_KEY não configurada.');

  const rows = await db
    .select({
      id: emailOutbox.id,
      to: emailOutbox.to,
      kind: emailOutbox.kind,
      status: emailOutbox.status,
      error: emailOutbox.error,
      messageId: emailOutbox.providerMessageId,
      createdAt: emailOutbox.createdAt,
    })
    .from(emailOutbox)
    .orderBy(desc(emailOutbox.createdAt))
    .limit(10);

  const mensagens = await Promise.all(
    rows.map(async (row) => {
      const base = {
        tipo: row.kind,
        destino: maskEmail(row.to),
        aceitoPeloResend: row.status === 'sent',
        erro: row.error ?? null,
        quando: row.createdAt.toISOString(),
      };

      if (!row.messageId) {
        return {
          ...base,
          entrega: row.status === 'sent' ? 'sem id — enviado antes desta correção' : 'não enviado',
        };
      }

      try {
        const response = await fetch(`https://api.resend.com/emails/${row.messageId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!response.ok) {
          return { ...base, entrega: `consulta falhou (HTTP ${response.status})` };
        }

        const detail = (await response.json()) as {
          last_event?: string;
          bounced_at?: string | null;
        };

        return {
          ...base,
          // Resend's own vocabulary: delivered, bounced, complained,
          // delivery_delayed, sent.
          entrega: detail.last_event ?? 'desconhecida',
          bounce: detail.bounced_at ?? null,
        };
      } catch {
        return { ...base, entrega: 'não foi possível consultar' };
      }
    }),
  );

  return jsonOk({ mensagens });
});
