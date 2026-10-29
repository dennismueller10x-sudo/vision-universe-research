// =============================================================================
// VISION UNIVERSE — vu-account (Cloudflare Worker)
//
// Konto- und Abo-API fuer research.visionuniverse.de (und spaeter die App).
// Backend-for-Frontend: Der Browser spricht nur mit diesem Worker; Tokens
// liegen in HttpOnly-Cookies. Supabase ist die Identitaet und Datenbank,
// Stripe der erste Zahlungsanbieter. Architektur und Betrieb:
// docs/accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md
// =============================================================================

import {loadConfig, supabaseReady} from './config.mjs';
import {HttpError, json, preflight, parseCookies, assertCsrf, clientIp} from './http.mjs';
import {createJwksCache} from './jwt.mjs';
import {createSupabase, createBillingStore, SupabaseError} from './supabase.mjs';
import {createStripeClient, StripeError} from './stripe.mjs';
import {createLimiter} from './limits.mjs';
import {createMailer} from './mail.mjs';
import * as auth from './auth.mjs';
import * as account from './account.mjs';
import * as billing from './billing.mjs';
import * as watchlist from './watchlist.mjs';
import {runScheduled, needsAttention} from './cancellation.mjs';
import {createBrevo, runBrevo} from './brevo.mjs';
import * as pages from './public-pages.mjs';

// Gesundheit, oeffentlich und ohne Zahlen: Kuendigungen "ok" | "attention" | "unknown"
// (fuer die Ueberwachung ohne Schluessel, .github/workflows/account-monitor.yml). 60 s zwischengespeichert.
let cancellationState = {at: 0, value: 'unknown'};
async function health(ctx) {
  let cancellations = 'unknown';
  if (supabaseReady(ctx.cfg)) {
    if (ctx.now() - cancellationState.at > 60_000) {
      let value = 'unknown';
      try { value = needsAttention(await ctx.store.cancellationHealth()) ? 'attention' : 'ok'; } catch { value = 'unknown'; }
      cancellationState = {at: ctx.now(), value};
    }
    cancellations = cancellationState.value;
  }
  // Newsletter-Liste konfiguriert: ist die DOI-Vorlage bei Brevo nutzbar (auch vor dem Einschalten)? Ersetzt einen
  // eigenen Pruef-Workflow; hoechstens ein Brevo-Abruf je 10 Minuten.
  let newsletterTemplate;
  if (ctx.cfg.brevo.lists.newsletter && ctx.brevo?.configured) {
    if (ctx.now() - templateState.at > 600_000) {
      let value;
      try { await ctx.brevo.doiTemplateId(); value = 'ok'; } catch (e) { value = String(e.code || 'unknown').slice(0, 40); }
      templateState = {at: ctx.now(), value};
    }
    newsletterTemplate = templateState.value;
  }
  return json(ctx.request, ctx.cfg, 200, {state: 'OK', service: 'vu-account', accounts: supabaseReady(ctx.cfg),
    mail: ctx.mailer.configured, cancellations, autoProcess: ctx.cfg.cancellation.autoProcess,
    checkout: ctx.cfg.stripe.checkoutAccess, legal: ctx.cfg.legal.status, legalApproved: ctx.cfg.legal.approved,
    tax: ctx.cfg.stripe.tax.mode, newsletter: ctx.cfg.brevo.newsletter, newsletterTemplate, contactSync: ctx.cfg.brevo.sync});
}
let templateState = {at: 0, value: 'unknown'};
export const resetHealthCache = () => { cancellationState = {at: 0, value: 'unknown'}; templateState = {at: 0, value: 'unknown'}; };

