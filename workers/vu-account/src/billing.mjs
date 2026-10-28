// Abrechnung: Tarife, Checkout, Kundenportal, Kuendigung, Stripe-Webhook.
//
// Regeln:
//   * Preis und Tarif kommen aus der Datenbank (plan_prices), nie aus der Anfrage.
//   * Rueckspruenge sind feste Pfade der eigenen Seite.
//   * Ein gueltiges Abo (gleich welcher Anbieter) verhindert einen zweiten Checkout.
//   * Webhooks: Signatur, Idempotenz, dann IMMER den aktuellen Zustand bei
//     Stripe abrufen - die Ereignisnutzlast ist nur ein Hinweis.

import {HttpError, json, readJson, readText} from './http.mjs';
import {requireUser} from './auth.mjs';
import {billingBlocker, SITE_PATHS} from './config.mjs';
import {verifyStripeSignature, StripeError} from './stripe.mjs';
import {normalizeStripeSubscription, normalizeStripeInvoice, stripeInvoiceSubscriptionId} from './providers/stripe-adapter.mjs';
import {SupabaseError} from './supabase.mjs';
import {featureDecision} from './entitlements.mjs';
import {receivePublicCancellation, receiveSignedInCancellation} from './cancellation.mjs';
import * as v from './validate.mjs';

const STRIPE_ID = {sub: /^sub_[A-Za-z0-9]{6,}$/, in: /^in_[A-Za-z0-9]{6,}$/, cus: /^cus_[A-Za-z0-9]{6,}$/};

function assertBilling(ctx) {
  const blocker = billingBlocker(ctx.cfg);
  if (blocker) throw new HttpError(503, blocker);
}

let catalogCache = null;
export async function plans(ctx) {
  if (!catalogCache || ctx.now() - catalogCache.at > 300_000) {
    const [planRows, featureRows, planFeatures, prices] = await Promise.all([
      ctx.sb.anon.select('plans', {order: 'rank.asc'}), ctx.sb.anon.select('features'),
      ctx.sb.anon.select('plan_features'), ctx.sb.anon.select('plan_prices', {provider: 'eq.stripe'})]);
    const live = ctx.cfg.stripe.mode === 'live';
    const data = planRows.map(p => ({
      id: p.id, name: p.name, description: p.description, rank: p.rank,
      features: Object.fromEntries(planFeatures.filter(f => f.plan_id === p.id).map(f => [f.feature_key, f.limit_value ?? true])),
      prices: prices.filter(x => x.plan_id === p.id && x.livemode === live)
        .map(x => ({key: x.id, interval: x.billing_interval, currency: x.currency, unitAmount: x.unit_amount})),
    }));
    catalogCache = {at: ctx.now(), body: {plans: data, features: featureRows.map(f => ({key: f.key, description: f.description})),
      mode: ctx.cfg.stripe.mode === 'live' ? 'live' : 'test', checkout: billingBlocker(ctx.cfg) ? 'off' : ctx.cfg.stripe.checkoutAccess}};
  }
  return json(ctx.request, ctx.cfg, 200, catalogCache.body, {headers: {'Cache-Control': 'public, max-age=300'}});
}
export const resetCatalogCache = () => { catalogCache = null; };

async function ensureCustomer(ctx, user) {
  const existing = await ctx.store.customerForUser(user.id, 'stripe');
  if (existing) return existing;
  const customer = await ctx.stripe.createCustomer({email: user.email, userId: user.id});
  await ctx.store.linkCustomer(user.id, 'stripe', customer.id);
  return customer.id;
}

// Darf dieses Konto den Checkout starten? Bei "testers" nur mit Rolle billing_tester
// (user_roles ist fuer Nutzer nur lesbar; vergeben wird die Rolle ausschliesslich per Service).
export async function checkoutAllowed(ctx, user) {
  const access = ctx.cfg.stripe.checkoutAccess;
  if (access === 'public') return true;
  if (access !== 'testers') return false;
  const rows = await ctx.sb.user.select(user.accessToken, 'user_roles', {user_id: `eq.${user.id}`, role: 'eq.billing_tester'});
  return Array.isArray(rows) && rows.length > 0;
}

// Vor dem Checkout bestaetigt das Konto: wiederkehrender Preis, Kuendigung zum Laufzeitende,
// sofortiger Beginn mit Kenntnis der Folgen fuer das Widerrufsrecht. Ohne Bestaetigung kein Checkout.
export const CHECKOUT_CONFIRMATION_VERSION = 'abo-2026-10';

