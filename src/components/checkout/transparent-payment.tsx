'use client';

import * as React from 'react';
import Script from 'next/script';
import { QrCode, CreditCard, Copy, Check, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api-client';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/cn';
import { getPlan, type PlanId } from '@/config';

/**
 * Pay without leaving the site.
 *
 * Pix renders the QR code and the copy-paste string we get back from the
 * gateway. Card is collected by the gateway's own SDK, mounted into our page
 * as secure iframes: the fields below are not ours, the value never enters
 * React state, and what we post to our API is a single-use token.
 *
 * NOT YET EXERCISED WITH REAL CREDENTIALS. No Mercado Pago account is
 * connected to this project, so this flow has never completed a payment. The
 * first run in a Mercado Pago test account is the real integration test.
 */

interface PixResult {
  method: 'pix';
  checkoutId: string;
  code: string;
  qrCodeBase64: string;
  expiresAt: string | null;
}

interface CardResult {
  method: 'card';
  checkoutId: string;
  status: 'approved' | 'pending' | 'rejected';
  statusDetail: string;
}

type MpFields = {
  create: (
    kind: string,
    options: Record<string, unknown>,
  ) => { mount: (id: string) => void };
};

type MpInstance = {
  fields: MpFields;
  createCardToken: (data: Record<string, unknown>) => Promise<{ id: string }>;
};

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MpInstance;
  }
}

const CARD_MESSAGES: Record<string, string> = {
  cc_rejected_bad_filled_card_number: 'Confira o número do cartão.',
  cc_rejected_bad_filled_date: 'Confira a validade do cartão.',
  cc_rejected_bad_filled_security_code: 'Confira o código de segurança.',
  cc_rejected_insufficient_amount: 'Cartão sem limite disponível.',
  cc_rejected_high_risk: 'O pagamento foi recusado pelo banco. Tente outro cartão.',
  cc_rejected_call_for_authorize: 'Autorize a compra com o seu banco e tente de novo.',
};

