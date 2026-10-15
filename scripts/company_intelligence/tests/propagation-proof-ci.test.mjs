/* Erweiterter Propagationsbeweis (PR B): Quant-Kennung und Company-Intelligence-Objekte, Gate OFFEN (ON) und ZU (OFF).
   Fake-HTTP-Server + Fake-Uhr, nichts wartet wirklich, kein Netz ausser 127.0.0.1. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {verifyPropagation, probeOnce, parseRollout, referenceDataSha256, CAUSE, DEFAULTS, CI_INDEX_SCHEMA} from '../propagation-proof.mjs';

import {build, sha256, sha16, J, COMMIT, D} from './fixtures/ci-site.mjs';

async function server(site) {
 const st = {site, requests: [], override: new Map()};
 const srv = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  st.requests.push(path);
  const ov = st.override.get(path), body = ov !== undefined ? ov : st.site.map.get(path);
  if (typeof body === 'number') { res.writeHead(body); return res.end('err'); }
  if (!body) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, {'x-cache': 'HIT', age: '221', 'x-served-by': 'cache-test', 'set-cookie': 'secret=1'});
  res.end(body);
 });
 await new Promise(r => srv.listen(0, '127.0.0.1', r));
 st.origin = 'http://127.0.0.1:' + srv.address().port;
 st.close = () => new Promise(r => { srv.close(r); srv.closeAllConnections(); });
 return st;
}
function clock(onSleep) {
 const c = {t: 1e9, sleeps: []};
 c.now = () => c.t;
 c.sleep = async ms => { c.sleeps.push(ms); c.t += ms; onSleep?.(c.sleeps.length, ms); };
 return c;
}
const run = (s, site, extra = {}) => verifyPropagation({origin: s.origin, expectedSha: site.commit, expectedDataSha256: site.dataSha256, ...clock(), maxMs: 1, ...extra});
const failedOf = r => Object.fromEntries(r.attempts.at(-1).failed.map(f => [f.name, f]));
const HTML = Buffer.from('<!doctype html><title>fallback</title><p>Seite nicht gefunden</p>');
const IDX = '/company-intelligence/data/index.json', ROLL = '/company-intelligence/config/rollout.js', DEL = '/company-intelligence-delivery.json', REF = '/company-intelligence-refresh.json';

// ---------------- ON ----------------
test('ON: alles zusammen propagiert; Soll-Generation stammt aus delivery.json, nichts ist hartkodiert', async () => {
 for (const salt of ['', 'andere-generation']) {
  const site = build({salt}), s = await server(site), c = clock();
  try {
   const r = await verifyPropagation({origin: s.origin, expectedSha: site.commit, expectedDataSha256: site.dataSha256, ci: 'ON', now: c.now, sleep: c.sleep});
   assert.equal(r.status, 'PROPAGATED'); assert.equal(r.attemptCount, 1); assert.deepEqual(c.sleeps, []);
   assert.equal(r.observed.ciGeneration, site.gen); assert.equal(r.observed.rolloutExpected, site.gen); assert.equal(r.observed.rolloutStage, 1);
   assert.equal(r.observed.ciIndexState, 'PREVIEW'); assert.equal(r.observed.ciSnapshotsChecked, 2);
   assert.equal(r.observed.quantId, site.qId); assert.equal(r.observed.quantMeta, site.qId); assert.equal(r.observed.quantAssetsChecked, 2);
   assert.ok(r.fingerprint.includes(site.gen) && r.fingerprint.includes(site.qId), 'Kennungen im Fingerabdruck (Zwischenstand erkennbar)');
   for (const p of [IDX, ROLL, DEL, REF, '/' + 'company-intelligence/data/' + site.lookupPath, '/company-intelligence/data/' + site.issuerPath, '/quant/']) assert.ok(s.requests.includes(p), p + ' abgerufen');
  } finally { await s.close(); }
 }
});

test('ohne Option ci: keine CI-Abrufe (rueckwaertskompatibel); falscher Modus wird abgelehnt', async () => {
 const site = build(), s = await server(site);
 try {
  const r = await run(s, site);
  assert.equal(r.status, 'PROPAGATED'); assert.equal(s.requests.some(p => p.includes('company-intelligence')), false);
  await assert.rejects(verifyPropagation({origin: s.origin, ci: 'AN', ...clock()}), /PROPAGATION_CI_MODE_INVALID/);
 } finally { await s.close(); }
});

const OTHER = build({salt: 'alt'});     // anderer Stand derselben Objekte (alte Generation / alte Kennung)
const MIX = [
 ['index.json mit alter Generation', IDX, OTHER.index, 'ci-index|ci-consistency', 'MIXED'],
 ['rollout.js mit alter expectedGeneration', ROLL, OTHER.rolloutText(1, false, OTHER.gen), 'ci-consistency', 'MIXED'],
 ['delivery.json mit alter Generation', DEL, readOf(OTHER, DEL), 'ci-consistency', 'MIXED'],
 ['refresh.json mit alter Generation', REF, readOf(OTHER, REF), 'ci-consistency', 'MIXED'],
 ['Lookup-Objekt alter Generation (Bytes != Manifest)', '/company-intelligence/data/' + build().lookupPath, J({shard: 'AA', gen: 'alt'}), 'ci-snapshots', 'MIXED'],
 ['Issuer-Objekt alter Generation (Bytes != Manifest)', '/company-intelligence/data/' + build().issuerPath, J({companyId: 'iss_cik_0000000001', gen: 'alt'}), 'ci-snapshots', 'MIXED']
];
function readOf(site, p) { return site.map.get(p); }

for (const [name, path, body, checks, cause] of MIX) {
 test('ON gemischter Stand: ' + name + ' -> nicht propagiert', async () => {
  const site = build(), s = await server(site);
  try {
   s.override.set(path, body);
   const r = await run(s, site, {ci: 'ON'});
   assert.equal(r.status, 'NOT_PROPAGATED'); assert.equal(r.cause, CAUSE);
   const f = failedOf(r), hit = checks.split('|').filter(n => f[n]);
   assert.ok(hit.length >= 1, 'erwartet ' + checks + ', war ' + Object.keys(f));
   assert.ok(hit.some(n => f[n].cause === cause), JSON.stringify(hit.map(n => f[n].cause)));
   assert.match(r.message, /nicht propagiert/);
  } finally { await s.close(); }
 });
}

test('ON gemischter Stand: einzelne Querpruefungen werden einzeln benannt', async () => {
 const site = build(), s = await server(site);
 try {
  const detail = async (path, body) => { s.override.clear(); s.override.set(path, body); return failedOf(await run(s, site, {ci: 'ON'}))['ci-consistency']?.detail; };
  const mod = (p, fn) => { const o = JSON.parse(site.map.get(p)); fn(o); return J(o); };
  assert.match(await detail(REF, mod(REF, o => { o.manifest.generation = OTHER.gen; })), /refresh\.manifest\.generation/);
  assert.match(await detail(REF, mod(REF, o => { o.manifest.generatedAt = '2026-01-01T00:00:00Z'; })), /generatedAt/);
  assert.match(await detail(REF, mod(REF, o => { o.manifest.assets['index.json'].sha256 = 'a'.repeat(64); })), /index\.json Bytes\/sha256 != Manifest/);
  assert.match(await detail(REF, mod(REF, o => { o.manifest.assets['index.json'].bytes += 1; })), /index\.json Bytes\/sha256 != Manifest/);
  assert.match(await detail(REF, mod(REF, o => { delete o.manifest.assets['index.json']; })), /index\.json fehlt im Manifest/);
  assert.match(await detail(REF, mod(REF, o => { o.issuers = 7; })), /refresh\.issuers 7 != delivery 1/);
  assert.match(await detail(REF, mod(REF, o => { o.cohortStocks = 9; })), /refresh\.cohortStocks 9 != delivery 2/);
  assert.match(await detail(REF, mod(REF, o => { o.manifest.assets['snapshots/' + OTHER.gen + '/x.json'] = {bytes: 1, sha256: 'b'.repeat(64)}; })), /anderer Generation/);
  assert.match(await detail(DEL, mod(DEL, o => { o.cohortStocks = 5; })), /rollout\.cohort 2 != delivery\.cohortStocks 5|refresh\.cohortStocks/);
  assert.match(await detail(ROLL, site.rolloutText(1, false, OTHER.gen)), /rollout\.expectedGeneration/);
 } finally { await s.close(); }
});

const ON_OBJECTS = [['index', IDX, 'ci-index'], ['rollout', ROLL, 'ci-rollout'], ['delivery', DEL, 'ci-delivery'], ['refresh', REF, 'ci-refresh'],
 ['lookup', '/company-intelligence/data/' + build().lookupPath, 'ci-snapshots'], ['issuer', '/company-intelligence/data/' + build().issuerPath, 'ci-snapshots']];
for (const [name, path, check] of ON_OBJECTS) {
 test('ON ' + name + ': 404 -> MISSING, HTML-Fallback (200) -> INVALID/MIXED, 500 -> HTTP_500', async () => {
  const site = build(), s = await server(site);
  try {
   s.override.set(path, 404);
   let f = failedOf(await run(s, site, {ci: 'ON'}));
   assert.equal(f[check].cause, 'MISSING', name);
   s.override.set(path, HTML);
   const r = await run(s, site, {ci: 'ON'});
   assert.equal(r.status, 'NOT_PROPAGATED'); f = failedOf(r);
   assert.ok(['INVALID', 'MIXED'].includes(f[check].cause), name + ' ' + JSON.stringify(f[check]));
   s.override.set(path, 500);
   assert.equal(failedOf(await run(s, site, {ci: 'ON'}))[check].cause, 'HTTP_500');
  } finally { await s.close(); }
 });
}

test('ON: Gate-zu-Stand bei offenem Gate (Index DISABLED, rollout stage 0) ist veraltet, nicht "propagiert"', async () => {
 const site = build(), off = build({mode: 'OFF'}), s = await server(site);
 try {
  s.override.set(IDX, off.index);
  assert.equal(failedOf(await run(s, site, {ci: 'ON'}))['ci-index'].cause, 'STALE');
  s.override.clear(); s.override.set(ROLL, off.map.get(ROLL));
  assert.equal(failedOf(await run(s, site, {ci: 'ON'}))['ci-rollout'].cause, 'STALE');
 } finally { await s.close(); }
});

test('ON: Snapshot-Auswahl ist defensiv (ohne lookupShards / ohne Issuer nur das Vorhandene), kein Dauer-Fehlalarm', async () => {
 const site = build(), s = await server(site);
 try {
  // Index ohne lookupShards: Manifest-Hash von index.json muss dann passen -> Manifest und Index gemeinsam anpassen
  const idx = J({...JSON.parse(site.index), lookupShards: undefined}), ref = JSON.parse(site.map.get(REF));
  ref.manifest.assets['index.json'] = {bytes: idx.length, sha256: sha256(idx)};
  s.override.set(IDX, idx); s.override.set(REF, J(ref));
  const r = await run(s, site, {ci: 'ON'});
  assert.equal(r.status, 'PROPAGATED'); assert.equal(r.observed.ciSnapshotsChecked, 1);
 } finally { await s.close(); }
});

test('ON Struktur: gueltiges JSON mit falschem Inhalt wird je Objekt als INVALID benannt (kein Absturz)', async () => {
 const site = build(), s = await server(site);
 try {
  const cause = async (path, body, check) => { s.override.clear(); s.override.set(path, body); const r = await run(s, site, {ci: 'ON'}); assert.equal(r.status, 'NOT_PROPAGATED'); return failedOf(r)[check]?.cause; };
  const mod = (p, fn) => { const o = JSON.parse(site.map.get(p)); fn(o); return J(o); };
  assert.equal(await cause(IDX, J({...JSON.parse(site.index), schema: 'anderes-schema'}), 'ci-index'), 'INVALID');
  assert.equal(await cause(IDX, J({...JSON.parse(site.index), state: 'KAPUTT'}), 'ci-index'), 'INVALID');
  assert.equal(await cause(DEL, mod(DEL, o => { o.status = 'FAIL'; }), 'ci-delivery'), 'INVALID');
  assert.equal(await cause(DEL, mod(DEL, o => { o.generation = 'zu-kurz'; }), 'ci-delivery'), 'INVALID');
  assert.equal(await cause(DEL, mod(DEL, o => { o.issuers = 0; }), 'ci-delivery'), 'INVALID');
  assert.equal(await cause(REF, J({status: 'PASS', generation: site.gen}), 'ci-refresh'), 'INVALID');
  assert.equal(await cause(REF, mod(REF, o => { o.status = 'FAIL'; }), 'ci-refresh'), 'INVALID');
  assert.equal(await cause(ROLL, '(function(){ /* leer */ })()', 'ci-rollout'), 'INVALID');
  assert.equal(await cause(ROLL, site.rolloutText(1, false, 'nicht-hex').replace('"nicht-hex"', 'undefined'), 'ci-rollout'), 'INVALID');
  // Manifest ohne den ausgewaehlten Eintrag
  assert.equal(await cause(REF, mod(REF, o => { delete o.manifest.assets[site.lookupPath]; }), 'ci-snapshots'), 'INVALID');
 } finally { await s.close(); }
});

