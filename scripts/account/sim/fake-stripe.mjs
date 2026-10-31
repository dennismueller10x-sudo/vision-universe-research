// Simuliertes Stripe (Testmodus) fuer Tests und lokale Entwicklung.
// Bildet die API-Teile ab, die vu-account nutzt, in der Objektform ab
// API-Version 2025-03-31.basil (Perioden an den Abo-Positionen, Abo der
// Rechnung unter parent.subscription_details). Jede Zustandsaenderung erzeugt
// ein Ereignis wie bei Stripe; deliver() stellt sie SIGNIERT zu.
import {randomBytes} from 'node:crypto';
import {signStripePayload} from '../../../workers/vu-account/src/stripe.mjs';

const rid = prefix => `${prefix}_${randomBytes(9).toString('base64url').replace(/[-_]/g, 'x')}`;
const DAY = 86400;

export const SIM_PRICES = Object.freeze({
  price_test_plus_month: {interval: 'month', amount: 990},
  price_test_plus_year: {interval: 'year', amount: 9900},
  price_test_pro_month: {interval: 'month', amount: 1990},
  price_test_pro_year: {interval: 'year', amount: 19900},
});

// "a[b][0][c]=x" -> {a: {b: [{c: 'x'}]}}
export function formDecode(text) {
  const out = {};
  for (const [key, value] of new URLSearchParams(text)) {
    const parts = key.replace(/\]/g, '').split('[');
    let node = out;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      const nextIsIndex = !last && /^\d+$/.test(parts[i + 1]);
      if (last) node[p] = value;
      else node = node[p] ??= nextIsIndex ? [] : {};
    });
  }
  return out;
}

