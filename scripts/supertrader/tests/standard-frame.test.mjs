// Standardmessrahmen (Portfolio Triage): nur synthetische Daten, keine Produktionsdaten, kein Netz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  classifySignalEdge, classifyPortfolioVsSpy, classifyDrawdownVsSpy, classifyExposure, classifyOverlap, classifyReturnCorrelation, regimeConsistency,
  publicRow, formatPublic, enumId, jaccard, sharedShare, pearson, pearsonOnCommon, isoWeekKey, entryKeys, overlapStats, dailyReturnMap, excessMap,
  buildRegimes, segmentTags, segmentSignal, entryRecord, signalQuality, portfolioMetrics, methodClasses, pairClasses, SEGMENTS, HORIZONS, THRESHOLDS,
  drawdownMap, drawdownOverlap,
} from '../validation/standard-frame.mjs';
import { exposureStats } from '../validation/audit-r14.mjs';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('SF1 signalEdge63: Schwellenraender und UNKNOWN', () => {
  const ok = { n: 30, clusters: 12 };
  assert.equal(classifySignalEdge({ ...ok, t: 2.0, median: 0.001 }), 'POSITIVE');
  assert.equal(classifySignalEdge({ ...ok, t: 1.999, median: 0.01 }), 'NEUTRAL');
  assert.equal(classifySignalEdge({ ...ok, t: 2.5, median: 0 }), 'NEUTRAL');
  assert.equal(classifySignalEdge({ ...ok, t: 2.5, median: -0.01 }), 'NEUTRAL');
  assert.equal(classifySignalEdge({ ...ok, t: -2.0, median: -0.001 }), 'NEGATIVE');
  assert.equal(classifySignalEdge({ ...ok, t: -2.0, median: 0.01 }), 'NEUTRAL');
  assert.equal(classifySignalEdge({ ...ok, t: -1.99, median: -0.01 }), 'NEUTRAL');
  assert.equal(classifySignalEdge({ n: 29, clusters: 12, t: 9, median: 1 }), 'UNKNOWN');
  assert.equal(classifySignalEdge({ n: 30, clusters: 11, t: 9, median: 1 }), 'UNKNOWN');
  assert.equal(classifySignalEdge({ n: 500, clusters: 50, t: null, median: 1 }), 'UNKNOWN');
  assert.equal(classifySignalEdge({ n: 500, clusters: 50, t: 3, median: NaN }), 'UNKNOWN');
});

test('SF2 portfolioVsSpy / drawdownVsSpy / exposure / overlap / correlation an den Raendern', () => {
  assert.equal(classifyPortfolioVsSpy(0.01), 'ABOVE');
  assert.equal(classifyPortfolioVsSpy(0.12 - 0.11), 'ABOVE'); // Gleitkomma 0.00999..
  assert.equal(classifyPortfolioVsSpy(0.0099), 'SIMILAR');
  assert.equal(classifyPortfolioVsSpy(-0.0099), 'SIMILAR');
  assert.equal(classifyPortfolioVsSpy(-0.01), 'BELOW');
  assert.equal(classifyPortfolioVsSpy(null), 'UNKNOWN');
  assert.equal(classifyDrawdownVsSpy(-0.25, -0.30), 'SHALLOWER');
  assert.equal(classifyDrawdownVsSpy(-0.26, -0.30), 'SIMILAR');
  assert.equal(classifyDrawdownVsSpy(-0.35, -0.30), 'DEEPER');
  assert.equal(classifyDrawdownVsSpy(-0.34, -0.30), 'SIMILAR');
  assert.equal(classifyDrawdownVsSpy(0.25, 0.30), 'SHALLOWER'); // Vorzeichenkonvention egal
  assert.equal(classifyExposure(0.2499), 'LOW'); assert.equal(classifyExposure(0.25), 'MID'); assert.equal(classifyExposure(0.60), 'MID'); assert.equal(classifyExposure(0.6001), 'HIGH');
  assert.equal(classifyOverlap(0.0999), 'LOW'); assert.equal(classifyOverlap(0.10), 'MEDIUM'); assert.equal(classifyOverlap(0.30), 'MEDIUM'); assert.equal(classifyOverlap(0.3001), 'HIGH'); assert.equal(classifyOverlap(null), 'UNKNOWN');
  assert.equal(classifyReturnCorrelation(0.4999), 'LOW'); assert.equal(classifyReturnCorrelation(0.5), 'MEDIUM'); assert.equal(classifyReturnCorrelation(0.8), 'MEDIUM'); assert.equal(classifyReturnCorrelation(0.8001), 'HIGH'); assert.equal(classifyReturnCorrelation(-0.9), 'LOW');
});

