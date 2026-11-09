#!/usr/bin/env node
/* Vision Universe - Abnahmeprotokoll der internen Backtest-Vorschau (ohne Netz, ohne Datenbank).
   Spielt die echte Worker-Logik (createApp) mit simuliertem Supabase durch und schreibt ein Protokoll:
     node scripts/account/backtest-review-acceptance.mjs [--out <protokoll.json>]
   Geprueft: Schalter aus (404 ohne Daten), ohne Sitzung 401, ohne Rolle 403, Rolle backtest_reviewer 200;
   alle sechs Arten; jede der vorgerechneten Auswahlen (GET und POST); gueltige, nicht vorgerechnete Varianten
   (NOT_PRECOMPUTED, nie gerechnet); ungueltige Kombinationen (400 mit sicherem Code); Zustand A/B, NOT_CERTIFIED,
   Nachweisart, Generation und Hashbindung des Pakets. Schreibt nur nach --out (Standard: stdout). */
import fs from 'node:fs';
import path from 'node:path';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {base64UrlEncode} from '../../workers/vu-account/src/crypto.mjs';
import {createApp} from '../../workers/vu-account/src/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2), at = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'workers/vu-account/data/backtest-review-bundle.json'), 'utf8'));
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/config/security-master-generations.json'), 'utf8'));
const SITE = 'https://research.visionuniverse.de', SUPA = 'https://proj.supabase.co', API = 'https://konto.example.test';
const REVIEWER = '0d3a3c3e-1111-4222-8333-444455556666', PLAIN = '0d3a3c3e-3333-4222-8333-444455556666', PRICING = '0d3a3c3e-2222-4222-8333-444455556666';
const ROLES = {[REVIEWER]: ['user', 'backtest_reviewer'], [PLAIN]: ['user'], [PRICING]: ['user', 'pricing_admin', 'billing_tester']};
const ENV = {SUPABASE_URL: SUPA, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test', VU_ACCOUNT_API_ORIGIN: API, VU_SITE_ORIGIN: SITE};

const keys = await webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
const JWK = {...(await webcrypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'ES256'};
async function token(sub) {
  const enc = o => base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const h = enc({alg: 'ES256', kid: 'k1', typ: 'JWT'});
  const p = enc({iss: SUPA + '/auth/v1', aud: 'authenticated', role: 'authenticated', sub, exp: Math.floor(Date.now() / 1000) + 600});
  const s = await webcrypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, keys.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${base64UrlEncode(s)}`;
}
function app(env) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url); calls.push(u.pathname);
    if (u.pathname === '/auth/v1/.well-known/jwks.json') return new Response(JSON.stringify({keys: [JWK]}));
    if (u.pathname === '/rest/v1/user_roles') {
      const sub = JSON.parse(Buffer.from(((init.headers || {}).Authorization || '').slice(7).split('.')[1], 'base64url').toString()).sub;
      const want = (u.searchParams.get('role') || '').replace(/^eq\./, ''), uid = (u.searchParams.get('user_id') || '').replace(/^eq\./, '');
      const rows = uid === sub ? (ROLES[sub] || []).filter(r => !want || r === want).map(role => ({user_id: sub, role})) : [];
      return new Response(JSON.stringify(rows), {headers: {'Content-Type': 'application/json'}});
    }
    return new Response('{}', {status: 500});
  };
  return {...createApp({env, fetchImpl, log: () => {}}), calls};
}
async function call(a, method, p, {sub, body} = {}) {
  const h = {};
  if (sub) h.Authorization = 'Bearer ' + await token(sub);
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await a.handle(new Request(API + p, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)}));
  return {status: r.status, cache: r.headers.get('Cache-Control'), body: await r.json()};
}
const q = s => '/v1/admin/backtests/lookup?selection=' + encodeURIComponent(JSON.stringify(s));

const checks = []; let failed = 0;
const check = (id, ok, detail = '') => { checks.push({id, ok: !!ok, detail}); if (!ok) failed++; };

// 1. Schalter aus: 404 ohne Daten, keine Rollenabfrage
{ const a = app(ENV);
  for (const [m, p] of [['GET', '/v1/admin/backtests'], ['GET', q(BUNDLE.entries[0].selection)]]) {
    const r = await call(a, m, p, {sub: REVIEWER});
    check('AUS ' + m + ' ' + p.slice(0, 40), r.status === 404 && r.body.state === 'PREVIEW_NOT_ACTIVATED' && Object.keys(r.body).length === 1, r.status);
  }
  check('AUS: keine Rollenabfrage', !a.calls.includes('/rest/v1/user_roles')); }

const a = app({...ENV, VU_BACKTEST_REVIEW_ENABLED: 'true'});
// 2. Sitzung und Rolle (serverseitig)
{ const none = await call(a, 'GET', '/v1/admin/backtests'); check('ohne Sitzung 401', none.status === 401 && !none.body.entries, none.status);
  for (const [name, sub] of [['ohne Rolle', PLAIN], ['pricing_admin/billing_tester', PRICING]]) {
    const r = await call(a, 'GET', '/v1/admin/backtests', {sub}); check(name + ' 403', r.status === 403 && r.body.state === 'NOT_BACKTEST_REVIEWER' && !r.body.entries, r.status); } }
// 3. Uebersicht mit Rolle
const ov = await call(a, 'GET', '/v1/admin/backtests', {sub: REVIEWER});
check('Rolle: 200, no-store', ov.status === 200 && /no-store/.test(ov.cache || ''), ov.status);
const body = ov.body;
const kinds = new Set((body.menu && body.menu.kinds) || []);
check('sechs Arten im Menue', kinds.size === 6, [...kinds].join(','));
check('Paket NOT_CERTIFIED, productionApproved=false, nicht aktiviert', body.certification === 'NOT_CERTIFIED' && body.productionApproved === false && body.publiclyActivated === false,
  JSON.stringify({c: body.certification, p: body.productionApproved, a: body.publiclyActivated}));
// Generation: Antwort nennt sie, das serverseitige Paket bindet sie per Hash an das Register (#1210)
const gen = REG.generations[body.masterGeneration];
check('Generation registriert und hashgleich (Antwort und Paket)', gen && body.masterGeneration === BUNDLE.masterGeneration && gen.sha256 === BUNDLE.masterHash,
  body.masterGeneration + ' ' + String(BUNDLE.masterHash).slice(0, 12));
check('Katalog-Generation 1', body.catalogHash === '7ea6383e7260a5fb40b95e07066b625c73d0beca74e332c3c79c1733d7cb6e44', String(body.catalogHash).slice(0, 12));

// 4. jede vorgerechnete Auswahl, GET und POST
const perEntry = [];
for (const e of BUNDLE.entries) {
  const g = await call(a, 'GET', q(e.selection), {sub: REVIEWER});
  const p = await call(a, 'POST', '/v1/admin/backtests/lookup', {sub: REVIEWER, body: {selection: e.selection}});
  const r = g.body.entry || g.body.result || g.body;
  const ok = g.status === 200 && p.status === 200 && g.body.state === 'PRECOMPUTED' && p.body.state === 'PRECOMPUTED' && JSON.stringify(g.body) === JSON.stringify(p.body);
  const ent = g.body.entry || {};
  const cert = ent.certificationStatus !== 'CERTIFIED' && ent.evidence && ent.evidence.certified === false && ent.productionApproved === false;
  perEntry.push({label: e.label, kind: e.kind, state: ent.stateCode, evidence: ent.evidence && ent.evidence.class, certificationStatus: ent.certificationStatus, ok: ok && cert});
  check('vorgerechnet: ' + e.label, ok && cert, ent.stateCode + ' ' + (ent.evidence && ent.evidence.class));
}
const byKind = perEntry.reduce((m, x) => (m[x.kind] = (m[x.kind] || 0) + 1, m), {});
check('alle sechs Arten vorgerechnet abrufbar', Object.keys(byKind).length === 6, JSON.stringify(byKind));
const states = perEntry.reduce((m, x) => (m[x.state] = (m[x.state] || 0) + 1, m), {});
check('Zustaende 20 A + 1 B', states.A === 20 && states.B === 1, JSON.stringify(states));

// 5. gueltig, aber nicht vorgerechnet: NOT_PRECOMPUTED, keine Rechnung (je Art mindestens eine Variante)
const variants = [], seenKinds = new Set();
const known = new Set(BUNDLE.entries.map(e => JSON.stringify(e.selection)));
for (const t of body.menu.templates) {
  for (const extra of [{costPreset: 'NONE'}, {costPreset: 'STANDARD'}, {costPreset: 'HIGH'}, {methods: 'NONE'}, {benchmark: 'NONE'}]) {
    const sel = {schemaVersion: 'backtest-spec-selection-1.0.0', template: t.id, ...extra};
    if (known.has(JSON.stringify(sel))) continue;
    const r = await call(a, 'GET', q(sel), {sub: REVIEWER});
    variants.push({template: t.id, kind: t.kind, selection: extra, status: r.status, state: r.body.state, code: r.body.code || null});
    if (r.status === 200) {
      check(`nicht vorgerechnet: ${t.id} ${JSON.stringify(extra)}`, r.body.state === 'NOT_PRECOMPUTED' && !r.body.entry && !r.body.result, r.body.state);
      seenKinds.add(t.kind); break;
    }
  }
}
check('NOT_PRECOMPUTED fuer jede der sechs Arten erreichbar', seenKinds.size === 6, [...seenKinds].join(','));
// 6. ungueltige Kombinationen: 400 mit sicherem Code, keine Daten
const bad = [
  ['unbekannte Vorlage', {schemaVersion: 'backtest-spec-selection-1.0.0', template: 'gibt-es-nicht'}, 'UNKNOWN_TEMPLATE'],
  ['falsches Schema', {schemaVersion: 'x', template: BUNDLE.entries[0].template}, 'SELECTION_SCHEMA_UNKNOWN'],
  ['unbekannter Kostensatz', {schemaVersion: 'backtest-spec-selection-1.0.0', template: BUNDLE.entries[0].template, costPreset: 'ZERO'}, 'COST_PRESET_UNKNOWN'],
  ['Regeln ausserhalb Signal', {schemaVersion: 'backtest-spec-selection-1.0.0', template: 'replay-nvda-winner-splits', ruleIds: ['TREND_DOWN']}, 'RULES_ONLY_FOR_SIGNAL'],
  ['Faktor ausserhalb Faktorart', {schemaVersion: 'backtest-spec-selection-1.0.0', template: 'replay-nvda-winner-splits', factorId: 'value'}, 'FACTOR_ONLY_FOR_FACTOR_KIND'],
  ['Zeitraum verkehrt', {schemaVersion: 'backtest-spec-selection-1.0.0', template: 'signal-2008-crash', window: {from: '2009-01-01', to: '2008-01-01'}}, 'WINDOW_INVALID'],
  ['Zeitraum vor 1990', {schemaVersion: 'backtest-spec-selection-1.0.0', template: BUNDLE.entries[0].template, window: {from: '1800-01-01', to: '1801-01-01'}}, 'WINDOW_INVALID'],
  ['unbekanntes Feld', {schemaVersion: 'backtest-spec-selection-1.0.0', template: BUNDLE.entries[0].template, leverage: 10}, 'SELECTION_UNKNOWN_KEY'],
  ['unbekannte Methodenoption', {schemaVersion: 'backtest-spec-selection-1.0.0', template: BUNDLE.entries[0].template, methods: 'ALL'}, 'METHODS_OPTION_UNKNOWN'],
];
const safe = new Set(BUNDLE.selectionRules.safeCodes);
for (const [name, sel, want] of bad) {
  const r = await call(a, 'GET', q(sel), {sub: REVIEWER});
  const code = String(r.body.detail || '');
  check('ungueltig: ' + name, r.status === 400 && r.body.state === 'SELECTION_REJECTED' && safe.has(code) && code.startsWith(want) && !r.body.entry, r.status + ' ' + code);
}
// 7. kein Ergebnis als zertifiziert
check('kein CERTIFIED_STRATEGY im Paket', !JSON.stringify(BUNDLE).includes('"CERTIFIED_STRATEGY","label"') && BUNDLE.entries.every(e => !e.evidence.certified), '');

const report = {schemaVersion: 'backtest-review-acceptance-1.0.0', bundleHash: BUNDLE.bundleHash, catalogHash: BUNDLE.catalogHash, previewHash: BUNDLE.previewHash,
  masterGeneration: BUNDLE.masterGeneration, checks: checks.length, failed, entries: perEntry, notPrecomputedVariants: variants, results: checks};
const out = at('--out');
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); else console.log(JSON.stringify(report, null, 2));
console.error(`[vorschau-abnahme] ${checks.length} Pruefungen, ${failed} fehlgeschlagen`);
for (const c of checks.filter(c => !c.ok)) console.error('  FEHLT ' + c.id + ' ' + c.detail);
process.exit(failed ? 1 : 0);