test('ON einzelne Generationsfelder: jede Abweichung allein wird erkannt (nicht durch andere Pruefungen verdeckt)', async () => {
 const site = build(), s = await server(site);
 try {
  const detail = async (over) => { s.override.clear(); for (const [p, b] of over) s.override.set(p, b); return failedOf(await run(s, site, {ci: 'ON'}))['ci-consistency']?.detail; };
  const mod = (p, fn) => { const o = JSON.parse(site.map.get(p)); fn(o); return J(o); };
  // Index mit anderer Generation, Manifest-Hash und Manifest-Generation dazu passend: nur der Vergleich mit delivery trennt
  const idx = J({...JSON.parse(site.index), generation: OTHER.gen});
  assert.match(await detail([[IDX, idx], [REF, mod(REF, o => { o.manifest.assets['index.json'] = {bytes: idx.length, sha256: sha256(idx)}; })]]), /index\.generation/);
  assert.match(await detail([[REF, mod(REF, o => { o.generation = OTHER.gen; })]]), /refresh\.generation/);
  // Kohorte: rollout und delivery zeigen 2 -> delivery und refresh gemeinsam auf 5: nur der rollout-Vergleich trennt
  assert.match(await detail([[DEL, mod(DEL, o => { o.cohortStocks = 5; })], [REF, mod(REF, o => { o.cohortStocks = 5; })]]), /rollout\.cohort 2 != delivery\.cohortStocks 5/);
  // Eligibility-Rollout (Objekt statt null): kein Kohortenvergleich -> kein Dauer-Fehlalarm
  const elig = site.rolloutText(1, false, site.gen).replace('eligibility:null', 'eligibility:{AAPL:{}}');
  s.override.clear(); s.override.set(ROLL, elig); s.override.set(DEL, mod(DEL, o => { o.cohortStocks = 5; })); s.override.set(REF, mod(REF, o => { o.cohortStocks = 5; }));
  assert.equal((await run(s, site, {ci: 'ON'})).status, 'PROPAGATED');
 } finally { await s.close(); }
});