// [Methode, Pfad, Handler, {csrf: Cookie-Schutz pruefen, needsDb}]
const ROUTES = [
  ['GET', '/v1/health', health, {db: false}],
  ['GET', '/v1/session', auth.session],
  ['POST', '/v1/auth/login', auth.login, {csrf: true}],
  ['POST', '/v1/auth/logout', auth.logout, {csrf: true}],
  ['POST', '/v1/auth/signup', auth.signup, {csrf: true}],
  ['POST', '/v1/auth/recover', auth.recover, {csrf: true}],
  ['GET', '/v1/auth/callback', auth.callback],
  ['POST', '/v1/auth/password', auth.changePassword, {csrf: true}],
  ['GET', '/v1/me', account.me],
  ['PATCH', '/v1/me', account.updateMe, {csrf: true}],
  ['POST', '/v1/me/plan-intent', account.setPlanIntent, {csrf: true}],
  ['POST', '/v1/me/newsletter', account.newsletter, {csrf: true}],
  ['GET', '/v1/me/billing', account.billingOverview],
  ['GET', '/v1/me/export', account.exportData],
  ['POST', '/v1/me/delete', account.deleteAccount, {csrf: true}],
  ['GET', '/v1/watchlist', watchlist.list],
  ['POST', '/v1/watchlist/items', watchlist.add, {csrf: true}],
  ['PATCH', '/v1/watchlist/items', watchlist.update, {csrf: true}],
  ['POST', '/v1/watchlist/items/remove', watchlist.remove, {csrf: true}],
  ['POST', '/v1/watchlist/import', watchlist.importItems, {csrf: true}],
  ['GET', '/v1/plans', billing.plans],
  ['GET', '/v1/entitlements/check', billing.entitlementCheck],
  ['POST', '/v1/billing/checkout', billing.checkout, {csrf: true}],
  ['POST', '/v1/billing/portal', billing.portal, {csrf: true}],
  ['POST', '/v1/billing/cancel', billing.cancel, {csrf: true}],
  ['POST', '/v1/billing/cancellation-request', billing.cancellationRequest, {csrf: true}],
  ['POST', '/v1/billing/webhook/stripe', billing.stripeWebhook, {webhook: true}],
  ['POST', '/v1/billing/webhook/apple', billing.storeWebhookNotConfigured, {webhook: true, db: false}],
  ['POST', '/v1/billing/webhook/google', billing.storeWebhookNotConfigured, {webhook: true, db: false}],
];

// Oeffentliche HTML-Seiten (ohne Anmeldung, ohne Passwortmaske): Rechtstexte, Kuendigen, Widerrufen.
const PAGES = [
  ['GET', '/rechtliches/', pages.legalIndex, {db: false}],
  ['GET', '/rechtliches', pages.legalIndex, {db: false}],
  ...['impressum', 'datenschutz', 'agb', 'widerrufsbelehrung', 'widerrufsformular', 'newsletter']
    .map(k => ['GET', `/rechtliches/${k}`, pages.legalPage(k), {db: false}]),
  ['GET', '/kuendigen', pages.cancelGet, {db: false}],
  ['POST', '/kuendigen', pages.cancelPost],
  ['GET', '/widerrufen', pages.withdrawGet, {db: false}],
  ['POST', '/widerrufen', pages.withdrawPost],
];

function defaultLog(level, message, fields) {
  console[level === 'error' ? 'error' : 'log'](JSON.stringify({level, message, ...fields}));
}

