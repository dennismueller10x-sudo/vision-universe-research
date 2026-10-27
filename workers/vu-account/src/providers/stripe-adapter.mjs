// Stripe -> anbieterunabhaengiger Schnappschuss (Eingabe fuer billing_apply_*).
// Liest beide Formen der Stripe-API: vor 2025-03-31 lagen die Periodenfelder
// am Abo, seit "basil" an den Abo-Positionen; die Abo-Kennung einer Rechnung
// liegt seit "basil" unter parent.subscription_details.

const iso = seconds => (typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000).toISOString() : null);
const id = value => (value && typeof value === 'object' ? value.id : value) || null;

// Stripe-Status -> kanonischer Status (subscription_status in der Datenbank).
export const STRIPE_STATUS = Object.freeze({
  incomplete: 'incomplete',
  incomplete_expired: 'expired',
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'unpaid',
  canceled: 'canceled',
  paused: 'paused',
});

export function normalizeStripeSubscription(sub, {stateAt}) {
  const items = sub?.items?.data || [];
  if (sub?.object !== 'subscription' || !items.length) throw new Error('STRIPE_SUBSCRIPTION_SHAPE');
  if (items.length !== 1) throw new Error('STRIPE_SUBSCRIPTION_MULTIPLE_ITEMS'); // ein Tarif je Abo
  const item = items[0];
  const status = STRIPE_STATUS[sub.status];
  if (!status) throw new Error('STRIPE_STATUS_UNKNOWN');
  return {
    provider: 'stripe',
    provider_subscription_id: sub.id,
    provider_customer_id: id(sub.customer),
    provider_price_id: id(item.price),
    status,
    current_period_start: iso(item.current_period_start ?? sub.current_period_start),
    current_period_end: iso(item.current_period_end ?? sub.current_period_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    cancel_at: iso(sub.cancel_at),
    canceled_at: iso(sub.canceled_at),
    ended_at: iso(sub.ended_at),
    trial_end: iso(sub.trial_end),
    grace_until: null,
    livemode: Boolean(sub.livemode),
    claimed_user_id: sub.metadata?.vu_user_id || null,
    state_at: stateAt,
  };
}

export function stripeInvoiceSubscriptionId(inv) {
  return id(inv?.parent?.subscription_details?.subscription) || id(inv?.subscription) || null;
}

export function normalizeStripeInvoice(inv, {stateAt}) {
  if (inv?.object !== 'invoice') throw new Error('STRIPE_INVOICE_SHAPE');
  const https = url => (typeof url === 'string' && url.startsWith('https://') ? url : null);
  return {
    provider: 'stripe',
    provider_invoice_id: inv.id,
    provider_customer_id: id(inv.customer),
    provider_subscription_id: stripeInvoiceSubscriptionId(inv),
    number: inv.number || null,
    status: inv.status,
    currency: String(inv.currency || '').toUpperCase(),
    amount_due: inv.amount_due ?? 0,
    amount_paid: inv.amount_paid ?? 0,
    hosted_invoice_url: https(inv.hosted_invoice_url),
    invoice_pdf: https(inv.invoice_pdf),
    period_start: iso(inv.period_start),
    period_end: iso(inv.period_end),
    issued_at: iso(inv.status_transitions?.finalized_at ?? inv.created),
    paid_at: iso(inv.status_transitions?.paid_at),
    livemode: Boolean(inv.livemode),
    state_at: stateAt,
  };
}
