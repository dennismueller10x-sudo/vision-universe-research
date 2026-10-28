#!/usr/bin/env node
// Vision Universe — Stripe LIVE pruefen (lesend), vor dem ersten echten Pro-Abschluss.
//
//   STRIPE_LIVE_KEY=rk_live_… STRIPE_LIVE_SETUP_APPROVED=true VU_ACCOUNT_API_ORIGIN=https://konto.visionuniverse.de \
//     node scripts/account/stripe-live-check.mjs [--probe-checkout]
//
// Liest: Pro-Preis, Zahlungsmethoden (Standard-Konfiguration), Konto-Faehigkeiten, Webhook, Kundenportal.
// --probe-checkout legt zusaetzlich eine Checkout-Sitzung (Abo, Pro-Preis, ohne Kunde) an, liest die Zahlungsmethoden,
// die Stripe fuer genau dieses Abo zulaesst, und beendet sie sofort (expire). Es wird nichts bezahlt; der Link der
// Sitzung wird nie ausgegeben. Nur so zeigt sich, ob PayPal fuer wiederkehrende Zahlungen freigegeben ist.
// Ausgabe: nur Zustaende, keine Schluessel und keine Kundendaten.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertLiveKey, client, LIVE_CATALOG, PAYMENT_METHODS} from './stripe-live-setup.mjs';
import {WEBHOOK_EVENTS, lookupKey} from './stripe-test-setup.mjs';

const CAPABILITIES = {card: 'card_payments', paypal: 'paypal_payments', sepa_debit: 'sepa_debit_payments', klarna: 'klarna_payments'};

async function attempt(fn) {
  try { return {ok: true, value: await fn()}; } catch (e) { return {ok: false, error: e.message}; }
}

