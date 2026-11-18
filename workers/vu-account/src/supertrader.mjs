// Supertrader: Methoden folgen („Folgen“ im Fenster „Methode“, App-Konzept 2, Owner 16.11.2026).
// Gemeldet wird, wenn eine Aktie bei einer gefolgten Methode „Regel erfuellt“ oder „Plan fertig“ erreicht
// (push.mjs#stageNotices, supabase/prepared/supertrader_follows.sql#push_claim_daily).
// „Melden“ einer einzelnen Aktie braucht keinen eigenen Ort: es ist der Watchlist-Eintrag mit alerts.SUPERTRADER_SIGNAL.
// Jeder Zugriff laeuft mit dem JWT des Nutzers - Postgres prueft RLS und die feste Grenze von 50 je Konto.
// AUS bis zur Anwaltspruefung (VU_SUPERTRADER_ALERTS_ENABLED, docs/accounts/FREIGABEN.md): ohne Schalter antwortet jede
// Route 404 SUPERTRADER_ALERTS_NOT_ACTIVATED, bevor Sitzung oder Datenbank gefragt werden.

import {HttpError, json, readJson} from './http.mjs';
import {requireUser} from './auth.mjs';
import {SupabaseError} from './supabase.mjs';
import * as v from './validate.mjs';

export const FOLLOWS_MAX = 50;
export const NOT_ACTIVATED = 'SUPERTRADER_ALERTS_NOT_ACTIVATED';
export function activated(cfg) { return cfg?.supertraderAlerts?.enabled === true; }
function requireActivated(ctx) { if (!activated(ctx.cfg)) throw new HttpError(404, NOT_ACTIVATED); }

const DB_STATES = [[/SUPERTRADER_FOLLOWS_LIMIT_REACHED/, 409], [/SUPERTRADER_FOLLOW_NOT_OWNED/, 404], [/STRATEGY_INVALID/, 400]];
async function db(fn) {
  try { return await fn(); } catch (e) {
    if (e instanceof SupabaseError) {
      const msg = String(e.upstreamMessage || e.code || '');
      for (const [re, status] of DB_STATES) if (re.test(msg)) throw new HttpError(status, msg.match(re)[0]);
    }
    throw e;
  }
}

// GET /v1/supertrader/follows -> {follows: [{strategyId, createdAt}], limit: 50}
export async function list(ctx) {
  requireActivated(ctx);
  const user = await requireUser(ctx);
  const rows = await ctx.sb.user.select(user.accessToken, 'supertrader_follows',
    {user_id: `eq.${user.id}`, order: 'created_at.asc', limit: String(FOLLOWS_MAX), select: 'strategy_id,created_at'});
  return json(ctx.request, ctx.cfg, 200, {follows: (rows || []).map(r => ({strategyId: r.strategy_id, createdAt: r.created_at})), limit: FOLLOWS_MAX},
    {cookies: ctx.outCookies, headers: {'Cache-Control': 'private, no-store'}});
}

// POST /v1/supertrader/follows {strategyId} -> {state: 'FOLLOWED'|'ALREADY_FOLLOWING', strategyId}
export async function follow(ctx) {
  requireActivated(ctx);
  const user = await requireUser(ctx);
  await ctx.limit('follows', user.id);
  const body = await readJson(ctx.request);
  const r = await db(() => ctx.sb.user.rpc(user.accessToken, 'supertrader_follow', {p_strategy: v.strategyId(body.strategyId)}));
  return json(ctx.request, ctx.cfg, r.state === 'FOLLOWED' ? 201 : 200, r, {cookies: ctx.outCookies});
}

// POST /v1/supertrader/follows/remove {strategyId} -> {state: 'REMOVED'|'NOT_PRESENT', removed}
export async function unfollow(ctx) {
  requireActivated(ctx);
  const user = await requireUser(ctx);
  await ctx.limit('follows', user.id);
  const body = await readJson(ctx.request);
  const removed = await db(() => ctx.sb.user.rpc(user.accessToken, 'supertrader_unfollow', {p_strategy: v.strategyId(body.strategyId)}));
  return json(ctx.request, ctx.cfg, 200, {state: removed ? 'REMOVED' : 'NOT_PRESENT', removed}, {cookies: ctx.outCookies});
}
