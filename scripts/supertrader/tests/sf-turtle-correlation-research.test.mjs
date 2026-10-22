// Turtle TUR-LIMIT6 / TUR-LIMIT10: Korrelations-Forschungskomponente (research/turtle-correlation.mjs).
// Synthetisch, deterministisch, keine Marktdaten. Prueft Kausalitaet, Unknown-Zustaende, Linkage, Verschachtelung,
// Engine-Bindung ohne Engine-Aenderung und die Trennung Quelle / Modellannahme.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORRELATION_VARIANTS, SOURCE_INTENT, UNKNOWN_REASON, validateVariant, monthEndAnchors, nnChainLinkage, cutDendrogram,
  createCorrelationGroupProvider, concentrationReport, TURTLE_CORR_RESEARCH_VERSION,
} from '../source-faithful/research/turtle-correlation.mjs';
import { runTurtle, TURTLE_VERSION } from '../source-faithful/methods/turtle.mjs';
import { CONTRACTS } from '../source-faithful/registry.mjs';

const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** returns per security = loadings x factors + idiosyncratic noise; closes from 100. */
function universe({ T = 400, spec, seed = 7, vol = 0.01, range = 0.02, start = 100, drift = 0 }) {
  const r = rng(seed), F = {};
  const factor = (k) => (F[k] ||= Array.from({ length: T }, () => drift + gauss(r) * vol));
  const calendar = Array.from({ length: T }, (_, k) => day(k));
  const securities = spec.map((s) => {
    let c = start; const bars = [];
    for (let t = 0; t < T; t++) {
      if (s.from && t < s.from) continue;
      if (s.gap && t === s.gap) continue;
      if (t > (s.from || 0)) { let ret = 0; for (const [f, w] of Object.entries(s.load)) ret += w * factor(f)[t]; ret += gauss(r) * vol * (s.idio ?? 0.3); c *= 1 + ret; }
      bars.push({ date: calendar[t], open: c, high: c * (1 + range), low: c * (1 - range), close: c, volume: 1e6, rawClose: c, rawVolume: 1e6, splitAdj: 1, dividend: 0 });
    }
    return { id: s.id, bars, terminal: null };
  });
  const benchmark = (() => { let c = 100; return calendar.map((d, t) => { if (t) c *= 1 + factor('M')[t]; return { date: d, open: c, high: c, low: c, close: c, volume: 1 }; }); })();
  return { calendar, securities, benchmark };
}

const RAW = CORRELATION_VARIANTS.find((v) => v.id === 'RAW-126-COMPLETE-70-50');
const RES = CORRELATION_VARIANTS.find((v) => v.id === 'RES-126-COMPLETE-50-30');
const at = (v, over) => Object.freeze({ ...v, ...over });

test('SF3-TUR-CORR-SOURCE: Quelle nennt kein Mass, kein Fenster, keine Schwelle; jede Variante ist Modellannahme', () => {
  assert.deepEqual([...SOURCE_INTENT.notEstablished].slice(0, 3), ['correlation measure', 'observation window and frequency', 'thresholds for closely / loosely']);
  assert.ok(CORRELATION_VARIANTS.length >= 6);
  for (const v of CORRELATION_VARIANTS) { assert.deepEqual(validateVariant(v), [], v.id); assert.equal(v.sourceStatus, 'EQUITY_MODEL_ASSUMPTION'); }
  assert.equal(new Set(CORRELATION_VARIANTS.map((v) => v.id)).size, CORRELATION_VARIANTS.length);
  assert.ok(validateVariant({ ...RAW, sourceStatus: 'SOURCE_EXACT' }).includes('SOURCE_STATUS_MUST_BE_MODEL_ASSUMPTION'));
  assert.ok(validateVariant({ ...RAW, threshold: { kind: 'ABSOLUTE', closely: 0.5, loosely: 0.7 } }).includes('THRESHOLD_ORDER'));
  // die Vertragsregel bleibt quellenoffen (keine automatische Freigabe)
  for (const id of ['SF_TURTLE_S1', 'SF_TURTLE_S2']) {
    const r = CONTRACTS.find((c) => c.strategyId === id).rules.find((x) => x.id === 'TUR-SF-LIMIT-CORR');
    assert.notEqual(r.status, 'SOURCE_EXACT');
  }
});

test('SF3-TUR-CORR-ANCHORS: Monatsende-Anker', () => {
  const cal = ['2020-01-30', '2020-01-31', '2020-02-03', '2020-02-28', '2020-03-02'];
  assert.deepEqual(monthEndAnchors(cal), [1, 3, 4]);
});