test('ON Snapshot: Groesse und Hash werden einzeln gegen das Manifest geprueft', async () => {
 const site = build(), s = await server(site);
 try {
  const lp = '/company-intelligence/data/' + site.lookupPath, mod = fn => { const o = JSON.parse(site.map.get(REF)); fn(o); return J(o); };
  // gleiche Laenge, anderer Inhalt: nur der Hash trennt
  const same = Buffer.from(site.lookup.toString().replace('AA', 'AB'));
  assert.equal(same.length, site.lookup.length);
  s.override.set(lp, same);
  let f = failedOf(await run(s, site, {ci: 'ON'}))['ci-snapshots']; assert.equal(f.cause, 'MIXED'); assert.match(f.detail, /lookup\/AA\.json/);
  // richtiger Hash, falsche Groesse im Manifest: nur der Groessenvergleich trennt
  s.override.clear(); s.override.set(REF, mod(o => { o.manifest.assets[site.lookupPath].bytes += 1; }));
  f = failedOf(await run(s, site, {ci: 'ON'}))['ci-snapshots']; assert.equal(f.cause, 'MIXED');
 } finally { await s.close(); }
});

// ---------------- Bootstrap-Pfad (refresh.json optional) ----------------
test('Bootstrap-Pfad (delivery.acceptedGeneration, kein consumerCache): refresh.json darf 404 sein, Rest bleibt Pflicht', async () => {
 const site = build({legacy: true}), s = await server(site);
 try {
  assert.equal(site.map.has(REF), false, 'Fixture: Bootstrap schreibt keine refresh.json');
  const r = await run(s, site, {ci: 'ON'});
  assert.equal(r.status, 'PROPAGATED', JSON.stringify(r.attempts.at(-1).failed));
  assert.equal(r.observed.ciBootstrap, true); assert.equal(r.observed.ciSnapshotsChecked, undefined);
  assert.ok(r.fingerprint.includes('bootstrap'));
  // Index/Rollout/Delivery bleiben Pflicht und werden gegeneinander geprueft
  const other = build({legacy: true, salt: 'alt'});
  for (const [path, body, check] of [[IDX, other.index, 'ci-consistency'], [ROLL, site.rolloutText(1, false, other.gen), 'ci-consistency'], [ROLL, site.rolloutText(0, true, site.gen), 'ci-rollout'], [DEL, 404, 'ci-delivery'], [IDX, 404, 'ci-index'], [ROLL, 404, 'ci-rollout']]) {
   s.override.clear(); s.override.set(path, body);
   const f = failedOf(await run(s, site, {ci: 'ON'}));
   assert.ok(f[check], path + ' -> ' + check + ' erwartet, war ' + Object.keys(f));
  }
 } finally { await s.close(); }
});

