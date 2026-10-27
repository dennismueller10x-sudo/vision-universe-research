// Persoenliche Watchlist: nur die Auswahl des Nutzers (instrumentId, Notiz,
// Benachrichtigungen). Jeder Zugriff laeuft mit dem JWT des Nutzers - Postgres
// prueft RLS und die Tarifgrenze (supabase/migrations/20261028000100_*).
// Kurse, Scores und Signale liefert der Worker NICHT: sie sind fuer alle gleich
// und kommen aus der gemeinsamen Auslieferungsansicht (core/data/watchlist-summary-v1.json).

import {HttpError, json, readJson} from './http.mjs';
import {requireUser} from './auth.mjs';
import {SupabaseError} from './supabase.mjs';
import * as v from './validate.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALERT_TYPES = ['PRICE_EVENT', 'SUPERTRADER_SIGNAL', 'QUANT_CHANGE', 'WATCHLIST_NEWS', 'EARNINGS'];

export function instrumentId(value) {
  const s = String(value || '');
  if (!/^vu_[a-f0-9]{6,32}$/.test(s)) throw new HttpError(400, 'INSTRUMENT_INVALID');
  return s;
}
function ticker(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,24}$/.test(s)) throw new HttpError(400, 'TICKER_INVALID');
  return s;
}
function listId(value, required) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new HttpError(400, 'LIST_REQUIRED');
    return null;
  }
  if (!UUID.test(String(value))) throw new HttpError(400, 'LIST_INVALID');
  return String(value);
}
export function alerts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'ALERTS_INVALID');
  for (const [k, b] of Object.entries(value)) if (!ALERT_TYPES.includes(k) || typeof b !== 'boolean') throw new HttpError(400, 'ALERTS_INVALID');
  return value;
}

// Datenbankmeldungen -> stabile Zustaende fuer die Oberflaeche. Nichts sonst
// aus Postgres gelangt zum Client.
const DB_STATES = [
  [/WATCHLIST_ITEMS_LIMIT_REACHED/, 409], [/WATCHLIST_LIMIT_REACHED/, 409], [/FEATURE_NOT_IN_PLAN/, 403],
  [/WATCHLIST_NOT_FOUND/, 404], [/WATCHLIST_ITEM_NOT_FOUND/, 404], [/INSTRUMENT_INVALID/, 400], [/TICKER_INVALID/, 400],
  [/ALERTS_INVALID/, 400], [/WATCHLIST_NOT_OWNED/, 404], [/IMPORT_INVALID/, 400],
];
async function db(fn) {
  try { return await fn(); } catch (e) {
    if (e instanceof SupabaseError) {
      const msg = String(e.upstreamMessage || e.code || '');
      for (const [re, status] of DB_STATES) if (re.test(msg)) throw new HttpError(status, msg.match(re)[0]);
    }
    throw e;
  }
}

function limitsOf(ent) {
  const f = (ent && ent.features) || {};
  const n = k => (typeof f[k] === 'number' ? f[k] : f[k] === true ? null : 0);
  return {plan: (ent && ent.plan_id) || 'free', items: n('watchlist.items'), lists: n('watchlist.lists')};
}

export async function list(ctx) {
  const user = await requireUser(ctx);
  const t = user.accessToken, f = {user_id: `eq.${user.id}`};
  const [lists, items, ent] = await Promise.all([
    ctx.sb.user.select(t, 'watchlists', {...f, order: 'position.asc,created_at.asc'}),
    ctx.sb.user.select(t, 'watchlist_items', {...f, order: 'added_at.desc', limit: '1000',
      select: 'watchlist_id,instrument_id,ticker_at_add,note,alerts,added_at'}),
    ctx.sb.user.rpc(t, 'my_entitlements'),
  ]);
  return json(ctx.request, ctx.cfg, 200, {
    lists: (lists || []).map(l => ({id: l.id, name: l.name, position: l.position})),
    items: (items || []).map(i => ({listId: i.watchlist_id, instrumentId: i.instrument_id, ticker: i.ticker_at_add,
      note: i.note, alerts: i.alerts || {}, addedAt: i.added_at})),
    limits: limitsOf(ent),
  }, {cookies: ctx.outCookies, headers: {'Cache-Control': 'private, no-store'}});
}

export async function add(ctx) {
  const user = await requireUser(ctx);
  await ctx.limit('watchlist', user.id);
  const body = await readJson(ctx.request);
  const r = await db(() => ctx.sb.user.rpc(user.accessToken, 'watchlist_add',
    {p_instrument: instrumentId(body.instrumentId), p_ticker: ticker(body.ticker), p_list: listId(body.listId, false)}));
  return json(ctx.request, ctx.cfg, r.state === 'ADDED' ? 201 : 200, r, {cookies: ctx.outCookies});
}

// Uebernahme mehrerer Titel (z. B. der bisherigen Browser-Watchlist) in EINEM
// Datenbankaufruf: Cloudflare Workers Free erlaubt 50 Unteranfragen je Anfrage.
export async function importItems(ctx) {
  const user = await requireUser(ctx);
  await ctx.limit('sensitive', user.id);
  const body = await readJson(ctx.request, 128 * 1024);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 500) throw new HttpError(400, 'IMPORT_INVALID');
  // Ungueltige Eintraege (z. B. ein Ticker statt instrumentId) werden uebersprungen, nicht der ganze Import.
  const items = [];
  let invalid = 0;
  for (const i of body.items) {
    try { items.push({instrumentId: instrumentId(i && i.instrumentId), ticker: ticker(i && i.ticker)}); } catch { invalid++; }
  }
  const r = items.length
    ? await db(() => ctx.sb.user.rpc(user.accessToken, 'watchlist_import', {p_items: items, p_list: listId(body.listId, false)}))
    : {added: 0, alreadyPresent: 0, skipped: 0, limitReached: false};
  return json(ctx.request, ctx.cfg, 200, {state: 'IMPORTED', ...r, skipped: r.skipped + invalid}, {cookies: ctx.outCookies});
}

export async function remove(ctx) {
  const user = await requireUser(ctx);
  await ctx.limit('watchlist', user.id);
  const body = await readJson(ctx.request);
  const removed = await db(() => ctx.sb.user.rpc(user.accessToken, 'watchlist_remove',
    {p_instrument: instrumentId(body.instrumentId), p_list: listId(body.listId, false)}));
  return json(ctx.request, ctx.cfg, 200, {state: removed ? 'REMOVED' : 'NOT_PRESENT', removed}, {cookies: ctx.outCookies});
}

export async function update(ctx) {
  const user = await requireUser(ctx);
  await ctx.limit('watchlist', user.id);
  const body = await readJson(ctx.request);
  const patch = {};
  if ('note' in body) patch.note = v.shortText(body.note, 500) || '';
  if ('alerts' in body) patch.alerts = alerts(body.alerts);
  if (!Object.keys(patch).length) throw new HttpError(400, 'NOTHING_TO_UPDATE');
  const r = await db(() => ctx.sb.user.rpc(user.accessToken, 'watchlist_update',
    {p_instrument: instrumentId(body.instrumentId), p_list: listId(body.listId, true), p: patch}));
  return json(ctx.request, ctx.cfg, 200, {state: 'UPDATED', item: r}, {cookies: ctx.outCookies});
}
