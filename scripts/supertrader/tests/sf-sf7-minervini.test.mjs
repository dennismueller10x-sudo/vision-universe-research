// Supertrader 7.0 – Minervini source completion (research/minervini-sf7.mjs). Synthetic golden and adversarial cases.
// The 4.0 reference stays untouched: variants only change the setup index, the configuration is REFERENCE_CONFIG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { staggeredStopRisk, flatBaseSetupAt, withFlatBaseSetups, withTrendTemplateLow25, withRsLineRising, rsLineRising, largestDeclineSignal, halfAverageGainStopCheck, sf7VariantRegistrySha256, SF7_VARIANTS, SF7_MODEL_ASSUMPTIONS, SF7_SOURCE_BOUNDS } from '../source-faithful/research/minervini-sf7.mjs';
import { buildSetupIndex, runMinerviniLifecycle } from '../source-faithful/research/minervini-execution.mjs';
import { REFERENCE_CONFIG, variantRegistrySha256, fillBuyOrder, sepaSetupAt } from '../source-faithful/research/minervini-lifecycle.mjs';

// pinned before the first 7.0 snapshot result was read
const PINNED_SF7_REGISTRY_SHA256 = 'a69ea6f4d4db0060c8f83e48c2329373cc0a161debde4515befe85660e714a35';
const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const mk = (closes, range = 0.002) => closes.map((c, k) => bar(k, c, c * (1 + range), c * (1 - range), c));
const path = (knots) => { const out = []; for (let s = 1; s < knots.length; s++) { const [a, pa] = knots[s - 1], [b, pb] = knots[s]; for (let k = a; k < b; k++) out.push(pa + ((pb - pa) * (k - a)) / (b - a)); } out.push(knots.at(-1)[1]); return out; };
const ds = (...secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs });
const run = (d, strategy, setupIndex) => runMinerviniLifecycle(d, { strategy, setupIndex, config: REFERENCE_CONFIG });

// flat base: uptrend to 100, then 30 sessions between ~94.5 and ~100 (about 6 % deep), breakout gap to 104
const FB = path([[0, 40], [280, 100], [285, 95], [290, 99], [295, 94.5], [300, 98.5], [305, 95], [310, 99], [311, 104], [350, 115]]);
// same history, but the base corrects about 20 % (outside "no more than 10 or 15 percent")
const DEEP = path([[0, 40], [280, 100], [290, 82], [300, 96], [310, 99], [311, 104], [350, 115]]);
// textbook VCP of the 4.0 tests (20 / 10 / 5 %)
const VCP = path([[0, 40], [260, 100], [272, 80], [284, 98], [292, 88.2], [300, 96], [305, 91.2], [320, 95], [330, 97], [340, 120], [400, 130]]);
const VOL = VCP.map((_, k) => (k <= 260 ? 2e6 : k <= 284 ? 1.5e6 : k <= 300 ? 1e6 : k <= 330 ? 5e5 : 3e6));

test('SF7-MIN-STAGGER-EXACT: staggered stops redistribute, never increase the planned risk (MIN-W18-1, English original)', () => {
  const ok = staggeredStopRisk({ entry: 100, shares: 100, singleStop: 92, tranches: [{ shares: 50, stop: 95 }, { shares: 50, stop: 89 }] });
  assert.equal(ok.ok, true); assert.equal(ok.plannedRiskSingle, 800); assert.equal(ok.plannedRiskStaggered, 800);
  const wider = staggeredStopRisk({ entry: 100, shares: 100, singleStop: 92, tranches: [{ shares: 50, stop: 94 }, { shares: 50, stop: 86 }] });
  assert.deepEqual(wider.violations, ['STAGGERED_RISK_ABOVE_PLANNED_RISK']);
  assert.deepEqual(staggeredStopRisk({ entry: 100, shares: 100, singleStop: 92, tranches: [{ shares: 60, stop: 95 }] }).violations, ['TRANCHES_DO_NOT_COVER_POSITION']);
  assert.deepEqual(staggeredStopRisk({ entry: 100, shares: 100, singleStop: 101, tranches: [{ shares: 100, stop: 95 }] }).violations, ['INVALID_PLAN']);
});