export async function checkout(ctx) {
  assertBilling(ctx);
  const user = await requireUser(ctx);
  await ctx.limit('sensitive', user.id);
  if (!await checkoutAllowed(ctx, user)) throw new HttpError(403, 'CHECKOUT_NOT_OPEN');
  const body = await readJson(ctx.request);
  if (body.confirm !== true) throw new HttpError(400, 'CHECKOUT_CONFIRMATION_REQUIRED');
  const key = v.priceKey(body.price);
  const live = ctx.cfg.stripe.mode === 'live';
  const [price] = await ctx.sb.anon.select('plan_prices', {id: `eq.${key}`, provider: 'eq.stripe', active: 'is.true'});
  if (!price || price.livemode !== live) throw new HttpError(404, 'PRICE_NOT_AVAILABLE');
  const blocking = await ctx.store.blockingSubscription(user.id);
  if (blocking) {
    throw new HttpError(409, 'ALREADY_SUBSCRIBED', {provider: blocking.provider, plan: blocking.plan_id,
      manage: blocking.provider === 'stripe' ? 'portal' : 'store'});
  }
  // Angezeigter Preis = berechneter Preis: Betrag, Waehrung, Laufzeit und Modus bei Stripe pruefen.
  const stripePrice = await ctx.stripe.retrievePrice(price.provider_price_id);
  if (!stripePrice.active || Boolean(stripePrice.livemode) !== live || stripePrice.unit_amount !== price.unit_amount
      || String(stripePrice.currency).toUpperCase() !== price.currency || stripePrice.recurring?.interval !== price.billing_interval) {
    ctx.log('error', 'PRICE_MISMATCH', {price: key});
    throw new HttpError(409, 'PRICE_NOT_AVAILABLE');
  }
  const customer = await ensureCustomer(ctx, user);
  const site = ctx.cfg.siteOrigin;
  const bucket = Math.floor(ctx.now() / 600_000); // Doppelklick -> dieselbe Sitzung
  const session = await ctx.stripe.createCheckoutSession({
    mode: 'subscription', customer, client_reference_id: user.id,
    line_items: [{price: price.provider_price_id, quantity: 1}],
    subscription_data: {metadata: {vu_user_id: user.id, vu_price_key: key}},
    metadata: {vu_user_id: user.id, vu_price_key: key, vu_confirmation: CHECKOUT_CONFIRMATION_VERSION,
      vu_confirmed_at: new Date(ctx.now()).toISOString()},
    success_url: `${site}${SITE_PATHS.subscription}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}${SITE_PATHS.plans}?checkout=canceled`,
    locale: 'de', allow_promotion_codes: 'true', billing_address_collection: 'auto',
    customer_update: {address: 'auto', name: 'auto'},
    ...(ctx.cfg.stripe.requireTerms ? {consent_collection: {terms_of_service: 'required'}} : {}),
  }, `vu-checkout-${user.id}-${key}-${bucket}`);
  const host = new URL(session.url).hostname;
  if (!ctx.cfg.stripe.checkoutHosts.has(host)) throw new HttpError(502, 'CHECKOUT_URL_UNEXPECTED');
  return json(ctx.request, ctx.cfg, 200, {url: session.url}, {cookies: ctx.outCookies});
}

export async function portal(ctx) {
  assertBilling(ctx);
  const user = await requireUser(ctx);
  const customer = await ctx.store.customerForUser(user.id, 'stripe');
  if (!customer) throw new HttpError(404, 'NO_BILLING_ACCOUNT');
  const session = await ctx.stripe.createPortalSession({customer, return_url: ctx.cfg.siteOrigin + SITE_PATHS.subscription, locale: 'de',
    ...(ctx.cfg.stripe.portalConfiguration ? {configuration: ctx.cfg.stripe.portalConfiguration} : {})});
  return json(ctx.request, ctx.cfg, 200, {url: session.url}, {cookies: ctx.outCookies});
}

// ---------------------------------------------------------------------------
// Kuendigungsbutton (§ 312k BGB): Ablauf in cancellation.mjs.
// ---------------------------------------------------------------------------
// Angemeldet: ordentliche Kuendigung zum Periodenende (Identitaet durch Login belegt).
export async function cancel(ctx) {
  assertBilling(ctx);
  const user = await requireUser(ctx);
  await ctx.limit('sensitive', user.id);
  const blocking = await ctx.store.blockingSubscription(user.id);
  if (!blocking) throw new HttpError(404, 'NO_ACTIVE_SUBSCRIPTION');
  if (blocking.provider !== 'stripe') throw new HttpError(409, 'MANAGED_BY_STORE', {provider: blocking.provider});
  const r = await receiveSignedInCancellation(ctx, {user, blocking});
  if (!r.snapshot) {
    // Der Eingang zaehlt trotzdem: gespeichert, bestaetigt, Ausfuehrung von Hand.
    return json(ctx.request, ctx.cfg, 202, {state: 'CANCELLATION_RECEIVED', confirmationId: r.confirmationId,
      receivedAt: r.receivedAt, emailSent: r.emailSent}, {cookies: ctx.outCookies});
  }
  return json(ctx.request, ctx.cfg, 200, {state: 'CANCELED_AT_PERIOD_END', endsAt: r.snapshot.current_period_end,
    confirmationId: r.confirmationId, receivedAt: r.receivedAt, emailSent: r.emailSent}, {cookies: ctx.outCookies});
}

