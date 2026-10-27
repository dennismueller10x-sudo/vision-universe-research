// Stripe ohne SDK: Webhook-Signatur und die wenigen API-Aufrufe, die wir brauchen.

import {hmacSha256Hex, timingSafeEqual} from './crypto.mjs';

export class StripeError extends Error {
  constructor(status, code, message) {
    super(code || 'STRIPE_ERROR');
    this.status = status;
    this.code = code;
    this.stripeMessage = message;
  }
}

// https://docs.stripe.com/webhooks#verify-manually
// Kopf: "t=<unix>,v1=<hex>[,v1=<hex>]". Signiert wird "<t>.<roher Koerper>".
export async function verifyStripeSignature(rawBody, header, secret, {toleranceSec = 300, now = Date.now()} = {}) {
  if (!secret || !String(secret).startsWith('whsec_')) throw new StripeError(500, 'WEBHOOK_SECRET_MISSING');
  const items = String(header || '').split(',').map(p => p.trim().split('='));
  const t = Number((items.find(([k]) => k === 't') || [])[1]);
  const signatures = items.filter(([k]) => k === 'v1').map(([, v]) => v || '');
  if (!Number.isInteger(t) || !signatures.length) throw new StripeError(400, 'SIGNATURE_HEADER_INVALID');
  if (Math.abs(Math.floor(now / 1000) - t) > toleranceSec) throw new StripeError(400, 'SIGNATURE_TIMESTAMP_OUT_OF_TOLERANCE');
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  if (!signatures.some(sig => timingSafeEqual(sig, expected))) throw new StripeError(400, 'SIGNATURE_INVALID');
  let event;
  try { event = JSON.parse(rawBody); } catch { throw new StripeError(400, 'PAYLOAD_INVALID'); }
  if (!event || typeof event.id !== 'string' || !event.id.startsWith('evt_') || typeof event.type !== 'string') {
    throw new StripeError(400, 'PAYLOAD_INVALID');
  }
  return event;
}

// Fuer Simulation und Tests: denselben Kopf erzeugen, den Stripe sendet.
export async function signStripePayload(rawBody, secret, timestampSec = Math.floor(Date.now() / 1000)) {
  return `t=${timestampSec},v1=${await hmacSha256Hex(secret, `${timestampSec}.${rawBody}`)}`;
}

// Stripe erwartet application/x-www-form-urlencoded mit Klammer-Schluesseln.
export function formEncode(params, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) value.forEach((v, i) => (v && typeof v === 'object') ? formEncode(v, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(v)));
    else if (typeof value === 'object') formEncode(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

export function createStripeClient({secretKey, apiBase = 'https://api.stripe.com', apiVersion, fetchImpl}) {
  async function request(method, path, params, {idempotencyKey} = {}) {
    const headers = {Authorization: `Bearer ${secretKey}`, 'Stripe-Version': apiVersion};
    let url = apiBase + path, body;
    if (method === 'GET' && params) url += '?' + formEncode(params).toString();
    else if (params) { body = formEncode(params).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetchImpl(url, {method, headers, body});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new StripeError(res.status, data.error?.code || data.error?.type || 'STRIPE_ERROR', data.error?.message);
    return data;
  }
  return {
    createCustomer: ({email, userId}) => request('POST', '/v1/customers',
      {email, metadata: {vu_user_id: userId}, preferred_locales: ['de']}, {idempotencyKey: `vu-customer-${userId}`}),
    updateCustomer: (id, params) => request('POST', `/v1/customers/${encodeURIComponent(id)}`, params),
    createCheckoutSession: (params, idempotencyKey) => request('POST', '/v1/checkout/sessions', params, {idempotencyKey}),
    createPortalSession: params => request('POST', '/v1/billing_portal/sessions', params),
    retrieveSubscription: id => request('GET', `/v1/subscriptions/${encodeURIComponent(id)}`, {expand: ['items.data.price']}),
    listSubscriptions: customer => request('GET', '/v1/subscriptions', {customer, status: 'all', limit: 20}),
    updateSubscription: (id, params, idempotencyKey) => request('POST', `/v1/subscriptions/${encodeURIComponent(id)}`, params, {idempotencyKey}),
    cancelSubscription: id => request('DELETE', `/v1/subscriptions/${encodeURIComponent(id)}`),
    retrievePrice: id => request('GET', `/v1/prices/${encodeURIComponent(id)}`),
    retrieveInvoice: id => request('GET', `/v1/invoices/${encodeURIComponent(id)}`),
  };
}
