// Tarifverwaltung: Preise aendern ohne Deployment (docs/accounts/TARIFVERWALTUNG.md).
//
// Nur Konten mit Rolle pricing_admin (serverseitig, aus user_roles mit dem Nutzer-JWT; vergeben nur durch den Service).
// Ablauf: Uebersicht -> Vorschau (Zusammenfassung, nichts geaendert) -> Bestaetigung mit Passwort.
// Eine Aenderung legt bei Stripe einen NEUEN Preis an (Brutto, tax_behavior inclusive, Stripe Tax rechnet die USt heraus)
// und macht ihn zum aktiven Preis fuer neue Abschluesse. Bestehende Abos behalten ihren Preis. Jede Aenderung steht im
// Audit-Log (billing.price_changes); eine Vorgangs-ID verhindert doppelte Ausfuehrung, auch bei Wiederholung nach Fehlern.
// Der Stripe-Schluessel bleibt im Worker.
import {HttpError, json, readJson} from './http.mjs';
import {requireUser, reauthenticate} from './auth.mjs';
import {billingBlocker} from './config.mjs';
import {resetCatalogCache, stripeTaxState} from './billing.mjs';
import {SupabaseError} from './supabase.mjs';
import * as v from './validate.mjs';

export const MIN_AMOUNT = 50;      // Stripe-Mindestbetrag EUR
export const MAX_AMOUNT = 99999;   // 999,99 EUR
const CHANGE_ID = /^pc_[a-f0-9]{32}$/;
const DB_ERRORS = ['PRICE_CHANGED', 'PRICE_UNCHANGED', 'PRICE_NOT_ACTIVE', 'CHANGE_IN_PROGRESS', 'CHANGE_ID_REUSED', 'CHANGE_NOT_READY'];

async function requirePricingAdmin(ctx) {
  const user = await requireUser(ctx);
  const rows = await ctx.sb.user.select(user.accessToken, 'user_roles', {user_id: `eq.${user.id}`, role: 'eq.pricing_admin'});
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(403, 'NOT_PRICING_ADMIN');
  if (billingBlocker(ctx.cfg)) throw new HttpError(503, 'BILLING_UNAVAILABLE');
  return user;
}

const euro = cents => new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'}).format(cents / 100);
const livemode = ctx => ctx.cfg.stripe.mode === 'live';

function amountFrom(body) {
  const a = body.amount;
  if (!Number.isInteger(a) || a < MIN_AMOUNT || a > MAX_AMOUNT) throw new HttpError(400, 'AMOUNT_INVALID');
  return a;
}

async function activePrice(ctx, key) {
  const overview = await ctx.store.pricingOverview(livemode(ctx));
  const row = (overview.prices || []).find(p => p.id === key && p.active);
  if (!row || row.provider !== 'stripe') throw new HttpError(404, 'PRICE_NOT_AVAILABLE');
  return {row, overview};
}

export async function overview(ctx) {
  await requirePricingAdmin(ctx);
  const data = await ctx.store.pricingOverview(livemode(ctx));
  const stripe = {};
  for (const p of (data.prices || []).filter(x => x.active && x.provider === 'stripe')) {
    try {
      const s = await ctx.stripe.retrievePrice(p.provider_price_id);
      stripe[p.id] = {amount: s.unit_amount, currency: String(s.currency).toUpperCase(), taxBehavior: s.tax_behavior || null,
        active: s.active, interval: s.recurring?.interval || null, matches: s.unit_amount === p.unit_amount && s.active === true};
    } catch { stripe[p.id] = {error: 'STRIPE_UNREADABLE'}; }
  }
  return json(ctx.request, ctx.cfg, 200, {prices: data.prices, changes: data.changes, stripe, mode: livemode(ctx) ? 'live' : 'test',
    tax: ctx.cfg.stripe.tax.mode, stripeTax: ctx.cfg.stripe.tax.mode === 'automatic' ? await stripeTaxState(ctx) : null,
    checkout: ctx.cfg.stripe.checkoutAccess, limits: {min: MIN_AMOUNT, max: MAX_AMOUNT}}, {cookies: ctx.outCookies});
}

