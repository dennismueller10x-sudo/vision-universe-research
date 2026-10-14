import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {verifyPropagation, probeOnce, evaluateRelease, retryDecision, PropagationError, CAUSE, headerEvidence} from '../propagation-proof.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const SCRIPTS = ['/quant/ui/charts.js', '/discover/ui/detail.js', '/company-intelligence/ui/stock-section.js'];

/** Ein in sich stimmiges Release, wie es Pages ausliefert (Shell, Gate-Inhalt, Lazy-Skripte, Datei). */
function release(commit, {drift = {}} = {}) {
 const files = new Map(), scripts = [];
 for (const path of SCRIPTS) {
  const body = Buffer.from('/* ' + path + ' ' + commit + ' */');
  const v = sha256(body).slice(0, 16);
  files.set(path, body); scripts.push({path, v});
 }
 const discoverId = sha256(Buffer.from('code-' + commit)).slice(0, 16);
 const content = '<!doctype html><meta name="vu-release" data-product="discover" content="' + discoverId + '">\n<template id="dx-lazy-detail">\n'
  + scripts.map(s => '<script src="' + s.path + '?v=' + s.v + '"></script>').join('\n') + '\n</template>';
 const contentBytes = Buffer.from(content), v = sha256(contentBytes).slice(0, 16);
 const dataBytes = Buffer.from(JSON.stringify({symbol: 'AAPL', commit}));
 const map = new Map([
  ['/release-id.json', Buffer.from(JSON.stringify({schema: 'vu-release-id-1', commit, products: {quant: 'q', discover: discoverId}}))],
  ['/release-delivery.json', Buffer.from(JSON.stringify({sourceCommit: commit}))],
  ['/discover/', Buffer.from('<html><script data-content="/__research/content/discover/index.html?v=' + v + '"></script></html>')],
  ['/__research/content/discover/index.html', contentBytes],
  ['/discover/data/stocks/US_REAL/AAPL.json', dataBytes],
  ...files
 ]);
 for (const [k, val] of Object.entries(drift)) map.set(k, val);
 return {commit, map, dataSha256: sha256(dataBytes), discoverId, shellV: v};
}

async function server(initial) {
 const state = {site: initial, requests: [], override: new Map()};
 const srv = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  state.requests.push(path);
  const ov = state.override.get(path);
  if (ov === 404) { res.writeHead(404); return res.end('nf'); }
  const body = ov ?? state.site.map.get(path);
  if (!body) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, {'x-cache': 'HIT', age: '221', 'x-served-by': 'cache-iad-test', 'set-cookie': 'secret=1', 'content-type': 'application/octet-stream'});
  res.end(body);
 });
 await new Promise(r => srv.listen(0, '127.0.0.1', r));
 state.origin = 'http://127.0.0.1:' + srv.address().port;
 state.close = () => new Promise(r => { srv.close(r); srv.closeAllConnections(); });
 return state;
}

/** Fake-Uhr: sleep() schreitet voran, nichts wartet wirklich. */
function clock(onSleep) {
 const c = {t: 1e9, sleeps: []};
 c.now = () => c.t;
 c.sleep = async ms => { c.sleeps.push(ms); c.t += ms; onSleep?.(c.sleeps.length, ms); };
 return c;
}

const fast = () => { const c = clock(); return {now: c.now, sleep: c.sleep}; };
const NEW = release('b'.repeat(40)), OLD = release('a'.repeat(40));

test('propagiert sofort: ein Durchlauf, keine Wartezeit', async () => {
 const s = await server(NEW), c = clock();
 try {
  const r = await verifyPropagation({origin: s.origin, expectedSha: NEW.commit, expectedDataSha256: NEW.dataSha256, now: c.now, sleep: c.sleep});
  assert.equal(r.status, 'PROPAGATED'); assert.equal(r.attemptCount, 1); assert.deepEqual(c.sleeps, []);
  assert.equal(r.intermediateSeen, false);
  assert.equal(r.observed.commit, NEW.commit); assert.equal(r.observed.discoverId, NEW.discoverId);
 } finally { await s.close(); }
});