export function createApp({env, fetchImpl = globalThis.fetch.bind(globalThis), now = () => Date.now(), log = defaultLog}) {
  const cfg = loadConfig(env);
  const jwks = cfg.supabase.url
    ? createJwksCache({url: cfg.supabase.url + '/auth/v1/.well-known/jwks.json', fetchImpl, now}) : null;
  const sb = createSupabase({url: cfg.supabase.url, publishableKey: cfg.supabase.publishableKey,
    secretKey: cfg.supabase.secretKey, fetchImpl, forwardClientIp: cfg.supabase.forwardClientIp});
  const store = createBillingStore(sb.service);
  const stripe = createStripeClient({secretKey: cfg.stripe.secretKey, apiBase: cfg.stripe.apiBase,
    apiVersion: cfg.stripe.apiVersion, fetchImpl});
  const limit = createLimiter({binding: env.VU_ACCOUNT_LIMITER, now});
  const mailer = createMailer({...cfg.mail, fetchImpl});
  const brevo = createBrevo({apiKey: cfg.mail.apiKey, apiBase: cfg.mail.apiBase, fetchImpl});

  async function handle(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return preflight(request, cfg);
    // HEAD wie GET (Link-Pruefer, Suchmaschinen), ohne Inhalt.
    const head = request.method === 'HEAD';
    const htmlRoute = PAGES.find(([m, p]) => p === url.pathname && m === (head ? 'GET' : request.method));
    if (htmlRoute) {
      const [, , handler, opts = {}] = htmlRoute;
      const ctx = {request, cfg, sb, store, stripe, jwks, now, log, limit, mailer, brevo, ip: clientIp(request),
        cookies: parseCookies(request), outCookies: []};
      try {
        if (opts.db !== false && !supabaseReady(cfg)) throw new Error('ACCOUNTS_NOT_CONFIGURED');
        const res = await handler(ctx);
        return head ? new Response(null, {status: res.status, headers: res.headers}) : res;
      } catch (e) {
        if (!(e instanceof HttpError)) log('error', 'PAGE_FAILED', {route: url.pathname, code: String(e.code || e.message).slice(0, 120)});
        return pages.htmlError(e);
      }
    }
    const route = ROUTES.find(([m, p]) => p === url.pathname && m === request.method);
    if (!route) {
      const known = ROUTES.some(([, p]) => p === url.pathname);
      return json(request, cfg, known ? 405 : 404, {state: known ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND'});
    }
    const [, , handler, opts = {}] = route;
    const ctx = {request, cfg, sb, store, stripe, jwks, now, log, limit, mailer, brevo, ip: clientIp(request),
      cookies: parseCookies(request), outCookies: []};
    try {
      if (opts.db !== false && !supabaseReady(cfg)) throw new HttpError(503, 'ACCOUNTS_NOT_CONFIGURED');
      if (opts.csrf) assertCsrf(request, cfg, {bearer: (request.headers.get('Authorization') || '').startsWith('Bearer ')});
      return await handler(ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        return json(request, cfg, e.status, {state: e.state, ...(e.detail ? {detail: e.detail} : {})}, {cookies: ctx.outCookies});
      }
      // Fehlerdetails von Upstream nie an den Client.
      const upstream = e instanceof SupabaseError ? 'SUPABASE' : e instanceof StripeError ? 'STRIPE' : 'INTERNAL';
      log('error', 'UNHANDLED', {route: url.pathname, upstream, code: String(e.code || e.message).slice(0, 120)});
      return json(request, cfg, upstream === 'INTERNAL' ? 500 : 502, {state: upstream === 'INTERNAL' ? 'INTERNAL_ERROR' : 'UPSTREAM_UNAVAILABLE'});
    }
  }
  // Cron (wrangler.toml [triggers]): Postausgang wiederholen, Fristen ueberwachen.
  async function scheduled() {
    if (!supabaseReady(cfg)) return {skipped: 'ACCOUNTS_NOT_CONFIGURED'};
    const result = await runScheduled({store, stripe, mailer, cfg, log, now});
    let brevoResult = null;
    try { brevoResult = await runBrevo({store, brevo, cfg, log, now}); }
    catch (e) { log('error', 'BREVO_RUN_FAILED', {code: String(e.code || e.message).slice(0, 120)}); }
    return {...result, brevo: brevoResult};
  }
  return {handle, scheduled, cfg, deps: {store, stripe, mailer, brevo, cfg, log, now}};
}

let cached = null;
export default {
  async scheduled(event, env, ctx) {
    if (!cached || cached.env !== env) cached = {env, app: createApp({env})};
    ctx.waitUntil(cached.app.scheduled());
  },
  async fetch(request, env) {
    if (!cached || cached.env !== env) cached = {env, app: createApp({env})};
    return cached.app.handle(request);
  },
};