test('SF3-TUR-CORR-LINKAGE: Kette A~B, B~C, A!~C: SINGLE verbindet, COMPLETE nicht; Schnitte sind verschachtelt', () => {
  // Distanzen 1 - rho: AB 0.2, BC 0.2, AC 0.6, D weit weg
  const n = 4, d = [[0, 0.2, 0.6, 1.5], [0.2, 0, 0.2, 1.5], [0.6, 0.2, 0, 1.5], [1.5, 1.5, 1.5, 0]];
  const D = () => Float64Array.from(d.flat());
  const single = cutDendrogram(nnChainLinkage(D(), n, 'SINGLE'), n, 0.3);
  assert.deepEqual([...single], [0, 0, 0, 3]);
  const complete = cutDendrogram(nnChainLinkage(D(), n, 'COMPLETE'), n, 0.3);
  assert.equal(complete[0] === complete[2], false);
  assert.equal(complete[1] === complete[0] || complete[1] === complete[2], true);
  const loose = cutDendrogram(nnChainLinkage(D(), n, 'COMPLETE'), n, 0.7);
  assert.deepEqual([...loose], [0, 0, 0, 3]);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (complete[i] === complete[j]) assert.equal(loose[i], loose[j]); // nested
  // average linkage is deterministic and exact on ties
  assert.deepEqual(nnChainLinkage(D(), n, 'AVERAGE'), nnChainLinkage(D(), n, 'AVERAGE'));
});

const SPEC = [
  { id: 'A1', load: { M: 0.3, A: 1 }, idio: 0.2 }, { id: 'A2', load: { M: 0.3, A: 1 }, idio: 0.2 }, { id: 'A3', load: { M: 0.3, A: 1 }, idio: 0.2 },
  { id: 'B1', load: { M: 0.3, B: 1 }, idio: 0.2 }, { id: 'B2', load: { M: 0.3, B: 1 }, idio: 0.2 },
  { id: 'X1', load: { M: 0.3, X: 1 }, idio: 0.2 },
  { id: 'NEW', load: { M: 0.3, A: 1 }, idio: 0.2, from: 330 },
];

test('SF3-TUR-CORR-GROUPS: Faktorgruppen werden gefunden; unbekannt bleibt unbekannt (REPORT_ONLY / POOLED_UNKNOWN)', () => {
  const data = universe({ spec: SPEC });
  const p = createCorrelationGroupProvider(data, RAW, { unknownPolicy: 'REPORT_ONLY' });
  const d = day(380);
  const g = Object.fromEntries(['A1', 'A2', 'A3', 'B1', 'B2', 'X1'].map((id) => [id, p.groupsOf(id, d)]));
  assert.equal(g.A1.closely, g.A2.closely); assert.equal(g.A2.closely, g.A3.closely);
  assert.equal(g.B1.closely, g.B2.closely);
  assert.notEqual(g.A1.closely, g.B1.closely); assert.notEqual(g.X1.closely, g.A1.closely);
  // NEW has fewer than 126 returns at the anchor: UNKNOWN, not independent
  assert.equal(p.groupsOf('NEW', d), null);
  assert.equal(p.lookup('NEW', d).reason, UNKNOWN_REASON.INCOMPLETE_RETURNS);
  assert.equal(p.groupsOf('NEW', day(100)), null);
  assert.equal(p.lookup('A1', day(60)).reason, UNKNOWN_REASON.NO_ANCHOR); // window not yet filled at any anchor
  const pooled = createCorrelationGroupProvider(data, RAW, { unknownPolicy: 'POOLED_UNKNOWN' });
  assert.deepEqual(pooled.groupsOf('NEW', d), { closely: 'UNKNOWN', loosely: 'UNKNOWN' });
  assert.throws(() => createCorrelationGroupProvider(data, RAW, {}), /UNKNOWN_POLICY_REQUIRED/);
  const c = p.conformance({ counts: { correlationGroupMissing: 2 }, correlationLimits: 'ENFORCED_PARTIAL_GROUP_COVERAGE' });
  assert.equal(c.ruleConformance, 'NOT_ESTABLISHED');
  assert.ok(c.reasons.includes('CORRELATION_OPERATIONALISATION_IS_EQUITY_MODEL_ASSUMPTION'));
  assert.ok(c.diagnostics.unknownByReason[UNKNOWN_REASON.INCOMPLETE_RETURNS] >= 1);
});

