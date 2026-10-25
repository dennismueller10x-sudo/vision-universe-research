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
import * as auth from './auth.mjs';
import * as account from './account.mjs';
import * as billing from './billing.mjs';

// [Methode, Pfad, Handler, {csrf: Cookie-Schutz pruefen, needsDb}]
const ROUTES = [
  ['GET', '/v1/health', ctx => json(ctx.request, ctx.cfg, 200, {state: 'OK', service: 'vu-account', accounts: supabaseReady(ctx.cfg)}), {db: false}],
  ['GET', '/v1/session', auth.session],
  ['POST', '/v1/auth/login', auth.login, {csrf: true}],
  ['POST', '/v1/auth/logout', auth.logout, {csrf: true}],
  ['POST', '/v1/auth/signup', auth.signup, {csrf: true}],
  ['POST', '/v1/auth/recover', auth.recover, {csrf: true}],
  ['GET', '/v1/auth/callback', auth.callback],
  ['POST', '/v1/auth/password', auth.changePassword, {csrf: true}],
  ['GET', '/v1/me', account.me],
  ['PATCH', '/v1/me', account.updateMe, {csrf: true}],
  ['GET', '/v1/me/billing', account.billingOverview],
  ['GET', '/v1/me/export', account.exportData],
  ['POST', '/v1/me/delete', account.deleteAccount, {csrf: true}],
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

  async function handle(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return preflight(request, cfg);
    const route = ROUTES.find(([m, p]) => p === url.pathname && m === request.method);
    if (!route) {
      const known = ROUTES.some(([, p]) => p === url.pathname);
      return json(request, cfg, known ? 405 : 404, {state: known ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND'});
    }
    const [, , handler, opts = {}] = route;
    const ctx = {request, cfg, sb, store, stripe, jwks, now, log, limit, ip: clientIp(request),
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
  return {handle, cfg};
}

let cached = null;
export default {
  async fetch(request, env) {
    if (!cached || cached.env !== env) cached = {env, app: createApp({env})};
    return cached.app.handle(request);
  },
};
