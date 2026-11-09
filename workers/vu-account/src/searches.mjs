// Gespeicherte Suchen (Z3): benannte Filter je Produktwelt (quant, screener, technical, fundamental, discover).
// Jeder Zugriff laeuft mit dem JWT des Nutzers - Postgres prueft RLS und die feste Grenze von 50 je Konto
// (supabase/migrations/20261104000100_redesign_settings_searches.sql). Den Inhalt der Abfrage (query) legt
// die jeweilige Welt fest; hier wird nur die Form geprueft (JSON-Objekt, hoechstens 4 KB).

import {HttpError, json, readJson} from './http.mjs';
import {requireUser} from './auth.mjs';
import {SupabaseError} from './supabase.mjs';
import * as v from './validate.mjs';

export const SAVED_SEARCHES_MAX = 50;

// Datenbankmeldungen -> stabile Zustaende. Nichts sonst aus Postgres gelangt zum Client.
const DB_STATES = [
  [/SAVED_SEARCHES_LIMIT_REACHED/, 409], [/SAVED_SEARCH_NOT_FOUND/, 404], [/SAVED_SEARCH_NOT_OWNED/, 404],
  [/WORLD_INVALID/, 400], [/NAME_INVALID/, 400], [/QUERY_TOO_LARGE/, 400], [/QUERY_INVALID/, 400], [/NOTHING_TO_UPDATE/, 400],
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

const shape = s => ({id: s.id, world: s.world, name: s.name, query: s.query, createdAt: s.created_at ?? s.createdAt,
  updatedAt: s.updated_at ?? s.updatedAt});

// GET /v1/searches[?world=quant] -> {searches: [...], limit: 50}
export async function list(ctx) {
  const user = await requireUser(ctx);
  const world = new URL(ctx.request.url).searchParams.get('world');
  const query = {user_id: `eq.${user.id}`, order: 'updated_at.desc', limit: String(SAVED_SEARCHES_MAX)};
  if (world !== null) query.world = `eq.${v.searchWorld(world)}`;
  const rows = await ctx.sb.user.select(user.accessToken, 'saved_searches', query);
  return json(ctx.request, ctx.cfg, 200, {searches: (rows || []).map(shape), limit: SAVED_SEARCHES_MAX},
    {cookies: ctx.outCookies, headers: {'Cache-Control': 'private, no-store'}});
}

// POST /v1/searches {world, name, query} -> 201 {state: 'CREATED', search}
export async function create(ctx) {
  const user = await requireUser(ctx);
  await ctx.limit('searches', user.id);
  const body = await readJson(ctx.request);
  const args = {p_world: v.searchWorld(body.world), p_name: v.searchName(body.name), p_query: v.searchQuery(body.query)};
  const r = await db(() => ctx.sb.user.rpc(user.accessToken, 'saved_search_create', args));
  return json(ctx.request, ctx.cfg, 201, {state: 'CREATED', search: shape(r)}, {cookies: ctx.outCookies});
}

// PATCH /v1/searches {id, name?, query?} -> {state: 'UPDATED', search}
export async function update(ctx) {
  const user = await requireUser(ctx);
  await ctx.limit('searches', user.id);
  const body = await readJson(ctx.request);
  const id = v.searchId(body.id);
  const patch = {};
  if ('name' in body) patch.name = v.searchName(body.name);
  if ('query' in body) patch.query = v.searchQuery(body.query);
  if (!Object.keys(patch).length) throw new HttpError(400, 'NOTHING_TO_UPDATE');
  const r = await db(() => ctx.sb.user.rpc(user.accessToken, 'saved_search_update', {p_id: id, p: patch}));
  return json(ctx.request, ctx.cfg, 200, {state: 'UPDATED', search: shape(r)}, {cookies: ctx.outCookies});
}

// POST /v1/searches/remove {id} -> {state: 'REMOVED'|'NOT_PRESENT', removed}
export async function remove(ctx) {
  const user = await requireUser(ctx);
  await ctx.limit('searches', user.id);
  const body = await readJson(ctx.request);
  const removed = await db(() => ctx.sb.user.rpc(user.accessToken, 'saved_search_remove', {p_id: v.searchId(body.id)}));
  return json(ctx.request, ctx.cfg, 200, {state: removed ? 'REMOVED' : 'NOT_PRESENT', removed}, {cookies: ctx.outCookies});
}