export async function checkStripeLive({key, approved, apiOrigin, fetchImpl = fetch, probeCheckout = false, log = console.log}) {
  assertLiveKey(key, approved);
  if (!/^https:\/\/[a-z0-9.-]+$/.test(String(apiOrigin || ''))) throw new Error('VU_ACCOUNT_API_ORIGIN fehlt (https://<host>, ohne Pfad).');
  const stripe = client(key, fetchImpl);
  const item = LIVE_CATALOG.find(i => i.plan === 'pro');
  const [interval, amount] = item.prices[0];
  const report = {price: null, methods: [], capabilities: null, webhook: null, portal: null, checkout: null};

  const lk = lookupKey(item.product, interval);
  const price = (await stripe('GET', '/v1/prices', {lookup_keys: [lk], active: 'true', limit: 1}))?.data?.[0] || null;
  report.price = price && {id: price.id, ok: price.unit_amount === amount && price.currency === 'eur' && price.recurring?.interval === interval};
  log(price ? `Preis ${lk}: ${price.id}, ${(price.unit_amount / 100).toFixed(2)} ${String(price.currency).toUpperCase()} je ${price.recurring?.interval}${report.price.ok ? '' : ' - WEICHT VOM KATALOG AB'}`
    : `Preis ${lk}: FEHLT`);

  const pmc = await attempt(async () => {
    const list = (await stripe('GET', '/v1/payment_method_configurations', {limit: 100}))?.data || [];
    return list.find(c => c.is_default && c.active && !c.parent && !c.application) || list.find(c => c.is_default) || null;
  });
  for (const m of [...PAYMENT_METHODS, {key: 'link', label: 'Link'}]) {
    const entry = pmc.ok && pmc.value ? pmc.value[m.key] : undefined;
    const state = !pmc.ok || !pmc.value ? 'unbekannt' : !entry ? 'nicht angeboten' : !entry.available ? 'nicht freigeschaltet'
      : entry.display_preference?.value === 'on' ? 'eingeschaltet' : 'ausgeschaltet';
    report.methods.push({key: m.key, label: m.label, state});
    log(`Zahlungsmethode ${m.label}: ${state}`);
  }
  if (!pmc.ok) log(`Zahlungsmethoden nicht lesbar (${pmc.error}).`);

  const account = await attempt(() => stripe('GET', '/v1/account'));
  if (account.ok && account.value?.capabilities) {
    report.capabilities = {};
    for (const [m, cap] of Object.entries(CAPABILITIES)) {
      report.capabilities[m] = account.value.capabilities[cap] || 'nicht vorhanden';
      log(`Faehigkeit ${cap}: ${report.capabilities[m]}`);
    }
  } else log(`Konto-Faehigkeiten nicht lesbar (${account.error || 'keine Angabe'}) - Restricted Key ohne Leserecht "Account".`);

  const url = `${apiOrigin}/v1/billing/webhook/stripe`;
  const hook = ((await stripe('GET', '/v1/webhook_endpoints', {limit: 100}))?.data || []).find(e => e.url === url);
  if (hook) {
    const events = new Set(hook.enabled_events || []);
    const missing = events.has('*') ? [] : WEBHOOK_EVENTS.filter(e => !events.has(e));
    report.webhook = {status: hook.status, missing};
    log(`Webhook ${hook.id}: ${hook.status}, ${missing.length ? `es fehlen ${missing.join(', ')}` : 'alle Ereignisse abonniert'}`);
  } else log(`Webhook ${url}: FEHLT`);

  const portal = ((await stripe('GET', '/v1/billing_portal/configurations', {active: 'true', limit: 100}))?.data || [])
    .find(p => p.metadata?.vu_managed === 'true');
  if (portal) {
    const f = portal.features || {};
    report.portal = {cancel: Boolean(f.subscription_cancel?.enabled), mode: f.subscription_cancel?.mode || null,
      paymentMethodUpdate: Boolean(f.payment_method_update?.enabled), invoices: Boolean(f.invoice_history?.enabled)};
    log(`Portal ${portal.id}: Kuendigung ${report.portal.cancel ? `an (${report.portal.mode})` : 'AUS'}, Zahlungsmethode aendern ${report.portal.paymentMethodUpdate ? 'an' : 'AUS'}, Rechnungen ${report.portal.invoices ? 'an' : 'AUS'}`);
  } else log('Portal-Konfiguration (vu_managed): FEHLT');

  if (probeCheckout && price) {
    const session = await attempt(() => stripe('POST', '/v1/checkout/sessions', {
      mode: 'subscription', line_items: [{price: price.id, quantity: 1}], locale: 'de', billing_address_collection: 'auto',
      success_url: 'https://research.visionuniverse.de/konto/abo/?probe=1', cancel_url: 'https://research.visionuniverse.de/konto/tarife/?probe=1',
      metadata: {vu_probe: 'payment-methods'}, subscription_data: {metadata: {vu_probe: 'payment-methods'}}}));
    if (session.ok) {
      const types = (session.value.payment_method_types || []).map(String);
      const expired = await attempt(() => stripe('POST', `/v1/checkout/sessions/${session.value.id}/expire`));
      report.checkout = {types, expired: expired.ok && expired.value?.status === 'expired'};
      log(`Probe-Checkout (Abo, ${(amount / 100).toFixed(2)} EUR/Monat): Stripe laesst zu: ${types.join(', ') || '-'}`);
      log(report.checkout.expired ? 'Probe-Sitzung sofort beendet (expired); nichts bezahlt.' : `Probe-Sitzung NICHT beendet (${expired.error || 'Status unklar'}) - laeuft nach 24 h ab.`);
    } else {
      report.checkout = {error: session.error};
      log(`Probe-Checkout nicht moeglich (${session.error}).`);
    }
  }

  const pp = report.methods.find(m => m.key === 'paypal');
  report.paypal = pp?.state !== 'eingeschaltet' ? `nein: PayPal ${pp?.state}`
    : report.checkout?.types ? (report.checkout.types.includes('paypal') ? 'ja' : 'nein: PayPal fehlt im Abo-Checkout (Wiederkehrende Zahlungen nicht freigegeben?)')
    : 'unbekannt: eingeschaltet, Abo-Checkout nicht geprueft';
  log(`PayPal fuer das Pro-Abo bereit: ${report.paypal}`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const e = process.env;
  checkStripeLive({key: e.STRIPE_LIVE_KEY, approved: e.STRIPE_LIVE_SETUP_APPROVED, apiOrigin: e.VU_ACCOUNT_API_ORIGIN,
    probeCheckout: process.argv.includes('--probe-checkout')})
    .catch(err => { console.error(`FEHLER: ${err.message}`); process.exit(1); });
}
