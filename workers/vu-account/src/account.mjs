// Mein Konto: Profil, Einstellungen, Abo-Uebersicht, Datenexport, Loeschung.
// Alle Lese- und Schreibzugriffe auf Nutzerdaten laufen mit dem JWT des
// Nutzers - Postgres prueft RLS. Nur Loeschung und Abrechnung nutzen den
// Server-Schluessel.

import {HttpError, json, readJson} from './http.mjs';
import {requireUser, reauthenticate, clearSession} from './auth.mjs';
import {billingBlocker} from './config.mjs';
import {checkoutAllowed} from './billing.mjs';
import * as v from './validate.mjs';

const one = rows => (Array.isArray(rows) ? rows[0] || null : null);

export async function me(ctx) {
  const user = await requireUser(ctx);
  const t = user.accessToken;
  const [profile, settings, roles, entitlements] = await Promise.all([
    ctx.sb.user.select(t, 'profiles', {user_id: `eq.${user.id}`}).then(one),
    ctx.sb.user.select(t, 'user_settings', {user_id: `eq.${user.id}`}).then(one),
    ctx.sb.user.select(t, 'user_roles', {user_id: `eq.${user.id}`}),
    ctx.sb.user.rpc(t, 'my_entitlements'),
  ]);
  return json(ctx.request, ctx.cfg, 200, {
    user: {id: user.id, email: user.email},
    profile: profile && {displayName: profile.display_name, locale: profile.locale, createdAt: profile.created_at},
    settings: settings && {displayCurrency: settings.display_currency, appearance: settings.appearance,
      experienceLevel: settings.experience_level, notifications: settings.notification_settings,
      marketingEmails: settings.marketing_emails},
    roles: (roles || []).map(r => r.role),
    entitlements,
    billingAvailable: !billingBlocker(ctx.cfg),
    checkoutAllowed: !billingBlocker(ctx.cfg) && await checkoutAllowed(ctx, user),
  }, {cookies: ctx.outCookies});
}

const SETTING_COLUMNS = {displayCurrency: 'display_currency', appearance: 'appearance', experienceLevel: 'experience_level',
  notifications: 'notification_settings', marketingEmails: 'marketing_emails'};

export async function updateMe(ctx) {
  const user = await requireUser(ctx);
  const body = await readJson(ctx.request);
  const profile = v.profilePatch(Object.fromEntries(Object.entries(body.profile || {})
    .map(([k, val]) => [k === 'displayName' ? 'display_name' : k, val])));
  const settings = v.settingsPatch(Object.fromEntries(Object.entries(body.settings || {}).map(([k, val]) => {
    if (!SETTING_COLUMNS[k]) throw new HttpError(400, 'SETTING_INVALID', k);
    return [SETTING_COLUMNS[k], val];
  })));
  const filter = {user_id: `eq.${user.id}`};
  if (Object.keys(profile).length) await ctx.sb.user.update(user.accessToken, 'profiles', filter, profile);
  if (Object.keys(settings).length) await ctx.sb.user.update(user.accessToken, 'user_settings', filter, settings);
  return me(ctx);
}

export async function billingOverview(ctx) {
  const user = await requireUser(ctx);
  const t = user.accessToken;
  const [subscriptions, invoices, entitlements] = await Promise.all([
    ctx.sb.user.select(t, 'subscriptions', {user_id: `eq.${user.id}`, order: 'updated_at.desc'}),
    ctx.sb.user.select(t, 'invoices', {user_id: `eq.${user.id}`, order: 'issued_at.desc.nullslast', limit: '36'}),
    ctx.sb.user.rpc(t, 'my_entitlements'),
  ]);
  return json(ctx.request, ctx.cfg, 200, {
    entitlements,
    subscriptions: (subscriptions || []).map(s => ({id: s.id, plan: s.plan_id, provider: s.provider, status: s.status,
      interval: s.billing_interval, currentPeriodEnd: s.current_period_end, cancelAtPeriodEnd: s.cancel_at_period_end,
      canceledAt: s.canceled_at, endedAt: s.ended_at, trialEnd: s.trial_end})),
    invoices: (invoices || []).map(i => ({number: i.number, status: i.status, currency: i.currency, amountDue: i.amount_due,
      amountPaid: i.amount_paid, issuedAt: i.issued_at, paidAt: i.paid_at, url: i.hosted_invoice_url, pdf: i.invoice_pdf})),
    billingAvailable: !billingBlocker(ctx.cfg),
    checkoutAllowed: !billingBlocker(ctx.cfg) && await checkoutAllowed(ctx, user),
  }, {cookies: ctx.outCookies});
}

