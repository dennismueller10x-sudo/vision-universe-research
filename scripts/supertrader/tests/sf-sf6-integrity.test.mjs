// Supertrader 6.0 – V4-D1-Eingrenzung (integrity/discontinuity.mjs, research/run-sf6-integrity.mjs). Synthetisch; der echte
// Lauf braucht den Snapshot (Workflow-Modus sf6-integrity).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../validation/lib.mjs';
import { datasetFromPit } from '../source-faithful/runner/snapshot-input.mjs';
import { DQ_POLICIES, sessionRatio, flagDiscontinuities, quarantineSegment, quarantineSegments, compareTrades, MIN_SEGMENT_BARS } from '../source-faithful/integrity/discontinuity.mjs';
import { integrityPart, INTEGRITY_KEYS } from '../source-faithful/research/run-sf6-integrity.mjs';

const K5 = DQ_POLICIES['DQ-K5'], K3 = DQ_POLICIES['DQ-K3'];
const day = (k) => new Date(Date.UTC(2016, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const bar = (date, c, extra = {}) => ({ date, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6, adjClose: null, dividend: 0, splitFactor: 1, ...extra });
const flat = (n, c = 10) => Array.from({ length: n }, (_, k) => bar(day(k), c));

/** Raw snapshot segments: random walks; jumps { seg, at, factor, declared } scale every raw price from `at` on. */
function pit(n = 24, len = 700, jumps = []) {
  const segs = [];
  for (let s = 0; s < n; s++) {
    const r = rng(s + 7); let c = 20; const drift = (r() - 0.3) * 0.004, raw = [];
    for (let k = 0; k < len; k++) {
      const gap = r() < 0.01 ? 0.08 : 0, o = c * (1 + gap + 0.01 * (r() - 0.5));
      c = o * (1 + drift + 0.03 * (r() - 0.5));
      raw.push({ date: day(k), open: o, high: Math.max(o, c) * (1 + 0.012 * r()), low: Math.min(o, c) * (1 - 0.012 * r()), close: c, volume: 1e6 * (0.5 + r()) * (gap ? 3 : 1), adjClose: null, dividend: 0, splitFactor: 1 });
    }
    for (const j of jumps.filter((x) => x.seg === s)) {
      for (let k = j.at; k < len; k++) for (const f of ['open', 'high', 'low', 'close']) raw[k][f] *= j.factor;
      if (j.declared) raw[j.at].splitFactor = 1 / j.factor;
    }
    segs.push({ id: `tiingo:NYSE:S${String(s).padStart(3, '0')}:2010-01-01`, raw, delisted: false, endCause: 'ACTIVE', survivor: true, cls: 'EQUITY_COMMON' });
  }
  const spyRaw = segs[0].raw.map((b) => ({ ...b }));
  const spyAdj = L.adjustSeries(spyRaw), calendar = spyRaw.map((b) => b.date);
  let v = 1; const spyTR = spyAdj.date.map((d, i) => { if (i > 0) v *= 1 + spyAdj.tr[i]; return { date: d, value: v }; });
  return { segs, calendar, spyAdj, spyTR };
}
const makeDs = (p) => (segs) => datasetFromPit({ ...p, segs });
const W = { from: day(0), to: day(699), dataEnd: day(699) };

test('SF6-DQ-RATIO: erklaerter Split ergibt Relativ ~1, nicht erklaerter Sprung wird markiert (beide Richtungen, K5/K3)', () => {
  const declared = flat(40); for (let k = 20; k < 40; k++) declared[k] = bar(day(k), 100, k === 20 ? { splitFactor: 0.1 } : {});
  assert.ok(Math.abs(sessionRatio(declared, 20) - 1) < 1e-12);
  assert.deepEqual(flagDiscontinuities(declared, 5), []);
  const undeclaredUp = flat(40); for (let k = 20; k < 40; k++) undeclaredUp[k] = bar(day(k), 100);
  assert.deepEqual(flagDiscontinuities(undeclaredUp, 5), [20]);
  const down4 = flat(40); for (let k = 20; k < 40; k++) down4[k] = bar(day(k), 2.5);
  assert.deepEqual(flagDiscontinuities(down4, 5), [], '4:1 nach unten liegt unter K5');
  assert.deepEqual(flagDiscontinuities(down4, 3), [20], '... aber in der K3-Sensitivitaet');
  const half = flat(40); for (let k = 20; k < 40; k++) half[k] = bar(day(k), 5);
  assert.deepEqual(flagDiscontinuities(half, 3), [], 'ein -50-%-Tag bleibt unmarkiert');
  const div = flat(40); for (let k = 20; k < 40; k++) div[k] = bar(day(k), 1.5, k === 20 ? { dividend: 8.5 } : {});
  assert.deepEqual(flagDiscontinuities(div, 5), [], 'Sonderdividende ist im Relativ enthalten');
});

test('SF6-DQ-WRONG-DAY: Split-Faktor am falschen Tag ergibt zwei Markierungen (Residuum), Ausreisser ebenfalls', () => {
  const raw = flat(60); raw[30] = bar(day(30), 10, { splitFactor: 0.1 }); for (let k = 31; k < 60; k++) raw[k] = bar(day(k), 100);
  assert.deepEqual(flagDiscontinuities(raw, 5), [30, 31]);
  const spike = flat(70); spike[30] = bar(day(30), 80);
  const q = quarantineSegment({ id: 'X', raw: spike, endCause: 'ACTIVE', delisted: false }, K5);
  assert.deepEqual(q.flags.map((f) => f.i), [30, 31]);
  assert.equal(q.flags[0].exPostRevertsNextSession, true);
  assert.equal(q.pieces.length, 2, 'das Einzelbalken-Stueck dazwischen faellt weg');
  assert.equal(q.droppedBars, 1);
});

test('SF6-DQ-CUT: Schnitt vor dem markierten Tag, erste ID bleibt, spaetere #dq<n>, Ende als Datenereignis, kurze Stuecke fallen weg', () => {
  const raw = flat(200); for (let k = 100; k < 200; k++) raw[k] = bar(day(k), 100);
  const seg = { id: 'tiingo:NYSE:ABC:2010-01-01#1', raw, endCause: 'LISTING_INACTIVE', delisted: true, survivor: false, fund: { eps: [] } };
  const q = quarantineSegment(seg, K5);
  assert.equal(q.pieces.length, 2);
  assert.equal(q.pieces[0].id, seg.id);
  assert.equal(q.pieces[1].id, `${seg.id}#dq1`);
  assert.equal(q.pieces[1].id.split('#')[0], 'tiingo:NYSE:ABC:2010-01-01', 'Listing-ID fuer SEC/Delisting bleibt lesbar');
  assert.equal(q.pieces[0].endCause, 'DATA_GAP'); assert.equal(q.pieces[0].delisted, true); assert.equal(q.pieces[0].dataQuarantine.cutBefore, day(100));
  assert.equal(q.pieces[1].endCause, 'LISTING_INACTIVE', 'das letzte Stueck behaelt die Endursache');
  assert.deepEqual(q.pieces[1].fund, seg.fund);
  assert.equal(q.pieces[0].raw.length + q.pieces[1].raw.length, 200);
  const late = flat(120); for (let k = 100; k < 120; k++) late[k] = bar(day(k), 100);
  const ql = quarantineSegment({ id: 'Y', raw: late, endCause: 'ACTIVE', delisted: false }, K5);
  assert.equal(ql.pieces.length, 1); assert.equal(ql.droppedBars, 20); assert.ok(20 < MIN_SEGMENT_BARS);
  assert.equal(ql.pieces[0].endCause, 'DATA_GAP', 'der verworfene Rest macht das erste Stueck zum Datenende');
  const clean = { id: 'Z', raw: flat(100), endCause: 'ACTIVE', delisted: false };
  assert.equal(quarantineSegment(clean, K3).pieces[0], clean, 'ohne Markierung unveraendert (identisches Objekt)');
});

test('SF6-DQ-PIT: Markierungen eines Praefix sind die Markierungen der Gesamtreihe bis dahin (kausal)', () => {
  const p = pit(6, 400, [{ seg: 1, at: 150, factor: 12 }, { seg: 2, at: 220, factor: 1 / 8 }, { seg: 3, at: 90, factor: 10, declared: true }]);
  for (const s of p.segs) for (const k of [3, 5]) {
    const full = flagDiscontinuities(s.raw, k);
    for (const m of [60, 151, 221, 300]) assert.deepEqual(flagDiscontinuities(s.raw.slice(0, m), k), full.filter((i) => i < m));
  }
  const { census } = quarantineSegments(p.segs, K5);
  assert.equal(census.flags, 2); assert.deepEqual(census.byDirection, { UP: 1, DOWN: 1 }); assert.equal(census.segmentsFlagged, 2);
  assert.equal(census.byKind.NO_DECLARED_EVENT, 2, 'der erklaerte Split wird nicht markiert');
});

test('SF6-DQ-COMPARE: Abgleich ordnet jeden Basistrade genau einer Klasse zu; Exposition ueber Rueckblick und Haltedauer', () => {
  const t = (id, e, x, r = 'STOP', sh = 10) => ({ id, entryDate: e, exitDate: x, exitReason: r, shares: sh, status: x ? 'CLOSED' : 'OPEN_AT_DATA_END' });
  const base = [t('A', '2017-01-10', '2017-02-01'), t('A', '2018-06-01', '2018-07-01'), t('B', '2017-03-01', '2017-04-01'), t('C', '2017-05-01', null)];
  const q = [t('A#dq1', '2018-06-01', '2018-07-01'), t('B', '2017-03-01', '2017-04-02'), t('D', '2017-08-01', '2017-09-01')];
  const events = [{ segmentId: 'A', date: '2018-03-01' }, { segmentId: 'C#1', date: '2018-01-01' }];
  const c = compareTrades(base, q, events, { dataEnd: '2019-01-01' }).public;
  assert.equal(c.unchanged, 1, 'A 2018 bleibt (ID mit #dq auf die Listing-ID abgebildet)');
  assert.equal(c.changed, 1); assert.equal(c.knockOnChanged, 1);
  assert.equal(c.removed, 2); assert.equal(c.added, 1);
  assert.equal(c.directlyExposed, 2, 'A 2018 (Rueckblick) und C (offen bis Datenende)');
  assert.equal(c.directlyExposedRemoved, 1); assert.equal(c.knockOnRemoved, 1); assert.equal(c.exposedOpenAtDataEnd, 1);
  assert.equal(c.unchanged + c.changed + c.removed, c.baseTrades);
});

const METRIC_KEYS = /"(cagr|sharpe|sortino|winRate|profitFactor|expectancy|pnl|equity|returnPct|maxDrawdown|ratio)"/;

test('SF6-INTEGRITY-CLEAN: ohne Markierung sind alle Referenzen unter DQ-K5/K3 trade-genau gleich BASE; oeffentlich nur Zaehlungen', () => {
  const p = pit();
  const r = integrityPart(p.segs, makeDs(p), W);
  assert.deepEqual(Object.keys(r.pub.lifecycles).sort(), [...INTEGRITY_KEYS].sort());
  for (const pid of ['DQ-K5', 'DQ-K3']) {
    assert.equal(r.pub.census[pid].flags, 0);
    for (const k of INTEGRITY_KEYS) {
      const x = r.pub.lifecycles[k];
      assert.equal(x[pid].tradesSha256, x.BASE.tradesSha256, `${k} ${pid}`);
      assert.equal(x[pid].ledgerSha256, x.BASE.ledgerSha256, `${k} ${pid}`);
      assert.equal(x[pid].comparisonWithBase.unchanged, x.BASE.trades);
      assert.ok(x[pid].reconciliation);
    }
  }
  assert.ok(Object.values(r.pub.lifecycles).some((x) => x.BASE.trades > 0), 'die Synthese erzeugt Trades');
  assert.doesNotMatch(JSON.stringify(r.pub), METRIC_KEYS);
  assert.doesNotMatch(JSON.stringify(r.pub), /tiingo:/, 'keine Segment-IDs oeffentlich');
  assert.ok(r.sealed.lifecycles.TURTLE_S1.BASE.metrics.cagr !== undefined, 'Kennzahlen nur versiegelt');
});

test('SF6-INTEGRITY-JUMP: nach der Quarantaene ueberspannt kein Trade und kein Rueckblick den markierten Tag', () => {
  const jumps = [{ seg: 2, at: 400, factor: 10 }, { seg: 5, at: 300, factor: 1 / 6 }, { seg: 9, at: 500, factor: 15 }];
  const p = pit(24, 700, jumps);
  const r = integrityPart(p.segs, makeDs(p), { ...W, policies: ['DQ-K5'] });
  assert.equal(r.pub.census['DQ-K5'].flags, 3);
  const ev = r.sealed.events['DQ-K5'];
  assert.equal(ev.length, 3);
  // the quarantined dataset: no security piece contains both sides of a flagged session
  const q = quarantineSegments(p.segs, DQ_POLICIES['DQ-K5']);
  for (const e of ev) for (const s of q.segs.filter((x) => x.id.split('#')[0] === e.segmentId.split('#')[0])) {
    const ds = s.raw.map((b) => b.date);
    assert.ok(!(ds[0] < e.date && ds.at(-1) >= e.date), `${s.id} ueberspannt ${e.date}`);
  }
  for (const k of INTEGRITY_KEYS) {
    const c = r.pub.lifecycles[k]['DQ-K5'].comparisonWithBase;
    assert.equal(c.unchanged + c.changed + c.removed, c.baseTrades, k);
    assert.ok(r.pub.lifecycles[k]['DQ-K5'].reconciliation, k);
  }
});
