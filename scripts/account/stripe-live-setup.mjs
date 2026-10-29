#!/usr/bin/env node
// Vision Universe — Stripe LIVE einrichten (idempotent, ohne SDK).
//
//   STRIPE_LIVE_KEY=rk_live_… STRIPE_LIVE_SETUP_APPROVED=true VU_ACCOUNT_API_ORIGIN=https://konto.visionuniverse.de \
//     node scripts/account/stripe-live-setup.mjs --secret-out=<datei> --sql-out=<datei> --portal-out=<datei> [--dry-run]
//
// Legt an bzw. gleicht ab (Owner-Entscheidung 28.10.2026, Tarife Free und Pro):
//   * Produkt vu_pro "Vision Universe Pro"
//   * Preise genau aus LIVE_CATALOG (Cent, brutto inkl. USt). Ein Live-Preis wird nie geaendert,
//     nur ergaenzt; der Nachschlageschluessel wandert zum neuen Preis (Stripe-Preise sind unveraenderlich).
//     Ein neuer Preis ist ein eigener PR mit Aenderung an LIVE_CATALOG.
//   * Kundenportal: Kuendigung zum Laufzeitende, Zahlungsmethode, Rechnungen, Rechnungsadresse
//     (kein Tarifwechsel: es gibt nur einen bezahlten Tarif)
//   * Webhook <API-Origin>/v1/billing/webhook/stripe mit den verarbeiteten Ereignissen
//   * Zahlungsmethoden (PAYMENT_METHODS) in der Standard-Konfiguration einschalten, soweit freigeschaltet
// Es wird nichts bezahlt und kein Checkout gestartet. Testschluessel werden abgelehnt (dafuer
// stripe-test-setup.mjs), ebenso Standard-Secret-Keys (nur Restricted Keys).
// Das Webhook-Geheimnis landet nur in --secret-out.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formEncode} from '../../workers/vu-account/src/stripe.mjs';
import {API_VERSION, WEBHOOK_EVENTS, lookupKey} from './stripe-test-setup.mjs';

const LEGAL = {privacy: 'https://www.visionuniverse.de/policies/privacy-policy', terms: 'https://www.visionuniverse.de/policies/terms-of-service'};

// Pro: Einfuehrungspreis 1,00 EUR im Monat (interner Testpreis). free hat keinen Preis.
export const LIVE_CATALOG = Object.freeze([
  {product: 'vu_pro', name: 'Vision Universe Pro', plan: 'pro',
    description: 'Monatliches Abonnement. Derzeit derselbe Funktionsumfang wie der kostenlose Tarif Free.',
    prices: [['month', 100]]},
]);

// Zahlungsmethoden fuer den Checkout (dynamisch, ohne payment_method_types): Stripe zeigt je Kunde nur, was fuer
// Abo, Betrag, Land und Waehrung zulaessig ist. Das Skript schaltet sie in der Standard-Konfiguration ein, soweit das
// Konto sie freigeschaltet hat (available); was fehlt, muss der Owner im Stripe-Dashboard aktivieren.
export const PAYMENT_METHODS = Object.freeze([
  {key: 'card', label: 'Kreditkarte'},
  {key: 'apple_pay', label: 'Apple Pay'},
  {key: 'google_pay', label: 'Google Pay'},
  {key: 'paypal', label: 'PayPal', note: 'Wiederkehrende Zahlungen ggf. separat aktivieren (Einstellungen > Zahlungsmethoden > PayPal > Wiederkehrende Zahlungen)'},
  {key: 'sepa_debit', label: 'SEPA-Lastschrift', note: 'Erstzahlung wird erst nach einigen Tagen bestaetigt'},
  {key: 'klarna', label: 'Klarna', note: 'Abos je nach Konto erst nach Freigabe durch Stripe; im Kundenportal nicht aenderbar'},
]);

export function assertLiveKey(key, approved) {
  const k = String(key || '');
  if (/^(sk|rk)_test_/.test(k)) throw new Error('Testschluessel abgelehnt: dieses Skript richtet nur den Live-Modus ein.');
  if (/^sk_live_/.test(k)) throw new Error('Standard-Secret-Key abgelehnt: bitte einen Restricted Key (rk_live_) verwenden.');
  if (!/^rk_live_[A-Za-z0-9]+$/.test(k)) throw new Error('STRIPE_LIVE_KEY fehlt oder ist kein rk_live_-Schluessel.');
  if (String(approved) !== 'true') throw new Error('STRIPE_LIVE_SETUP_APPROVED=true fehlt (Freigabe des Owners).');
}

