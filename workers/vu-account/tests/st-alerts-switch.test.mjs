// Vertragstest: Supertrader „Folgen“/„Melden“ ist eingebaut, aber AUS bis zur Pruefung durch einen Anwalt
// (Owner 16.11.2026: „mach das so, wie du es für richtig hältst“; docs/accounts/FREIGABEN.md, docs/legal/EINORDNUNG.md).
// Drei Teile schalten gemeinsam: Worker (VU_SUPERTRADER_ALERTS_ENABLED), Frontend (ST_ALERTS_UI in
// supertrader/assets/st-redesign.js) und die Migration (vorbereitet in supabase/prepared/, ausgerollt erst in
// supabase/migrations/). Geprueft werden beide Zustaende: AUS (ausgeliefert) und AN (wie gebaut).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {base64UrlEncode} from '../src/crypto.mjs';
import {createApp} from '../src/index.mjs';
import {runPush} from '../src/push.mjs';
import {SF_INDEX_URL, SF_SCHEMA} from '../src/st-notices.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SUPA = 'https://proj.supabase.co';
const API = 'https://konto.example.test';
const USER = '0d3a3c3e-4444-4222-8333-444455556666';
const ENV = {SUPABASE_URL: SUPA, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test',
  VU_ACCOUNT_API_ORIGIN: API, VU_SITE_ORIGIN: 'https://research.visionuniverse.de'};
const ON = {...ENV, VU_SUPERTRADER_ALERTS_ENABLED: 'true'};
const ROUTES = [['GET', '/v1/supertrader/follows'], ['POST', '/v1/supertrader/follows', {strategyId: 'SF_MINERVINI_SEPA_VCP'}],
  ['POST', '/v1/supertrader/follows/remove', {strategyId: 'SF_MINERVINI_SEPA_VCP'}]];