test('SF7-MIN-FLAT-BASE: flat base <= 15 % with pivot at the base high (B12 PDF 306); the 4.0 strict proxy does not trade it, the variant does', () => {
  const s = { id: 'FB', bars: mk(FB) }, d = ds(s);
  const f = flatBaseSetupAt(s.bars, 309);
  assert.equal(f.state, 'SETUP_DETECTED'); assert.equal(f.pivot, s.bars[280].high); assert.ok(f.flatBase.depth <= SF7_SOURCE_BOUNDS.flatBaseMaxCorrection.value);
  const ref = buildSetupIndex(d, 'SEPA');
  assert.equal(run(d, 'SEPA', ref).trades.length, 0);
  const alt = withFlatBaseSetups(d, ref), r = run(d, 'SEPA', alt);
  assert.equal(r.trades.length, 1); assert.equal(r.trades[0].entryDate, day(311));
  assert.ok(r.trades[0].plannedLoss <= 0.10 + 1e-12); assert.equal(r.reconciliation.pass, true);
  // the reference index is not mutated
  assert.equal(run(d, 'SEPA', ref).trades.length, 0);
});

test('ADV-SF7-MIN-FLAT-BASE-DEEP: a base deeper than 15 % is no flat base; a base shorter than 15 sessions neither', () => {
  const s = { id: 'D', bars: mk(DEEP) };
  for (let i = 290; i <= 310; i++) assert.equal(flatBaseSetupAt(s.bars, i), null);
  const f = { id: 'FB', bars: mk(FB) };
  assert.equal(flatBaseSetupAt(f.bars, 290), null); // 10 sessions after the base high
});

test('SF7-MIN-FLAT-BASE-KEEPS-REF: a strict 4.0 VCP setup is kept unchanged; the variant reproduces the reference trade', () => {
  const s = { id: 'VCP', bars: VCP.map((c, k) => bar(k, c, c * 1.002, c * 0.998, c, VOL[k])) }, d = ds(s);
  const ref = buildSetupIndex(d, 'SEPA'), alt = withFlatBaseSetups(d, ref);
  const a = run(d, 'SEPA', ref), b = run(d, 'SEPA', alt);
  assert.equal(a.trades.length, 1);
  assert.deepEqual(b.trades.map((t) => [t.entryDate, t.entryFill, t.initialStop]), a.trades.map((t) => [t.entryDate, t.entryFill, t.initialStop]));
});

test('SF7-MIN-FLAT-BASE-PIT: the flat-base setup on close i uses bars 0..i only', () => {
  const b = mk(FB);
  for (const i of [300, 305, 309, 320]) assert.deepEqual(flatBaseSetupAt(b.slice(0, i + 1), i), flatBaseSetupAt(b, i));
});

test('SF7-MIN-TT6-25: the 25 % reading of the 52-week-low criterion (B03 PDF 143) qualifies closes the 30 % reference rejects; superset of the reference', () => {
  // slow rise to ~100, then a run to ~129: some closes are 25-30 % above the 52-week low
  const c = [...path([[0, 80], [200, 100], [260, 100.5]]), ...path([[0, 100.5], [40, 129], [48, 121], [56, 128], [62, 124.5], [75, 127.2], [76, 131]]).slice(1)];
  const s = { id: 'L', bars: mk(c) }, d = ds(s);
  const ref = buildSetupIndex(d, 'SEPA'), alt = withTrendTemplateLow25(d);
  assert.equal(alt.counts.sf7.aboveLow, 0.25);
  assert.ok(alt.counts.NOT_QUALIFIED < ref.counts.NOT_QUALIFIED);
  for (const [i, st] of ref.index.get('L') ?? []) assert.deepEqual(alt.index.get('L').get(i), st);
});

