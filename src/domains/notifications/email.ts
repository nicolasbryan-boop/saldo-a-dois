import { ids } from '@/lib/ids';
import { emailOutbox } from '@/db/schema';
import type { Database } from '@/db';
import { readEnv, isProduction } from '@/server/context';
import { branding } from '@/config';

/**
 * E-mail delivery abstraction.
 *
 * There are exactly two behaviours and neither of them lies:
 *  - `console`: nothing is sent. The message is persisted in `email_outbox`
 *    and the caller is told `delivered: false`, so development flows can be
 *    exercised end to end without pretending an e-mail left the building.
 *  - `resend`: a real HTTP send. Without RESEND_API_KEY it reports
 *    `not_configured` instead of silently succeeding.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text body. Kept simple and readable; also used as the HTML source. */
  body: string;
  kind: 'password_reset' | 'partner_invite' | 'welcome' | 'generic';
}

export interface EmailResult {
  delivered: boolean;
  /** Provider-side id, when the provider returns one. */
  messageId?: string;
  provider: string;
  status: 'sent' | 'queued' | 'failed' | 'not_configured';
  /** Present only outside production, so dev can follow the link. */
  previewBody?: string;
  error?: string;
}

export interface EmailProvider {
  readonly id: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

async function record(
  db: Database,
  message: EmailMessage,
  provider: string,
  status: EmailResult['status'],
  error?: string,
  providerMessageId?: string,
): Promise<void> {
  await db.insert(emailOutbox).values({
    id: ids.email(),
    to: message.to,
    subject: message.subject,
    body: message.body,
    kind: message.kind,
    provider,
    status: status === 'sent' ? 'sent' : status === 'failed' ? 'failed' : status === 'not_configured' ? 'not_configured' : 'queued',
    error: error ?? null,
    providerMessageId: providerMessageId ?? null,
    createdAt: new Date(),
  });
}

class ConsoleEmailProvider implements EmailProvider {
  readonly id = 'console';

  constructor(
    private readonly db: Database,
    private readonly production: boolean,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    await record(this.db, message, this.id, 'queued');

    if (!this.production) {
      // Intentional: the developer needs the reset/invite link.
      console.warn(
        `[email:console] Nenhum e-mail foi enviado de verdade.\n  Para: ${message.to}\n  Assunto: ${message.subject}\n${message.body}`,
      );
    }

    return {
      delivered: false,
      provider: this.id,
      status: 'queued',
      previewBody: this.production ? undefined : message.body,
    };
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly id = 'resend';

  constructor(
    private readonly db: Database,
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    if (!this.apiKey) {
      await record(this.db, message, this.id, 'not_configured', 'RESEND_API_KEY ausente');
      return {
        delivered: false,
        provider: this.id,
        status: 'not_configured',
        error: 'RESEND_API_KEY não configurada.',
      };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.body,
        }),
      });

      if (!response.ok) {
        // Resend puts the actionable part in the body — an unverified sending
        // domain and a key without permission both surface as 403, and the
        // status alone cannot tell them apart. Storing only the code made a
        // failed send undebuggable.
        let reason = '';
        try {
          const body = (await response.json()) as { message?: string; name?: string };
          reason = [body.name, body.message].filter(Boolean).join(': ');
        } catch {
          reason = '';
        }

        const detail = `HTTP ${response.status}${reason ? ` — ${reason}` : ''}`.slice(0, 300);
        await record(this.db, message, this.id, 'failed', detail);
        return { delivered: false, provider: this.id, status: 'failed', error: detail };
      }

      // "sent" only means Resend accepted the request. The id is what makes
      // the real outcome — delivered, bounced, complained — knowable later.
      let messageId = '';
      try {
        const body = (await response.json()) as { id?: string };
        messageId = typeof body.id === 'string' ? body.id : '';
      } catch {
        messageId = '';
      }

      await record(this.db, message, this.id, 'sent', undefined, messageId);
      return { delivered: true, provider: this.id, status: 'sent', messageId };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'erro desconhecido';
      await record(this.db, message, this.id, 'failed', detail);
      return { delivered: false, provider: this.id, status: 'failed', error: detail };
    }
  }
}

/**
 * The address messages are sent from, and the domain inside it.
 *
 * Exported so the health check can report the sender that is ACTUALLY used
 * rather than recomputing it. The two had drifted apart: health parsed the raw
 * variable while the provider applied a fallback, so they disagreed about
 * which domain was in play and the real reason for a rejected send stayed
 * hidden behind a contradiction.
 */
export function resolveSender(env?: Partial<CloudflareEnv>): {
  from: string;
  domain: string;
  usingFallback: boolean;
} {
  const configured = readEnv(env, 'EMAIL_FROM').trim();

  // A value without an address in it cannot be a sender. Treating it as one
  // sends Resend something it will reject for a reason that points nowhere.
  const usable = configured.includes('@') ? configured : '';
  const from = usable || `${branding.name} <nao-responda@${branding.domain}>`;

  return {
    from,
    domain: from.match(/@([^>\s]+)/)?.[1] ?? '',
    usingFallback: !usable,
  };
}

export function getEmailProvider(
  db: Database,
  env?: Partial<CloudflareEnv>,
): EmailProvider {
  const configured = readEnv(env, 'EMAIL_PROVIDER') || 'console';
  const production = isProduction(env);

  if (configured === 'resend') {
    return new ResendEmailProvider(
      db,
      readEnv(env, 'RESEND_API_KEY').trim(),
      resolveSender(env).from,
    );
  }

  return new ConsoleEmailProvider(db, production);
}

export function passwordResetEmail(to: string, url: string, name: string): EmailMessage {
  return {
    to,
    kind: 'password_reset',
    subject: `Redefinir sua senha — ${branding.name}`,
    body: [
      `Olá, ${name}.`,
      '',
      `Recebemos um pedido para redefinir a senha da sua conta no ${branding.name}.`,
      'Use o link abaixo para criar uma nova senha. Ele vale por 1 hora.',
      '',
      url,
      '',
      'Se não foi você, pode ignorar esta mensagem: nada muda sem você acessar o link.',
    ].join('\n'),
  };
}

export function partnerInviteEmail(
  to: string,
  name: string,
  householdName: string,
  url: string,
): EmailMessage {
  return {
    to,
    kind: 'partner_invite',
    subject: `${name} convidou você para o espaço "${householdName}"`,
    body: [
      `Olá!`,
      '',
      `${name} está organizando as finanças de vocês no ${branding.name} e convidou você para o espaço "${householdName}".`,
      '',
      'Aceite o convite por aqui:',
      url,
      '',
      'O convite vale por 7 dias.',
    ].join('\n'),
  };
}
