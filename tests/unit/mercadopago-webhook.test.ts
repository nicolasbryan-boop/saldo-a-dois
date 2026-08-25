import { describe, it, expect } from 'vitest';
import { MercadoPagoPaymentProvider } from '@/domains/billing/providers/mercadopago';
import { AppError } from '@/lib/errors';

/**
 * MERCADO PAGO WEBHOOK VERIFICATION
 * =================================
 * These cover the part that decides whether a request is an event at all.
 * A forged, replayed or unsigned notification must be refused before anything
 * is fetched or written — so none of these tests touch the network, and a
 * passing suite proves the rejection paths, not the happy path.
 *
 * The approved-payment path deliberately is NOT covered here: it calls the
 * live API to read the real payment, which cannot be exercised without a
 * Mercado Pago account. That path is untested until credentials exist.
 */

const SECRET = 'whsec_mercadopago_teste';

function provider(secret = SECRET) {
  return new MercadoPagoPaymentProvider('APP_USR-token', 'APP_USR-public', secret);
}

async function sign(secret: string, manifest: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function headersFor(ts: string, v1: string, requestId = 'req-1') {
  return new Headers({
    'x-signature': `ts=${ts},v1=${v1}`,
    'x-request-id': requestId,
  });
}

async function expectForbidden(promise: Promise<unknown>) {
  await expect(promise).rejects.toSatisfy(
    (error: unknown) => error instanceof AppError && error.code === 'forbidden',
  );
}

const BODY = JSON.stringify({ type: 'payment', action: 'payment.updated', data: { id: '123' } });

/** Mercado Pago delivers the resource id as a query parameter, and signs it. */
function notificationUrl(id = '123', type = 'payment') {
  return `https://exemplo.test/api/webhooks/payment/mercadopago?type=${type}&data.id=${id}`;
}

describe('webhook do Mercado Pago', () => {
  it('recusa requisição sem assinatura', async () => {
    await expectForbidden(provider().verifyWebhook(BODY, new Headers(), notificationUrl()));
  });

  it('recusa assinatura sem timestamp', async () => {
    const headers = new Headers({ 'x-signature': 'v1=abc' });
    await expectForbidden(provider().verifyWebhook(BODY, headers, notificationUrl()));
  });

  it('recusa assinatura forjada', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    await expectForbidden(
      provider().verifyWebhook(BODY, headersFor(ts, 'f'.repeat(64)), notificationUrl()),
    );
  });

  it('recusa assinatura feita com outro segredo', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const forged = await sign('segredo-do-atacante', `id:123;request-id:req-1;ts:${ts};`);

    await expectForbidden(provider().verifyWebhook(BODY, headersFor(ts, forged), notificationUrl()));
  });

  it('recusa replay de um evento antigo, mesmo assinado corretamente', async () => {
    // Ten minutes old: the signature checks out, the timestamp does not.
    const ts = String(Math.floor(Date.now() / 1000) - 600);
    const valid = await sign(SECRET, `id:123;request-id:req-1;ts:${ts};`);

    await expectForbidden(provider().verifyWebhook(BODY, headersFor(ts, valid), notificationUrl()));
  });

  it('recusa quando o request-id não é o que foi assinado', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const valid = await sign(SECRET, `id:123;request-id:req-1;ts:${ts};`);

    // Same signature, different request id — the manifest no longer matches.
    await expectForbidden(
      provider().verifyWebhook(BODY, headersFor(ts, valid, 'req-outro'), notificationUrl()),
    );
  });

  it('recusa quando o id do recurso foi trocado no corpo', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const valid = await sign(SECRET, `id:123;request-id:req-1;ts:${ts};`);

    // The signature covers the id in the URL, so pointing the notification at
    // a different resource must break it.
    const tampered = JSON.stringify({ type: 'payment', data: { id: '999' } });
    await expectForbidden(
      provider().verifyWebhook(tampered, headersFor(ts, valid), notificationUrl('999')),
    );
  });

  it('assina pelo id da query, não pelo do corpo', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    // Signed for the id Mercado Pago put in the URL.
    const valid = await sign(SECRET, `id:123;request-id:req-1;ts:${ts};`);

    // A body claiming a different resource does not change the manifest, so
    // this still verifies — and the lookup below uses the URL id.
    const lying = JSON.stringify({ type: 'plan', data: { id: '999' } });
    const outcome = await provider().verifyWebhook(
      lying,
      headersFor(ts, valid),
      notificationUrl('123', 'plan'),
    );

    expect(outcome.kind).toBe('ignored');
    expect(outcome.eventId).toContain('123');
  });

  it('ignora tipos de evento que não interessam, sem chamar a API', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: 'plan', data: { id: '55' } });
    const valid = await sign(SECRET, `id:55;request-id:req-1;ts:${ts};`);

    const outcome = await provider().verifyWebhook(
      body,
      headersFor(ts, valid),
      notificationUrl('55', 'plan'),
    );

    expect(outcome.kind).toBe('ignored');
    expect(outcome.eventId).toBe('plan:55:');
  });
});

describe('Mercado Pago sem credenciais', () => {
  it('recusa verificar webhook e nomeia a variável que falta', async () => {
    const bare = new MercadoPagoPaymentProvider('', '', '');

    await expect(bare.verifyWebhook(BODY, new Headers(), notificationUrl())).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AppError &&
        error.code === 'not_configured' &&
        error.message.includes('MERCADOPAGO_ACCESS_TOKEN') &&
        error.message.includes('MERCADOPAGO_WEBHOOK_SECRET'),
    );
  });

  it('não inventa preço: o valor cobrado vem sempre do nosso catálogo', async () => {
    // There is no code path that accepts an amount from the caller — the
    // charge methods take a planId and look the price up themselves.
    const bare = new MercadoPagoPaymentProvider('', '', '');

    await expect(
      bare.createPixCharge({
        checkoutId: 'chk_1',
        email: 'a@b.test',
        planId: 'anual',
        amountCents: 1,
        description: 'x',
        notificationUrl: 'https://exemplo.test/webhook',
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === 'not_configured',
    );
  });
});