export function client(key, fetchImpl) {
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

export async function setupStripeLive({key, approved, apiOrigin, catalog = LIVE_CATALOG, fetchImpl = fetch, dryRun = false, log = console.log}) {
  assertLiveKey(key, approved);
  if (!/^https:\/\/[a-z0-9.-]+$/.test(String(apiOrigin || ''))) throw new Error('VU_ACCOUNT_API_ORIGIN fehlt (https://<host>, ohne Pfad).');
  const stripe = client(key, fetchImpl);
  const write = (label, fn) => dryRun ? (log(`[Probelauf] wuerde: ${label}`), null) : fn();
  const prices = [];

  for (const item of catalog) {
    const productParams = {name: item.name, description: item.description, metadata: {vu_plan: item.plan}};
    let product = await stripe('GET', `/v1/products/${item.product}`);
    if (!product) product = await write(`Produkt ${item.product} "${item.name}" anlegen`, () => stripe('POST', '/v1/products', {id: item.product, ...productParams}));
    else if (product.name !== item.name || product.description !== item.description || product.active === false) {
      await write(`Produkt ${item.product} abgleichen ("${item.name}", aktiv)`, () => stripe('POST', `/v1/products/${item.product}`, {...productParams, active: 'true'}));
    } else log(`Produkt ${item.product} vorhanden.`);
    for (const [interval, amount] of item.prices) {
      if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) throw new Error(`Preis ${item.plan}_${interval} ungueltig (Cent, 1-100000)`);
      const lk = lookupKey(item.product, interval);
      const found = (await stripe('GET', '/v1/prices', {lookup_keys: [lk], active: 'true', limit: 1}))?.data?.[0];
      const fits = found && found.unit_amount === amount && found.currency === 'eur' && found.recurring?.interval === interval
        && found.recurring?.interval_count === 1 && found.tax_behavior === 'inclusive'
        && (found.product === item.product || found.product?.id === item.product);
      let price = fits ? found : null;
      if (!price) {
        price = await write(`Preis ${lk} anlegen (${(amount / 100).toFixed(2)} EUR je ${interval === 'month' ? 'Monat' : 'Jahr'}, inkl. USt)`,
          () => stripe('POST', '/v1/prices', {product: item.product, currency: 'eur', unit_amount: amount, tax_behavior: 'inclusive',
            recurring: {interval, interval_count: 1}, lookup_key: lk, transfer_lookup_key: 'true', nickname: `${item.name} ${(amount / 100).toFixed(2)} EUR/${interval}`,
            metadata: {vu_plan: item.plan, vu_interval: interval}}));
      } else log(`Preis ${lk} vorhanden (${price.id}).`);
      prices.push({plan: item.plan, interval, amount, priceId: price?.id || `price_probelauf_${lk}`});
    }
  }

  // Kundenportal: Kuendigung zum Laufzeitende (Zugang bis dahin), Zahlungsmethode, Rechnungen.
  const portalParams = {
    business_profile: {headline: 'Vision Universe – Abonnement verwalten', privacy_policy_url: LEGAL.privacy, terms_of_service_url: LEGAL.terms},
    default_return_url: 'https://research.visionuniverse.de/konto/abo/',
    features: {
      customer_update: {enabled: 'true', allowed_updates: ['email', 'address', 'tax_id']},
      invoice_history: {enabled: 'true'},
      payment_method_update: {enabled: 'true'},
      subscription_cancel: {enabled: 'true', mode: 'at_period_end', proration_behavior: 'none',
        cancellation_reason: {enabled: 'true', options: ['too_expensive', 'unused', 'missing_features', 'other']}},
      subscription_update: {enabled: 'false'},
    },
    metadata: {vu_managed: 'true'},
  };
  const portals = (await stripe('GET', '/v1/billing_portal/configurations', {active: 'true', limit: 100}))?.data || [];
  const ownPortal = portals.find(p => p.metadata?.vu_managed === 'true');
  const portal = ownPortal
    ? await write(`Portal ${ownPortal.id} abgleichen`, () => stripe('POST', `/v1/billing_portal/configurations/${ownPortal.id}`, portalParams))
    : await write('Portal-Konfiguration anlegen', () => stripe('POST', '/v1/billing_portal/configurations', portalParams));
  const portalId = portal?.id || ownPortal?.id || null;

  const paymentMethods = await configurePaymentMethods(stripe, write, log);

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
  return {prices, portalId, webhookId, webhookSecret, webhookCreated: !own, paymentMethods};
}

