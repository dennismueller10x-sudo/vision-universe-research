// Supertrader 7.0 – Tiingo-Splits-Probe (research/run-sf7-tiingo-splits-probe.mjs). Nur synthetische Antworten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from '../validation/lib.mjs';
import { datasetFromPit } from '../source-faithful/runner/snapshot-input.mjs';
import { caResolutionPart } from '../source-faithful/research/run-sf7-ca-resolution.mjs';
import { PROBE_SPEC, PROBE_GATE, probeSpecSha256, createTiingoClient, stageA, classifySession, stageBRefine, ProbeDone, groupOf } from '../source-faithful/research/run-sf7-tiingo-splits-probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..', '..');
const day = (k) => new Date(Date.UTC(2016, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
function series(len, seed, events = []) {
  const r = rng(seed); let c = 20; const raw = [];
  for (let k = 0; k < len; k++) { const o = c * (1 + 0.01 * (r() - 0.5)); c = o * (1 + 0.0008 + 0.02 * (r() - 0.5)); raw.push({ date: day(k), open: o, high: Math.max(o, c) * 1.005, low: Math.min(o, c) * 0.995, close: c, volume: Math.round(1e6 * (0.7 + 0.6 * r())), adjClose: null, dividend: 0, splitFactor: 1 }); }
  for (const e of events) for (let k = e.at; k < len; k++) { for (const f of ['open', 'high', 'low', 'close']) raw[k][f] *= e.price; raw[k].volume = Math.round(raw[k].volume * (e.volume ?? 1)); }
  return raw;
}
const seg = (id, raw) => ({ id, raw, endCause: 'ACTIVE', delisted: false, survivor: true, cls: 'EQUITY_COMMON' });
const dsOf = (segs, cal = segs[0].raw) => { const spyAdj = L.adjustSeries(cal); let v = 1; const spyTR = spyAdj.date.map((d, i) => { if (i > 0) v *= 1 + spyAdj.tr[i]; return { date: d, value: v }; }); return datasetFromPit({ segs, calendar: cal.map((b) => b.date), spyAdj, spyTR }); };
const json = (status, body) => ({ status, ok: status === 200, text: async () => JSON.stringify(body) });
const REC = (exDate, from, to, extra = {}) => ({ permaTicker: 'US000000000001', ticker: 'x', exDate: `${exDate}T00:00:00.000Z`, splitFrom: from, splitTo: to, splitFactor: to / from, splitStatus: 'a', ...extra });

test('SF7-TIINGO-SPEC: Probe vorregistriert und festgeschrieben; Obergrenzen 4 und 90, >= 1 s, keine Wiederholung', () => {
  assert.ok(Object.isFrozen(PROBE_SPEC)); assert.equal(PROBE_SPEC.stageA.maxRequests, 4); assert.equal(PROBE_SPEC.stageB.maxRequests, 90);
  assert.equal(PROBE_SPEC.throttle.minIntervalMs, 1000); assert.equal(PROBE_SPEC.throttle.retries, 0); assert.equal(PROBE_SPEC.stageB.expectedSessions, 83);
  assert.equal(probeSpecSha256(), '76b70088060119319c8196d36c22589fdd7f22e3182b5ecca07b6b55dc1c6eac');
});

test('SF7-TIINGO-A: Zugangsprobe mit festen oeffentlichen Beispielen; Ablehnung mit Meldung ohne Token; Obergrenze fail closed', async () => {
  const calls = [];
  const ok = async (url, o) => { calls.push(url); assert.equal(o.headers.Authorization, 'Token k3y'); assert.doesNotMatch(url, /k3y/);
    if (url.includes('/aapl/')) return json(200, [REC('2020-08-31', 1, 4)]);
    if (url.includes('/ge/')) return json(200, [REC('2021-08-02', 8, 1)]);
    return json(200, [REC('2020-08-31', 1, 4, { ticker: 'aapl' }), REC('2020-08-31', 1, 5, { ticker: 'tsla' })]); };
  let t = 0; const c = createTiingoClient({ key: 'k3y', cap: 4, fetchImpl: ok, now: () => t, sleep: async (ms) => { t += ms; } });
  const a = await stageA(c);
  assert.equal(a.access, true); assert.equal(a.used, 3);
  assert.deepEqual(a.requests.map((x) => [x.id, x.status, x.records, x.expectedSplitFound, x.permaTickerPresent]), [['A1-AAPL', 200, 1, true, true], ['A2-GE', 200, 1, true, true], ['A3-BATCH', 200, 2, true, true]]);
  assert.ok(a.requests[0].fields.includes('splitStatus'));
  const deny = async () => json(403, { detail: 'You do not have permission. Token k3y is not entitled to this beta endpoint.' });
  const d = await stageA(createTiingoClient({ key: 'k3y', cap: 4, fetchImpl: deny, sleep: async () => {} }));
  assert.equal(d.access, false); assert.equal(d.requests[0].status, 403); assert.match(d.requests[0].message, /not entitled/); assert.doesNotMatch(JSON.stringify(d), /k3y/);
  // hard cap: never more requests than the cap
  let n = 0; const capped = createTiingoClient({ key: 'k', cap: 2, fetchImpl: async () => { n++; return json(200, []); }, sleep: async () => {} });
  for (let k = 0; k < 5; k++) await capped.get('https://x'); assert.equal(n, 2); assert.equal(capped.refused(), 3);
});

test('SF7-TIINGO-B-CLASS: Ereignis im Fenster (+-2 Sitzungen, Kalender), Verhaeltnis gegen Eroeffnung/Schluss, EOD-Abgleich', () => {
  const raw = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }]), cal = raw.map((b) => b.date);
  const x = classifySession({ records: [REC(day(401), 10, 1)], found: true, raw, i: 400, calendar: cal });
  assert.equal(x.cls, 'SPLIT_EVENT_IN_WINDOW'); assert.equal(x.ratioMatchesOpen, true); assert.equal(x.ratioMatchesClose, true); assert.equal(x.status, 'a');
  assert.equal(x.eodCarriesSameFactor, false, 'die EOD-Reihe kennt den Split nicht: unabhaengig');
  const raw2 = raw.map((b) => ({ ...b })); raw2[401].splitFactor = 0.1;
  assert.equal(classifySession({ records: [REC(day(401), 10, 1)], found: true, raw: raw2, i: 400, calendar: cal }).eodCarriesSameFactor, true, 'dieselbe Tiingo-Quelle');
  assert.equal(classifySession({ records: [REC(day(401), 8, 1)], found: true, raw, i: 400, calendar: cal }).ratioMatchesOpen, false, '1:8 passt nicht zum Sprung 10');
  assert.equal(classifySession({ records: [REC(day(410), 10, 1)], found: true, raw, i: 400, calendar: cal }).cls, 'SPLIT_EVENT_ELSEWHERE');
  assert.equal(classifySession({ records: [], found: true, raw, i: 400, calendar: cal }).cls, 'NO_SPLIT_RECORDS');
  assert.equal(classifySession({ records: [], found: false, raw, i: 400, calendar: cal }).cls, 'TICKER_NOT_FOUND');
  assert.equal(classifySession({ records: [REC(day(401), 10, 1, { splitStatus: 'c' })], found: true, raw, i: 400, calendar: cal }).status, 'c');
  assert.equal(groupOf('SEC_LISTING_NOT_MAPPED'), 'NO_CIK'); assert.equal(groupOf('SEC_SHARES_NOT_BRACKETING'), 'DOCUMENT_PATH'); assert.equal(groupOf('DECLARED_SPLIT_NEARBY'), 'DECLARED_SPLIT_NEARBY');
});