test('refresh.json fehlt ohne Bootstrap-Beleg: Fehler (fail-closed)', async () => {
 const good = build(), boot = build({legacy: true}), s = await server(good);
 try {
  // GOOD-Pfad (consumerCache, keine acceptedGeneration) + refresh 404
  s.override.set(REF, 404); assert.equal(failedOf(await run(s, good, {ci: 'ON'}))['ci-refresh'].cause, 'MISSING');
  // acceptedGeneration leer / zusammen mit consumerCache = kein Bootstrap-Beleg
  const del = JSON.parse(boot.map.get(DEL));
  for (const o of [{...del, acceptedGeneration: ''}, {...del, consumerCache: {cachedAssets: 0}}, {...del, acceptedGeneration: 7}]) {
   s.override.set(DEL, J(o)); assert.equal(failedOf(await run(s, good, {ci: 'ON'}))['ci-refresh'].cause, 'MISSING', JSON.stringify(o));
  }
  // delivery.json selbst fehlt: kein Beleg
  s.override.set(DEL, 404); assert.ok(failedOf(await run(s, good, {ci: 'ON'}))['ci-refresh']);
 } finally { await s.close(); }
});

test('Bootstrap: nur 404 ist erlaubt - HTML-Fallback (200) und 500 an refresh.json bleiben Fehler', async () => {
 const site = build({legacy: true}), s = await server(site);
 try {
  s.override.set(REF, HTML); assert.equal(failedOf(await run(s, site, {ci: 'ON'}))['ci-refresh'].cause, 'INVALID');
  s.override.set(REF, 500); assert.equal(failedOf(await run(s, site, {ci: 'ON'}))['ci-refresh'].cause, 'HTTP_500');
 } finally { await s.close(); }
});

