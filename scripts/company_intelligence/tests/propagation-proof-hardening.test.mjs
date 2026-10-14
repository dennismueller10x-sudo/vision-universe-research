import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {verifyPropagation, evaluateRelease, referenceDataSha256, DEFAULTS} from '../propagation-proof.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const fast = () => { let t = 1e9; return {now: () => t, sleep: async ms => { t += ms; }}; };
const proofOf = fp => ({status: 'PROPAGATED', fingerprint: fp, observed: {discoverId: 'id1', commit: 'c'}, attemptCount: 1});

/** Minimal in sich stimmiges Release (Shell, Gate-Inhalt, ein Lazy-Skript, Datei). */
function site(commit) {
 const script = Buffer.from('/* detail ' + commit + ' */'), v = sha256(script).slice(0, 16);
 const content = Buffer.from('<meta name="vu-release" data-product="discover" content="abc123">\n<template id="dx-lazy-detail"><script src="/discover/ui/detail.js?v=' + v + '"></script></template>');
 return new Map([
  ['/release-id.json', Buffer.from(JSON.stringify({schema: 'vu-release-id-1', commit, products: {discover: 'abc123'}}))],
  ['/release-delivery.json', Buffer.from(JSON.stringify({sourceCommit: commit}))],
  ['/discover/', Buffer.from('<script data-content="/__research/content/discover/index.html?v=' + sha256(content).slice(0, 16) + '"></script>')],
  ['/__research/content/discover/index.html', content], ['/discover/ui/detail.js', script],
  ['/discover/data/stocks/US_REAL/AAPL.json', Buffer.from('{"symbol":"AAPL"}')]
 ]);
}
async function listen(handler) {
 const srv = http.createServer(handler);
 await new Promise(r => srv.listen(0, '127.0.0.1', r));
 return {origin: 'http://127.0.0.1:' + srv.address().port, close: () => new Promise(r => { srv.close(r); srv.closeAllConnections(); })};
}

test('Server antwortet nie: Timeout wird REQUEST_FAILED, kein Haengen', async () => {
 const s = await listen(() => {});
 try {
  const t = Date.now();
  const r = await verifyPropagation({origin: s.origin, ...fast(), maxMs: 1, requestTimeoutMs: 150});
  assert.equal(r.status, 'NOT_PROPAGATED');
  const f = r.attempts.at(-1).failed;
  assert.ok(f.filter(c => c.cause === 'REQUEST_FAILED').length >= 3, JSON.stringify(f.map(c => c.name + c.cause)));
  assert.match(f[0].detail, /TimeoutError|AbortError/);
  assert.ok(Date.now() - t < 5000);
 } finally { await s.close(); }
});

test('abgebrochener Body wird REQUEST_FAILED', async () => {
 const s = await listen((req, res) => { res.writeHead(200, {'content-length': '1000'}); res.write('{"schema"'); setTimeout(() => res.destroy(), 20); });
 try {
  const r = await verifyPropagation({origin: s.origin, ...fast(), maxMs: 1, requestTimeoutMs: 2000});
  assert.equal(r.status, 'NOT_PROPAGATED');
  assert.equal(r.attempts.at(-1).failed[0].cause, 'REQUEST_FAILED');
 } finally { await s.close(); }
});

test('Referenzdatei: Vertrag (liegt im Checkout); fehlt sie, entfaellt nur der Hash-Vergleich', async () => {
 const file = new URL('../../../discover/data/stocks/US_REAL/AAPL.json', import.meta.url).pathname;
 assert.equal(DEFAULTS.dataPath, '/discover/data/stocks/US_REAL/AAPL.json');
 assert.match(referenceDataSha256(file, 'x'.repeat(40)).sha256, /^[0-9a-f]{64}$/, DEFAULTS.dataPath + ' muss im Checkout liegen');
 const missing = referenceDataSha256(file + '.fehlt', 'x'.repeat(40));
 assert.equal(missing.reason, 'REFERENCE_FILE_MISSING'); assert.equal(missing.sha256, null);
 assert.equal(referenceDataSha256(file, null).sha256, null);
 const files = site('a'.repeat(40));
 const s = await listen((req, res) => { const b = files.get(new URL(req.url, 'http://x').pathname); res.writeHead(b ? 200 : 404); res.end(b || 'nf'); });
 try {
  const ok = await verifyPropagation({origin: s.origin, expectedSha: 'a'.repeat(40), expectedDataSha256: missing.sha256, ...fast()});
  assert.equal(ok.status, 'PROPAGATED', 'ohne Referenz-Hash kein dauerhafter Propagationsfehler');
  files.set('/discover/data/stocks/US_REAL/AAPL.json', Buffer.from('<html>fallback'));
  const bad = await verifyPropagation({origin: s.origin, expectedSha: 'a'.repeat(40), expectedDataSha256: missing.sha256, ...fast(), maxMs: 1});
  assert.equal(bad.status, 'NOT_PROPAGATED', '200 + gueltiges JSON bleibt Pflicht');
 } finally { await s.close(); }
});

test('maxLazyScripts-Abschneiden wird kenntlich gemacht', async () => {
 const files = site('a'.repeat(40));
 const extra = Buffer.from('x'), v = sha256(extra).slice(0, 16);
 const content = Buffer.from(files.get('/__research/content/discover/index.html').toString().replace('</template>', '<script src="/discover/ui/extra.js?v=' + v + '"></script></template>'));
 files.set('/__research/content/discover/index.html', content); files.set('/discover/ui/extra.js', extra);
 files.set('/discover/', Buffer.from('<script data-content="/__research/content/discover/index.html?v=' + sha256(content).slice(0, 16) + '"></script>'));
 const s = await listen((req, res) => { const b = files.get(new URL(req.url, 'http://x').pathname); res.writeHead(b ? 200 : 404); res.end(b || 'nf'); });
 try {
  const r = await verifyPropagation({origin: s.origin, maxLazyScripts: 1, ...fast()});
  assert.equal(r.status, 'PROPAGATED'); assert.equal(r.observed.lazyTruncated, true); assert.equal(r.observed.lazyTotal, 2); assert.equal(r.observed.lazyChecked, 1);
  const full = await verifyPropagation({origin: s.origin, ...fast()});
  assert.equal(full.observed.lazyTruncated, undefined);
 } finally { await s.close(); }
});

test('Zeitbudget: Wiederholung nur mit genug Restzeit, sonst fail-closed mit Ursache', async () => {
 const mk = total => {
  let t = 0, ran = 0; const fps = ['old', 'new', 'new'];
  return {ran: () => ran, run: () => evaluateRelease({
   budget: {now: () => t, startedAt: 0, totalMs: total, reserveMs: 60000, proofMaxMs: 480000},
   prove: async () => proofOf(fps.shift()), runBrowser: async () => { ran++; t += 120000; throw new Error('timeout'); }})};
 };
 const tight = mk(600000); // Rest nach dem ersten Lauf 480 s < 480 + 120 + 60 s
 await assert.rejects(tight.run(), e => e.propagationEvidence.decision.reason === 'NO_TIME_BUDGET' && /Restzeit/.test(e.propagationEvidence.decision.detail) && /STATE_CHANGED_AFTER_PROOF/.test(e.propagationEvidence.decision.detail));
 assert.equal(tight.ran(), 1);
 const roomy = mk(3600000);
 await assert.rejects(roomy.run(), /timeout/);
 assert.equal(roomy.ran(), 2, 'mit genug Restzeit wird genau einmal wiederholt');
});