// Auskunft und Datenuebertragbarkeit (Art. 15, 20 DSGVO): alles, was zum
// Konto gespeichert ist, als JSON.
export async function exportData(ctx) {
  const user = await requireUser(ctx);
  const t = user.accessToken;
  const f = {user_id: `eq.${user.id}`};
  const [profiles, settings, roles, watchlists, items, subscriptions, invoices, entitlements] = await Promise.all([
    ctx.sb.user.select(t, 'profiles', f), ctx.sb.user.select(t, 'user_settings', f), ctx.sb.user.select(t, 'user_roles', f),
    ctx.sb.user.select(t, 'watchlists', f), ctx.sb.user.select(t, 'watchlist_items', f),
    ctx.sb.user.select(t, 'subscriptions', f), ctx.sb.user.select(t, 'invoices', f), ctx.sb.user.rpc(t, 'my_entitlements')]);
  const body = {schemaVersion: 'vu-account-export-1', exportedAt: new Date(ctx.now()).toISOString(),
    account: {id: user.id, email: user.email}, profile: one(profiles), settings: one(settings), roles, watchlists,
    watchlistItems: items, subscriptions, invoices, entitlements,
    notice: 'Zahlungsdaten (Karte, Konto) speichert Vision Universe nicht; sie liegen beim Zahlungsanbieter.'};
  return json(ctx.request, ctx.cfg, 200, body, {cookies: ctx.outCookies,
    headers: {'Content-Disposition': 'attachment; filename="vision-universe-konto.json"'}});
}

// Kontoloeschung (Art. 17 DSGVO). Reihenfolge:
//   1 Passwort bestaetigen  2 laufende Stripe-Abos sofort beenden
//   3 Loeschnachweis (nur Hash)  4 Supabase-Nutzer loeschen -> Profil,
//   Einstellungen, Rollen, Watchlists per Cascade; Abos/Rechnungen werden
//   pseudonymisiert aufbewahrt (§ 147 AO, § 257 HGB).
export async function deleteAccount(ctx) {
  const user = await requireUser(ctx);
  await ctx.limit('sensitive', user.id);
  const body = await readJson(ctx.request);
  if (body.confirm !== 'LOESCHEN') throw new HttpError(400, 'CONFIRMATION_REQUIRED');
  await reauthenticate(ctx, user, body.currentPassword);

  let canceled = 0;
  const customer = await ctx.store.customerForUser(user.id, 'stripe');
  if (customer) {
    if (billingBlocker(ctx.cfg)) throw new HttpError(503, 'BILLING_UNAVAILABLE_FOR_DELETION');
    const list = await ctx.stripe.listSubscriptions(customer);
    for (const sub of list.data || []) {
      if (['canceled', 'incomplete_expired'].includes(sub.status)) continue;
      await ctx.stripe.cancelSubscription(sub.id);
      canceled++;
    }
    await ctx.stripe.updateCustomer(customer, {metadata: {vu_account_deleted: 'true'}});
  }
  await ctx.store.recordDeletion(user.id, canceled);
  await ctx.sb.auth.adminDeleteUser(user.id);
  ctx.log('info', 'ACCOUNT_DELETED', {subscriptionsCanceled: canceled});
  return json(ctx.request, ctx.cfg, 200, {state: 'ACCOUNT_DELETED', subscriptionsCanceled: canceled},
    {cookies: clearSession(ctx)});
}