test('Quant mit 0 gestempelten Assets ist INVALID (bewusst streng)', async () => {
 const site = build(), s = await server(site), P = '/__research/content/quant/index.html';
 try {
  const bare = Buffer.from('<!doctype html><meta name="vu-release" data-product="quant" content="' + site.qId + '"><p>ohne Stempel</p>');
  s.override.set(P, bare); s.override.set('/quant/', Buffer.from('<script data-content="' + P + '?v=' + sha16(bare) + '"></script>'));
  const f = failedOf(await run(s, site));
  assert.equal(f['quant-assets'].cause, 'INVALID'); assert.match(f['quant-assets'].detail, /ohne gestempelte Assets/);
 } finally { await s.close(); }
});

test('Gate offen -> zu: jeder Fehlversuch (200 statt 404) wird wiederholt; erst der letzte zaehlt, und der bleibt ein Fehler', async () => {
 const on = build(), site = build({mode: 'OFF'}), s = await server(site), c = clock();
 try {
  s.override.set(DEL, on.map.get(DEL)); s.override.set(REF, on.map.get(REF));
  const r = await verifyPropagation({origin: s.origin, ci: 'OFF', now: c.now, sleep: c.sleep, maxMs: DEFAULTS.maxMs});
  assert.equal(r.status, 'NOT_PROPAGATED'); assert.equal(r.cause, CAUSE); assert.ok(r.attemptCount >= 8, 'mehrere Versuche vor dem Urteil');
  // Edge-Cache laeuft nach max-age=600 aus: spaeter 404 -> propagiert
  const c2 = clock(n => { if (n === 6) { s.override.delete(DEL); s.override.delete(REF); } });
  const ok = await verifyPropagation({origin: s.origin, ci: 'OFF', now: c2.now, sleep: c2.sleep, maxMs: DEFAULTS.maxMs});
  assert.equal(ok.status, 'PROPAGATED'); assert.equal(ok.intermediateSeen, true);
 } finally { await s.close(); }
});

