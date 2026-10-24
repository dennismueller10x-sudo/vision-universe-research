// Supertrader 6.0, Kullamaegi EP (C09) / PS (C10): saubere Stichprobe je Methode, gemeinsamer EP-Tagessatz, offene
// PS-Trades, Ueberlappungs-Variante, Median, Cache-only (0 Anfragen) und geschichtete Stichprobe. Synthetische Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchLifecycle } from '../source-faithful/research/lifecycle-engine.mjs';
import { KK_EP_ADAPTER, EP_REFERENCE_CONFIG, EP_RUN_VARIANTS, EP_MODEL_ASSUMPTIONS } from '../source-faithful/research/kk-ep-lifecycle.mjs';
import { PS_REFERENCE_CONFIG, PS_RUN_VARIANTS, PS_MODEL_ASSUMPTIONS, PS_OVERLAP_REFERENCE, PS_OVERLAP_POLICIES, PS_REPORTING_VARIANTS, psChartCandidate, runPsCandidate, evaluatePsCandidates, psTradeMetrics, shortReturn } from '../source-faithful/research/kk-ps-study.mjs';
import { KK_SAMPLE_ASSUMPTIONS, STRATA_SCHEMES, STRATA_MIN_POPULATION, LIQUIDITY_BOUNDS, OUTSIDE_DAY_SET, hashOrder, median, cleanPrefix, epCommonDaySet, liquidityAt, liquidityBucket, regimeByDate, strataFeatures, stratumOf, stratifiedSample } from '../source-faithful/research/kk-sample.mjs';
import { runFetchLoops, buildDaySets, fetchOrder, hasRoom, KK_RESEARCH_FILES } from '../source-faithful/research/run-kk-intraday.mjs';

