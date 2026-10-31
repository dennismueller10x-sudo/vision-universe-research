// Interne Backtest-Vorschau im Konto-Worker: Aktivierung, Sitzung, Rolle, CSRF, Paketintegritaet, Nachschlagen.
// Ohne Datenbank: Supabase (JWKS, user_roles) wird simuliert; die Rolle kommt wie in Produktion aus user_roles.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {base64UrlEncode} from '../src/crypto.mjs';
import {createApp} from '../src/index.mjs';
import {bundleViolations, specFromSelection, lookupSelection} from '../src/backtests.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BUNDLE_FILE = path.join(ROOT, 'workers/vu-account/data/backtest-review-bundle.json');
const Export = require(path.join(ROOT, 'scripts/quant/research/export-backtest-review-bundle.cjs'));
const Builder = require(path.join(ROOT, 'scripts/quant/research/backtest-spec-builder.cjs'));
const Catalog = require(path.join(ROOT, 'scripts/quant/research/build-backtest-catalog.cjs'));
const Runner = require(path.join(ROOT, 'scripts/quant/research/backtest-runner.cjs'));
const BUNDLE = JSON.parse(fs.readFileSync(BUNDLE_FILE, 'utf8'));
const GRID = Catalog.readGrid();

const SITE = 'https://research.visionuniverse.de';
const SUPA = 'https://proj.supabase.co';
const API = 'https://konto.example.test';
const REVIEWER = '0d3a3c3e-1111-4222-8333-444455556666';
const PRICING = '0d3a3c3e-2222-4222-8333-444455556666';
const PLAIN = '0d3a3c3e-3333-4222-8333-444455556666';
const ROLES = {[REVIEWER]: ['user', 'backtest_reviewer'], [PRICING]: ['user', 'pricing_admin', 'billing_tester'], [PLAIN]: ['user']};
const ENV = {SUPABASE_URL: SUPA, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test',
  VU_ACCOUNT_API_ORIGIN: API, VU_SITE_ORIGIN: SITE};
const ON = {...ENV, VU_BACKTEST_REVIEW_ENABLED: 'true'};