// Vorschau: nichts wird geaendert. Liefert die Zusammenfassung und eine Vorgangs-ID fuer die Bestaetigung.
export async function preview(ctx) {
  await requirePricingAdmin(ctx);
  const body = await readJson(ctx.request);
  const key = v.priceKey(body.price);
  const amount = amountFrom(body);
  const {row} = await activePrice(ctx, key);
  if (row.unit_amount === amount) throw new HttpError(409, 'PRICE_UNCHANGED');
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const changeId = 'pc_' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const ratio = amount / Math.max(row.unit_amount, 1);
  const lines = [
    `Tarif: ${row.plan_id.charAt(0).toUpperCase() + row.plan_id.slice(1)}, ${row.interval === 'year' ? 'jährlich' : 'monatlich'}`,
    `Neuer Endpreis: ${euro(amount)} pro ${row.interval === 'year' ? 'Jahr' : 'Monat'} inkl. Umsatzsteuer (bisher ${euro(row.unit_amount)})`,
    ctx.cfg.stripe.tax.mode === 'automatic'
      ? 'Umsatzsteuer: Stripe Tax rechnet sie aus dem Endpreis heraus; der Endpreis steigt dadurch nicht.'
      : 'Umsatzsteuer: Endpreis brutto, kein gesonderter Steuerausweis (Stripe Tax nicht eingeschaltet).',
    'Gilt ab sofort für neue Abschlüsse, auf der Preisseite und bei der Registrierung (spätestens nach 5 Minuten).',
    `Bestehende Abos (${row.subscribers}) behalten ihren bisherigen Preis.`,
  ];
  const warnings = [];
  if (ratio >= 1.5 || ratio <= 0.5) warnings.push(`Große Änderung: ${Math.round((ratio - 1) * 100)} %.`);
  if (ctx.cfg.stripe.tax.mode === 'automatic' && await stripeTaxState(ctx) !== 'ok') warnings.push('Stripe Tax ist gerade nicht aktiv – die Änderung wird abgelehnt.');
  return json(ctx.request, ctx.cfg, 200, {changeId, price: key, amount, current: row.unit_amount,
    expectedProviderPriceId: row.provider_price_id, summary: lines, warnings}, {cookies: ctx.outCookies});
}

// Ausfuehren: erneute Anmeldung, Pruefungen, Stripe-Preis (idempotent), Aktivierung in einer DB-Transaktion.
export async function apply(ctx) {
  const user = await requirePricingAdmin(ctx);
  await ctx.limit('sensitive', user.id);
  const body = await readJson(ctx.request);
  if (body.confirm !== true) throw new HttpError(400, 'CONFIRMATION_REQUIRED');
  const changeId = String(body.changeId || '');
  if (!CHANGE_ID.test(changeId)) throw new HttpError(400, 'CHANGE_ID_INVALID');
  const key = v.priceKey(body.price);
  const amount = amountFrom(body);
  const expected = String(body.expectedProviderPriceId || '');
  await reauthenticate(ctx, user, body.password);
  if (ctx.cfg.stripe.tax.mode === 'automatic' && await stripeTaxState(ctx) !== 'ok') throw new HttpError(503, 'TAX_CONFIG_INVALID');

  const dbError = e => {
    const code = DB_ERRORS.find(c => e instanceof SupabaseError && String(e.upstreamMessage || e.code).includes(c));
    if (code) return new HttpError(409, code);
    return e;
  };
  let change;
  try { change = await ctx.store.priceChangeBegin(changeId, user.id, key, expected, amount); }
  catch (e) { throw dbError(e); }
  if (change.status === 'applied') return done(ctx, change);

  if (!change.new_provider_price_id) {
    let created;
    try {
      const old = await ctx.stripe.retrievePrice(change.old_provider_price_id);
      if (old.tax_behavior !== 'inclusive' || !old.recurring?.interval) throw new HttpError(409, 'PRICE_NOT_INCLUSIVE');
      created = await ctx.stripe.createPrice({
        product: typeof old.product === 'string' ? old.product : old.product?.id,
        currency: old.currency, unit_amount: amount, tax_behavior: 'inclusive',
        recurring: {interval: old.recurring.interval, interval_count: old.recurring.interval_count || 1},
        ...(old.lookup_key ? {lookup_key: old.lookup_key, transfer_lookup_key: 'true'} : {}),
        nickname: `${key} ${(amount / 100).toFixed(2)} EUR`, metadata: {vu_change_id: changeId, vu_previous_price: old.id},
      }, `vu-price-${changeId}`);
      if (created.unit_amount !== amount || Boolean(created.livemode) !== livemode(ctx) || created.tax_behavior !== 'inclusive') {
        throw new HttpError(502, 'STRIPE_PRICE_MISMATCH');
      }
    } catch (e) {
      await ctx.store.priceChangeFailed(changeId, String(e.code || e.message)).catch(() => {});
      ctx.log('error', 'PRICE_CHANGE_FAILED', {change: changeId, step: 'stripe', code: String(e.code || e.message).slice(0, 80)});
      throw e instanceof HttpError ? e : new HttpError(502, 'STRIPE_UNAVAILABLE');
    }
    await ctx.store.priceChangeStripe(changeId, created.id);
  }
  try { change = await ctx.store.priceChangeApply(changeId); }
  catch (e) {
    await ctx.store.priceChangeFailed(changeId, String(e.upstreamMessage || e.code || e.message)).catch(() => {});
    ctx.log('error', 'PRICE_CHANGE_FAILED', {change: changeId, step: 'activate'});
    const mapped = dbError(e);
    throw mapped instanceof HttpError ? mapped : new HttpError(503, 'PRICE_CHANGE_RETRY');
  }
  ctx.log('info', 'PRICE_APPLIED', {change: changeId, price: key, from: change.old_amount, to: change.new_amount});
  return done(ctx, change);
}

function done(ctx, change) {
  resetCatalogCache();
  return json(ctx.request, ctx.cfg, 200, {state: 'PRICE_APPLIED', change: {changeId: change.change_id, from: change.old_amount,
    to: change.new_amount, price: change.new_plan_price_id, status: change.status}}, {cookies: ctx.outCookies});
}
