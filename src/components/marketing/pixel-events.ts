import type { Plan } from '@/config';

/**
 * The only place that speaks to the Meta Pixel.
 *
 * Everything here takes a `Plan` from the server catalogue rather than loose
 * numbers, so an amount reported to Meta can never come from a query string a
 * visitor can edit. `pricing.ts` stays the single source of what things cost,
 * for reporting exactly as it is for charging.
 *
 * Nothing about a couple's money is ever sent: no balances, no goals, no
 * transactions, no chat, no partner, no CPF. Only which plan was looked at or
 * bought, and its catalogue price.
 */

type Fbq = ((...args: unknown[]) => void) | undefined;

function fbq(): Fbq {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { fbq?: Fbq }).fbq;
}

/**
 * Events raised before the pixel script finished loading.
 *
 * The snippet is injected with `afterInteractive`, so a React effect on the
 * first render usually runs BEFORE `window.fbq` exists. Calling it with
 * optional chaining then drops the event silently — which is exactly how the
 * first InitiateCheckout of every visit went missing, with nothing in the code
 * looking wrong.
 *
 * Buffered here and flushed once the script appears. The wait is bounded: if
 * the pixel is blocked or absent, the queue is dropped rather than retried
 * forever.
 */
const buffered: Array<unknown[]> = [];
let flushing = false;

function flushWhenReady(): void {
  if (flushing) return;
  flushing = true;

  let attempts = 0;
  const timer = setInterval(() => {
    const send = fbq();
    attempts += 1;

    if (send) {
      for (const args of buffered.splice(0)) send(...args);
      clearInterval(timer);
      flushing = false;
      return;
    }

    // ~10s. A tracker blocker never resolves, and that is a fine outcome.
    if (attempts > 50) {
      buffered.length = 0;
      clearInterval(timer);
      flushing = false;
    }
  }, 200);
}

function emit(...args: unknown[]): void {
  const send = fbq();
  if (send) {
    send(...args);
    return;
  }

  buffered.push(args);
  flushWhenReady();
}

/** Meta's contents payload for a plan. Same shape for every event. */
function contentsFor(plan: Plan) {
  return {
    currency: 'BRL',
    value: plan.priceCents / 100,
    content_ids: [plan.id],
    content_name: `${plan.name} — Saldo a Dois`,
    content_type: 'product',
  };
}

/** Someone opened the checkout for a specific plan. */
export function trackInitiateCheckout(plan: Plan): void {
  emit('track', 'InitiateCheckout', contentsFor(plan));
}

/**
 * A payment the backend has confirmed.
 *
 * `eventId` must be stable for a given purchase: Meta deduplicates on it, so a
 * reloaded page or a webhook delivered twice reports one conversion, not two.
 * It is also what lets the Pixel and a future Conversions API call describe
 * the same event instead of double counting it.
 */
export function trackPurchase(plan: Plan, eventId: string): void {
  emit('track', 'Purchase', contentsFor(plan), { eventID: eventId });
}

/**
 * Stable id for a purchase, derived from our own checkout row.
 *
 * The checkout id is a random opaque token that identifies a row, not a
 * person — nothing about who bought or what they earn can be read from it.
 */
export function purchaseEventId(checkoutId: string): string {
  return `purchase_${checkoutId}`;
}