const keys = await webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
const JWK = {...(await webcrypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'ES256'};
async function token(sub) {
  const enc = o => base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const h = enc({alg: 'ES256', kid: 'k1', typ: 'JWT'});
  const p = enc({iss: SUPA + '/auth/v1', aud: 'authenticated', role: 'authenticated', sub, exp: Math.floor(Date.now() / 1000) + 600});
  const s = await webcrypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, keys.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${base64UrlEncode(s)}`;
}
const subOf = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).sub;

function app(env = ON, backtestBundle = null) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(u.pathname);
    if (u.pathname === '/auth/v1/.well-known/jwks.json') return new Response(JSON.stringify({keys: [JWK]}));
    if (u.pathname === '/rest/v1/user_roles') {
      const auth = (init.headers || {}).Authorization || '';
      const sub = subOf(auth.slice(7));
      const want = (u.searchParams.get('role') || '').replace(/^eq\./, '');
      const userId = (u.searchParams.get('user_id') || '').replace(/^eq\./, '');
      const rows = userId === sub ? (ROLES[sub] || []).filter(r => !want || r === want).map(role => ({user_id: sub, role})) : [];
      return new Response(JSON.stringify(rows), {headers: {'Content-Type': 'application/json'}});
    }
    return new Response('{"message":"unexpected"}', {status: 500});
  };
  return {...createApp({env, fetchImpl, log: () => {}, backtestBundle}), calls};
}
async function call(a, method, p, {sub, cookieSub, body, headers = {}} = {}) {
  const h = {...headers};
  if (sub) h.Authorization = 'Bearer ' + await token(sub);
  if (cookieSub) h.Cookie = '__Host-vu_at=' + await token(cookieSub);
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await a.handle(new Request(API + p, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)}));
  return {status: res.status, headers: res.headers, body: await res.json()};
}
const q = sel => '/v1/admin/backtests/lookup?selection=' + encodeURIComponent(JSON.stringify(sel));
const SEL = (template, extra = {}) => ({schemaVersion: 'backtest-spec-selection-1.0.0', template, ...extra});

test('standardmaessig aus: ohne Schalter 404 PREVIEW_NOT_ACTIVATED, ohne Daten und ohne Rollenabfrage', async () => {
  for (const flag of [undefined, '', 'false', '1', 'yes', 'on']) {
    const a = app(flag === undefined ? ENV : {...ENV, VU_BACKTEST_REVIEW_ENABLED: flag});
    assert.equal(a.cfg.backtestReview.enabled, false);
    for (const [m, p, body] of [['GET', '/v1/admin/backtests'], ['GET', q(GRID.selections[0].selection)], ['POST', '/v1/admin/backtests/lookup', {selection: GRID.selections[0].selection}]]) {
      const r = await call(a, m, p, {sub: REVIEWER, body});
      assert.equal(r.status, 404, `${flag} ${m} ${p}`);
      assert.deepEqual(r.body, {state: 'PREVIEW_NOT_ACTIVATED'});
      assert.match(r.headers.get('Cache-Control'), /no-store/);
    }
    assert.equal(a.calls.includes('/rest/v1/user_roles'), false, 'keine Rollenabfrage, solange aus');
  }
  const toml = fs.readFileSync(path.join(ROOT, 'workers/vu-account/wrangler.toml'), 'utf8');
  assert.equal((toml.match(/^VU_BACKTEST_REVIEW_ENABLED = "false"$/gm) || []).length, 2, 'Entwicklung und Produktion: aus');
  assert.equal(/^VU_BACKTEST_REVIEW_ENABLED = "true"/m.test(toml), false);
});

test('eingeschaltet: 401 ohne Sitzung, 403 ohne Rolle (auch pricing_admin/billing_tester), Fehler ohne Daten', async () => {
  const a = app();
  const none = await call(a, 'GET', '/v1/admin/backtests');
  assert.equal(none.status, 401); assert.deepEqual(none.body, {state: 'NOT_AUTHENTICATED'});
  const badToken = await call(a, 'GET', '/v1/admin/backtests', {headers: {Authorization: 'Bearer abc.def.ghi'}});
  assert.equal(badToken.status, 401); assert.deepEqual(badToken.body, {state: 'TOKEN_INVALID'});
  for (const sub of [PLAIN, PRICING]) {
    for (const [m, p] of [['GET', '/v1/admin/backtests'], ['GET', q(GRID.selections[0].selection)]]) {
      const r = await call(a, m, p, {sub});
      assert.equal(r.status, 403); assert.deepEqual(r.body, {state: 'NOT_BACKTEST_REVIEWER'});
    }
    const p = await call(a, 'POST', '/v1/admin/backtests/lookup', {sub, body: {selection: GRID.selections[0].selection}});
    assert.equal(p.status, 403); assert.deepEqual(p.body, {state: 'NOT_BACKTEST_REVIEWER'});
  }
});

test('Rolle + Aktivierung: Uebersicht mit Menue, Arten, vorgerechneten Auswahlen und Grenzen; no-store; nie zertifiziert', async () => {
  const a = app();
  const r = await call(a, 'GET', '/v1/admin/backtests', {sub: REVIEWER});
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Cache-Control'), /no-store/);
  assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
  const b = r.body;
  assert.equal(b.productionApproved, false); assert.equal(b.publiclyActivated, false);
  assert.equal(b.certification, 'NOT_CERTIFIED'); assert.equal(b.claim, 'NO_ALPHA_OR_CERTIFICATION_CLAIM');
  assert.equal(b.masterGeneration, 'us-security-master-1.1.0');
  assert.equal(b.catalogHash, BUNDLE.catalogHash); assert.equal(b.previewHash, BUNDLE.previewHash); assert.equal(b.bundleHash, BUNDLE.bundleHash);
  assert.deepEqual(b.certificationArtifact.certifiedKinds, []);
  assert.ok(b.limits.length >= 3 && b.limits.some(l => l.includes('NOT_CERTIFIED')));
  assert.equal(b.menu.kinds.length, 6); assert.equal(b.menu.templates.length, 16);
  assert.deepEqual(Object.keys(b.menu.costPresets), ['NONE', 'STANDARD', 'HIGH']);
  assert.equal(b.kinds.length, 6);
  assert.equal(b.precomputed.length, GRID.selections.length);
  for (const e of b.precomputed) { assert.equal(e.evidence.certified, false); assert.equal(e.evidence.alphaClaim, false); assert.notEqual(e.evidence.class, 'CERTIFIED_STRATEGY'); }
  assert.equal(JSON.stringify(b).includes('"display":{'), false, 'Uebersicht ohne Zahlen der Eintraege');
});

test('Nachschlagen: jede vorgerechnete Auswahl (GET und POST) liefert ihren Eintrag mit Nachweisart und Grenzen', async () => {
  const a = app();
  for (const s of GRID.selections) {
    const g = await call(a, 'GET', q(s.selection), {sub: REVIEWER});
    assert.equal(g.status, 200, s.label);
    assert.equal(g.body.state, 'PRECOMPUTED', s.label);
    const e = BUNDLE.entries.find(x => x.label === s.label);
    assert.equal(g.body.specHash, e.specHash);
    assert.deepEqual(g.body.entry, e, 'Eintrag unveraendert aus dem Paket, Nachweisart erhalten');
    assert.equal(g.body.entry.productionApproved, false);
    assert.equal(g.body.productionApproved, false);
    assert.ok(g.body.limits.length >= 3);
    const p = await call(a, 'POST', '/v1/admin/backtests/lookup', {sub: REVIEWER, body: {selection: s.selection}});
    assert.deepEqual(p.body, g.body);
  }
  const classes = new Set(BUNDLE.entries.map(e => e.evidence.class));
  for (const c of ['HISTORICAL_STUDY', 'HISTORICAL_SIMULATION', 'RECONSTRUCTION', 'NOT_COMPUTED']) assert.ok(classes.has(c), c);
});

test('Nachschlagen: nicht vorgerechnet heisst NOT_PRECOMPUTED (nie gerechnet), ungueltig heisst 400 mit sicherem Code', async () => {
  const a = app();
  const n = await call(a, 'GET', q(SEL('signal-2022-bear', {costPreset: 'NONE'})), {sub: REVIEWER});
  assert.equal(n.status, 200); assert.equal(n.body.state, 'NOT_PRECOMPUTED'); assert.equal(n.body.display, 'nicht vorgerechnet');
  assert.equal(n.body.entry, undefined); assert.equal(n.body.productionApproved, false); assert.match(n.body.specHash, /^[a-f0-9]{64}$/);
  const bad = [
    [SEL('nope'), 'UNKNOWN_TEMPLATE'], [{template: 'signal-2022-bear'}, 'SELECTION_SCHEMA_UNKNOWN'],
    [SEL('signal-2022-bear', {status: {requestProductCertifiedState: true}}), 'SELECTION_UNKNOWN_KEY'],
    [SEL('signal-2022-bear', {window: {from: '2022-01-01', to: '2030-01-01'}}), 'WINDOW_INVALID'],
    [SEL('signal-2022-bear', {costPreset: 'ZERO'}), 'COST_PRESET_UNKNOWN'], [SEL('signal-2022-bear', {benchmark: 'QQQ'}), 'BENCHMARK_UNKNOWN'],
    [SEL('strategy-2019-bull', {ruleIds: ['TREND_DOWN']}), 'RULES_ONLY_FOR_SIGNAL'], [SEL('signal-2022-bear', {ruleIds: ['EVIL']}), 'RULE_NOT_ALLOWED'],
    [SEL('signal-2022-bear', {factorId: 'value'}), 'FACTOR_ONLY_FOR_FACTOR_KIND'], [SEL('factor-momentum-v10-panel', {factorId: 'x'}), 'FACTOR_NOT_ALLOWED'],
    [SEL('signal-2022-bear', {methods: 'ALL'}), 'METHODS_OPTION_UNKNOWN']];
  for (const [sel, code] of bad) {
    const r = await call(a, 'GET', q(sel), {sub: REVIEWER});
    assert.equal(r.status, 400, code); assert.deepEqual(r.body, {state: 'SELECTION_REJECTED', detail: code});
  }
  for (const raw of ['{', 'x'.repeat(3000)]) {
    const r = await call(a, 'GET', '/v1/admin/backtests/lookup?selection=' + encodeURIComponent(raw), {sub: REVIEWER});
    assert.equal(r.status, 400); assert.deepEqual(r.body, {state: 'SELECTION_REJECTED', detail: 'SELECTION_SCHEMA_UNKNOWN'});
  }
  const noSel = await call(a, 'GET', '/v1/admin/backtests/lookup', {sub: REVIEWER});
  assert.equal(noSel.status, 400);
});

test('CSRF: POST mit Cookie-Sitzung nur mit erlaubter Herkunft und Client-Kopf; GET braucht keinen Kopf', async () => {
  const a = app();
  const body = {selection: GRID.selections[0].selection};
  const noOrigin = await call(a, 'POST', '/v1/admin/backtests/lookup', {cookieSub: REVIEWER, body});
  assert.equal(noOrigin.status, 403); assert.deepEqual(noOrigin.body, {state: 'ORIGIN_NOT_ALLOWED'});
  const evil = await call(a, 'POST', '/v1/admin/backtests/lookup', {cookieSub: REVIEWER, body, headers: {Origin: 'https://evil.example', 'X-VU-Client': 'web'}});
  assert.equal(evil.status, 403); assert.deepEqual(evil.body, {state: 'ORIGIN_NOT_ALLOWED'});
  const noHeader = await call(a, 'POST', '/v1/admin/backtests/lookup', {cookieSub: REVIEWER, body, headers: {Origin: SITE}});
  assert.equal(noHeader.status, 403); assert.deepEqual(noHeader.body, {state: 'CLIENT_HEADER_REQUIRED'});
  const ok = await call(a, 'POST', '/v1/admin/backtests/lookup', {cookieSub: REVIEWER, body, headers: {Origin: SITE, 'X-VU-Client': 'web'}});
  assert.equal(ok.status, 200); assert.equal(ok.body.state, 'PRECOMPUTED');
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), SITE);
  const get = await call(a, 'GET', '/v1/admin/backtests', {cookieSub: REVIEWER});
  assert.equal(get.status, 200);
  const wrong = await call(a, 'PUT', '/v1/admin/backtests', {sub: REVIEWER});
  assert.equal(wrong.status, 405);
});

test('Paketintegritaet: Manipulation, Freigabe-Flags oder Zertifizierung ohne Artefakt -> 503 ohne Daten', async () => {
  assert.deepEqual(await bundleViolations(BUNDLE), []);
  const rehash = b => { const {bundleHash, ...body} = b; return {...body, bundleHash: Runner.hash(body)}; };
  const cases = [];
  const t1 = structuredClone(BUNDLE); t1.entries[0].display.metrics.hitRate = 0.99; cases.push([t1, 'BUNDLE_HASH_MISMATCH']);
  const t2 = structuredClone(BUNDLE); t2.productionApproved = true; cases.push([rehash(t2), 'BUNDLE_FLAGS_INVALID']);
  const t3 = structuredClone(BUNDLE); t3.entries[0].evidence = {...t3.entries[0].evidence, class: 'CERTIFIED_STRATEGY', certified: true};
  cases.push([rehash(t3), 'PRODUCT_CERTIFICATION_NOT_PROVEN']);
  const t4 = structuredClone(BUNDLE); t4.entries[1].state = 'PRODUCT_CERTIFIED'; cases.push([rehash(t4), 'PRODUCT_CERTIFICATION_NOT_PROVEN']);
  const t5 = structuredClone(BUNDLE); t5.certification = 'CERTIFIED'; cases.push([rehash(t5), 'BUNDLE_CLAIMS_CERTIFICATION']);
  const t6 = structuredClone(BUNDLE); t6.entries[2].productionApproved = true; cases.push([rehash(t6), 'ENTRY_PRODUCTION_APPROVED']);
  for (const [b, code] of cases) {
    assert.ok((await bundleViolations(b)).includes(code), code);
    const a = app(ON, b);
    const r = await call(a, 'GET', '/v1/admin/backtests', {sub: REVIEWER});
    assert.equal(r.status, 503, code); assert.deepEqual(r.body, {state: 'BACKTEST_BUNDLE_INVALID'});
    const l = await call(a, 'GET', q(GRID.selections[0].selection), {sub: REVIEWER});
    assert.deepEqual(l.body, {state: 'BACKTEST_BUNDLE_INVALID'});
  }
  // Ohne Rolle erfaehrt niemand etwas ueber den Paketzustand.
  const r = await call(app(ON, t1), 'GET', '/v1/admin/backtests', {sub: PLAIN});
  assert.equal(r.status, 403);
});

test('gleiche Regeln wie backtest-spec-builder: specHash und Codes identisch, Nachschlagen wie build-backtest-catalog#lookup', async () => {
  const templates = Builder.loadTemplates();
  const catalogDir = path.join(ROOT, 'docs/quant/backtest-catalog');
  const variants = [...GRID.selections.map(s => s.selection)];
  for (const t of templates.keys()) {
    variants.push(SEL(t), SEL(t, {costPreset: 'NONE'}), SEL(t, {costPreset: 'STANDARD', benchmark: 'NONE'}), SEL(t, {methods: 'NONE'}), SEL(t, {methods: 'TEMPLATE'}),
      SEL(t, {benchmark: 'SPY', costPreset: 'HIGH'}), SEL(t, {window: {from: '2010-01-01', to: '2010-12-31'}}), SEL(t, {window: {from: '1980-01-01', to: '2010-12-31'}}),
      SEL(t, {ruleIds: ['TREND_DOWN']}), SEL(t, {ruleIds: []}), SEL(t, {factorId: 'value'}), SEL(t, {factorId: 'momentum', methods: 'NONE'}), SEL(t, {extra: 1}));
  }
  variants.push(null, 'x', [], {}, SEL('signal-2022-bear', {ruleIds: ['TREND_DOWN', 'TREND_DOWN']}), SEL('signal-2022-bear', {window: {from: '2022-06-01', to: '2022-01-01'}}),
    SEL('signal-2022-bear', {window: {from: '2022-01-01'}}), SEL('signal-2022-bear', {window: null}), SEL('signal-2022-bear', {costPreset: 'toString'}));
  for (const sel of variants) {
    const mine = await specFromSelection(BUNDLE, sel);
    const ref = Builder.buildSpec(sel, templates);
    assert.equal(mine.ok, ref.ok, JSON.stringify(sel));
    if (ref.ok) { assert.equal(mine.specHash, ref.specHash, JSON.stringify(sel)); assert.deepEqual(mine.spec, ref.spec); }
    else assert.equal(mine.code, ref.code, JSON.stringify(sel));
    const l = await lookupSelection(BUNDLE, sel), r = Catalog.lookup(catalogDir, sel, templates);
    assert.equal(l.state, r.state, JSON.stringify(sel));
    if (r.state === 'PRECOMPUTED') { assert.equal(l.entry.specHash, r.entry.specHash); assert.equal(l.entry.hashes.result, r.result.resultHash); }
    if (r.state === 'NOT_PRECOMPUTED') assert.equal(l.specHash, r.specHash);
    if (r.state === 'REJECTED') assert.equal(l.code, r.code);
  }
});

test('Paket: reproduzierbar aus den committeten Artefakten, hashgebunden, ohne Rohreihen/QA, nur Forschungsaussagen', () => {
  assert.deepEqual(Export.main(['--check']).ok, true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vu-bt-bundle-'));
  try {
    const out = path.join(dir, 'b.json');
    const r = Export.main(['--out', out]);
    assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(BUNDLE_FILE, 'utf8'), 'Neubau byte-gleich');
    assert.equal(r.bundleHash, BUNDLE.bundleHash);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  const {bundleHash, ...body} = BUNDLE;
  assert.equal(Runner.hash(body), bundleHash);
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant/backtest-catalog/catalog.json'), 'utf8'));
  assert.equal(BUNDLE.catalogHash, cat.catalogHash); assert.equal(BUNDLE.gridHash, cat.gridHash);
  assert.equal(BUNDLE.certification, 'NOT_CERTIFIED'); assert.equal(BUNDLE.productionApproved, false);
  assert.equal(BUNDLE.claim, 'NO_ALPHA_OR_CERTIFICATION_CLAIM'); assert.equal(BUNDLE.masterGeneration, 'us-security-master-1.1.0');
  assert.equal(BUNDLE.entries.length, cat.entries.length);
  const text = JSON.stringify(BUNDLE);
  for (const k of ['"equity"', '"dates"', '"portfolio"', '"qa"', '"inputHashes"', '"listingId"', '"splitsInWindow"', '"identity"']) assert.equal(text.includes(k), false, k);
  // Isolation (keine Verweise auf den Vorschau-Dienst) und Aussage-Regeln: quant/tests/backtest-review-bundle.test.mjs.
  assert.ok(Buffer.byteLength(text) < 400_000, 'Paket bleibt klein (Worker-Bundle)');
  for (const bad of ['quant/data/x.json', 'discover/data/x.json']) assert.throws(() => Export.parse(['--out', path.join(ROOT, bad)]), /OUT_INSIDE_GENERATED_DATA/);
});

test('Paket wird nicht von GitHub Pages ausgeliefert, nur vom Worker (geschuetzt)', async () => {
  const {permitted} = await import('../../../scripts/vu2/build-release.mjs');
  assert.equal(permitted('workers/vu-account/data/backtest-review-bundle.json'), false);
  assert.equal(permitted('docs/quant/backtest-catalog/catalog.json'), false);
  assert.equal(permitted('konto/konto.js'), true, 'Kontoseiten bleiben ausgeliefert');
});