test('SF7-TIINGO-B-RUN: Umfang wie run-sf7-ca-edgar, eine Anfrage je Ticker, nur Zaehlungen oeffentlich, nichts geaendert', async () => {
  const ids = (s) => `tiingo:NYSE:S${String(s).padStart(3, '0')}:2010-01-01`;
  const EV = { 2: [{ at: 400, price: 10, volume: 0.1 }], 5: [{ at: 300, price: 10, volume: 0.1 }], 9: [{ at: 500, price: 12, volume: 0.08 }], 11: [{ at: 450, price: 20, volume: 0.05 }] };
  const segs = Array.from({ length: 16 }, (_, s) => seg(ids(s), series(700, s + 21, EV[s] || []))), ds = dsOf(segs);
  const calls = [];
  const impl = async (url) => { calls.push(url); if (url.includes('/s002/')) return json(200, [REC(day(400), 10, 1)]); if (url.includes('/s005/')) return json(200, []); if (url.includes('/s009/')) return json(404, { detail: 'not found' }); return json(200, [REC(day(10), 2, 1)]); };
  const client = createTiingoClient({ key: 'k', cap: 90, fetchImpl: impl, sleep: async () => {} });
  let res = null;
  await assert.rejects(caResolutionPart(ds, segs, { from: day(0), to: day(699), dataEnd: day(699), refine: stageBRefine({ client }) }), (e) => { res = e; return e instanceof ProbeDone; });
  const p = res.result.pub;
  assert.equal(p.sessions, 4); assert.equal(p.distinctTickers, 4); assert.equal(calls.length, 4);
  assert.deepEqual(p.byClass, { SPLIT_EVENT_IN_WINDOW: 1, NO_SPLIT_RECORDS: 1, TICKER_NOT_FOUND: 1, SPLIT_EVENT_ELSEWHERE: 1 });
  assert.equal(p.inWindow.ratioMatchesOpen, 1); assert.equal(p.independence.endpointOnly, 1);
  assert.equal(p.byReasonGroup.NO_CIK.sessions, 4, 'die Synthese hat keine SEC-Zuordnung'); assert.equal(p.permaTicker.noCikWithPermaTicker, 2);
  assert.doesNotMatch(JSON.stringify(p), /s00\d|tiingo:/, 'keine Ticker oeffentlich');
  await assert.rejects(caResolutionPart(ds, segs, { from: day(0), to: day(699), dataEnd: day(699), refine: stageBRefine({ client, expectedCount: 83 }) }), /PROBE_SCOPE_COUNT_MISMATCH: 4 != 83/);
});