const keys = await webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
const JWK = {...(await webcrypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'ES256'};
async function token(sub) {
  const enc = o => base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const h = enc({alg: 'ES256', kid: 'k1', typ: 'JWT'});
  const p = enc({iss: SUPA + '/auth/v1', aud: 'authenticated', role: 'authenticated', sub, exp: Math.floor(Date.now() / 1000) + 600});
  const s = await webcrypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, keys.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${base64UrlEncode(s)}`;
}

// Supabase simuliert: JWKS, die Tabelle supertrader_follows und die beiden Funktionen; jede Anfrage wird mitgeschrieben.
function app(env) {
  const calls = [], follows = new Set();
  const res = body => new Response(JSON.stringify(body), {headers: {'Content-Type': 'application/json'}});
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(u.pathname);
    if (u.pathname === '/auth/v1/.well-known/jwks.json') return res({keys: [JWK]});
    if (u.pathname === '/rest/v1/supertrader_follows') return res([...follows].map(id => ({strategy_id: id, created_at: '2026-11-16T10:00:00Z'})));
    const body = init.body ? JSON.parse(init.body) : {};
    if (u.pathname === '/rest/v1/rpc/supertrader_follow') {
      const had = follows.has(body.p_strategy); follows.add(body.p_strategy);
      return res({state: had ? 'ALREADY_FOLLOWING' : 'FOLLOWED', strategyId: body.p_strategy});
    }
    if (u.pathname === '/rest/v1/rpc/supertrader_unfollow') return res(follows.delete(body.p_strategy) ? 1 : 0);
    return new Response('{"message":"unexpected"}', {status: 500});
  };
  return {...createApp({env, fetchImpl, log: () => {}}), calls};
}
async function call(a, method, p, body) {
  const headers = {Authorization: 'Bearer ' + await token(USER)};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await a.handle(new Request(API + p, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)}));
  return {status: r.status, body: await r.json()};
}

const index = asOf => ({schema: SF_SCHEMA, asOf, strategies: [{strategyId: 'SF_MINERVINI_SEPA_VCP', candidateId: 'C06'}],
  candidates: [{c: 'C06', t: 'NVDA', n: 'NVIDIA', s: 'CONFIRMED_RESEARCH_SETUP'}], changes: {status: 'COMPARED', added: ['C06|NVDA'], removed: [], restaged: []}});

test('ST-ALERTS-1 AUS (Standard): jede Route 404 SUPERTRADER_ALERTS_NOT_ACTIVATED, ohne Sitzungs- oder Datenbankabfrage', async () => {
  for (const flag of [undefined, '', 'false', '1', 'yes', 'on', 'wahr']) {
    const a = app(flag === undefined ? ENV : {...ENV, VU_SUPERTRADER_ALERTS_ENABLED: flag});
    assert.equal(a.cfg.supertraderAlerts.enabled, false, String(flag));
    for (const [m, p, body] of ROUTES) {
      const r = await call(a, m, p, body);
      assert.deepEqual([r.status, r.body], [404, {state: 'SUPERTRADER_ALERTS_NOT_ACTIVATED'}], `${flag} ${m} ${p}`);
    }
    assert.deepEqual(a.calls, [], 'weder JWKS noch Tabelle noch Funktion');
  }
});

test('ST-ALERTS-2 AN: Folgen, Liste, Entfolgen wie gebaut', async () => {
  const a = app(ON);
  assert.equal(a.cfg.supertraderAlerts.enabled, true);
  assert.deepEqual((await call(a, 'GET', '/v1/supertrader/follows')).body, {follows: [], limit: 50});
  const f = await call(a, 'POST', '/v1/supertrader/follows', {strategyId: 'SF_MINERVINI_SEPA_VCP'});
  assert.deepEqual([f.status, f.body], [201, {state: 'FOLLOWED', strategyId: 'SF_MINERVINI_SEPA_VCP'}]);
  assert.equal((await call(a, 'POST', '/v1/supertrader/follows', {strategyId: 'SF_MINERVINI_SEPA_VCP'})).status, 200, 'idempotent');
  assert.deepEqual((await call(a, 'GET', '/v1/supertrader/follows')).body.follows.map(x => x.strategyId), ['SF_MINERVINI_SEPA_VCP']);
  assert.deepEqual((await call(a, 'POST', '/v1/supertrader/follows', {strategyId: 'MINERVINI'})).body, {state: 'STRATEGY_INVALID'});
  assert.deepEqual((await call(a, 'POST', '/v1/supertrader/follows/remove', {strategyId: 'SF_MINERVINI_SEPA_VCP'})).body, {state: 'REMOVED', removed: 1});
});

test('ST-ALERTS-3 Push: AUS liest weder Kandidatenstand noch supertrader_stage_seen und sendet keine Stufen-Meldung; AN wie gebaut', async () => {
  const now = Date.parse('2026-11-16T08:00:00Z'), fetched = [], rpcs = [], sent = [];
  const fetchImpl = async url => { fetched.push(url); return url === SF_INDEX_URL ? {ok: true, text: async () => JSON.stringify(index('2026-11-16'))} : {ok: false}; };
  const service = {rpc: async (fn, args) => {
    rpcs.push(fn);
    if (fn === 'supertrader_stage_seen') return '2026-11-16T07:50:00Z';
    return args.p_events.length ? [{token: 'device-a', count: 1, stage: 1, ids: [args.p_events[0].eventId]}] : [];
  }};
  const fcm = {configured: true, send: async (token, count, message) => { sent.push([token, count, message]); }};
  // AUS: Watchlist-Ereignisse nicht erreichbar -> wie bisher EVENTS_UNAVAILABLE, kein Stufen-Weg.
  for (const stageAlerts of [undefined, false]) {
    assert.deepEqual(await runPush({fcm, service, fetchImpl, now: () => now, ...(stageAlerts === undefined ? {} : {stageAlerts})}), {skipped: 'EVENTS_UNAVAILABLE'});
  }
  assert.equal(fetched.includes(SF_INDEX_URL), false, 'Kandidatenstand nicht gelesen');
  assert.deepEqual(rpcs, [], 'keine Datenbankfunktion');
  assert.deepEqual(sent, [], 'keine Nachricht');
  // AN: Stufen-Meldung geht raus.
  assert.deepEqual(await runPush({fcm, service, fetchImpl, now: () => now, stageAlerts: true}), {sent: 1, failed: 0});
  assert.deepEqual(rpcs, ['supertrader_stage_seen', 'push_claim_daily']);
  assert.match(sent[0][2].body, /^NVIDIA: Regel erfüllt laut Methode Minervini · VCP .* · Forschung, nicht zertifiziert$/);
});

test('ST-ALERTS-4 Cron reicht den Schalter an den Push weiter; Export liest die Tabelle nur, wenn AN', () => {
  const index = read('workers/vu-account/src/index.mjs'), account = read('workers/vu-account/src/account.mjs');
  assert.match(index, /push\.runPush\(\{[^}]*stageAlerts: cfg\.supertraderAlerts\.enabled\}\)/);
  assert.match(account, /ctx\.cfg\.supertraderAlerts\?\.enabled === true \? ctx\.sb\.user\.select\(t, 'supertrader_follows', f\) : null/);
  assert.match(account, /\.\.\.\(supertraderFollows \? \{supertraderFollows\} : \{\}\)/);
});

// Die drei Teile schalten nur gemeinsam. Ausgeliefert ist alles AUS: Worker in Entwicklung und Produktion "false",
// Frontend-Schalter false, Migration nur vorbereitet (nichts davon laeuft automatisch in die Produktion).
test('ST-ALERTS-5 Schalterkette: Worker, Frontend und Migration stehen gemeinsam (ausgeliefert: AUS)', () => {
  const toml = read('workers/vu-account/wrangler.toml');
  const values = [...toml.matchAll(/^VU_SUPERTRADER_ALERTS_ENABLED = "(true|false)"$/gm)].map(m => m[1]);
  assert.equal(values.length, 2, 'Entwicklung und Produktion setzen den Schalter ausdruecklich');
  const prodOn = toml.slice(toml.indexOf('[env.production.vars]')).match(/^VU_SUPERTRADER_ALERTS_ENABLED = "(true|false)"$/m)[1] === 'true';
  const ui = read('supertrader/assets/st-redesign.js').match(/^ {2}var ST_ALERTS_UI = (true|false);$/m);
  assert.ok(ui, 'Frontend-Schalter ST_ALERTS_UI in st-redesign.js');
  const uiOn = ui[1] === 'true';
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations'));
  const rolledOut = migrations.filter(f => /create table public\.supertrader_follows/.test(read('supabase/migrations/' + f)));
  assert.equal(uiOn, prodOn, 'Frontend und Worker (Produktion) gemeinsam');
  assert.equal(rolledOut.length, prodOn ? 1 : 0, prodOn ? 'AN braucht die Migration in supabase/migrations/' : 'AUS: keine Migration, die automatisch ausrollt');
  if (!prodOn) {
    assert.ok(fs.existsSync(path.join(ROOT, 'supabase/prepared/supertrader_follows.sql')), 'vorbereitet');
    assert.deepEqual(values, ['false', 'false'], 'ausgeliefert: AUS bis zur Anwaltspruefung');
    assert.equal(uiOn, false);
  }
  // Dokumentiert: Freigaben, Anwaltsmappe.
  assert.match(read('docs/accounts/FREIGABEN.md'), /VU_SUPERTRADER_ALERTS_ENABLED/);
  assert.match(read('docs/legal/EINORDNUNG.md'), /Folgen.*Melden/);
});