test('SF3-TUR-CORR-PIT: Gruppen zum Zeitpunkt d aendern sich nicht, wenn Daten nach dem Anker veraendert werden', () => {
  const data = universe({ spec: SPEC });
  const d = day(300), anchorDay = monthEndAnchors(data.calendar).filter((a) => a <= 300).at(-1);
  const before = createCorrelationGroupProvider(data, RAW, { unknownPolicy: 'REPORT_ONLY' });
  const want = SPEC.map((s) => before.groupsOf(s.id, d));
  // future: scramble every bar after the anchor (and swap factor membership)
  const future = { ...data, securities: data.securities.map((s, k) => ({ ...s, bars: s.bars.map((b, t) => (b.date > data.calendar[anchorDay] ? { ...b, close: b.close * (1 + ((k * 7 + t) % 5) / 10) } : b)) })) };
  const after = createCorrelationGroupProvider(future, RAW, { unknownPolicy: 'REPORT_ONLY' });
  assert.deepEqual(SPEC.map((s) => after.groupsOf(s.id, d)), want);
  // a date before the next month-end still uses the old anchor
  assert.equal(after.lookup('A1', d).anchor, data.calendar[anchorDay]);
});

test('SF3-TUR-CORR-RESIDUAL: Marktgleichlauf allein bildet unter MARKET_RESIDUAL keine Gruppe', () => {
  const spec = [{ id: 'P', load: { M: 1 }, idio: 0.3 }, { id: 'Q', load: { M: 1 }, idio: 0.3 }, { id: 'R1', load: { M: 1, R: 0.8 }, idio: 0.3 }, { id: 'R2', load: { M: 1, R: 0.8 }, idio: 0.3 }];
  const data = universe({ spec, seed: 11 });
  const d = day(390);
  const raw = createCorrelationGroupProvider(data, RAW, { unknownPolicy: 'REPORT_ONLY' });
  assert.equal(raw.groupsOf('P', d).closely, raw.groupsOf('Q', d).closely); // raw: market makes them "closely"
  const res = createCorrelationGroupProvider(data, RES, { unknownPolicy: 'REPORT_ONLY' });
  assert.notEqual(res.groupsOf('P', d).closely, res.groupsOf('Q', d).closely);
  assert.equal(res.groupsOf('R1', d).closely, res.groupsOf('R2', d).closely);
  assert.throws(() => createCorrelationGroupProvider({ ...data, benchmark: null }, RES, { unknownPolicy: 'REPORT_ONLY' }), /BENCHMARK_REQUIRED/);
});

test('SF3-TUR-CORR-QUANTILE: Paar-Quantil-Schwelle haelt Gruppen bei marktweitem Gleichlauf klein', () => {
  const spec = Array.from({ length: 12 }, (_, k) => ({ id: `S${String(k).padStart(2, '0')}`, load: { M: 1, ...(k < 2 ? { Z: 1 } : {}) }, idio: 0.25 }));
  const data = universe({ spec, seed: 3 });
  const d = day(390);
  const abs = createCorrelationGroupProvider(data, at(RAW, { id: 'T-ABS' }), { unknownPolicy: 'REPORT_ONLY' });
  abs.groupsOf('S00', d);
  const sAbs = abs.anchorStats().at(-1);
  assert.ok(sAbs.loosely.largest >= 10, 'absolute threshold merges a market-wide group');
  const qv = at(CORRELATION_VARIANTS.find((v) => v.threshold.kind === 'PAIR_QUANTILE'), { threshold: { kind: 'PAIR_QUANTILE', closely: 0.02, loosely: 0.05 } });
  const qp = createCorrelationGroupProvider(data, qv, { unknownPolicy: 'REPORT_ONLY' });
  assert.equal(qp.groupsOf('S00', d).closely, qp.groupsOf('S01', d).closely);
  const sQ = qp.anchorStats().at(-1);
  assert.ok(sQ.closely.largest <= 3);
  assert.ok(sQ.thresholds.closely > sQ.pairs.meanCorrelation);
});

/** trending, strongly co-moving names: breakouts arrive together */
function trendBook(n, { seed = 5, correlated = true } = {}) {
  const spec = Array.from({ length: n }, (_, k) => ({ id: `T${String(k).padStart(2, '0')}`, load: correlated ? { M: 1 } : { [`F${k}`]: 1 }, idio: correlated ? 0.15 : 1 }));
  return universe({ spec, seed, T: 420, vol: 0.012, range: 0.08, start: 50, drift: 0.004 });
}