const day = (k) => new Date(Date.UTC(2021, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const flat = (k, c, v = 1e6) => bar(k, c, c * 1.015, c * 0.985, c, v);
const mm = (k, o, h, l, c, v = 10000) => ({ k, open: o, high: h, low: l, close: c, volume: v });

// ---------------------------------------------------------------- clean prefix (PS sample bias, finding 1)
/** Fetch loops on stub fetchers: every request is definitive; EP needs a baseline and minutes per day. */
async function simulateFetch(epKeys, psKeys, { max, epMax, minuteCache = {}, baseCache = {}, cacheOnly = false } = {}) {
  const calls = [];
  const budget = { used: 0, max }, epBudget = { used: 0, max: epMax };
  const take = (b) => { for (const x of b) x.used++; };
  const fetchMinutes = async (k, b) => { calls.push(['m', k]); take(b); minuteCache[k] = { k: [] }; return 200; };
  const fetchBaseline = async (k, b) => { calls.push(['b', k]); take(b); baseCache[k] = { mean: 100 }; return 200; };
  const r = await runFetchLoops({ cacheOnly, epOrder: fetchOrder(epKeys), psOrder: fetchOrder(psKeys), minuteCache, baseCache, budget, epBudget, fetchMinutes, fetchBaseline, pause: async () => {} });
  return { r, calls, budget, epBudget, minuteCache, baseCache };
}

test('SF6-KK-CACHE-ONLY: --cache-only ueberspringt beide Abrufschleifen vollstaendig (0 Anfragen); sonst gilt das Budget', async () => {
  const ep = Array.from({ length: 30 }, (_, n) => `E${n}|2021-01-04`), ps = Array.from({ length: 30 }, (_, n) => `P${n}|2021-01-04`);
  const c = await simulateFetch(ep, ps, { max: 0, epMax: 0, cacheOnly: true });
  assert.deepEqual(c.r, { skipped: true }); assert.equal(c.calls.length, 0); assert.equal(c.budget.used, 0); assert.equal(c.epBudget.used, 0);
  // even with budget left, cache-only never calls a fetcher
  const c2 = await simulateFetch(ep, ps, { max: 100, epMax: 50, cacheOnly: true });
  assert.equal(c2.calls.length, 0);
  const f = await simulateFetch(ep, ps, { max: 40, epMax: 20 });
  assert.equal(f.r.skipped, false); assert.equal(f.budget.used, 40); assert.equal(f.epBudget.used, 20); assert.ok(!hasRoom([f.budget]));
});

test('SF6-KK-PS-CLEAN-PREFIX: PS wertet nur das eigene Hash-Praefix aus; ueber den EP-Pfad gecachte PS-Tage dahinter fallen weg', async () => {
  // EP and PS candidates overlap (O*): the EP loop runs first in the SAME hash order and caches overlap keys far beyond the PS frontier
  const only = (p, n) => Array.from({ length: n }, (_, k) => `${p}${k}|2021-01-04`);
  const overlap = only('O', 60), epKeys = [...only('E', 60), ...overlap], psKeys = [...overlap, ...only('P', 300)];
  const s = await simulateFetch(epKeys, psKeys, { max: 160, epMax: 120 }); // EP: 60 days, PS: 40 requests
  const order = fetchOrder(psKeys), epSet = new Set(epKeys);
  const p = cleanPrefix(order, { cached: (k) => k in s.minuteCache, ownPath: (k) => k in s.minuteCache && !epSet.has(k) });
  // the prefix is exactly the first ranks of the PS order (no holes: every stub request is definitive)
  assert.deepEqual([...p.keys], order.slice(0, p.counts.prefixLength)); assert.equal(p.counts.holesInPrefix, 0);
  // the old evaluation (every cached PS day) over-represents the overlap keys; the clean prefix has them at the PS fraction only
  const cachedAll = order.filter((k) => k in s.minuteCache), ovAll = cachedAll.filter((k) => epSet.has(k)).length, ovClean = [...p.keys].filter((k) => epSet.has(k)).length;
  assert.equal(p.counts.cachedBeyondPrefixDropped, cachedAll.length - p.keys.size);
  assert.ok(p.counts.cachedBeyondPrefixDropped > 0, 'the stub sample must exercise the bias');
  assert.ok(ovAll > ovClean);
  for (const k of order.slice(p.counts.prefixLength)) assert.ok(!(k in s.minuteCache) || epSet.has(k), 'beyond the prefix only EP-path keys can be cached');
});

test('SF6-KK-BUILD-DAY-SETS: EP-Gemeinschaftssatz (Minuten + Basis > 0), PS-Praefix, Schichtung; ohne Ausgabe von Minutenwerten', async () => {
  const bars = Array.from({ length: 30 }, (_, k) => flat(k, 20 + (k % 3)));
  const mk = (p, n) => Array.from({ length: n }, (_, k) => ({ id: `US:X:${p}${k}`, ticker: `${p}${k}`, i: 25, date: day(25) }));
  const epC = [...mk('E', 40), ...mk('O', 40)], psC = [...mk('O', 40), ...mk('P', 200)];
  const key = (c) => `${c.ticker}|${c.date}`;
  const s = await simulateFetch(epC.map(key), psC.map(key), { max: 100, epMax: 60 });
  // one EP day without a usable IEX baseline: excluded for every EP variant
  const epPrefixKey = fetchOrder(epC.map(key)).find((k) => k in s.baseCache);
  s.baseCache[epPrefixKey] = { mean: null, days: 20, daysWithVolume: 3 };
  const d = buildDaySets({ epCands: epC, psCands: psC, minuteCache: s.minuteCache, baseCache: s.baseCache, barsOf: () => bars, benchmark: bars });
  assert.equal(d.ep.BEFORE_FIX, null); assert.equal(d.ps.BEFORE_FIX, null);
  assert.ok(!d.ep.CLEAN.has(epPrefixKey)); assert.equal(d.public.ep.commonDaySet.excluded.BASELINE_TOO_FEW_IEX_DAYS, 1);
  assert.equal(d.public.ep.commonDaySet.size, d.public.ep.prefix.cachedInPrefix - 1);
  for (const k of d.ep.CLEAN) assert.ok(k in s.minuteCache && s.baseCache[k].mean > 0);
  for (const sc of STRATA_SCHEMES) { const id = `STRAT_${sc.id}`; for (const k of d.ep[id]) assert.ok(d.ep.CLEAN.has(k)); for (const k of d.ps[id]) assert.ok(d.ps.CLEAN.has(k)); }
  assert.equal(d.public.ps.psCandidatesThatAreEpCandidates.population, 40);
  assert.match(d.public.daySetSha256.ep.CLEAN, /^[0-9a-f]{64}$/);
  const pub = JSON.stringify(d.public);
  assert.doesNotMatch(pub, /"(open|high|low|close|o|h|l|c|v|k)":\[/); assert.doesNotMatch(pub, /\|2021-/); // counts and hashes only, no keys
});

// ---------------------------------------------------------------- EP common day set (finding 2)
function epScenario() {
  const bars = []; for (let k = 0; k < 80; k++) bars.push(flat(k, 20));
  bars.push(bar(80, 23, 25, 22.95, 24.5, 5e6));
  for (let j = 0; j < 20; j++) { const c = 25 + j * 0.25; bars.push(bar(81 + j, c - 0.1, c + 0.2, c - 0.2, c)); }
  bars.push(bar(101, 29.6, 29.7, 27, 27.2)); bars.push(bar(102, 27.1, 27.3, 26.8, 27));
  for (let j = 0; j < 3; j++) bars.push(flat(bars.length, 27));
  return { id: 'US:X:EPX', bars };
}
function epMinutes() {
  const m = [mm(0, 23, 23.2, 22.95, 23.1, 50000), mm(1, 23.1, 23.15, 23.05, 23.1, 30000), mm(2, 23.12, 23.4, 23.1, 23.35, 40000)];
  for (let k = 3; k < 390; k++) { const p = 23.4 + (k / 389) * 1.6; m.push(mm(k, p, k === 389 ? 25 : p + 0.02, p - 0.02, p, 2000)); }
  return m;
}

test('SF6-KK-EP-COMMON-DAY-SET: ein Tag ohne IEX-Basis ist fuer ALLE Varianten ausserhalb des Satzes; vorher nur fuer PACE_20', () => {
  const s = epScenario(), key = `EPX|${day(80)}`, base = { [key]: { mean: null, days: 20, daysWithVolume: 3 } };
  const intraday = (excludedKeys) => ({ minutes: (t, d) => (`${t}|${d}` === key ? epMinutes() : undefined), iexBaseline: (t, d) => base[`${t}|${d}`]?.mean ?? null, ...(excludedKeys ? { excluded: (t, d) => excludedKeys.has(`${t}|${d}`) } : {}) });
  const ds = (kk) => ({ calendar: s.bars.map((b) => b.date), securities: [s], kkIntraday: kk });
  const noVol = EP_RUN_VARIANTS.find((v) => v.id === 'ALT-NO-VOLUME-RULE').config;
  // BEFORE (1.1.0 behaviour, no hook): the variants see different day sets
  const refB = runResearchLifecycle(ds(intraday(null)), { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
  const altB = runResearchLifecycle(ds(intraday(null)), { adapter: KK_EP_ADAPTER, config: noVol });
  assert.equal(refB.counts.notExecutedResolved.NOT_EXECUTED_NO_IEX_VOLUME_BASELINE, 1); assert.equal(altB.trades.length, 1);
  // AFTER: the common day set excludes the day for every variant
  const common = epCommonDaySet(new Set([key]), base);
  assert.equal(common.keys.size, 0); assert.deepEqual(common.excluded, { BASELINE_TOO_FEW_IEX_DAYS: 1 });
  const excl = new Set([key].filter((k) => !common.keys.has(k)));
  for (const v of EP_RUN_VARIANTS) {
    const r = runResearchLifecycle(ds(intraday(excl)), { adapter: KK_EP_ADAPTER, config: v.config });
    assert.equal(r.trades.length, 0, v.id);
    if (v.config.quietPhase === 'NONE') assert.equal(r.counts.notExecutedResolved[OUTSIDE_DAY_SET], 1, v.id);
  }
  // a day inside the set is unchanged by the hook
  const inSet = runResearchLifecycle(ds({ ...intraday(new Set()), iexBaseline: () => 200000 }), { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
  const noHook = runResearchLifecycle(ds({ ...intraday(null), iexBaseline: () => 200000 }), { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
  assert.deepEqual(inSet.trades.map((t) => [t.entryDate, t.entryFill, t.exitReason]), noHook.trades.map((t) => [t.entryDate, t.entryFill, t.exitReason]));
  assert.ok(EP_MODEL_ASSUMPTIONS.some((a) => a.id === 'MA-EP-COMMON-DAY-SET'));
});

// ---------------------------------------------------------------- PS: open at data end, overlap, median (findings 3, 4)
function psScenario({ end = 'slide' } = {}) {
  const bars = []; for (let k = 0; k < 60; k++) bars.push(flat(k, 20));
  let c = 20; for (const r of [0.05, 0.07, 0.10]) { const o = c; c = c * (1 + r); bars.push(bar(bars.length, o, c * 1.005, o * 0.995, c)); }
  bars.push(bar(63, 27, 27.5, 26, 26.2));
  if (end === 'slide') { bars.push(bar(64, 26.2, 26.4, 24.5, 24.8)); bars.push(bar(65, 24.8, 25, 21, 21.5)); for (let j = 0; j < 3; j++) bars.push(flat(bars.length, 21.5)); }
  else { bars.push(bar(64, 26.2, 26.4, 25.8, 26)); bars.push(bar(65, 26, 26.3, 25.7, 25.9)); } // neither the stop nor the MA10 target: open at the data end
  return { id: 'US:X:PSX', bars };
}
function psMinutes() {
  const m = [mm(0, 27, 27.5, 26.9, 27.3), mm(1, 27.3, 27.4, 27.1, 27.2), mm(2, 27.2, 27.25, 26.8, 26.9), mm(3, 26.9, 27, 26.85, 26.95), mm(4, 26.95, 27.05, 26.9, 27)];
  m.push(mm(5, 27, 27.02, 26.9, 26.92)); m.push(mm(6, 26.92, 26.95, 26.85, 26.88)); m.push(mm(7, 26.85, 26.86, 26.7, 26.72));
  for (let k = 8; k < 390; k++) { const p = 26.7 - ((k - 8) / 381) * 0.5; m.push(mm(k, p, p + 0.03, k === 389 ? 26 : p - 0.03, p)); }
  return m;
}

test('SF6-KK-PS-OPEN-AT-DATA-END: offene Shorts werden gezaehlt und versiegelt zum letzten Schluss bewertet; closedOnly unveraendert', () => {
  const s = psScenario({ end: 'open' }), c = psChartCandidate(s.bars, 63);
  const r = runPsCandidate({ bars: s.bars, cand: c, minutes: psMinutes(), cfg: PS_REFERENCE_CONFIG });
  assert.equal(r.status, 'OPEN_AT_DATA_END');
  assert.equal(r.trade.markDate, day(65)); assert.equal(r.trade.markAdj, 25.9); assert.equal(r.trade.openFraction, 1);
  assert.ok(Math.abs(r.trade.netReturnMarked - shortReturn(r.trade.entryAdj, 25.9)) < 1e-12);
  assert.ok(Number.isFinite(r.trade.rMultipleMarked));
  const closed = runPsCandidate({ bars: psScenario().bars, cand: psChartCandidate(psScenario().bars, 63), minutes: psMinutes(), cfg: PS_REFERENCE_CONFIG });
  assert.equal(closed.status, 'CLOSED');
  const m = psTradeMetrics([closed.trade], [r.trade]);
  assert.equal(m.closedOnly.trades, 1); assert.equal(m.closedOnly.meanNetReturn, closed.trade.netReturn);
  assert.equal(m.withOpenMarked.trades, 2); assert.equal(m.withOpenMarked.openIncluded, 1);
  assert.ok(Math.abs(m.withOpenMarked.meanNetReturn - (closed.trade.netReturn + r.trade.netReturnMarked) / 2) < 1e-12);
  assert.ok(PS_MODEL_ASSUMPTIONS.some((a) => a.id === 'MA-PS-OPEN-AT-DATA-END'));
});

test('SF6-KK-PS-MEDIAN: echter Median (gerade Anzahl = Mittel der beiden mittleren Werte)', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5); assert.equal(median([3, 1, 2]), 2); assert.equal(median([]), null);
  const t = (x) => ({ netReturn: x, rMultiple: x * 10 });
  assert.equal(psTradeMetrics([t(0.04), t(-0.01), t(0.02), t(-0.03)]).closedOnly.medianNetReturn, 0.005); // 1.1.0 returned 0.02
});

test('SF6-KK-PS-ONE-POSITION-PER-TICKER: Folgetage derselben Serie werden uebersprungen, solange ein frueherer Trade offen ist; Referenz unveraendert', () => {
  const sec = (id) => ({ id, bars: [] });
  const cands = [0, 1, 2, 5].map((k) => ({ id: 'US:X:A', ticker: 'A', i: k, date: day(k) })).concat([{ id: 'US:X:B', ticker: 'B', i: 1, date: day(1) }]);
  // stub: every candidate is screened and closes two days after its entry (A on day 0 covers on day 2)
  const run = ({ cand }) => ({ status: 'CLOSED', trade: { entryDate: cand.date, fills: [{ frac: 1, date: day(cand.t + 2), reason: 'X' }], exitReasons: ['X'], netReturn: 0.01, rMultiple: 0.1 } });
  const screen = (bars, i) => ({ t: i, date: day(i) });
  const base = { cands, barsOf: (c) => sec(c.id).bars, minutesOf: () => [], cfg: PS_REFERENCE_CONFIG, screen, run };
  const ind = evaluatePsCandidates({ ...base, overlap: PS_OVERLAP_REFERENCE });
  assert.equal(ind.closed.length, 5);
  const one = evaluatePsCandidates({ ...base, overlap: 'ONE_POSITION_PER_TICKER' });
  // A: day 0 trade covers on day 2 -> days 1 and 2 skipped (a cover on the candidate day counts as open), day 5 trades; B independent
  assert.deepEqual(one.closed.map((t) => `${t.id}|${t.entryDate}`), [`US:X:A|${day(0)}`, `US:X:A|${day(5)}`, `US:X:B|${day(1)}`]);
  assert.equal(one.statuses.SKIPPED_EARLIER_TRADE_OPEN, 2);
  // an open trade at the data end blocks every later candidate of the security
  const openRun = ({ cand }) => (cand.t === 0 ? { status: 'OPEN_AT_DATA_END', trade: { entryDate: cand.date, fills: [] } } : run({ cand }));
  const o2 = evaluatePsCandidates({ ...base, run: openRun, overlap: 'ONE_POSITION_PER_TICKER' });
  assert.equal(o2.open.length, 1); assert.equal(o2.statuses.SKIPPED_EARLIER_TRADE_OPEN, 3);
  assert.throws(() => evaluatePsCandidates({ ...base, overlap: 'SOMETHING' }), /PS_OVERLAP_POLICY/);
  assert.deepEqual([...PS_OVERLAP_POLICIES], ['INDEPENDENT', 'ONE_POSITION_PER_TICKER']); assert.equal(PS_REPORTING_VARIANTS.length, 1);
});

test('SF6-KK-PS-REFERENCE-UNCHANGED: Referenz (INDEPENDENT, kein Tagessatz) = 1.1.0-Schleife; Tag ausserhalb des Satzes wird nie simuliert', () => {
  const s = psScenario(), cands = [{ id: s.id, ticker: 'PSX', i: 63, date: day(63) }];
  const minutesOf = () => psMinutes();
  for (const v of PS_RUN_VARIANTS) {
    const pc = psChartCandidate(s.bars, 63, v.config), old = pc ? runPsCandidate({ bars: s.bars, cand: pc, minutes: psMinutes(), cfg: v.config }) : null;
    const now = evaluatePsCandidates({ cands, barsOf: () => s.bars, minutesOf, cfg: v.config });
    if (!old) { assert.deepEqual(now.statuses, {}, v.id); continue; }
    assert.deepEqual(now.statuses, { [old.status]: 1 }, v.id);
    if (old.status === 'CLOSED') assert.deepEqual(now.closed.map(({ id, key, ...t }) => t), [old.trade], v.id);
  }
  const out = evaluatePsCandidates({ cands, barsOf: () => s.bars, minutesOf, inDaySet: () => false, cfg: PS_REFERENCE_CONFIG, outsideStatus: OUTSIDE_DAY_SET });
  assert.deepEqual(out.statuses, { [OUTSIDE_DAY_SET]: 1 }); assert.equal(out.closed.length, 0);
  // not fetched stays NOT_FETCHED (never relabelled as outside the set)
  const nf = evaluatePsCandidates({ cands, barsOf: () => s.bars, minutesOf: () => undefined, inDaySet: () => false, cfg: PS_REFERENCE_CONFIG });
  assert.deepEqual(nf.statuses, { NOT_EXECUTED_INTRADAY_NOT_FETCHED: 1 });
});

// ---------------------------------------------------------------- strata (equal fraction, known at the decision)
test('SF6-KK-STRATA: gleicher Anteil je Schicht (Minimum, exakt rational), kleine Schichten ausgeschlossen, Reihenfolge nach Hash', () => {
  const pop = new Map(), sampled = new Set();
  const add = (s, n, have) => { for (let k = 0; k < n; k++) { const key = `${s}${k}|2021-01-04`; pop.set(key, s); if (k < have) sampled.add(key); } };
  add('A', 200, 40); add('B', 100, 30); add('C', 50, 50);
  const r = stratifiedSample(pop, sampled, 100);
  assert.deepEqual(r.fraction, { num: 40, den: 200, value: 0.2 });
  assert.deepEqual(r.strata.A, { population: 200, cachedInPrefix: 40, kept: 40, eligible: true });
  assert.deepEqual(r.strata.B, { population: 100, cachedInPrefix: 30, kept: 20, eligible: true });
  assert.deepEqual(r.strata.C, { population: 50, cachedInPrefix: 50, kept: 0, eligible: false });
  assert.equal(r.excludedSmallStrata, 1); assert.equal(r.keys.size, 60);
  const keptB = [...r.keys].filter((k) => k.startsWith('B')), haveB = [...sampled].filter((k) => k.startsWith('B'));
  assert.deepEqual(keptB, hashOrder(haveB).slice(0, 20));
  // exact rational: 1/3 of 300 is 100, never 99 from a floating error
  const p2 = new Map(), s2 = new Set(); for (let k = 0; k < 300; k++) { p2.set(`X${k}`, 'X'); if (k < 100) s2.add(`X${k}`); }
  assert.equal(stratifiedSample(p2, s2, 100).strata.X.kept, 100);
  assert.equal(stratifiedSample(new Map([['a', 'S']]), new Set(), 100).fraction, null);
  assert.equal(STRATA_MIN_POPULATION, 100);
});

test('SF6-KK-STRATA-PIT: Liquiditaet aus den 20 Sitzungen VOR dem Handelstag (feste Grenzen), Regime aus dem Vortagesschluss', () => {
  const bars = Array.from({ length: 30 }, (_, k) => flat(k, 50, 1e5)); // 5 M USD per session
  assert.equal(liquidityAt(bars, 25), 5e6); assert.equal(liquidityBucket(liquidityAt(bars, 25)), 'LIQ_1M_10M');
  const later = bars.map((b, k) => (k >= 25 ? { ...b, rawVolume: 1e9, volume: 1e9 } : b)); // the trade day and later do not count
  assert.equal(liquidityAt(later, 25), 5e6);
  assert.equal(liquidityBucket(LIQUIDITY_BOUNDS[0]), 'LIQ_10M_100M'); assert.equal(liquidityBucket(LIQUIDITY_BOUNDS[1]), 'LIQ_100M_PLUS'); assert.equal(liquidityBucket(null), 'NA');
  assert.equal(liquidityAt(bars, 10), null);
  const spy = Array.from({ length: 205 }, (_, k) => ({ date: day(k), close: k < 203 ? 100 + k * 0.1 : 50 }));
  const reg = regimeByDate(spy);
  assert.equal(reg.get(day(198)), 'NA'); assert.equal(reg.get(day(202)), 'SPY_ABOVE_SMA200'); assert.equal(reg.get(day(203)), 'SPY_AT_OR_BELOW_SMA200');
  const sec = Array.from({ length: 205 }, (_, k) => flat(k, 50, 1e6));
  assert.deepEqual(strataFeatures(sec, 203, reg), { year: day(203).slice(0, 4), liquidity: 'LIQ_10M_100M', regime: 'SPY_ABOVE_SMA200' }); // prior close (202)
  assert.equal(stratumOf({ year: '2021', liquidity: 'L', regime: 'R' }, STRATA_SCHEMES[0]), '2021|L');
  assert.equal(stratumOf({ year: '2021', liquidity: 'L', regime: 'R' }, STRATA_SCHEMES[1]), '2021|L|R');
});

test('SF6-KK-ASSUMPTIONS: jede neue Schwelle ist eine gekennzeichnete Modellannahme, keine Kullamaegi-Regel; Code im Research-Hash', () => {
  for (const id of ['MA-SAMPLE-CLEAN-PREFIX', 'MA-SAMPLE-EP-COMMON-DAY-SET', 'MA-STRAT-YEAR', 'MA-STRAT-LIQUIDITY', 'MA-STRAT-REGIME', 'MA-STRAT-MIN-POPULATION', 'MA-STRAT-EQUAL-FRACTION']) {
    const a = KK_SAMPLE_ASSUMPTIONS.find((x) => x.id === id); assert.ok(a, id); assert.equal(a.class, 'MODEL_ASSUMPTION'); assert.doesNotMatch(a.reference, /KK-0\d\d/);
  }
  assert.ok(PS_MODEL_ASSUMPTIONS.some((a) => a.id === 'MA-PS-OVERLAP'));
  assert.ok(KK_RESEARCH_FILES.includes('kk-sample.mjs'));
  assert.deepEqual(fetchOrder(['b', 'a', 'b']), hashOrder(['a', 'b']));
});