test('SF3 Schwellen stimmen mit PREREGISTRATION-TRIAGE.json ueberein (Schluessel und Zahlen im Text)', () => {
  const pre = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../triage/PREREGISTRATION-TRIAGE.json', import.meta.url)), 'utf8'));
  const c = pre.publicClassThresholds;
  for (const k of ['signalEdge63', 'portfolioVsSpy', 'drawdownVsSpy', 'exposureClass', 'overlapClass', 'returnCorrelationClass', 'regimeConsistency']) assert.ok(k in c, k);
  assert.match(c.signalEdge63.POSITIVE, /2,0/); assert.match(c.signalEdge63.UNKNOWN, /30/); assert.match(c.signalEdge63.UNKNOWN, /12/);
  assert.equal(THRESHOLDS.minEntries, 30); assert.equal(THRESHOLDS.minClusters, 12);
  assert.match(c.drawdownVsSpy.SHALLOWER, /5/); assert.match(c.exposureClass.HIGH, /60/); assert.match(c.overlapClass.LOW, /0,10/); assert.match(c.overlapClass.HIGH, /0,30/);
  assert.match(c.returnCorrelationClass.LOW, /0,50/); assert.match(c.returnCorrelationClass.HIGH, /0,80/);
});

test('SF4 publicRow: nur Booleans, ganze Zahlen, Enum-Kennungen', () => {
  const row = publicRow({ signalEdge63: 'POSITIVE', n: 123, ok: true, m: 'MOMENTUM_BREAKOUT_3.2.0', commit: 'sha_0123456789ab', neg: -4 });
  assert.equal(row.n, 123); assert.equal(Object.isFrozen(row), true);
  assert.equal(formatPublic({ a: 'X', b: 2, c: false }), 'a=X b=2 c=false');
  assert.equal(enumId('DARVAS_BOX@3.0.2'), 'DARVAS_BOX_3.0.2');
  for (const bad of [{ x: 0.5 }, { x: 1.5e-3 }, { x: NaN }, { x: Infinity }, { x: 1e9 }, { x: 2 ** 60 }, { x: '0.123' }, { x: '-0.5' }, { x: '12.5' }, { x: '1e5' }, { x: '.5' }, { x: 'a b' }, { x: '' }, { x: 'A'.repeat(49) },
    { x: 'a@b' }, { x: 'a%' }, { x: '12,5' }, { x: null }, { x: undefined }, { x: [1] }, { x: { a: 1 } }, { x: 10n }, { 'bad key': 1 }, { '': 1 }, { 'a-b': 1 }]) {
    assert.throws(() => publicRow(bad), /publicRow/, JSON.stringify(Object.keys(bad)) + String(Object.values(bad)[0]));
  }
  assert.throws(() => publicRow([1, 2]), /publicRow/); assert.throws(() => publicRow(null), /publicRow/);
  assert.doesNotThrow(() => publicRow({ x: 'A'.repeat(48) })); assert.doesNotThrow(() => publicRow({ x: 10000000 }));
  // typische Leckwege: Kennzahl als Text, verschachtelt, als Zahl
  assert.throws(() => publicRow({ cagr: '0.1834' })); assert.throws(() => publicRow({ cagr: 0.1834 })); assert.throws(() => formatPublic({ nested: { cagr: 1 } }));
});

test('SF5 methodClasses/pairClasses liefern nur oeffentlich zulaessige Werte', () => {
  const rob = segmentSignal([], new Map(), '2020-12-31');
  const cls = methodClasses({ sig63: { n: 5, clusters: 2, t: null, median: null }, portfolio: { excessCagr: 0.02, maxDrawdown: -0.2, spy: { maxDrawdown: -0.34 } }, exposureMean: 0.4, rob });
  assert.equal(cls.signalEdge63, 'UNKNOWN'); assert.equal(cls.portfolioVsSpy, 'ABOVE'); assert.equal(cls.drawdownVsSpy, 'SHALLOWER'); assert.equal(cls.exposureClass, 'MID');
  assert.doesNotThrow(() => publicRow(cls)); assert.doesNotThrow(() => publicRow(pairClasses({ jaccard: 0.2, retCorr: 0.9 })));
  assert.deepEqual(pairClasses({ jaccard: 0.2, retCorr: 0.9 }), { overlapClass: 'MEDIUM', returnCorrelationClass: 'HIGH' });
});