test('SF3-TUR-CORR-ENGINE: unveraenderte Engine setzt LIMIT6 mit Korrelationsgruppen durch; ohne Gruppen bitgleich', () => {
  const data = trendBook(14);
  const opts = { system: 'S2', initialCapital: 1e6, from: day(260), slippageBps: 0, commissionBps: 0 };
  const ref1 = runTurtle(data, opts), ref2 = runTurtle(data, opts);
  assert.deepEqual(ref1.ledger, ref2.ledger);
  assert.equal(ref1.correlationLimits, 'NOT_EVALUATED_NO_PIT_GROUPS');
  assert.equal(TURTLE_VERSION, 'sf-turtle-1.2.0'); // the engine is not changed by this research component
  const p = createCorrelationGroupProvider(data, RAW, { unknownPolicy: 'REPORT_ONLY' });
  const withG = runTurtle(data, { ...opts, groupsOf: p.groupsOf });
  assert.ok(withG.counts.rejectCorrelationLimit6 > 0, JSON.stringify(withG.counts));
  assert.ok(withG.reconciliation.pass);
  const rep = concentrationReport(withG, p, { calendar: data.calendar, from: day(260) });
  assert.ok(rep.unitsInLargestCloselyGroup.max <= 6);
  assert.equal(rep.sessionsAboveCap.closely6, 0);
  const refRep = concentrationReport(ref1, p, { calendar: data.calendar, from: day(260) });
  assert.ok(refRep.unitsInLargestCloselyGroup.max > 6, 'without the limit the book concentrates in one correlated group');
  assert.ok(refRep.unitWeightedMeanPairCorrelation.p50 > 0.5);
});

test('SF3-TUR-CORR-ENGINE-INDEPENDENT: unkorrelierte Titel werden nicht begrenzt', () => {
  const data = trendBook(10, { correlated: false, seed: 9 });
  const opts = { system: 'S2', initialCapital: 1e6, from: day(260), slippageBps: 0, commissionBps: 0 };
  const p = createCorrelationGroupProvider(data, RAW, { unknownPolicy: 'REPORT_ONLY' });
  const r = runTurtle(data, { ...opts, groupsOf: p.groupsOf });
  assert.ok(r.counts.entries + r.counts.adds > 6, JSON.stringify(r.counts));
  assert.equal(r.counts.rejectCorrelationLimit6, 0);
  assert.equal(r.counts.rejectCorrelationLimit10, 0);
});

test('SF3-TUR-CORR-VERSION: Komponente ist versioniert und deterministisch', () => {
  assert.match(TURTLE_CORR_RESEARCH_VERSION, /^sf3-turtle-corr-\d+\.\d+\.\d+$/);
  const data = universe({ spec: SPEC });
  const a = createCorrelationGroupProvider(data, RAW, { unknownPolicy: 'REPORT_ONLY' }), b = createCorrelationGroupProvider(data, RAW, { unknownPolicy: 'REPORT_ONLY' });
  for (const s of SPEC) assert.deepEqual(a.groupsOf(s.id, day(399)), b.groupsOf(s.id, day(399)));
  assert.deepEqual(a.anchorStats(), b.anchorStats());
});

test('SF3-TUR-CORR-SHARED-ANCHORS: geteilter Anker-Cache liefert dieselben Gruppen fuer beide Unknown-Politiken', () => {
  const data = universe({ spec: SPEC }), cache = new Map();
  const a = createCorrelationGroupProvider(data, RAW, { unknownPolicy: 'REPORT_ONLY', anchorCache: cache });
  const b = createCorrelationGroupProvider(data, RAW, { unknownPolicy: 'POOLED_UNKNOWN', anchorCache: cache });
  const d = day(380);
  assert.deepEqual(a.groupsOf('A1', d), b.groupsOf('A1', d));
  assert.equal(a.groupsOf('NEW', d), null);
  assert.deepEqual(b.groupsOf('NEW', d), { closely: 'UNKNOWN', loosely: 'UNKNOWN' });
  assert.ok(cache.size >= 1);
  // a cache of another variant is refused (re-review L-a)
  assert.throws(() => createCorrelationGroupProvider(data, RES, { unknownPolicy: 'REPORT_ONLY', anchorCache: cache }), /ANCHOR_CACHE_MISMATCH/);
});
