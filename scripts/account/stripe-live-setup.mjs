#!/usr/bin/env node
// Vision Universe — Stripe LIVE einrichten (idempotent, ohne SDK).
//
//   STRIPE_LIVE_KEY=rk_live_… STRIPE_LIVE_SETUP_APPROVED=true VU_ACCOUNT_API_ORIGIN=https://konto.visionuniverse.de \
//   [VU_ACCOUNT_LIVE_PRICES='{"plus_month":990,"plus_year":9900,"pro_month":1990,"pro_year":19900}'] \
//     node scripts/account/stripe-live-setup.mjs --secret-out=<datei> --sql-out=<datei> [--dry-run]
//
// Legt an bzw. gleicht ab:
//   * Produkte vu_plus / vu_pro (immer)
//   * Preise NUR aus VU_ACCOUNT_LIVE_PRICES (Owner-Entscheidung, Cent, brutto inkl. USt).
//     Ohne diese Angabe: keine Preise, kein Kundenportal-Tarifwechsel, kein Checkout.
//     Ein Live-Preis wird nie geaendert, nur ergaenzt (Stripe-Preise sind unveraenderlich).
//   * Kundenportal (nur mit Preisen): Kuendigung zum Laufzeitende, Tarifwechsel, Rechnungen
//   * Webhook <API-Origin>/v1/billing/webhook/stripe mit den verarbeiteten Ereignissen
// Testschluessel werden abgelehnt (dafuer stripe-test-setup.mjs), ebenso Standard-
// Secret-Keys (nur Restricted Keys). Das Webhook-Geheimnis landet nur in --secret-out.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formEncode} from '../../workers/vu-account/src/stripe.mjs';
import {API_VERSION, CATALOG, WEBHOOK_EVENTS, lookupKey} from './stripe-test-setup.mjs';

const LEGAL = {privacy: 'https://www.visionuniverse.de/policies/privacy-policy', terms: 'https://www.visionuniverse.de/policies/terms-of-service'};
const PRICE_KEYS = ['plus_month', 'plus_year', 'pro_month', 'pro_year'];

export function assertLiveKey(key, approved) {
  const k = String(key || '');
  if (/^(sk|rk)_test_/.test(k)) throw new Error('Testschluessel abgelehnt: dieses Skript richtet nur den Live-Modus ein.');
  if (/^sk_live_/.test(k)) throw new Error('Standard-Secret-Key abgelehnt: bitte einen Restricted Key (rk_live_) verwenden.');
  if (!/^rk_live_[A-Za-z0-9]+$/.test(k)) throw new Error('STRIPE_LIVE_KEY fehlt oder ist kein rk_live_-Schluessel.');
  if (String(approved) !== 'true') throw new Error('STRIPE_LIVE_SETUP_APPROVED=true fehlt (Freigabe des Owners).');
}

// Preise sind eine Owner-Entscheidung: nur ganze Cent-Betraege > 0 fuer genau die vier Schluessel.
export function parseLivePrices(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('VU_ACCOUNT_LIVE_PRICES ist kein JSON.'); }
  const keys = Object.keys(data || {}).sort();
  if (keys.join(',') !== [...PRICE_KEYS].sort().join(',')) throw new Error(`VU_ACCOUNT_LIVE_PRICES braucht genau: ${PRICE_KEYS.join(', ')}`);
  for (const k of PRICE_KEYS) if (!Number.isInteger(data[k]) || data[k] <= 0 || data[k] > 100000) throw new Error(`Preis ${k} ungueltig (Cent, 1-100000)`);
  return data;
}

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
    if (data.livemode === false) throw new Error('Stripe meldet livemode=false - Abbruch (falscher Schluessel?).');
    return data;
  };
}

// Live-Preise stehen als eigene Zeilen (<plan>_<interval>_live) neben den Test-Platzhaltern;
// der Worker waehlt nach Modus des Schluessels, die Datenbank lehnt Modus-Mischungen ab.
export function livePriceSql(rows) {
  for (const r of rows) if (!/^price_[A-Za-z0-9]+$/.test(r.priceId)) throw new Error(`Preis-ID ${r.plan}_${r.interval} ungueltig`);
  return `-- Erzeugt von scripts/account/stripe-live-setup.mjs (Stripe LIVE).\nbegin;\n`
    + `insert into public.plan_prices (id, plan_id, provider, provider_price_id, billing_interval, currency, unit_amount, livemode, active)\nvalues\n`
    + rows.map(r => `  ('${r.plan}_${r.interval}_live', '${r.plan}', 'stripe', '${r.priceId}', '${r.interval}', 'EUR', ${r.amount}, true, true)`).join(',\n')
    + `\non conflict (id) do update set provider_price_id = excluded.provider_price_id, unit_amount = excluded.unit_amount,\n`
    + `  currency = excluded.currency, livemode = true, active = true;\ncommit;\n`;
}

