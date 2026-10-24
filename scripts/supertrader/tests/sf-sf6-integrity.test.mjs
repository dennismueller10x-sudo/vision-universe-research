// Supertrader 6.0 – V4-D1-Eingrenzung (integrity/discontinuity.mjs, research/run-sf6-integrity.mjs). Synthetisch; der echte
// Lauf braucht den Snapshot (Workflow-Modus sf6-integrity).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../validation/lib.mjs';
import { datasetFromPit } from '../source-faithful/runner/snapshot-input.mjs';
import { runResearchLifecycle, prepareAll } from '../source-faithful/research/lifecycle-engine.mjs';
import { SF5_LIFECYCLES } from '../source-faithful/research/sf5-lifecycles.mjs';
import { DQ_POLICIES, sessionRatio, flagDiscontinuities, quarantineSecurity, quarantineDataset, compareTrades, MIN_SEGMENT_BARS } from '../source-faithful/integrity/discontinuity.mjs';
import { integrityPart, INTEGRITY_KEYS } from '../source-faithful/research/run-sf6-integrity.mjs';

const K5 = DQ_POLICIES['DQ-K5-BOOK'], K5P = DQ_POLICIES['DQ-K5-PRIOR'], K3 = DQ_POLICIES['DQ-K3-BOOK'];
const day = (k) => new Date(Date.UTC(2016, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const rawBar = (date, c, extra = {}) => ({ date, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6, adjClose: null, dividend: 0, splitFactor: 1, ...extra });
/** Research security from raw bars through the production adjustment (snapshot-input). */
const sec = (id, raw, endCause = 'ACTIVE') => datasetFromPit({ calendar: raw.map((b) => b.date), spyAdj: L.adjustSeries(raw), spyTR: [], segs: [{ id, raw, endCause, delisted: endCause !== 'ACTIVE', survivor: true }] }).securities[0];
const flatRaw = (n, c = 10) => Array.from({ length: n }, (_, k) => rawBar(day(k), c));

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
  return datasetFromPit({ segs, calendar, spyAdj, spyTR });
}
const W = { from: day(0), to: day(699), dataEnd: day(699) };

test('SF6-DQ-RATIO: erklaerter Split ergibt Relativ ~1, nicht erklaerter Sprung wird markiert (beide Richtungen, K5/K3)', () => {
  const declared = flatRaw(40); for (let k = 20; k < 40; k++) declared[k] = rawBar(day(k), 100, k === 20 ? { splitFactor: 0.1 } : {});
  const d = sec('D', declared);
  assert.ok(Math.abs(sessionRatio(d.bars, 20) - 1) < 1e-12);
  assert.deepEqual(flagDiscontinuities(d.bars, 5), []);
  const up = flatRaw(40); for (let k = 20; k < 40; k++) up[k] = rawBar(day(k), 100);
  assert.deepEqual(flagDiscontinuities(sec('U', up).bars, 5), [20]);
  const down4 = flatRaw(40); for (let k = 20; k < 40; k++) down4[k] = rawBar(day(k), 2.5);
  assert.deepEqual(flagDiscontinuities(sec('X', down4).bars, 5), [], '4:1 nach unten liegt unter K5');
  assert.deepEqual(flagDiscontinuities(sec('X', down4).bars, 3), [20], '... aber in der K3-Sensitivitaet');
  const half = flatRaw(40); for (let k = 20; k < 40; k++) half[k] = rawBar(day(k), 5);
  assert.deepEqual(flagDiscontinuities(sec('H', half).bars, 3), [], 'ein -50-%-Tag bleibt unmarkiert');
  const div = flatRaw(40); for (let k = 20; k < 40; k++) div[k] = rawBar(day(k), 1.5, k === 20 ? { dividend: 8.5 } : {});
  assert.deepEqual(flagDiscontinuities(sec('V', div).bars, 5), [], 'Sonderdividende ist im Relativ enthalten');
});

test('SF6-DQ-WRONG-DAY: Split-Faktor am falschen Tag ergibt zwei Markierungen (Residuum), Ausreisser ebenfalls', () => {
  const raw = flatRaw(70); raw[30] = rawBar(day(30), 10, { splitFactor: 0.1 }); for (let k = 31; k < 70; k++) raw[k] = rawBar(day(k), 100);
  const s = sec('W', raw);
  assert.deepEqual(flagDiscontinuities(s.bars, 5), [30, 31]);
  assert.equal(quarantineSecurity(s, K5).flags[0].kind, 'DECLARED_SPLIT_RESIDUAL');
  const spike = flatRaw(70); spike[30] = rawBar(day(30), 80);
  const q = quarantineSecurity(sec('X', spike), K5P);
  assert.deepEqual(q.flags.map((f) => f.i), [30, 31]);
  assert.equal(q.flags[0].exPostRevertsNextSession, true);
  assert.equal(q.pieces.length, 2, 'PRIOR: das Einzelbalken-Stueck des Ausreissers faellt weg');
  assert.equal(q.droppedBars, 1);
});

test('SF6-DQ-CUT: BOOK endet mit dem markierten Balken, PRIOR davor; IDs, Datenende, Delisting bleibt Delisting (H2)', () => {
  const raw = flatRaw(200); for (let k = 100; k < 200; k++) raw[k] = rawBar(day(k), 100);
  const s = sec('tiingo:NYSE:ABC:2010-01-01#1', raw, 'LISTING_INACTIVE'); s.fund = { eps: [] };
  const b = quarantineSecurity(s, K5), p = quarantineSecurity(s, K5P);
  assert.equal(b.pieces[0].bars.at(-1).date, day(100), 'BOOK: der Sprungtag gehoert zum frueheren Stueck');
  assert.equal(b.pieces[1].bars[0].date, day(100), '... und beginnt das spaetere');
  assert.equal(p.pieces[0].bars.at(-1).date, day(99), 'PRIOR: endet am Vortag');
  for (const q of [b, p]) {
    assert.equal(q.pieces[0].id, s.id);
    assert.equal(q.pieces[1].id, `${s.id}#dq1`);
    assert.equal(q.pieces[1].id.split('#')[0], 'tiingo:NYSE:ABC:2010-01-01');
    assert.equal(q.pieces[0].terminal.cause, 'DATA_GAP');
    assert.equal(q.pieces[1].terminal.cause, 'LISTING_INACTIVE');
    assert.deepEqual(q.pieces[1].fund, s.fund);
  }
  // H2: the final piece is too short -> the last KEPT piece keeps the delisting (distress) instead of a data gap
  const late = flatRaw(100); for (let k = 90; k < 100; k++) late[k] = rawBar(day(k), 1.5);
  const d = sec('tiingo:NYSE:DEL:2010-01-01', late, 'LISTING_INACTIVE');
  const ql = quarantineSecurity(d, K5);
  assert.equal(ql.pieces.length, 1); assert.ok(10 < MIN_SEGMENT_BARS);
  assert.equal(ql.pieces[0].terminal.cause, 'LISTING_INACTIVE');
  assert.equal(ql.pieces[0].terminal.distress, d.terminal.distress);
  assert.equal(ql.pieces[0].terminal.date, ql.pieces[0].bars.at(-1).date);
  const clean = sec('Z', flatRaw(100));
  assert.equal(quarantineSecurity(clean, K3).pieces[0], clean, 'ohne Markierung unveraendert (identisches Objekt)');
});

test('SF6-DQ-LEVELS (M1): ein Schnitt veraendert keinen bereinigten Kurs ausserhalb der Markierung', () => {
  const raw = flatRaw(200, 10); raw[150] = rawBar(day(150), 5, { splitFactor: 2 }); for (let k = 151; k < 200; k++) raw[k] = rawBar(day(k), 5);
  for (let k = 80; k < 200; k++) for (const f of ['open', 'high', 'low', 'close']) raw[k][f] *= 6; // undeclared 6x at bar 80
  const s = sec('L', raw), q = quarantineSecurity(s, K5);
  assert.equal(q.pieces[0].bars[0].close, s.bars[0].close, 'der erklaerte Split nach dem Schnitt bleibt in Stueck 0 wirksam');
  assert.equal(q.pieces[1].bars.at(-1).close, s.bars.at(-1).close);
});

test('SF6-DQ-SETTLE (H1): BOOK verbucht einen gehaltenen Sprung wie BASE, PRIOR rechnet zum Vortagesschluss ab', () => {
  // flat 20, a buyable gap-up at 260, then a genuine -85 % crash at 300 while the BGU position is held
  const raw = []; for (let k = 0; k < 400; k++) { const c = k < 260 ? 20 + (k % 7) * 0.05 : k < 300 ? 26 + (k - 260) * 0.05 : 4; raw.push(rawBar(day(k), c, { volume: k === 260 ? 5e6 : 1e6, open: k === 260 ? 24 : c, low: k === 260 ? 23.5 : c * 0.99 })); }
  const ds = datasetFromPit({ calendar: raw.map((b) => b.date), spyAdj: L.adjustSeries(raw), spyTR: [], segs: [{ id: 'G', raw, endCause: 'ACTIVE', survivor: true }] });
  const lc = SF5_LIFECYCLES.find((l) => l.key === 'BUYABLE_GAP_UP'), cfg = lc.variants.find((v) => v.id === 'REF').config;
  const run = (d) => runResearchLifecycle(d, { adapter: lc.adapter, config: { ...cfg, contextProxy: 'NONE' }, prepared: prepareAll(d, lc.adapter, { ...cfg, contextProxy: 'NONE' }), from: day(0), to: day(399) });
  const base = run(ds), book = run(quarantineDataset(ds, K5).ds), prior = run(quarantineDataset(ds, K5P).ds);
  assert.equal(base.trades.length, 1, 'die Synthese erzeugt genau einen BGU-Trade');
  const loss = (r) => r.trades[0].pnl;
  assert.ok(loss(base) < -1000, 'BASE verbucht den Absturz');
  assert.ok(Math.abs(loss(book) - loss(base)) / Math.abs(loss(base)) < 0.25, 'BOOK verbucht ihn ebenfalls');
  assert.ok(loss(prior) > loss(base) / 4, 'PRIOR rechnet vor dem Absturz ab (Sensitivitaet, nach oben verzerrt)');
});

test('SF6-DQ-PIT: Markierungen eines Praefix sind die Markierungen der Gesamtreihe bis dahin (kausal)', () => {
  const ds = pit(6, 400, [{ seg: 1, at: 150, factor: 12 }, { seg: 2, at: 220, factor: 1 / 8 }, { seg: 3, at: 90, factor: 10, declared: true }]);
  for (const s of ds.securities) for (const k of [3, 5]) {
    const full = flagDiscontinuities(s.bars, k);
    for (const m of [60, 151, 221, 300]) assert.deepEqual(flagDiscontinuities(s.bars.slice(0, m), k), full.filter((i) => i < m));
  }
  const { census } = quarantineDataset(ds, K5);
  assert.equal(census.flags, 2); assert.deepEqual(census.byDirection, { UP: 1, DOWN: 1 }); assert.equal(census.securitiesFlagged, 2);
  assert.equal(census.byKind.NO_DECLARED_EVENT, 2, 'der erklaerte Split wird nicht markiert');
});

test('SF6-DQ-COMPARE: Abgleich ordnet jeden Basistrade genau einer Klasse zu; Exposition ueber Rueckblick und Haltedauer', () => {
  const t = (id, e, x, r = 'STOP', sh = 10) => ({ id, entryDate: e, exitDate: x, exitReason: r, shares: sh, status: x ? 'CLOSED' : 'OPEN_AT_DATA_END' });
  const base = [t('A', '2017-01-10', '2017-02-01'), t('A', '2018-06-01', '2018-07-01'), t('B', '2017-03-01', '2017-04-01'), t('C', '2017-05-01', null)];
  const q = [t('A#dq1', '2018-06-01', '2018-07-01'), t('B', '2017-03-01', '2017-04-02'), t('D', '2017-08-01', '2017-09-01')];
  const events = [{ securityId: 'A', date: '2018-03-01' }, { securityId: 'C#1', date: '2018-01-01' }];
  const c = compareTrades(base, q, events, { dataEnd: '2019-01-01' }).public;
  assert.equal(c.unchanged, 1); assert.equal(c.changed, 1); assert.equal(c.knockOnChanged, 1);
  assert.equal(c.removed, 2); assert.equal(c.added, 1);
  assert.equal(c.directlyExposed, 2); assert.equal(c.heldAcrossFlag, 1, 'nur C haelt ueber eine Markierung');
  assert.equal(c.directlyExposedRemoved, 1); assert.equal(c.knockOnRemoved, 1); assert.equal(c.exposedOpenAtDataEnd, 1);
  assert.equal(c.unchanged + c.changed + c.removed, c.baseTrades);
});

const METRIC_KEYS = /"(cagr|sharpe|sortino|winRate|profitFactor|expectancy|pnl|equity|returnPct|maxDrawdown|ratio)"/;

test('SF6-INTEGRITY-CLEAN: ohne Markierung sind alle Referenzen in allen Arten trade-genau gleich BASE; oeffentlich nur Zaehlungen', () => {
  const r = integrityPart(pit(), W);
  assert.deepEqual(Object.keys(r.pub.lifecycles).sort(), [...INTEGRITY_KEYS].sort());
  for (const pid of Object.keys(DQ_POLICIES)) {
    assert.equal(r.pub.census[pid].flags, 0);
    for (const k of INTEGRITY_KEYS) {
      const x = r.pub.lifecycles[k];
      assert.equal(x[pid].tradesSha256, x.BASE.tradesSha256, `${k} ${pid}`);
      assert.equal(x[pid].ledgerSha256, x.BASE.ledgerSha256, `${k} ${pid}`);
      assert.equal(x[pid].comparisonWithBase.unchanged, x.BASE.trades);
    }
  }
  assert.ok(Object.values(r.pub.lifecycles).some((x) => x.BASE.trades > 0), 'die Synthese erzeugt Trades');
  assert.doesNotMatch(JSON.stringify(r.pub), METRIC_KEYS);
  assert.doesNotMatch(JSON.stringify(r.pub), /tiingo:/, 'keine Wertpapier-IDs oeffentlich');
  assert.ok(r.sealed.lifecycles.TURTLE_S1.BASE.metrics.cagr !== undefined, 'Kennzahlen nur versiegelt');
});

test('SF6-INTEGRITY-JUMP: nach der Quarantaene ueberspannt kein Rueckblick den markierten Tag; Abgleich vollstaendig', () => {
  const ds = pit(24, 700, [{ seg: 2, at: 400, factor: 10 }, { seg: 5, at: 300, factor: 1 / 6 }, { seg: 9, at: 500, factor: 15 }]);
  const r = integrityPart(ds, { ...W, policies: ['DQ-K5-BOOK', 'DQ-K5-PRIOR'] });
  assert.equal(r.pub.census['DQ-K5-BOOK'].flags, 3);
  for (const pid of ['DQ-K5-BOOK', 'DQ-K5-PRIOR']) {
    const q = quarantineDataset(ds, DQ_POLICIES[pid]);
    for (const e of r.sealed.events[pid]) for (const s of q.ds.securities.filter((x) => x.id.split('#')[0] === e.securityId.split('#')[0])) {
      const i = s.bars.findIndex((b) => b.date === e.date);
      assert.ok(i < 0 || i === 0 || i === s.bars.length - 1, `${pid} ${s.id}: ${e.date} liegt nur am Rand eines Stuecks`);
    }
    for (const k of INTEGRITY_KEYS) {
      const c = r.pub.lifecycles[k][pid].comparisonWithBase;
      assert.equal(c.unchanged + c.changed + c.removed, c.baseTrades, k);
      assert.ok(r.pub.lifecycles[k][pid].reconciliation, k);
    }
  }
});

test('SF6-DQ-PROVENANCE (Quellentreue-Review HIGH): Herkunft der Schwellen ehrlich, keine Quarantaene ist eine Korrektur', () => {
  assert.match(DQ_POLICIES['DQ-K5-BOOK'].origin, /post hoc/, 'k = 5 wurde in #722 nachtraeglich gesetzt, nicht vorregistriert');
  assert.doesNotMatch(DQ_POLICIES['DQ-K5-BOOK'].origin, /pre-registered/);
  assert.match(DQ_POLICIES['DQ-K3-BOOK'].origin, /#758/);
  for (const p of Object.values(DQ_POLICIES)) assert.notEqual(p.role, 'CORRECTION');
  const c = quarantineDataset(pit(4, 200), K5).census;
  assert.equal(c.correction, 'NONE'); assert.match(c.claim, /NOT_A_DEFECT_FINDING/); assert.equal(c.certification, 'DIAGNOSTIC_NOT_CERTIFIED');
});