export function createFakeStripe({secretKey = 'sk_test_local_simulation', webhookSecret = 'whsec_local_simulation',
  checkoutBase = 'https://checkout.stripe.com/c/pay', portalBase = 'https://billing.stripe.com/p/session', now = () => Date.now()}) {
  const customers = new Map(), sessions = new Map(), subscriptions = new Map(), invoices = new Map();
  const idempotency = new Map();
  const priceOverrides = new Map(); // Simulation: Preis im Stripe-Dashboard geaendert
  let taxSettings = {status: 'active'}; // Simulation: Stripe Tax im Dashboard
  const events = [];
  const t = () => Math.floor(now() / 1000);

  const emit = (type, object) => events.push({id: rid('evt'), object: 'event', type, created: t(), livemode: false,
    api_version: '2025-03-31.basil', data: {object: structuredClone(object)}, delivered: false});
  const reply = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
  const notFound = what => reply(404, {error: {type: 'invalid_request_error', code: 'resource_missing', message: `No such ${what}`}});

  function makeInvoice(sub, {paid}) {
    const item = sub.items.data[0];
    const inv = {id: rid('in'), object: 'invoice', customer: sub.customer, livemode: false, currency: 'eur',
      number: `SIM-${String(invoices.size + 1).padStart(4, '0')}`, status: paid ? 'paid' : 'open',
      amount_due: item.price.unit_amount, amount_paid: paid ? item.price.unit_amount : 0,
      hosted_invoice_url: `https://invoice.stripe.com/i/sim/${invoices.size + 1}`, invoice_pdf: `https://pay.stripe.com/invoice/sim/${invoices.size + 1}/pdf`,
      period_start: item.current_period_start, period_end: item.current_period_end, created: t(),
      status_transitions: {finalized_at: t(), paid_at: paid ? t() : null},
      parent: {type: 'subscription_details', subscription_details: {subscription: sub.id}}};
    invoices.set(inv.id, inv);
    sub.latest_invoice = inv.id;
    emit('invoice.finalized', inv);
    emit(paid ? 'invoice.paid' : 'invoice.payment_failed', inv);
    return inv;
  }

  const createdPrices = new Map(); // Simulation: in der Tarifverwaltung angelegte Preise
  function priceObject(id) {
    if (createdPrices.has(id)) return createdPrices.get(id);
    const p = SIM_PRICES[id];
    if (!p) return null;
    return {id, object: 'price', product: `prod_sim_${String(id).replace(/^price_test_/, '').split('_')[0]}`, unit_amount: p.amount,
      currency: 'eur', recurring: {interval: p.interval, interval_count: 1}, tax_behavior: 'inclusive', lookup_key: `vu_${id.replace(/^price_test_/, '')}`,
      active: true, livemode: false};
  }

  function newSubscription(session, {paid}) {
    const price = priceObject(session.line_items[0].price);
    const start = t();
    const end = start + (price.recurring.interval === 'year' ? 365 : 30) * DAY;
    const sub = {id: rid('sub'), object: 'subscription', customer: session.customer, livemode: false,
      status: paid ? 'active' : 'incomplete', cancel_at_period_end: false, cancel_at: null, canceled_at: null, ended_at: null,
      trial_end: null, created: start, metadata: {...(session.subscription_data?.metadata || {})},
      items: {object: 'list', data: [{id: rid('si'), object: 'subscription_item', price, quantity: 1,
        current_period_start: start, current_period_end: end}]}};
    subscriptions.set(sub.id, sub);
    emit('customer.subscription.created', sub);
    makeInvoice(sub, {paid});
    return sub;
  }

  async function handle(req) {
    if (req.headers.get('Authorization') !== `Bearer ${secretKey}`) {
      return reply(401, {error: {type: 'invalid_request_error', message: 'Invalid API Key provided'}});
    }
    const url = new URL(req.url);
    const key = req.headers.get('Idempotency-Key');
    if (key && idempotency.has(key)) return reply(200, idempotency.get(key));
    const params = req.method === 'GET' ? formDecode(url.search.slice(1)) : formDecode(await req.text());
    const done = body => { if (key) idempotency.set(key, body); return reply(200, body); };
    const p = url.pathname;
    let m;

    if (p === '/v1/customers' && req.method === 'POST') {
      const c = {id: rid('cus'), object: 'customer', email: params.email || null, metadata: params.metadata || {}, livemode: false};
      customers.set(c.id, c);
      return done(c);
    }
    if ((m = p.match(/^\/v1\/customers\/(cus_\w+)$/)) && req.method === 'POST') {
      const c = customers.get(m[1]);
      if (!c) return notFound('customer');
      Object.assign(c.metadata, params.metadata || {});
      return done(c);
    }
    if (p === '/v1/checkout/sessions' && req.method === 'POST') {
      if (!customers.has(params.customer)) return notFound('customer');
      if (!priceObject(params.line_items?.[0]?.price)) return notFound('price');
      if (params.mode !== 'subscription') return reply(400, {error: {message: 'mode'}});
      const s = {id: rid('cs_test'), object: 'checkout.session', mode: 'subscription', status: 'open', livemode: false,
        customer: params.customer, client_reference_id: params.client_reference_id, metadata: params.metadata || {},
        subscription_data: params.subscription_data || {}, line_items: params.line_items, subscription: null,
        success_url: params.success_url, cancel_url: params.cancel_url,
        // Fuer Pruefungen festgehalten (Stripe zeigt den Text ueber der Bestellschaltflaeche).
        custom_text: params.custom_text || null, automatic_tax: params.automatic_tax || null};
      s.url = `${checkoutBase}/${s.id}`;
      sessions.set(s.id, s);
      return done(s);
    }
    if (p === '/v1/billing_portal/sessions' && req.method === 'POST') {
      if (!customers.has(params.customer)) return notFound('customer');
      return done({id: rid('bps'), object: 'billing_portal.session', customer: params.customer,
        url: `${portalBase}/${params.customer}`, return_url: params.return_url});
    }
    if (p === '/v1/subscriptions' && req.method === 'GET') {
      const all = [...subscriptions.values()].filter(s => !params.customer || s.customer === params.customer);
      const start = params.starting_after ? all.findIndex(s => s.id === params.starting_after) + 1 : 0;
      const limit = Math.min(Number(params.limit) || 10, 100);
      return reply(200, {object: 'list', data: all.slice(start, start + limit), has_more: start + limit < all.length});
    }
    if ((m = p.match(/^\/v1\/subscriptions\/(sub_\w+)$/))) {
      const sub = subscriptions.get(m[1]);
      if (!sub) return notFound('subscription');
      if (req.method === 'GET') return reply(200, sub);
      if (req.method === 'POST') {
        if ('cancel_at_period_end' in params) {
          sub.cancel_at_period_end = params.cancel_at_period_end === 'true';
          sub.cancel_at = sub.cancel_at_period_end ? sub.items.data[0].current_period_end : null;
          sub.canceled_at = sub.cancel_at_period_end ? t() : null;
        }
        if (params.items?.[0]?.price) {
          const price = priceObject(params.items[0].price);
          if (!price) return notFound('price');
          sub.items.data[0].price = price;
        }
        emit('customer.subscription.updated', sub);
        return done(sub);
      }
      if (req.method === 'DELETE') {
        sub.status = 'canceled';
        sub.ended_at = t();
        sub.canceled_at = sub.canceled_at || t();
        emit('customer.subscription.deleted', sub);
        return done(sub);
      }
    }
    if (p === '/v1/prices' && req.method === 'POST') {
      if (!params.product || !params.unit_amount || params.tax_behavior !== 'inclusive') return reply(400, {error: {message: 'invalid price'}});
      const price = {id: rid('price_sim'), object: 'price', product: params.product, unit_amount: Number(params.unit_amount),
        currency: params.currency, recurring: {interval: params.recurring?.interval, interval_count: Number(params.recurring?.interval_count || 1)},
        tax_behavior: params.tax_behavior, lookup_key: params.lookup_key || null, active: true, livemode: false, metadata: params.metadata || {}};
      if (params.lookup_key) for (const other of createdPrices.values()) if (other.lookup_key === params.lookup_key) other.lookup_key = null;
      createdPrices.set(price.id, price);
      sim.pricesCreated = (sim.pricesCreated || 0) + 1;
      return done(price);
    }
    if ((m = p.match(/^\/v1\/prices\/(price_\w+)$/)) && req.method === 'GET') {
      const price = priceOverrides.get(m[1]) || priceObject(m[1]);
      return price ? reply(200, {...price, active: price.active ?? true}) : notFound('price');
    }
    if (p === '/v1/tax/settings' && req.method === 'GET') return reply(200, {object: 'tax.settings', livemode: false, ...taxSettings});
    if ((m = p.match(/^\/v1\/invoices\/(in_\w+)$/)) && req.method === 'GET') {
      return invoices.has(m[1]) ? reply(200, invoices.get(m[1])) : notFound('invoice');
    }
    return reply(404, {error: {type: 'invalid_request_error', message: `Unrecognized request URL (${req.method}: ${p})`}});
  }

  // ---------------------------------------------------------------- Simulation
  const sim = {
    // Nutzer bezahlt im (simulierten) Checkout.
    completeCheckout(sessionId, {paid = true} = {}) {
      const s = sessions.get(sessionId);
      if (!s || s.status !== 'open') throw new Error('SESSION_NOT_OPEN');
      const sub = newSubscription(s, {paid});
      s.status = 'complete';
      s.subscription = sub.id;
      emit('checkout.session.completed', s);
      return sub;
    },
    // Verzoegerte Zahlungsmethode (z. B. SEPA-Lastschrift): Checkout abgeschlossen, Erstzahlung noch in Bearbeitung.
    // Das Abo bleibt "incomplete" (kein Zugang), bis settleDelayed() die Zahlung bestaetigt oder scheitern laesst.
    completeDelayedCheckout(sessionId) {
      const s = sessions.get(sessionId);
      if (!s || s.status !== 'open') throw new Error('SESSION_NOT_OPEN');
      const price = priceObject(s.line_items[0].price);
      const start = t();
      const sub = {id: rid('sub'), object: 'subscription', customer: s.customer, livemode: false, status: 'incomplete',
        cancel_at_period_end: false, cancel_at: null, canceled_at: null, ended_at: null, trial_end: null, created: start,
        metadata: {...(s.subscription_data?.metadata || {})},
        items: {object: 'list', data: [{id: rid('si'), object: 'subscription_item', price, quantity: 1,
          current_period_start: start, current_period_end: start + (price.recurring.interval === 'year' ? 365 : 30) * DAY}]}};
      subscriptions.set(sub.id, sub);
      emit('customer.subscription.created', sub);
      const item = sub.items.data[0];
      const inv = {id: rid('in'), object: 'invoice', customer: sub.customer, livemode: false, currency: 'eur',
        number: `SIM-${String(invoices.size + 1).padStart(4, '0')}`, status: 'open', amount_due: item.price.unit_amount, amount_paid: 0,
        hosted_invoice_url: `https://invoice.stripe.com/i/sim/${invoices.size + 1}`, invoice_pdf: `https://pay.stripe.com/invoice/sim/${invoices.size + 1}/pdf`,
        period_start: item.current_period_start, period_end: item.current_period_end, created: t(),
        status_transitions: {finalized_at: t(), paid_at: null}, parent: {type: 'subscription_details', subscription_details: {subscription: sub.id}}};
      invoices.set(inv.id, inv);
      sub.latest_invoice = inv.id;
      emit('invoice.finalized', inv);
      s.status = 'complete';
      s.subscription = sub.id;
      s.payment_status = 'unpaid';
      emit('checkout.session.completed', s);
      return sub;
    },
    // Ausgang der verzoegerten Erstzahlung. Bei Misserfolg nur das Checkout-Ereignis (wie es Stripe zuerst schickt):
    // der Worker muss den Zustand selbst bei Stripe abrufen.
    settleDelayed(subId, {paid}) {
      const sub = subscriptions.get(subId);
      const inv = invoices.get(sub.latest_invoice);
      const session = [...sessions.values()].find(x => x.subscription === subId);
      if (paid) {
        sub.status = 'active';
        inv.status = 'paid'; inv.amount_paid = inv.amount_due; inv.status_transitions.paid_at = t();
        emit('invoice.paid', inv);
        emit('customer.subscription.updated', sub);
      } else {
        sub.status = 'incomplete_expired';
        sub.ended_at = t();
      }
      if (session) { session.payment_status = paid ? 'paid' : 'unpaid'; emit(paid ? 'checkout.session.async_payment_succeeded' : 'checkout.session.async_payment_failed', session); }
      return sub;
    },
    // Verlaengerung am Periodenende, erfolgreich oder fehlgeschlagen.
    renew(subId, {paid = true} = {}) {
      const sub = subscriptions.get(subId);
      const item = sub.items.data[0];
      const length = item.current_period_end - item.current_period_start;
      item.current_period_start = item.current_period_end;
      item.current_period_end += length;
      sub.status = paid ? 'active' : 'past_due';
      emit('customer.subscription.updated', sub);
      return makeInvoice(sub, {paid});
    },
    // Alle Wiederholungen gescheitert.
    markUnpaid(subId) {
      const sub = subscriptions.get(subId);
      sub.status = 'unpaid';
      emit('customer.subscription.updated', sub);
    },
    // Tarifwechsel (wie im Kundenportal).
    changePrice(subId, priceId) {
      const sub = subscriptions.get(subId);
      sub.items.data[0].price = priceObject(priceId);
      emit('customer.subscription.updated', sub);
    },
    // Kuendigung zum Laufzeitende (wie im Kundenportal).
    scheduleCancel(subId) {
      const sub = subscriptions.get(subId);
      sub.cancel_at_period_end = true;
      sub.cancel_at = sub.items.data[0].current_period_end;
      sub.canceled_at = t();
      emit('customer.subscription.updated', sub);
    },
    // Periodenende einer vorgemerkten Kuendigung erreicht.
    endPeriod(subId) {
      const sub = subscriptions.get(subId);
      sub.status = 'canceled';
      sub.ended_at = t();
      emit('customer.subscription.deleted', sub);
    },
    // Ein Abo, das an der Integration vorbei angelegt wurde (z. B. im Dashboard).
    foreignSubscription({priceId = 'price_test_pro_month'} = {}) {
      const c = {id: rid('cus'), object: 'customer', email: 'fremd@example.test', metadata: {}, livemode: false};
      customers.set(c.id, c);
      return newSubscription({customer: c.id, line_items: [{price: priceId}], subscription_data: {}}, {paid: true});
    },
    pendingEvents: () => events.filter(e => !e.delivered),
    overridePrice(id, patch) { priceOverrides.set(id, {...priceObject(id), ...patch}); },
    setTaxSettings(patch) { taxSettings = {...taxSettings, ...patch}; },
    // Stellt alle offenen Ereignisse signiert zu. post(rawBody, signatureHeader) -> Response
    async deliver(post, {only} = {}) {
      const results = [];
      for (const e of events.filter(x => !x.delivered && (!only || only(x)))) {
        const {delivered, ...payload} = e;
        const raw = JSON.stringify(payload);
        const res = await post(raw, await signStripePayload(raw, webhookSecret, t()));
        e.delivered = res.status < 300;
        results.push({id: e.id, type: e.type, status: res.status, body: await res.json().catch(() => null)});
      }
      return results;
    },
    events, sessions, subscriptions, invoices, customers,
  };
  return {handle, sim, secretKey, webhookSecret};
}