test('SF6 Jaccard, gleiche Titel, Pearson', () => {
  near(jaccard(['a', 'b', 'c'], ['b', 'c', 'd']), 2 / 4); assert.equal(jaccard([], []), null); assert.equal(jaccard(['a'], ['b']), 0); assert.equal(jaccard(new Set(['a']), new Set(['a'])), 1);
  near(sharedShare(['a', 'b'], ['b', 'c', 'd']), 1 / 2); assert.equal(sharedShare([], ['a']), null);
  near(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1); near(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1); assert.equal(pearson([1, 1, 1], [1, 2, 3]), null); assert.equal(pearson([1, 2], [1, 2]), null);
  near(pearson([1, 2, 3, NaN, 5], [2, 4, 6, 9, 10]), 1);
  const a = new Map([['d1', 1], ['d2', 2], ['d3', 3], ['d9', 7]]), b = new Map([['d1', 2], ['d2', 4], ['d3', 6], ['d8', 0]]);
  near(pearsonOnCommon(a, b, 3), 1); assert.equal(pearsonOnCommon(a, b, 4), null);
});

test('SF7 Einstiegsschluessel: ISO-Kalenderwoche, Titel x Woche, Ueberlappung', () => {
  assert.equal(isoWeekKey('2021-01-03'), '2020-W53'); assert.equal(isoWeekKey('2021-01-04'), '2021-W01'); assert.equal(isoWeekKey('2024-12-30'), '2025-W01'); assert.equal(isoWeekKey('2016-01-04'), '2016-W01');
  const tr = (l, d) => ({ listingId: l, entry: { date: d } });
  const A = [tr('X#1', '2021-03-01'), tr('Y', '2021-03-02'), tr('Z', '2021-03-10')], B = [tr('X', '2021-03-05'), tr('Y', '2021-03-09'), tr('W', '2021-03-01')];
  assert.deepEqual([...entryKeys(A)].sort(), ['X|2021-W09', 'Y|2021-W09', 'Z|2021-W10']);
  const o = overlapStats(A, B); near(o.jaccard, 1 / 5); // gemeinsam: X|W09; Y ist in W09 bzw. W10
  near(o.sameTitleShare, 2 / 3); assert.equal(o.entriesA, 3);
});

test('SF8 Tagesrenditen, Ueberrenditen, Exposure-Buckets', () => {
  const eq = [{ date: '2020-01-01', equity: 100 }, { date: '2020-01-02', equity: 110 }, { date: '2020-01-03', equity: 99 }];
  const m = dailyReturnMap(eq); near(m.get('2020-01-02'), 0.1); near(m.get('2020-01-03'), -0.1); assert.equal(dailyReturnMap(eq, '2020-01-03').size, 1);
  near(excessMap(m, new Map([['2020-01-02', 0.04]])).get('2020-01-02'), 0.06); assert.equal(excessMap(m, new Map()).size, 0);
  const x = [0, 0.1, 0.25, 0.4, 0.5, 0.74, 0.75, 1].map((e, i) => ({ exposure: e, n: i }));
  const s = exposureStats(x);
  near(s.lt25, 2 / 8); near(s.b25_50, 2 / 8); near(s.b50_75, 2 / 8); near(s.b75_100, 2 / 8); near(s.full95, 1 / 8); near(s.mean, (0 + 0.1 + 0.25 + 0.4 + 0.5 + 0.74 + 0.75 + 1) / 8);
});