// ---------------- OFF ----------------
test('OFF: Platzhalter-Index, stage 0 productionOff, delivery/refresh 404 -> propagiert', async () => {
 const site = build({mode: 'OFF'}), s = await server(site);
 try {
  const r = await run(s, site, {ci: 'OFF', expectedIndexSha256: sha256(site.index)});
  assert.equal(r.status, 'PROPAGATED', JSON.stringify(r.attempts.at(-1).failed));
  assert.equal(r.observed.ciIndexState, 'DISABLED'); assert.equal(r.observed.rolloutStage, 0);
  const noRef = await run(s, site, {ci: 'OFF'});   // Referenzobjekt des Checkouts fehlt: kein Fehlalarm, DISABLED genuegt
  assert.equal(noRef.status, 'PROPAGATED');
  assert.equal(s.requests.some(p => p.includes('/company-intelligence/data/snapshots/')), false, 'im OFF-Modus keine Snapshot-Abrufe');
 } finally { await s.close(); }
});

test('OFF: Hash == Platzhalter genuegt auch ohne state-Feld', async () => {
 const site = build({mode: 'OFF'}), s = await server(site), odd = Buffer.from('{"platzhalter":true}');
 try {
  s.override.set(IDX, odd);
  assert.equal((await run(s, site, {ci: 'OFF', expectedIndexSha256: sha256(odd)})).status, 'PROPAGATED');
  assert.equal(failedOf(await run(s, site, {ci: 'OFF', expectedIndexSha256: sha256(site.index)}))['ci-index'].cause, 'MIXED');
 } finally { await s.close(); }
});

test('OFF gemischter Stand: ein Objekt des offenen Gates ist noch da -> nicht propagiert', async () => {
 const on = build(), site = build({mode: 'OFF'}), s = await server(site);
 try {
  s.override.set(IDX, on.index);
  let f = failedOf(await run(s, site, {ci: 'OFF'})); assert.equal(f['ci-index'].cause, 'MIXED'); assert.match(f['ci-index'].detail, /PREVIEW/);
  s.override.clear(); s.override.set(ROLL, on.map.get(ROLL));
  f = failedOf(await run(s, site, {ci: 'OFF'})); assert.equal(f['ci-rollout'].cause, 'MIXED'); assert.match(f['ci-rollout'].detail, /stage 1/);
  s.override.clear(); s.override.set(ROLL, site.rolloutText(0, false, 'f'.repeat(24)));
  f = failedOf(await run(s, site, {ci: 'OFF'})); assert.equal(f['ci-rollout'].cause, 'MIXED'); assert.match(f['ci-rollout'].detail, /ohne productionOff/);
  s.override.clear(); s.override.set(DEL, on.map.get(DEL));
  f = failedOf(await run(s, site, {ci: 'OFF'})); assert.equal(f['ci-delivery'].cause, 'MIXED'); assert.match(f['ci-delivery'].detail, /200 statt 404/);
  s.override.clear(); s.override.set(REF, on.map.get(REF));
  f = failedOf(await run(s, site, {ci: 'OFF'})); assert.equal(f['ci-refresh'].cause, 'MIXED');
  const r = await run(s, site, {ci: 'OFF'}); assert.equal(r.status, 'NOT_PROPAGATED'); assert.equal(r.cause, CAUSE);
 } finally { await s.close(); }
});

test('OFF je Objekt: 404/HTML-Fallback/500 am Index und rollout; HTML statt 404 bei delivery/refresh; 500 ist nicht "404"', async () => {
 const site = build({mode: 'OFF'}), s = await server(site);
 try {
  for (const [path, check] of [[IDX, 'ci-index'], [ROLL, 'ci-rollout']]) {
   s.override.clear(); s.override.set(path, 404);
   assert.equal(failedOf(await run(s, site, {ci: 'OFF'}))[check].cause, 'MISSING', check);
   s.override.set(path, HTML);
   assert.equal(failedOf(await run(s, site, {ci: 'OFF'}))[check].cause, 'INVALID', check);
   s.override.set(path, 500);
   assert.equal(failedOf(await run(s, site, {ci: 'OFF'}))[check].cause, 'HTTP_500', check);
  }
  for (const [path, check] of [[DEL, 'ci-delivery'], [REF, 'ci-refresh']]) {
   s.override.clear(); s.override.set(path, HTML);
   assert.equal(failedOf(await run(s, site, {ci: 'OFF'}))[check].cause, 'MIXED', check + ' HTML-Fallback ist kein 404');
   s.override.set(path, 500);
   assert.equal(failedOf(await run(s, site, {ci: 'OFF'}))[check].cause, 'HTTP_500', check);
  }
 } finally { await s.close(); }
});