test('SF7-TIINGO-FAIL-CLOSED: ohne Snapshot, research-v1 oder Schluessel kein Lauf; Workflow-Modus mit Snapshot-Vertrag', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sf7-tiingo-')), script = path.join(ROOT, 'scripts/supertrader/source-faithful/research/run-sf7-tiingo-splits-probe.mjs');
  try {
    const env = { ...process.env }; delete env.TIINGO_API_KEY;
    assert.match(spawnSync(process.execPath, [script, '--accounting', 'research-v1', '--out', out], { encoding: 'utf8', env }).stderr, /SNAPSHOT_REQUIRED/);
    assert.match(spawnSync(process.execPath, [script, '--snapshot', 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', '--out', out], { encoding: 'utf8', env }).stderr, /RESEARCH_ACCOUNTING_REQUIRED/);
    const r = spawnSync(process.execPath, [script, '--snapshot', 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', '--accounting', 'research-v1', '--out', out], { encoding: 'utf8', env: { ...env, TIINGO_API_KEY: 'k3y' } });
    assert.equal(r.status, 2); assert.match(r.stderr, /PROBE_FROZEN/, 'gesperrt, auch mit Schluessel'); assert.doesNotMatch(r.stderr, /k3y/); assert.deepEqual(fs.readdirSync(out), []);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/supertrader-validation.yml'), 'utf8');
  assert.match(y, /run-sf7-tiingo-splits-probe\.mjs --out "\$RUNNER_TEMP\/val" \$SNAP_ARGS/);
  for (const m of y.matchAll(/case "\$MODE" in (sf-research\|[^)]*|methods\|[^)]*)\)/g)) assert.match(m[1], /\|sf7-tiingo-splits-probe\|/);
});

test('SF7-TIINGO-GATE: nach HTTP 403 gesperrt; Abruf vor Schluessel und Snapshot abgelehnt; Workflow-Sperre vor jedem Schritt mit Schluessel', () => {
  assert.ok(Object.isFrozen(PROBE_GATE)); assert.equal(PROBE_GATE.state, 'FROZEN'); assert.equal(PROBE_GATE.unlockedBy, null);
  assert.match(PROBE_GATE.reason, /40221353332/);
  assert.equal(probeSpecSha256(), '76b70088060119319c8196d36c22589fdd7f22e3182b5ecca07b6b55dc1c6eac', 'die Sperre liegt ausserhalb der vorregistrierten Spezifikation');
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/supertrader-validation.yml'), 'utf8');
  const freeze = y.indexOf('TIINGO_SPLITS_FETCH_FROZEN'), probeStep = y.indexOf('Supertrader 7.0 Tiingo-Splits-Probe (Corporate'), snapStep = y.indexOf('- name: Snapshot- und Abrechnungsvertrag');
  assert.ok(freeze > 0 && freeze < snapStep && snapStep < probeStep, 'Sperre vor Snapshot-Vertrag und Abrufschritt');
  assert.match(y, /case "\$MODE" in sf7-tiingo-splits-probe\) echo "TIINGO_SPLITS_FETCH_FROZEN/);
  // der Plan-Schritt bekommt keinen Tiingo-Schluessel
  const plan = y.slice(y.indexOf('Supertrader 7.0 Tiingo-Splits-Plan'), y.indexOf('- name:', y.indexOf('Supertrader 7.0 Tiingo-Splits-Plan') + 10));
  assert.doesNotMatch(plan, /TIINGO_API_KEY/); assert.match(plan, /run-sf7-tiingo-splits-probe\.mjs --plan --out/);
});

test('SF7-TIINGO-PLAN: Stufe B als Plan ohne jede Anfrage; Umfang, Ticker, Obergrenze, Reason-Gruppen; nur Zaehlungen', async () => {
  const ids = (s) => `tiingo:NYSE:S${String(s).padStart(3, '0')}:2010-01-01`;
  const EV = { 2: [{ at: 400, price: 10, volume: 0.1 }], 5: [{ at: 300, price: 10, volume: 0.1 }], 9: [{ at: 500, price: 12, volume: 0.08 }], 11: [{ at: 450, price: 20, volume: 0.05 }] };
  const segs = Array.from({ length: 16 }, (_, s) => seg(ids(s), series(700, s + 21, EV[s] || []))), ds = dsOf(segs);
  let res = null;
  await assert.rejects(caResolutionPart(ds, segs, { from: day(0), to: day(699), dataEnd: day(699), refine: stageBRefine({ plan: true }) }), (e) => { res = e; return e instanceof ProbeDone; });
  const p = res.result.pub;
  assert.equal(p.plan, true); assert.equal(p.requests, 0); assert.equal(p.sessions, 4); assert.equal(p.distinctTickers, 4); assert.equal(p.plannedRequests, 4);
  assert.equal(p.cap, 90); assert.equal(p.fitsCap, true); assert.equal(p.noCikSessions, 4); assert.equal(p.byReasonGroup.NO_CIK, 4);
  assert.deepEqual(res.result.sealed, []); assert.doesNotMatch(JSON.stringify(p), /s00\d|tiingo:/);
  // ohne Plan und ohne Client: fail closed statt Abruf
  await assert.rejects(caResolutionPart(ds, segs, { from: day(0), to: day(699), dataEnd: day(699), refine: stageBRefine({}) }), /PROBE_CLIENT_MISSING/);
});