// Ohne Anmeldung (§ 312k BGB). Die Antwort verraet nie, ob es zur Adresse ein
// Konto oder Abo gibt (das steht nur in der E-Mail an genau diese Adresse).
export async function cancellationRequest(ctx) {
  if (billingBlocker(ctx.cfg) === 'ACCOUNTS_NOT_CONFIGURED') throw new HttpError(503, 'ACCOUNTS_NOT_CONFIGURED');
  const body = await readJson(ctx.request);
  const email = v.email(body.email);
  await ctx.limit('cancellation', ctx.ip || email);
  await ctx.limit('cancellationEmail', email);
  const fullName = v.shortText(body.fullName, 120);
  if (!fullName) throw new HttpError(400, 'NAME_REQUIRED');
  const kind = body.kind === 'extraordinary' ? 'extraordinary' : 'ordinary';
  const r = await receivePublicCancellation(ctx, {email, fullName, reference: v.shortText(body.reference, 120), kind,
    reason: kind === 'extraordinary' ? v.shortText(body.reason, 500) : null});
  return json(ctx.request, ctx.cfg, 202, {state: 'CANCELLATION_RECEIVED', confirmationId: r.confirmationId,
    receivedAt: r.receivedAt, emailSent: r.emailSent});
}

export async function entitlementCheck(ctx) {
  const user = await requireUser(ctx);
  const feature = new URL(ctx.request.url).searchParams.get('feature') || '';
  if (!/^[a-z][a-z0-9_.]{1,63}$/.test(feature)) throw new HttpError(400, 'FEATURE_INVALID');
  const ent = await ctx.store.entitlements(user.id);
  return json(ctx.request, ctx.cfg, 200, {feature, ...featureDecision(ent, feature)}, {cookies: ctx.outCookies});
}

// Fuer kuenftige Premium-Endpunkte: wirft 402, wenn der Tarif die Funktion nicht enthaelt.
export async function requireFeature(ctx, feature) {
  const user = await requireUser(ctx);
  const decision = featureDecision(await ctx.store.entitlements(user.id), feature);
  if (!decision.allowed) throw new HttpError(402, 'FEATURE_NOT_IN_PLAN', {feature, plan: decision.plan});
  return {user, decision};
}

async function syncSubscription(ctx, id) {
  const sub = await ctx.stripe.retrieveSubscription(id);
  const snapshot = normalizeStripeSubscription(sub, {stateAt: new Date(ctx.now()).toISOString()});
  const result = await ctx.store.applySubscription(snapshot);
  if (result?.duplicate_entitling) {
    ctx.log('error', 'DUPLICATE_ENTITLING_SUBSCRIPTION', {user: result.user_id, subscription: id});
  }
  return {...snapshot, result};
}

async function syncInvoice(ctx, id) {
  const inv = await ctx.stripe.retrieveInvoice(id);
  const subId = stripeInvoiceSubscriptionId(inv);
  if (subId && STRIPE_ID.sub.test(subId)) await syncSubscription(ctx, subId); // Status (z. B. past_due) zuerst
  return ctx.store.applyInvoice(normalizeStripeInvoice(inv, {stateAt: new Date(ctx.now()).toISOString()}));
}

const SUBSCRIPTION_EVENTS = new Set(['customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed',
  'customer.subscription.pending_update_applied', 'customer.subscription.pending_update_expired',
  'customer.subscription.trial_will_end']);
const INVOICE_EVENTS = new Set(['invoice.created', 'invoice.finalized', 'invoice.paid', 'invoice.payment_succeeded',
  'invoice.payment_failed', 'invoice.payment_action_required', 'invoice.voided', 'invoice.marked_uncollectible',
  'invoice.updated']);
// Fehler, die eine Wiederholung nicht behebt: aufzeichnen, 200 antworten, alarmieren.
const PERMANENT = /CUSTOMER_NOT_LINKED|CUSTOMER_USER_MISMATCH|USER_HAS_OTHER_CUSTOMER|SUBSCRIPTION_USER_MISMATCH|UNKNOWN_PRICE|LIVEMODE_MISMATCH|SUBSCRIPTION_CUSTOMER_CHANGED|STRIPE_SUBSCRIPTION_|STRIPE_STATUS_UNKNOWN|STRIPE_INVOICE_SHAPE|resource_missing/;

