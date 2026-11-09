#!/usr/bin/env node
// Vision Universe — Stripe-TESTMODUS einrichten (idempotent, ohne SDK).
//
//   STRIPE_SETUP_KEY=sk_test_… VU_ACCOUNT_API_ORIGIN=https://… \
//     node scripts/account/stripe-test-setup.mjs --secret-out=/tmp/whsec --sql-out=/tmp/prices.sql [--dry-run]
//
// Legt an bzw. gleicht ab:
//   * Produkte vu_plus / vu_pro, Preise mit lookup_key (monatlich/jaehrlich, EUR, inkl. USt)
//   * Kundenportal-Konfiguration (Kuendigung zum Laufzeitende, Tarifwechsel, Rechnungen)
//   * Webhook-Endpunkt <API-Origin>/v1/billing/webhook/stripe mit den verarbeiteten Ereignissen
// Live-Schluessel werden abgelehnt. Das Webhook-Geheimnis gibt Stripe nur beim
// Anlegen heraus; es landet ausschliesslich in --secret-out (Modus 600), nie im
// Protokoll. --sql-out schreibt das Upsert fuer public.plan_prices.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formEncode} from '../../workers/vu-account/src/stripe.mjs';

export const API_VERSION = '2025-03-31.basil';
export const CATALOG = Object.freeze([
  {product: 'vu_plus', name: 'Vision Universe Plus', plan: 'plus', prices: [['month', 990], ['year', 9900]]},
  {product: 'vu_pro', name: 'Vision Universe Pro', plan: 'pro', prices: [['month', 1990], ['year', 19900]]},
]);
// Muss zu workers/vu-account/src/billing.mjs passen (SUBSCRIPTION_EVENTS, INVOICE_EVENTS, Checkout, Streitfaelle).
export const WEBHOOK_EVENTS = Object.freeze([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed', 'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired', 'customer.subscription.trial_will_end',
  'invoice.created', 'invoice.finalized', 'invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed',
  'invoice.payment_action_required', 'invoice.voided', 'invoice.marked_uncollectible', 'invoice.updated',
  'charge.dispute.created', 'charge.refunded',
]);
// Eigene Rechtstexte (oeffentlich, ohne Passwortmaske; workers/vu-account/src/legal/texts.mjs) statt der Shopify-Shop-Texte.
const LEGAL = {privacy: 'https://konto.visionuniverse.de/rechtliches/datenschutz', terms: 'https://konto.visionuniverse.de/rechtliches/agb'};

export function assertTestKey(key) {
  const k = String(key || '');
  if (/^(sk|rk)_live_/.test(k)) throw new Error('Stripe-LIVE-Schluessel abgelehnt: dieses Skript richtet nur den Testmodus ein.');
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(k)) throw new Error('STRIPE_SETUP_KEY fehlt oder ist kein Testschluessel (sk_test_/rk_test_).');
}

export function lookupKey(product, interval) { return `${product}_${interval}`; }

function client(key, fetchImpl) {
  return async function request(method, path, params) {
    const headers = {Authorization: `Bearer ${key}`, 'Stripe-Version': API_VERSION};
    let url = `https://api.stripe.com${path}`, body;
    if (method === 'GET' && params) url += '?' + formEncode(params).toString();
    else if (params) { body = formEncode(params).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    const res = await fetchImpl(url, {method, headers, body});
    const data = await res.json().catch(() => ({}));
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) throw new Error(`Stripe ${method} ${path.split('?')[0]}: ${res.status} ${data.error?.code || data.error?.type || ''}`.trim());
    if (data.livemode === true) throw new Error('Stripe meldet livemode=true - Abbruch.');
    return data;
  };
}

export function priceSql(rows) {
  const v = rows.map(r => `  ('${r.plan}_${r.interval}', '${r.plan}', 'stripe', '${r.priceId}', '${r.interval}', 'EUR', ${r.amount}, false)`);
  return `-- Erzeugt von scripts/account/stripe-test-setup.mjs (Stripe-Testmodus).\nbegin;\n`
    + `insert into public.plan_prices (id, plan_id, provider, provider_price_id, billing_interval, currency, unit_amount, livemode)\nvalues\n${v.join(',\n')}\n`
    + `on conflict (id) do update set provider_price_id = excluded.provider_price_id, unit_amount = excluded.unit_amount,\n`
    + `  currency = excluded.currency, livemode = false, active = true;\ncommit;\n`;
}