test('OFF-Bericht: Fehler im Index entstehen als Beweisfehler mit Kennungen (kein ungeschuetzter assert)', async () => {
 const on = build(), site = build({mode: 'OFF'}), s = await server(site), c = clock();
 try {
  s.override.set(IDX, on.index);
  const r = await verifyPropagation({origin: s.origin, expectedSha: site.commit, ci: 'OFF', now: c.now, sleep: c.sleep});
  assert.equal(r.status, 'NOT_PROPAGATED'); assert.equal(r.cause, CAUSE);
  assert.match(r.message, /ci-index MIXED/); assert.equal(r.observed.ciIndexState, 'PREVIEW');
  assert.equal(r.attempts.at(-1).failed.find(f => f.name === 'ci-index').headers['x-cache'], 'HIT');
  assert.equal(JSON.stringify(r).includes('secret=1'), false);
 } finally { await s.close(); }
});

// ---------------- Quant ----------------
test('Quant: Kennung falsch (Meta != release-id products.quant) -> MIXED', async () => {
 const site = build(), s = await server(site);
 try {
  s.override.set('/release-id.json', J({...JSON.parse(site.map.get('/release-id.json')), products: {quant: 'c'.repeat(16), discover: site.dId}}));
  const f = failedOf(await run(s, site));
  assert.equal(f['quant-content'].cause, 'MIXED'); assert.match(f['quant-content'].detail, /products\.quant c{16}/);
 } finally { await s.close(); }
});

test('Quant: Shell 404 / HTML-Fallback, Inhalt 404, Inhalt alt (Hash != ?v der Shell), Meta fehlt, Asset alt oder 404', async () => {
 const site = build(), old = build({commit: 'a'.repeat(40)}), s = await server(site), P = '/__research/content/quant/index.html';
 try {
  s.override.set('/quant/', 404); let f = failedOf(await run(s, site)); assert.equal(f['quant-shell'].cause, 'MISSING'); assert.equal(f['quant-content'].cause, 'SKIPPED');
  s.override.set('/quant/', HTML); f = failedOf(await run(s, site)); assert.equal(f['quant-shell'].cause, 'INVALID');
  s.override.clear(); s.override.set(P, 404); assert.equal(failedOf(await run(s, site))['quant-content'].cause, 'MISSING');
  s.override.set(P, old.map.get(P)); assert.equal(failedOf(await run(s, site))['quant-content'].cause, 'MIXED');
  // gleiche Kennung (Meta), aber andere Bytes als die Shell stempelt: allein der Hash-Vergleich erkennt das
  s.override.set(P, Buffer.concat([site.map.get(P), Buffer.from('\n<!-- alter Edge-Stand -->')]));
  f = failedOf(await run(s, site)); assert.equal(f['quant-content'].cause, 'MIXED'); assert.match(f['quant-content'].detail, /Inhalt sha256\[:16\]/);
  const noMeta = Buffer.from('<p>kein Meta</p>'), shell = Buffer.from('<script data-content="' + P + '?v=' + sha16(noMeta) + '"></script>');
  s.override.clear(); s.override.set(P, noMeta); s.override.set('/quant/', shell); assert.equal(failedOf(await run(s, site))['quant-content'].cause, 'INVALID');
  s.override.clear(); s.override.set('/quant/release-bundle.js', old.map.get('/quant/release-bundle.js'));
  f = failedOf(await run(s, site)); assert.equal(f['quant-assets'].cause, 'MIXED'); assert.match(f['quant-assets'].detail, /release-bundle\.js/);
  s.override.set('/quant/release-bundle.js', 404); assert.equal(failedOf(await run(s, site))['quant-assets'].cause, 'MISSING');
 } finally { await s.close(); }
});

test('Quant: Release ohne products.quant (gekuerzter Build) -> Quant-Block entfaellt, kein Fehlalarm', async () => {
 const site = build({quant: false}), s = await server(site);
 try {
  const r = await run(s, site, {ci: 'ON'});
  assert.equal(r.status, 'PROPAGATED'); assert.equal(r.observed.quantSkipped, true); assert.equal(s.requests.includes('/quant/'), false);
 } finally { await s.close(); }
});