export async function setupStripeLive({key, approved, apiOrigin, prices: priceConfig = null, fetchImpl = fetch, dryRun = false, log = console.log}) {
  assertLiveKey(key, approved);
  if (!/^https:\/\/[a-z0-9.-]+$/.test(String(apiOrigin || ''))) throw new Error('VU_ACCOUNT_API_ORIGIN fehlt (https://<host>, ohne Pfad).');
  const stripe = client(key, fetchImpl);
  const write = (label, fn) => dryRun ? (log(`[Probelauf] wuerde: ${label}`), null) : fn();
  const prices = [];

  for (const item of CATALOG) {
    let product = await stripe('GET', `/v1/products/${item.product}`);
    if (!product) product = await write(`Produkt ${item.product} anlegen`, () => stripe('POST', '/v1/products', {id: item.product, name: item.name,
      metadata: {vu_plan: item.plan}}));
    else log(`Produkt ${item.product} vorhanden.`);
    if (!priceConfig) continue;
    for (const interval of ['month', 'year']) {
      const amount = priceConfig[`${item.plan}_${interval}`];
      const lk = lookupKey(item.product, interval);
      const found = (await stripe('GET', '/v1/prices', {lookup_keys: [lk], active: 'true', limit: 1}))?.data?.[0];
      const fits = found && found.unit_amount === amount && found.currency === 'eur' && found.recurring?.interval === interval
        && found.tax_behavior === 'inclusive' && (found.product === item.product || found.product?.id === item.product);
      let price = fits ? found : null;
      if (!price) {
        price = await write(`Preis ${lk} anlegen (${(amount / 100).toFixed(2)} EUR)`, () => stripe('POST', '/v1/prices', {product: item.product,
          currency: 'eur', unit_amount: amount, tax_behavior: 'inclusive', recurring: {interval}, lookup_key: lk, transfer_lookup_key: 'true',
          metadata: {vu_plan: item.plan, vu_interval: interval}}));
      } else log(`Preis ${lk} vorhanden (${price.id}).`);
      prices.push({plan: item.plan, interval, amount, priceId: price?.id || `price_probelauf_${lk}`});
    }
  }
  if (!priceConfig) log('Keine Live-Preise vorgegeben: keine Preise, kein Kundenportal-Tarifwechsel, Checkout bleibt aus.');

  let portalId = null;
  if (prices.length) {
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
    const own = portals.find(p => p.metadata?.vu_managed === 'true');
    const portal = own
      ? await write(`Portal ${own.id} abgleichen`, () => stripe('POST', `/v1/billing_portal/configurations/${own.id}`, portalParams))
      : await write('Portal-Konfiguration anlegen', () => stripe('POST', '/v1/billing_portal/configurations', portalParams));
    portalId = portal?.id || own?.id || null;
  }

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
      api_version: API_VERSION, description: 'Vision Universe vu-account (Produktion)', metadata: {vu_managed: 'true'}}));
    webhookSecret = created?.secret || null;
    webhookId = created?.id || null;
  }
  return {prices, portalId, webhookId, webhookSecret, webhookCreated: !own};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
  const dryRun = process.argv.includes('--dry-run');
  const e = process.env;
  Promise.resolve().then(() => setupStripeLive({key: e.STRIPE_LIVE_KEY, approved: e.STRIPE_LIVE_SETUP_APPROVED, apiOrigin: e.VU_ACCOUNT_API_ORIGIN,
    prices: parseLivePrices(e.VU_ACCOUNT_LIVE_PRICES), dryRun})).then(r => {
    for (const p of r.prices) console.log(`${p.plan}_${p.interval} -> ${p.priceId}`);
    console.log(`Portal-Konfiguration: ${r.portalId || '-'}`);
    console.log(`Webhook: ${r.webhookId || '-'}${r.webhookCreated && !dryRun ? ' (neu angelegt)' : ''}`);
    if (opt('sql-out') && !dryRun && r.prices.length) writeFileSync(opt('sql-out'), livePriceSql(r.prices), {mode: 0o600});
    if (r.webhookSecret) {
      if (!opt('secret-out')) throw new Error('Webhook neu angelegt, aber --secret-out fehlt: Geheimnis in Stripe neu erzeugen (Roll secret).');
      writeFileSync(opt('secret-out'), r.webhookSecret, {mode: 0o600});
      console.log('Webhook-Geheimnis in --secret-out geschrieben (nicht ausgegeben).');
    }
  }).catch(err => { console.error(`FEHLER: ${err.message}`); process.exit(1); });
}