test('SF9 Regime: Bull/Bear (200-Tage-Linie), Vol hoch/niedrig (Median), Frueh/Spaet, Vortagszustand', () => {
  // Mini-Reihe: SMA 3, Vol 3. Preise steigen, fallen, steigen.
  const closes = [10, 11, 12, 13, 12, 9, 8, 9, 10, 12];
  const dates = closes.map((_, i) => `2021-01-${String(i + 4).padStart(2, '0')}`);
  const { map, volMedian } = buildRegimes(dates, closes, { smaN: 3, volN: 3, from: dates[0], to: dates[9] });
  assert.ok(volMedian > 0);
  assert.equal(map.get(dates[3]).trend, 'BULL'); // Zustand von dates[2]: 12 > mean(10,11,12)=11
  assert.equal(map.get(dates[6]).trend, 'BEAR'); // dates[5]: 9 < mean(12,13,12)... Linie 11.33
  assert.equal(map.has(dates[0]), false); // kein Vortag
  assert.equal(map.get(dates[2])?.trend, undefined); // SMA noch nicht definiert
  // Vol: ruhige Phase LOW, wilde Phase HIGH
  const calm = [100, 100.1, 100.2, 100.1, 100.2, 100.3, 100.2, 100.1, 120, 90, 125, 80, 130];
  const cd = calm.map((_, i) => `2022-01-${String(i + 1).padStart(2, '0')}`);
  const r = buildRegimes(cd, calm, { smaN: 3, volN: 3 }).map;
  assert.equal(r.get(cd[5]).vol, 'LOW'); assert.equal(r.get(cd[12]).vol, 'HIGH');
  // Segmente
  assert.deepEqual(segmentTags('2020-12-31', new Map([['2020-12-31', { trend: 'BULL', vol: 'LOW' }]]), '2020-12-31'), ['early', 'bull', 'lowVol']);
  assert.deepEqual(segmentTags('2021-01-04', new Map([['2021-01-04', { trend: 'BEAR', vol: 'HIGH' }]]), '2020-12-31'), ['late', 'bear', 'highVol']);
  assert.deepEqual(segmentTags('2021-01-04', new Map(), '2020-12-31'), ['late']);
});

test('SF10 Segmentierung der 63d-Ueberrendite und regimeConsistency', () => {
  const rm = new Map([['2019-05-01', { trend: 'BULL', vol: 'LOW' }], ['2019-06-03', { trend: 'BULL', vol: 'HIGH' }], ['2022-02-01', { trend: 'BEAR', vol: 'HIGH' }], ['2022-03-01', { trend: 'BEAR', vol: 'LOW' }]]);
  const e = [{ date: '2019-05-01', ex: 0.05, mon: '2019-05' }, { date: '2019-06-03', ex: 0.03, mon: '2019-06' }, { date: '2022-02-01', ex: -0.04, mon: '2022-02' }, { date: '2022-03-01', ex: 0.02, mon: '2022-03' }, { date: '2022-03-01', ex: NaN, mon: '2022-03' }];
  const s = segmentSignal(e, rm, '2020-12-31');
  assert.equal(s.overall.n, 4); near(s.overall.mean, 0.015); assert.equal(s.overall.dir, 1);
  assert.equal(s.segments.early.n, 2); assert.equal(s.segments.late.n, 2); assert.equal(s.segments.bull.n, 2); assert.equal(s.segments.bear.n, 2); assert.equal(s.segments.highVol.n, 2); assert.equal(s.segments.lowVol.n, 2);
  near(s.segments.late.mean, -0.01); assert.equal(s.segments.late.dir, -1); near(s.segments.bear.mean, -0.01); near(s.segments.highVol.mean, -0.005); near(s.segments.lowVol.mean, 0.035);
  const rc = regimeConsistency(s.overall.mean, s.segments); // early+, late-, bull+, bear-, highVol-, lowVol+
  assert.deepEqual(rc, { consistent: 3, consistentN30: 0, segmentsN30: 0 });
  assert.deepEqual(regimeConsistency(0, s.segments), { consistent: 0, consistentN30: 0, segmentsN30: 0 });
  assert.deepEqual(regimeConsistency(0.1, { a: { n: 40, mean: 0.2 }, b: { n: 30, mean: -0.1 }, c: { n: 29, mean: 0.3 }, d: { n: 0, mean: null } }), { consistent: 2, consistentN30: 1, segmentsN30: 2 });
  assert.equal(SEGMENTS.length, 6);
});