export function TransparentPayment({
  planId,
  email,
  publicKey,
  onFallback,
}: {
  planId: PlanId;
  email: string;
  publicKey: string;
  /** Called when the transparent flow cannot run, so the page can redirect. */
  onFallback: () => void;
}) {
  const [method, setMethod] = React.useState<'pix' | 'card'>('pix');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pix, setPix] = React.useState<PixResult | null>(null);
  const [card, setCard] = React.useState<CardResult | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [sdkReady, setSdkReady] = React.useState(false);
  const [document, setDocument] = React.useState('');
  const [holder, setHolder] = React.useState('');

  const mp = React.useRef<MpInstance | null>(null);
  const plan = getPlan(planId);

  // Mount the gateway's card fields once the SDK is available. They are
  // iframes owned by the gateway — this component never sees their contents.
  React.useEffect(() => {
    if (method !== 'card' || !sdkReady || mp.current || !window.MercadoPago) return;

    const instance = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
    mp.current = instance;

    instance.fields
      .create('cardNumber', { placeholder: '0000 0000 0000 0000' })
      .mount('mp-card-number');
    instance.fields.create('expirationDate', { placeholder: 'MM/AA' }).mount('mp-card-expiry');
    instance.fields.create('securityCode', { placeholder: 'CVV' }).mount('mp-card-cvv');
  }, [method, sdkReady, publicKey]);

  async function payWithPix() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<PixResult>('/api/checkout/transparente', {
        method: 'pix',
        email,
        planId,
        // Brazilian acquirers usually require the payer's tax id for Pix.
        payerDocument: document.replace(/\D/g, '') || undefined,
        payerName: holder.trim() || undefined,
      });
      setPix(result);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === 'not_configured') {
        onFallback();
        return;
      }
      setError(
        cause instanceof ApiClientError ? cause.message : 'Não conseguimos gerar o Pix.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function payWithCard(event: React.FormEvent) {
    event.preventDefault();
    if (!mp.current) return;

    setLoading(true);
    setError(null);

    try {
      // Tokenisation happens inside the gateway's script, from the iframes.
      const token = await mp.current.createCardToken({
        cardholderName: holder.trim(),
        identificationType: 'CPF',
        identificationNumber: document.replace(/\D/g, ''),
      });

      const result = await api.post<CardResult>('/api/checkout/transparente', {
        method: 'card',
        email,
        planId,
        cardToken: token.id,
        payerDocument: document.replace(/\D/g, ''),
      });

      setCard(result);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Não conseguimos processar o cartão. Confira os dados e tente de novo.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!pix) return;
    await navigator.clipboard.writeText(pix.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  /* ------------------------------------------------------------------ */
  /* Pix generated                                                       */
  /* ------------------------------------------------------------------ */
  if (pix) {
    return (
      <Card className="space-y-4 p-6 text-center">
        <h2 className="text-lg font-semibold text-ink-900">Pague com Pix</h2>
        <p className="text-sm text-ink-600">
          Abra o app do seu banco, escaneie o código e pronto. A liberação é automática.
        </p>

        {pix.qrCodeBase64 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/png;base64,${pix.qrCodeBase64}`}
            alt="QR Code do Pix"
            className="mx-auto size-56 rounded-lg border border-ink-200 bg-white p-2"
          />
        ) : null}

        <div className="rounded-lg border border-ink-200 bg-cream-50 p-3">
          <p className="break-all font-mono text-[11px] leading-relaxed text-ink-700">
            {pix.code}
          </p>
        </div>

        <Button type="button" fullWidth variant="secondary" onClick={copyCode}>
          {copied ? (
            <>
              <Check className="size-4" aria-hidden /> Copiado
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden /> Copiar código Pix
            </>
          )}
        </Button>

        <p className="flex items-center justify-center gap-2 text-xs text-ink-500">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Aguardando o pagamento. Esta página libera sozinha quando cair.
        </p>
      </Card>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Card submitted                                                      */
  /* ------------------------------------------------------------------ */
  if (card) {
    const approved = card.status === 'approved';
    return (
      <Card className="space-y-3 p-6 text-center">
        <h2 className="text-lg font-semibold text-ink-900">
          {approved
            ? 'Pagamento aprovado'
            : card.status === 'pending'
              ? 'Pagamento em análise'
              : 'Pagamento recusado'}
        </h2>
        <p className="text-sm text-ink-600">
          {approved
            ? 'Estamos liberando o seu acesso. Em instantes você cria a sua senha.'
            : card.status === 'pending'
              ? 'O banco ainda está confirmando. Assim que confirmar, liberamos o acesso.'
              : (CARD_MESSAGES[card.statusDetail] ??
                'O banco recusou a cobrança. Tente outro cartão ou pague com Pix.')}
        </p>

        {card.status === 'rejected' ? (
          <Button type="button" fullWidth onClick={() => setCard(null)}>
            Tentar de novo
          </Button>
        ) : null}
      </Card>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Method picker                                                       */
  /* ------------------------------------------------------------------ */
  return (
    <div className="space-y-4">
      <Script
        src="https://sdk.mercadopago.com/js/v2"
        onReady={() => setSdkReady(true)}
        strategy="lazyOnload"
      />

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { id: 'pix' as const, label: 'Pix', icon: QrCode, hint: 'Liberação na hora' },
            {
              id: 'card' as const,
              label: 'Cartão',
              icon: CreditCard,
              hint: 'Renova sozinho',
            },
          ]
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setMethod(option.id)}
            className={cn(
              'flex flex-col items-start gap-1 rounded-lg border p-3.5 text-left transition',
              method === option.id
                ? 'border-ink-900 bg-white shadow-sm'
                : 'border-ink-200 bg-cream-50 hover:border-ink-300',
            )}
            aria-pressed={method === option.id}
          >
            <option.icon className="size-4 text-ink-700" aria-hidden />
            <span className="text-sm font-semibold text-ink-900">{option.label}</span>
            <span className="text-[11px] text-ink-500">{option.hint}</span>
          </button>
        ))}
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-ink-600">Plano {plan.name}</span>
          <span className="tabular text-lg font-bold text-ink-900">
            {formatBRL(plan.priceCents)}
          </span>
        </div>

        {method === 'pix' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void payWithPix();
            }}
            className="space-y-4"
          >
            <Field label="Seu nome" htmlFor="pix-nome">
              <Input
                id="pix-nome"
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                autoComplete="name"
                required
              />
            </Field>

            <Field label="Seu CPF" htmlFor="pix-cpf">
              <Input
                id="pix-cpf"
                inputMode="numeric"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder="000.000.000-00"
                required
              />
            </Field>

            <Button type="submit" fullWidth size="lg" loading={loading}>
              Gerar código Pix
            </Button>
          </form>
        ) : (
          <form onSubmit={payWithCard} className="space-y-4">
            <Field label="Nome impresso no cartão" htmlFor="card-holder">
              <Input
                id="card-holder"
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                autoComplete="cc-name"
                required
              />
            </Field>

            <Field label="Número do cartão" htmlFor="mp-card-number">
              {/* Filled by the gateway's iframe. Nothing here reads it. */}
              <div
                id="mp-card-number"
                className="h-12 rounded-md border border-ink-200 bg-white px-3.5"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Validade" htmlFor="mp-card-expiry">
                <div
                  id="mp-card-expiry"
                  className="h-12 rounded-md border border-ink-200 bg-white px-3.5"
                />
              </Field>
              <Field label="CVV" htmlFor="mp-card-cvv">
                <div
                  id="mp-card-cvv"
                  className="h-12 rounded-md border border-ink-200 bg-white px-3.5"
                />
              </Field>
            </div>

            <Field label="CPF do titular" htmlFor="card-document">
              <Input
                id="card-document"
                inputMode="numeric"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder="000.000.000-00"
                required
              />
            </Field>

            <Button type="submit" fullWidth size="lg" loading={loading} disabled={!sdkReady}>
              {sdkReady ? 'Pagar e criar minha conta' : 'Carregando pagamento seguro...'}
            </Button>
          </form>
        )}

        {error ? (
          <p role="alert" className="text-sm font-medium text-money-out">
            {error}
          </p>
        ) : null}

        <p className="text-center text-[11px] leading-relaxed text-ink-500">
          Os dados do cartão vão direto para o processador de pagamento. Eles não passam
          nem ficam guardados nos nossos servidores.
        </p>
      </Card>
    </div>
  );
}