test('propagiert nach N Versuchen: begrenzter Backoff, Zwischenstand vermerkt', async () => {
 const s = await server(OLD);
 const c = clock(n => { if (n === 3) s.site = NEW; });
 try {
  const r = await verifyPropagation({origin: s.origin, expectedSha: NEW.commit, expectedDataSha256: NEW.dataSha256, now: c.now, sleep: c.sleep});
  assert.equal(r.status, 'PROPAGATED'); assert.equal(r.attemptCount, 4);
  assert.deepEqual(c.sleeps, [5000, 10000, 15000]);
  assert.equal(r.intermediateSeen, true);
 } finally { await s.close(); }
});

test('nie propagiert: harte Obergrenze, klare Ursache, Header-Belege', async () => {
 const s = await server(OLD), c = clock();
 try {
  const r = await verifyPropagation({origin: s.origin, expectedSha: NEW.commit, now: c.now, sleep: c.sleep, maxMs: 480000});
  assert.equal(r.status, 'NOT_PROPAGATED'); assert.equal(r.cause, CAUSE);
  assert.match(r.message, /nicht propagiert/);
  assert.ok(r.elapsedMs >= 480000 && r.elapsedMs <= 480000 + 1000, 'Obergrenze exakt eingehalten: ' + r.elapsedMs);
  assert.ok(c.sleeps.every(ms => ms <= 30000));
  assert.ok(r.attemptCount >= 8 && r.attemptCount <= 25);
  const failed = r.attempts.at(-1).failed.find(f => f.name === 'release-id');
  assert.equal(failed.cause, 'STALE'); assert.match(failed.detail, /a{40}/);
  assert.equal(failed.headers['x-cache'], 'HIT'); assert.equal(failed.headers.age, '221'); assert.equal(failed.headers['x-served-by'], 'cache-iad-test');
  assert.equal(JSON.stringify(r).includes('secret=1'), false, 'keine Cookies im Bericht');
 } finally { await s.close(); }
});

test('Obergrenze gilt auch bei hakenden Requests (kein Warten ueber maxMs hinaus)', async () => {
 const c = clock();
 const r = await verifyPropagation({origin: 'http://127.0.0.1:1', now: c.now, sleep: c.sleep, maxMs: 60000, requestTimeoutMs: 1000});
 assert.equal(r.status, 'NOT_PROPAGATED');
 assert.equal(r.attempts.at(-1).failed[0].cause, 'REQUEST_FAILED');
 assert.ok(c.sleeps.reduce((a, b) => a + b, 0) <= 60000);
});

test('alte Kennung: release-id und delivery zeigen den alten Commit', async () => {
 const s = await server(OLD);
 try {
  const p = await probeOnce({origin: s.origin, fetch, now: Date.now, deadline: Date.now() + 1e5, requestTimeoutMs: 5000, expectedSha: NEW.commit, expectedDataSha256: null, dataPath: '/discover/data/stocks/US_REAL/AAPL.json', maxLazyScripts: 40, nonce: () => 'n'});
  assert.equal(p.ok, false);
  assert.deepEqual(p.checks.filter(c => !c.ok).map(c => c.name + ':' + c.cause), ['release-id:STALE', 'release-delivery:STALE']);
 } finally { await s.close(); }
});

test('404 auf Lazy-Skript, Datei und Gate-Inhalt wird mit Ursache MISSING benannt', async () => {
 const s = await server(NEW), c = clock();
 try {
  s.override.set('/discover/ui/detail.js', 404);
  s.override.set('/discover/data/stocks/US_REAL/AAPL.json', 404);
  const r = await verifyPropagation({origin: s.origin, expectedSha: NEW.commit, now: c.now, sleep: c.sleep, maxMs: 20000});
  assert.equal(r.status, 'NOT_PROPAGATED');
  const names = Object.fromEntries(r.attempts.at(-1).failed.map(f => [f.name, f.cause]));
  assert.equal(names['lazy-detail'], 'MISSING'); assert.equal(names['discover-data'], 'MISSING');
  s.override.clear(); s.override.set('/__research/content/discover/index.html', 404);
  const r2 = await verifyPropagation({origin: s.origin, expectedSha: NEW.commit, ...fast(), maxMs: 1});
  assert.equal(r2.attempts.at(-1).failed.find(f => f.name === 'gate-content').cause, 'MISSING');
 } finally { await s.close(); }
});