async function processStripeEvent(ctx, event) {
  const object = event.data?.object || {};
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (object.mode !== 'subscription' || !object.subscription) return 'ignored';
    const userId = String(object.client_reference_id || '');
    const customer = typeof object.customer === 'string' ? object.customer : object.customer?.id;
    if (!/^[0-9a-f-]{36}$/.test(userId) || !STRIPE_ID.cus.test(String(customer))) throw new Error('CHECKOUT_SESSION_INCOMPLETE');
    await ctx.store.linkCustomer(userId, 'stripe', customer); // wirft bei Widerspruch
    const subId = typeof object.subscription === 'string' ? object.subscription : object.subscription.id;
    return (await syncSubscription(ctx, subId)).result?.user_id || userId;
  }
  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    if (!STRIPE_ID.sub.test(String(object.id))) throw new Error('STRIPE_SUBSCRIPTION_SHAPE');
    return (await syncSubscription(ctx, object.id)).result?.user_id || null;
  }
  if (INVOICE_EVENTS.has(event.type)) {
    if (!STRIPE_ID.in.test(String(object.id))) throw new Error('STRIPE_INVOICE_SHAPE');
    if (!stripeInvoiceSubscriptionId(object)) return 'ignored'; // Einzelrechnungen gehoeren nicht zum Abo
    return (await syncInvoice(ctx, object.id))?.user_id || null;
  }
  if (event.type === 'charge.dispute.created' || event.type === 'charge.refunded') {
    // Kein automatischer Entzug: Erstattung oder Rueckbuchung ist eine Betriebsentscheidung.
    ctx.log('error', event.type === 'charge.dispute.created' ? 'PAYMENT_DISPUTED' : 'PAYMENT_REFUNDED',
      {event: event.id, customer: typeof object.customer === 'string' ? object.customer : null});
    return 'ignored';
  }
  return 'ignored';
}

export async function stripeWebhook(ctx) {
  const blocker = billingBlocker(ctx.cfg);
  if (blocker) throw new HttpError(503, blocker);
  const raw = await readText(ctx.request, 512 * 1024);
  let event;
  try {
    event = await verifyStripeSignature(raw, ctx.request.headers.get('Stripe-Signature'), ctx.cfg.stripe.webhookSecret, {now: ctx.now()});
  } catch (e) {
    if (e instanceof StripeError) { ctx.log('warn', 'WEBHOOK_REJECTED', {reason: e.code}); throw new HttpError(400, e.code); }
    throw e;
  }
  if (event.livemode && !(ctx.cfg.stripe.mode === 'live' && ctx.cfg.stripe.liveApproved)) {
    ctx.log('error', 'WEBHOOK_LIVEMODE_REJECTED', {event: event.id});
    throw new HttpError(400, 'LIVEMODE_NOT_APPROVED');
  }
  const claim = await ctx.store.claimEvent('stripe', event.id, event.type, Boolean(event.livemode), event.data?.object?.id || null);
  if (claim === 'duplicate') return json(ctx.request, ctx.cfg, 200, {received: true, duplicate: true});
  if (claim === 'in_progress') return json(ctx.request, ctx.cfg, 409, {state: 'EVENT_IN_PROGRESS'});
  try {
    const outcome = await processStripeEvent(ctx, event);
    const ignored = outcome === 'ignored';
    await ctx.store.finishEvent('stripe', event.id, ignored ? 'ignored' : 'processed', null, ignored ? null : outcome);
    return json(ctx.request, ctx.cfg, 200, {received: true, state: ignored ? 'IGNORED' : 'PROCESSED'});
  } catch (e) {
    const code = String(e instanceof SupabaseError || e instanceof StripeError ? `${e.code}:${e.upstreamMessage || e.stripeMessage || ''}` : e.message).slice(0, 300);
    await ctx.store.finishEvent('stripe', event.id, 'failed', code).catch(() => {});
    const permanent = PERMANENT.test(code);
    ctx.log('error', 'WEBHOOK_FAILED', {event: event.id, type: event.type, code, permanent});
    if (permanent) return json(ctx.request, ctx.cfg, 200, {received: true, state: 'FAILED_PERMANENT'});
    throw new HttpError(500, 'WEBHOOK_PROCESSING_FAILED');
  }
}

export function storeWebhookNotConfigured(ctx) {
  return json(ctx.request, ctx.cfg, 501, {state: 'PROVIDER_NOT_CONNECTED',
    detail: 'Apple/Google: Normalisierung vorbereitet (providers/store-adapters.mjs), Signaturpruefung noch nicht angeschlossen.'});
}

export {syncSubscription};