// ---------------- Retry / Obergrenze ----------------
test('Obergrenze: nie propagiertes CI (ON) endet exakt bei maxMs, Backoff <= 30 s, Ursache + Kennungen', async () => {
 const site = build(), s = await server(site), c = clock();
 try {
  s.override.set(IDX, OTHER.index);
  const r = await verifyPropagation({origin: s.origin, expectedSha: site.commit, ci: 'ON', now: c.now, sleep: c.sleep, maxMs: DEFAULTS.maxMs});
  assert.equal(DEFAULTS.maxMs, 480000);
  assert.equal(r.status, 'NOT_PROPAGATED'); assert.equal(r.cause, CAUSE);
  assert.ok(r.elapsedMs >= 480000 && r.elapsedMs <= 481000, String(r.elapsedMs));
  assert.ok(c.sleeps.every(ms => ms <= 30000)); assert.ok(r.attemptCount >= 8 && r.attemptCount <= 25);
 } finally { await s.close(); }
});

test('Propagation nach Wartezeit: erst gemischt (alter Index), dann konsistent -> PROPAGATED mit Zwischenstand', async () => {
 const site = build(), s = await server(site);
 const c = clock(n => { if (n === 2) s.override.clear(); });
 try {
  s.override.set(IDX, OTHER.index);
  const r = await verifyPropagation({origin: s.origin, expectedSha: site.commit, ci: 'ON', now: c.now, sleep: c.sleep});
  assert.equal(r.status, 'PROPAGATED'); assert.equal(r.attemptCount, 3); assert.deepEqual(c.sleeps, [5000, 10000]); assert.equal(r.intermediateSeen, true);
 } finally { await s.close(); }
});

test('Zwischenstand der CI-Generation zwischen zwei Durchlaeufen ist im Fingerabdruck sichtbar', async () => {
 const a = build(), b = build({salt: 'x'});
 const ctxOf = origin => ({origin, fetch, now: Date.now, deadline: Date.now() + 1e5, requestTimeoutMs: 5000, expectedSha: null, expectedDataSha256: null, dataPath: D, maxLazyScripts: 40, maxQuantAssets: 40, maxSnapshotObjects: 2, ci: 'ON', nonce: () => 'n'});
 const sa = await server(a), sb = await server(b);
 try {
  const pa = await probeOnce(ctxOf(sa.origin)), pb = await probeOnce(ctxOf(sb.origin));
  assert.equal(pa.ok, true); assert.equal(pb.ok, true); assert.notEqual(pa.fingerprint, pb.fingerprint);
 } finally { await sa.close(); await sb.close(); }
});

// ---------------- rollout-Parser und Referenzobjekte ----------------
test('parseRollout: minifiziert (ON/OFF), Quelltext, Eligibility-Objekt, Muell', () => {
 const off = readFileSync(new URL('./fixtures/rollout.served-minified.js', import.meta.url), 'utf8');
 const o = parseRollout(off);
 assert.equal(o.stage, 0); assert.equal(o.productionOff, true); assert.equal(o.eligibilityNull, true); assert.ok(o.cohortSize >= 40);
 assert.equal(o.expectedGeneration, '6c3fb74e36086a0b86dfdf3b');
 const on = parseRollout(off.replace('const config={stage:0,productionOff:!0,', 'const config={stage:1,'));
 assert.equal(on.stage, 1); assert.equal(on.productionOff, false);
 const src = readFileSync(new URL('../../../company-intelligence/config/rollout.js', import.meta.url), 'utf8');
 const q = parseRollout(src); assert.equal(q.stage, 1); assert.equal(q.productionOff, false); assert.ok(q.expectedGeneration);
 const elig = parseRollout(off.replace('eligibility:null', 'eligibility:{AAPL:{}}'));
 assert.equal(elig.eligibilityNull, false);
 assert.equal(parseRollout('<html>404</html>'), null); assert.equal(parseRollout(''), null); assert.equal(parseRollout(undefined), null);
});

test('Referenzobjekt Platzhalter-Index: liegt im Checkout; fehlt es, entfaellt nur der Hash-Vergleich', () => {
 const file = new URL('../../../company-intelligence/data/index.json', import.meta.url).pathname;
 const ref = referenceDataSha256(file, 'x'.repeat(40));
 assert.match(ref.sha256, /^[0-9a-f]{64}$/, 'company-intelligence/data/index.json muss im Checkout liegen');
 assert.equal(JSON.parse(readFileSync(file, 'utf8')).state, 'DISABLED', 'Platzhalter bleibt DISABLED');
 assert.equal(referenceDataSha256(file + '.fehlt', 'x'.repeat(40)).reason, 'REFERENCE_FILE_MISSING');
 assert.equal(referenceDataSha256(file, null).sha256, null);
});