test('gemischter Stand: neue Kennung, aber alter Gate-Inhalt oder alte Lazy-Skripte', async () => {
 // Shell neu, Inhalt alt (Edge-Knoten mit altem Objekt): Hash des Inhalts passt nicht zu ?v der Shell
 let s = await server(NEW);
 try {
  s.override.set('/__research/content/discover/index.html', OLD.map.get('/__research/content/discover/index.html'));
  let p = await verifyPropagation({origin: s.origin, expectedSha: NEW.commit, ...fast(), maxMs: 1});
  assert.equal(p.attempts.at(-1).failed.find(f => f.name === 'gate-content').cause, 'MIXED');
  // Inhalt passend zur Shell, aber Meta-Kennung nicht gleich release-id.json
  const odd = release(NEW.commit, {});
  const forged = Buffer.from(NEW.map.get('/__research/content/discover/index.html').toString().replace(NEW.discoverId, 'f'.repeat(16)));
  const shell = Buffer.from('<script data-content="/__research/content/discover/index.html?v=' + sha256(forged).slice(0, 16) + '"></script>');
  s.override.clear(); s.override.set('/__research/content/discover/index.html', forged); s.override.set('/discover/', shell);
  p = await verifyPropagation({origin: s.origin, expectedSha: NEW.commit, ...fast(), maxMs: 1});
  assert.match(p.attempts.at(-1).failed.find(f => f.name === 'gate-content').detail, /Meta f{16} != release-id/);
  assert.ok(odd);
  // Lazy-Skript im Cache auf altem Stand: Hash passt nicht zum Stempel
  s.override.clear(); s.override.set('/discover/ui/detail.js', OLD.map.get('/discover/ui/detail.js'));
  p = await verifyPropagation({origin: s.origin, expectedSha: NEW.commit, ...fast(), maxMs: 1});
  const lazy = p.attempts.at(-1).failed.find(f => f.name === 'lazy-detail');
  assert.equal(lazy.cause, 'MIXED'); assert.match(lazy.detail, /detail\.js/);
 } finally { await s.close(); }
});

test('Discover-Datei: Hash des Checkouts wird verlangt, sonst nur Struktur', async () => {
 const s = await server(NEW);
 try {
  s.override.set('/discover/data/stocks/US_REAL/AAPL.json', Buffer.from('{"symbol":"AAPL","commit":"stale"}'));
  const bad = await verifyPropagation({origin: s.origin, expectedSha: NEW.commit, expectedDataSha256: NEW.dataSha256, ...fast(), maxMs: 1});
  assert.equal(bad.attempts.at(-1).failed.find(f => f.name === 'discover-data').cause, 'STALE');
  s.override.set('/discover/data/stocks/US_REAL/AAPL.json', Buffer.from('<html>fallback</html>'));
  const html = await verifyPropagation({origin: s.origin, expectedSha: NEW.commit, ...fast(), maxMs: 1});
  assert.equal(html.attempts.at(-1).failed.find(f => f.name === 'discover-data').cause, 'INVALID');
 } finally { await s.close(); }
});

test('ohne erwarteten Commit nur Konsistenz: Shell/Inhalt/Lazy/Daten muessen zusammenpassen', async () => {
 const s = await server(NEW);
 try {
  const ok = await verifyPropagation({origin: s.origin, ...fast()});
  assert.equal(ok.status, 'PROPAGATED');
  s.override.set('/release-delivery.json', Buffer.from(JSON.stringify({sourceCommit: 'c'.repeat(40)})));
  const mixed = await verifyPropagation({origin: s.origin, ...fast(), maxMs: 1});
  assert.equal(mixed.attempts.at(-1).failed[0].cause, 'MIXED');
 } finally { await s.close(); }
});