// Standard-Konfiguration der Zahlungsmethoden: einschalten, was verfuegbar ist; der Rest ist ein Hinweis, kein Fehler
// (fehlt dem Restricted Key das Recht "Payment Method Configurations", laeuft die Einrichtung trotzdem weiter).
export async function configurePaymentMethods(stripe, write, log) {
  let config;
  try {
    const list = (await stripe('GET', '/v1/payment_method_configurations', {limit: 100}))?.data || [];
    config = list.find(c => c.is_default && c.active && !c.parent && !c.application) || list.find(c => c.is_default);
  } catch (e) {
    log(`Zahlungsmethoden nicht lesbar (${e.message}) - bitte im Stripe-Dashboard pruefen.`);
    return PAYMENT_METHODS.map(m => ({...m, state: 'unbekannt'}));
  }
  if (!config) { log('Keine Standard-Konfiguration der Zahlungsmethoden gefunden.'); return PAYMENT_METHODS.map(m => ({...m, state: 'unbekannt'})); }
  const result = [];
  const enable = {};
  for (const m of PAYMENT_METHODS) {
    const entry = config[m.key];
    if (!entry) result.push({...m, state: 'nicht angeboten'});
    else if (!entry.available) result.push({...m, state: 'Freischaltung im Dashboard noetig'});
    else if (entry.display_preference?.value === 'on') result.push({...m, state: 'aktiv'});
    else { enable[m.key] = {display_preference: {preference: 'on'}}; result.push({...m, state: 'wird eingeschaltet'}); }
  }
  if (Object.keys(enable).length) {
    try {
      const updated = await write(`Zahlungsmethoden einschalten: ${Object.keys(enable).join(', ')}`,
        () => stripe('POST', `/v1/payment_method_configurations/${config.id}`, enable));
      if (updated) for (const r of result) if (r.state === 'wird eingeschaltet') r.state = 'eingeschaltet';
    } catch (e) {
      log(`Zahlungsmethoden nicht aenderbar (${e.message}) - bitte im Stripe-Dashboard einschalten.`);
      for (const r of result) if (r.state === 'wird eingeschaltet') r.state = 'im Dashboard einschalten';
    }
  }
  for (const r of result) log(`Zahlungsmethode ${r.label}: ${r.state}${r.note ? ` (${r.note})` : ''}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
  const dryRun = process.argv.includes('--dry-run');
  const e = process.env;
  Promise.resolve().then(() => setupStripeLive({key: e.STRIPE_LIVE_KEY, approved: e.STRIPE_LIVE_SETUP_APPROVED, apiOrigin: e.VU_ACCOUNT_API_ORIGIN,
    dryRun})).then(r => {
    for (const p of r.prices) console.log(`${p.plan}_${p.interval} ${(p.amount / 100).toFixed(2)} EUR -> ${p.priceId}`);
    console.log(`Portal-Konfiguration: ${r.portalId || '-'}`);
    console.log(`Webhook: ${r.webhookId || '-'}${r.webhookCreated && !dryRun ? ' (neu angelegt)' : ''}`);
    if (opt('sql-out') && !dryRun && r.prices.length) writeFileSync(opt('sql-out'), livePriceSql(r.prices), {mode: 0o600});
    if (opt('portal-out') && !dryRun && r.portalId) writeFileSync(opt('portal-out'), r.portalId, {mode: 0o600});
    if (r.webhookSecret) {
      if (!opt('secret-out')) throw new Error('Webhook neu angelegt, aber --secret-out fehlt: Geheimnis in Stripe neu erzeugen (Roll secret).');
      writeFileSync(opt('secret-out'), r.webhookSecret, {mode: 0o600});
      console.log('Webhook-Geheimnis in --secret-out geschrieben (nicht ausgegeben).');
    }
  }).catch(err => { console.error(`FEHLER: ${err.message}`); process.exit(1); });
}