export async function setupStripe({key, apiOrigin, fetchImpl = fetch, dryRun = false, log = console.log}) {
  assertTestKey(key);
  if (!/^https:\/\/[a-z0-9.-]+$/.test(String(apiOrigin || ''))) throw new Error('VU_ACCOUNT_API_ORIGIN fehlt (https://<host>, ohne Pfad).');
  const stripe = client(key, fetchImpl);
  const write = (label, fn) => dryRun ? (log(`[Probelauf] wuerde: ${label}`), null) : fn();
  const prices = [];

  for (const item of CATALOG) {
    let product = await stripe('GET', `/v1/products/${item.product}`);
    if (!product) product = await write(`Produkt ${item.product} anlegen`, () => stripe('POST', '/v1/products', {id: item.product, name: item.name,
      metadata: {vu_plan: item.plan}}));
    else log(`Produkt ${item.product} vorhanden.`);
    for (const [interval, amount] of item.prices) {
      const lk = lookupKey(item.product, interval);
      const found = (await stripe('GET', '/v1/prices', {lookup_keys: [lk], active: 'true', limit: 1}))?.data?.[0];
      const fits = found && found.unit_amount === amount && found.currency === 'eur' && found.recurring?.interval === interval
        && found.tax_behavior === 'inclusive' && (found.product === item.product || found.product?.id === item.product);
      let price = fits ? found : null;
      if (!price) {
        price = await write(`Preis ${lk} anlegen (${amount / 100} EUR)`, () => stripe('POST', '/v1/prices', {product: item.product, currency: 'eur',
          unit_amount: amount, tax_behavior: 'inclusive', recurring: {interval}, lookup_key: lk, transfer_lookup_key: 'true',
          metadata: {vu_plan: item.plan, vu_interval: interval}}));
      } else log(`Preis ${lk} vorhanden (${price.id}).`);
      prices.push({plan: item.plan, interval, amount, priceId: price?.id || `price_probelauf_${lk}`});
    }
  }

  // Kundenportal: Kuendigung zum Laufzeitende, Tarifwechsel zwischen unseren Preisen.
  const portalParams = {
    business_profile: {headline: 'Vision Universe – Abonnement verwalten', privacy_policy_url: LEGAL.privacy, terms_of_service_url: LEGAL.terms},
    default_return_url: 'https://research.visionuniverse.de/konto/abo/',
    features: {
      customer_update: {enabled: 'true', allowed_updates: ['email', 'address', 'tax_id']},
      invoice_history: {enabled: 'true'},
      payment_method_update: {enabled: 'true'},
      subscription_cancel: {enabled: 'true', mode: 'at_period_end', proration_behavior: 'none'},
      subscription_update: {enabled: 'true', default_allowed_updates: ['price'], proration_behavior: 'create_prorations',
        products: CATALOG.map(c => ({product: c.product, prices: prices.filter(p => p.plan === c.plan).map(p => p.priceId)}))},
    },
    metadata: {vu_managed: 'true'},
  };
  const portals = (await stripe('GET', '/v1/billing_portal/configurations', {active: 'true', limit: 100}))?.data || [];
  const ownPortal = portals.find(p => p.metadata?.vu_managed === 'true');
  const portal = ownPortal
    ? await write(`Portal ${ownPortal.id} abgleichen`, () => stripe('POST', `/v1/billing_portal/configurations/${ownPortal.id}`, portalParams))
    : await write('Portal-Konfiguration anlegen', () => stripe('POST', '/v1/billing_portal/configurations', portalParams));

  // Webhook-Endpunkt
  const url = `${apiOrigin}/v1/billing/webhook/stripe`;
  const endpoints = (await stripe('GET', '/v1/webhook_endpoints', {limit: 100}))?.data || [];
  const own = endpoints.find(e => e.url === url);
  let webhookSecret = null, webhookId = own?.id || null;
  if (own) {
    await write(`Webhook ${own.id} abgleichen`, () => stripe('POST', `/v1/webhook_endpoints/${own.id}`, {enabled_events: [...WEBHOOK_EVENTS],
      disabled: 'false'}));
    log(`Webhook vorhanden (${own.id}); das Geheimnis bleibt wie hinterlegt.`);
  } else {
    const created = await write(`Webhook ${url} anlegen`, () => stripe('POST', '/v1/webhook_endpoints', {url, enabled_events: [...WEBHOOK_EVENTS],
      api_version: API_VERSION, description: 'Vision Universe vu-account (Entwicklung)', metadata: {vu_managed: 'true'}}));
    webhookSecret = created?.secret || null;
    webhookId = created?.id || null;
  }
  return {prices, portalId: portal?.id || ownPortal?.id || null, webhookId, webhookSecret, webhookCreated: !own};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
  const dryRun = process.argv.includes('--dry-run');
  setupStripe({key: process.env.STRIPE_SETUP_KEY, apiOrigin: process.env.VU_ACCOUNT_API_ORIGIN, dryRun}).then(r => {
    for (const p of r.prices) console.log(`${p.plan}_${p.interval} -> ${p.priceId}`);
    console.log(`Portal-Konfiguration: ${r.portalId || '-'}`);
    console.log(`Webhook: ${r.webhookId || '-'}${r.webhookCreated ? ' (neu angelegt)' : ''}`);
    if (opt('sql-out') && !dryRun) writeFileSync(opt('sql-out'), priceSql(r.prices), {mode: 0o600});
    if (r.webhookSecret) {
      if (!opt('secret-out')) throw new Error('Webhook neu angelegt, aber --secret-out fehlt: Geheimnis in Stripe neu erzeugen (Roll secret).');
      writeFileSync(opt('secret-out'), r.webhookSecret, {mode: 0o600});
      console.log('Webhook-Geheimnis in --secret-out geschrieben (nicht ausgegeben).');
    }
  }).catch(e => { console.error(`FEHLER: ${e.message}`); process.exit(1); });
}