test('Cache-Buster und no-store werden gesendet, Header-Allowlist enthaelt keine Cookies', async () => {
 const seen = [];
 const fake = async (url, init) => { seen.push({url, init}); return new Response('{}', {status: 200, headers: {'set-cookie': 'a=b', 'x-cache': 'MISS'}}); };
 await probeOnce({origin: 'http://x', fetch: fake, now: Date.now, deadline: Date.now() + 1e5, requestTimeoutMs: 100, expectedSha: null, dataPath: '/d.json', maxLazyScripts: 1, nonce: () => 'N1'});
 assert.ok(seen.length >= 1 && seen.every(s => s.url.includes('ci-proof=N1') && s.init.cache === 'no-store' && s.init.headers['cache-control'] === 'no-cache'));
 const h = headerEvidence(new Response('', {headers: {'set-cookie': 'a=b', age: '5', authorization: 'x'}}));
 assert.equal(h.age, '5'); assert.equal('set-cookie' in h || 'authorization' in h, false);
});

// ---- Ablauf: Beweis -> Browser ----
const proofOf = (fp, status = 'PROPAGATED', extra = {}) => ({status, fingerprint: fp, observed: {discoverId: 'id1', commit: 'c'}, attemptCount: 1, ...extra});

test('Beweis fehlgeschlagen: kein Browserlauf, PropagationError mit Ursache', async () => {
 let ran = 0;
 await assert.rejects(evaluateRelease({prove: async () => proofOf('x', 'NOT_PROPAGATED', {cause: CAUSE, message: 'm'}), runBrowser: async () => { ran++; }}),
  e => e instanceof PropagationError && e.message.startsWith(CAUSE));
 assert.equal(ran, 0);
});

test('echter Fehler nach bewiesener Propagation: KEINE Wiederholung, Fehler bleibt', async () => {
 let ran = 0, proofs = 0;
 const err = Object.assign(new Error('Gerade nicht erreichbar'), {observed: {metaRelease: 'id1'}});
 await assert.rejects(evaluateRelease({prove: async () => { proofs++; return proofOf('same'); }, runBrowser: async () => { ran++; throw err; }}),
  e => e === err && e.propagationEvidence.decision.reason === 'SAME_STATE_REAL_FAILURE' && e.propagationEvidence.decision.retry === false);
 assert.equal(ran, 1); assert.equal(proofs, 2); // Beweis + Gegenprobe
});

test('Zwischenstand belegt (Kennung nach dem Fehler anders): genau eine Wiederholung', async () => {
 const fps = ['old', 'new', 'new']; let ran = 0;
 const out = await evaluateRelease({prove: async () => proofOf(fps.shift()), runBrowser: async ({attempt}) => { ran++; if (attempt === 1) throw Object.assign(new Error('timeout'), {observed: {}}); return 'ok'; }});
 assert.equal(ran, 2); assert.equal(out.retried, true); assert.equal(out.result, 'ok'); assert.equal(out.previousFailure.decision.reason, 'STATE_CHANGED_AFTER_PROOF');
});

test('Wiederholung ist hoechstens einmal: zweiter Fehler wird geworfen', async () => {
 const fps = ['old', 'new', 'new']; let ran = 0;
 await assert.rejects(evaluateRelease({prove: async () => proofOf(fps.shift()), runBrowser: async () => { ran++; throw new Error('boom' + ran); }}), /boom2/);
 assert.equal(ran, 2);
});

test('Browser sah andere Release-Kennung als bewiesen: Wiederholung erlaubt, sonst nicht', () => {
 const proof = proofOf('f');
 assert.equal(retryDecision({proof, reproof: proofOf('f'), browser: {metaRelease: 'other'}}).retry, true);
 assert.equal(retryDecision({proof, reproof: proofOf('f'), browser: {metaRelease: 'id1'}}).retry, false);
 assert.equal(retryDecision({proof, reproof: proofOf('f'), browser: {metaRelease: null}}).retry, false);
 assert.equal(retryDecision({proof, reproof: proofOf('f', 'NOT_PROPAGATED')}).retry, true);
});

test('Wiederholung ohne erneute Propagation scheitert fail-closed mit Ursache, nicht mit Browserfehler', async () => {
 const seq = [proofOf('old'), proofOf('new'), proofOf('new', 'NOT_PROPAGATED', {cause: CAUSE, message: 'm'})];
 await assert.rejects(evaluateRelease({prove: async () => seq.shift(), runBrowser: async () => { throw new Error('x'); }}), e => e instanceof PropagationError);
});