test('SF7-MIN-RS-LINE: setups are kept only while the RS line rose over 6 weeks (B03 PDF 143); not measurable -> removed', () => {
  const s = { id: 'VCP', bars: VCP.map((c, k) => bar(k, c, c * 1.002, c * 0.998, c, VOL[k])) };
  const flatBench = s.bars.map((b) => ({ date: b.date, close: 100 }));
  const hotBench = s.bars.map((b, k) => ({ date: b.date, close: 100 * (1 + k * 0.01) })); // market outruns the stock
  const d1 = { ...ds(s), benchmark: flatBench }, d2 = { ...ds(s), benchmark: hotBench }, d3 = { ...ds(s), benchmark: [] };
  const ref = buildSetupIndex(d1, 'SEPA');
  assert.equal(run(d1, 'SEPA', withRsLineRising(d1, ref)).trades.length, run(d1, 'SEPA', ref).trades.length);
  assert.equal(run(d2, 'SEPA', withRsLineRising(d2, ref)).trades.length, 0);
  assert.equal(withRsLineRising(d3, ref).index.size, 0);
  assert.equal(rsLineRising(s.bars, 10, new Map()), null);
});

test('SF7-MIN-LARGEST-DECLINE: the first post-entry decline larger than every decline since the Stage 2 start is reported (B12 PDF 130), diagnostic only', () => {
  const closes = path([[0, 40], [300, 100], [320, 110]]);
  closes[305] = closes[304] * 0.99; // -1 % before the entry: the worst decline since the Stage 2 start
  const tail = [111, 110.5, 105, 106]; // -0.45 %, then -4.98 % on the third session after the entry
  const b = mk([...closes, ...tail]);
  const t = { setupDate: b[315].date, entryDate: b[316].date, exitDate: b.at(-1).date };
  const r = largestDeclineSignal(b, t);
  assert.equal(r.status, 'SIGNAL'); assert.equal(r.signalDate, b[323].date); assert.ok(r.decline < r.priorWorst);
  // PIT: the signal does not change if later bars are removed
  assert.equal(largestDeclineSignal(b.slice(0, 324), { ...t, exitDate: b[323].date }).signalDate, b[323].date);
});

test('SF7-MIN-HALF-AVG-GAIN: planned loss compared with half the PIT average gain and with 10 % (B12 PDF 398-399), counts only', () => {
  const won = Array.from({ length: 10 }, (_, k) => ({ status: 'CLOSED', entryDate: `2020-01-${String(k + 1).padStart(2, '0')}`, exitDate: `2020-02-${String(k + 1).padStart(2, '0')}`, returnPct: 0.16, entryFill: 100, initialStop: 95 }));
  const later = [{ status: 'OPEN_AT_DATA_END', entryDate: '2020-03-01', entryFill: 100, initialStop: 93 }, { status: 'OPEN_AT_DATA_END', entryDate: '2020-03-02', entryFill: 100, initialStop: 89 }];
  const r = halfAverageGainStopCheck([...won, ...later]);
  assert.equal(r.notEvaluated, 10); assert.equal(r.evaluated, 2);
  assert.equal(r.plannedLossWithinHalfAvgGain, 1); assert.equal(r.plannedLossAboveHalfAvgGain, 1); assert.equal(r.plannedLossAbove10pct, 1);
});

test('SF7-MIN-PRICE-CONFIRM: no fill without the price crossing the pivot, whatever the fundamentals (MIN-W18-5, MIN-PRICE-01)', () => {
  const order = { type: 'BUY_STOP_LIMIT', level: 100, stop: 92, limit: 102.2 };
  assert.equal(fillBuyOrder({ date: day(1), open: 98, high: 99.9, low: 97, close: 99, volume: 1e6 }, order).status, 'NOT_TRIGGERED');
  assert.equal(fillBuyOrder({ date: day(1), open: 98, high: 100.5, low: 97, close: 100.2, volume: 1e6 }, order).status, 'FILLED');
});

test('SF7-MIN-REGISTRY: 7.0 additions pre-registered and pinned; the 4.0 reference registry is unchanged', () => {
  assert.equal(variantRegistrySha256(), 'f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75');
  assert.equal(sf7VariantRegistrySha256(), PINNED_SF7_REGISTRY_SHA256);
  assert.deepEqual(SF7_VARIANTS.map((v) => v.id), ['ALT-SEPA-FLAT-BASE', 'ALT-SEPA-TT6-25', 'ALT-SEPA-RS-LINE']);
  for (const v of SF7_VARIANTS) assert.deepEqual(v.config, REFERENCE_CONFIG);
  assert.ok(SF7_MODEL_ASSUMPTIONS.every((m) => m.id.startsWith('MA-MIN7-') && m.why));
});