test('SF11 entryRecord: Horizonte 21/63/126, Ueberrendite, MFE/MAE, Delisting-Faktor', () => {
  const n = 200, date = Array.from({ length: n }, (_, i) => `d${String(i).padStart(3, '0')}`);
  const close = Array.from({ length: n }, (_, i) => 100 * 1.001 ** i), tri = close.slice().map((c) => c / 100);
  const high = close.map((c) => c * 1.02), low = close.map((c) => c * 0.97);
  const spyFrom = (a, b) => (b > a ? 0.01 : 0); // stub
  const rec = entryRecord({ date, close, high, low, tri }, 10, close[10], { delisted: false, spyFrom, listingId: 'T' });
  assert.deepEqual(HORIZONS, [21, 63, 126]);
  near(rec.fwd[0], 1.001 ** 21 - 1); near(rec.fwd[1], 1.001 ** 63 - 1); near(rec.fwd[2], 1.001 ** 126 - 1); near(rec.ex[1], 1.001 ** 63 - 1 - 0.01);
  near(rec.mfe[63], close[73] * 1.02 / close[10] - 1); near(rec.mae[63], -0.03); // Tiefstwert am Einstiegstag: -3 %
  near(rec.mae[126], -0.03); assert.equal(rec.mon, 'd010'.slice(0, 7));
  const late = entryRecord({ date, close, high, low, tri }, 150, close[150], { delisted: false, spyFrom });
  assert.ok(Number.isNaN(late.fwd[2])); assert.ok(Number.isNaN(late.ex[2])); assert.ok(Number.isNaN(late.mfe[126])); assert.ok(Number.isFinite(late.fwd[0]));
  const dl = entryRecord({ date, close, high, low, tri }, 150, close[150], { delisted: true, delistClassAcq: false, spyFrom });
  near(dl.fwd[2], (tri[199] / tri[150]) * 0.7 - 1); const acq = entryRecord({ date, close, high, low, tri }, 150, close[150], { delisted: true, delistClassAcq: true, spyFrom });
  near(acq.fwd[2], (tri[199] / tri[150]) * (1 - 10 / 1e4) - 1);
});

test('SF12 signalQuality: Mittel, Median, Trefferquote, n, Cluster-t ueber Einstiegsmonate', () => {
  const mk = (mon, ex) => ({ mon, ex: [ex, ex, ex], fwd: [ex, ex, ex], mfe: { 63: ex, 126: ex }, mae: { 63: -ex, 126: -ex } });
  const q = signalQuality([mk('2020-01', 0.1), mk('2020-01', 0.1), mk('2020-02', 0.2), mk('2020-03', 0.3), mk('2020-03', -0.1)]);
  const h = q.byHorizon[63];
  assert.equal(h.n, 5); near(h.mean, 0.12); near(h.median, 0.1); near(h.hitRate, 0.8); assert.equal(h.clusters, 3); near(h.clusterMean, (0.1 + 0.2 + 0.1) / 3);
  assert.ok(Number.isFinite(h.clusterT)); assert.equal(q.mfeMae[126].mfe.n, 5); assert.equal(q.entries, 5);
});

test('SF13 portfolioMetrics: CAGR, MaxDD, Vol, Sharpe, Umschlag, Trefferquote, Gewinn/Verlust, SPY', () => {
  const eq = [], spy = [];
  let v = 100, s = 100;
  for (let i = 0; i <= 504; i++) { const d = new Date(Date.UTC(2020, 0, 1) + i * 864e5 * 365.25 / 252).toISOString().slice(0, 10); eq.push({ date: d, equity: v, exposure: 0.5, n: 1 }); spy.push({ date: d, value: s }); v *= i % 2 ? 1.01 : 1.0; s *= 1.0005; }
  const m = portfolioMetrics({ equity: eq, tradeReturns: [0.2, -0.1, 0.1, -0.3, NaN, 0], tradedNotional: 2 * 100 * 2, spyCurve: spy });
  assert.equal(m.days, 505); assert.ok(m.cagr > 0.1); near(m.totalReturn, eq[504].equity / 100 - 1); assert.equal(m.maxDrawdown, 0);
  assert.equal(m.trades, 5); near(m.hitRate, 2 / 5); near(m.avgWin, 0.15); near(m.avgLoss, -0.2); assert.ok(m.vol > 0 && m.sharpe > 0); assert.ok(m.turnoverPerYear > 0);
  near(m.excessCagr, m.cagr - m.spy.cagr); assert.equal(m.spy.maxDrawdown, 0); assert.ok(m.spy.cagr > 0);
});

test('SF14: Drawdown-Ueberlappung (beide >= 10 % unter dem Hoch / mindestens einer)', () => {
  const mk = (v) => v.map((e, i) => ({ date: `2020-01-${String(i + 1).padStart(2, '0')}`, equity: e }));
  const a = drawdownMap(mk([100, 100, 85, 85, 100]), '2020-01-01', '2020-01-31');
  const b = drawdownMap(mk([100, 100, 100, 85, 85]), '2020-01-01', '2020-01-31');
  assert.equal(drawdownOverlap(a, b, 0.10), 1 / 3); // Tage 3 (nur a), 4 (beide), 5 (nur b)
  assert.equal(drawdownOverlap(drawdownMap(mk([100, 100]), '2020-01-01', '2020-01-31'), a, 0.10), null);
});
