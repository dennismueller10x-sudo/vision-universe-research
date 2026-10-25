// Supertrader 7.0 – Minervini package 1.4.0 (research/minervini-sf7-mechanical.mjs): golden and adversarial cases of
// the mechanical diagnostics. Diagnostics only: the 4.0 reference and the 7.0 variants stay unchanged; no diagnostic
// reads a bar after its cut-off (setup close, exit session - 1, fill bar).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseCountAt, marketCorrectionAnchors, baseCountTally, topVolumeDecline, relativeBaseDepth, entryDistanceTally, signalsByBaseNumber, sf7MechanicalRegistrySha256, SF7_MECHANICAL_MODEL_ASSUMPTIONS, SF7_MECHANICAL_SOURCE_BOUNDS, SF7_MECHANICAL_VERSION } from '../source-faithful/research/minervini-sf7-mechanical.mjs';
import { benchIndex, sf7VariantRegistrySha256, SF7_MINERVINI_VERSION } from '../source-faithful/research/minervini-sf7.mjs';

// pinned before the first snapshot run of package 1.4.0
const PINNED_SF7_MECHANICAL_REGISTRY_SHA256 = 'eb1ead1547f54fdb76c2484c7d4df639fca581e5c874c9857abdc75f60c3bc37';
const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const mk = (closes, range = 0.002) => closes.map((c, k) => bar(k, c, c * (1 + range), c * (1 - range), c));
const path = (knots) => { const out = []; for (let s = 1; s < knots.length; s++) { const [a, pa] = knots[s - 1], [b, pb] = knots[s]; for (let k = a; k < b; k++) out.push(pa + ((pb - pa) * (k - a)) / (b - a)); } out.push(knots.at(-1)[1]); return out; };
const ctxOf = (rows) => { const bench = benchIndex(rows); return { bench, anchors: marketCorrectionAnchors(bench) }; };
// corrupt every bar after index cut (prices and volume): a PIT diagnostic must not change
const corruptAfter = (bars, cut) => bars.map((b, k) => (k <= cut ? b : { ...b, open: b.open * 3.1, high: b.high * 3.3, low: b.low * 0.2, close: b.close * (k % 2 ? 0.25 : 2.9), volume: b.volume * 50 }));

// below the 200-day mean around session 270-289 (stock reset), then four bases of >= 20 sessions, each completed by a
// close above the prior closing high; the setup close 530 lies in the fourth base
const FOUR = path([[0, 100], [250, 100], [270, 85], [320, 120], [335, 108], [350, 119], [355, 124], [380, 140], [395, 128], [410, 139], [415, 145], [440, 160], [455, 148], [470, 159], [475, 165], [500, 180], [515, 168], [530, 178], [560, 200]]);
const flatBench = (bars) => bars.map((b) => ({ date: b.date, close: 100 }));
// a 15 % market correction with its low at session 430 (between the 2nd and 3rd breakout)
const corrBench = (bars) => bars.map((b, k) => ({ date: b.date, close: k < 420 ? 100 : k <= 430 ? 100 - 1.5 * (k - 420) : Math.min(100, 85 + (k - 430)) }));

test('SF7-MECH-BASECOUNT: four bases after the stock reset, base number 4 (late stage, B12 PDF 116; late, B03 PDF 207)', () => {
  const b = mk(FOUR), r = baseCountAt(b, 530, ctxOf(flatBench(b)));
  assert.equal(r.status, 'EVIDENCE'); assert.equal(r.baseNumber, 4); assert.equal(r.reset, 'BELOW_MA200'); assert.equal(r.baseCountLowerBound, false);
  assert.equal(r.earlyBase, false); assert.equal(r.lateBase, true); assert.equal(r.lateStage, true); assert.equal(r.likelyFailure, false);
  // without a benchmark the stock reset alone gives the same count
  assert.equal(baseCountAt(b, 530, null).baseNumber, 4);
  // inside the first base the setup is base 1
  assert.equal(baseCountAt(b, 340, null).baseNumber, 1);
});

test('SF7-MECH-BASECOUNT-MARKET-RESET: a market correction of >= 10 % restarts the count at its low (MA-MIN7-BASECOUNT-MARKET-RESET)', () => {
  const b = mk(FOUR), r = baseCountAt(b, 530, ctxOf(corrBench(b)));
  assert.equal(r.reset, 'MARKET_CORRECTION'); assert.equal(r.marketCorrectionLowDate, day(430)); assert.equal(r.baseNumber, 2); assert.equal(r.earlyBase, true);
  // a 9 % market dip is no correction
  const dip = b.map((x, k) => ({ date: x.date, close: k < 420 ? 100 : k <= 430 ? 100 - 0.9 * (k - 420) : Math.min(100, 91 + (k - 430)) }));
  assert.equal(baseCountAt(b, 530, ctxOf(dip)).baseNumber, 4);
  // the anchor is point in time: on a benchmark session before the correction there is none
  const a = marketCorrectionAnchors(benchIndex(corrBench(b)));
  assert.equal(a[425], -1); assert.ok(a[427] >= 0); assert.equal(a.at(-1), 430);
});

test('ADV-SF7-MECH-BASECOUNT-SHORT: a pause shorter than 20 sessions (B12 PDF 115) is no base', () => {
  // the 2nd pause lasts 12 sessions only
  const c = path([[0, 100], [250, 100], [270, 85], [320, 120], [335, 108], [350, 119], [355, 124], [380, 140], [386, 134], [392, 141], [420, 160], [435, 148], [450, 158]]);
  assert.equal(baseCountAt(mk(c), 450, null).baseNumber, 2); // base 1 completed, the short pause is no base, the setup base is the 2nd
  // the same pause stretched to 24 sessions is a base: the setup base becomes the 3rd
  const long = path([[0, 100], [250, 100], [270, 85], [320, 120], [335, 108], [350, 119], [355, 124], [380, 140], [392, 134], [404, 141], [432, 160], [447, 148], [462, 158]]);
  assert.equal(baseCountAt(mk(long), 462, null).baseNumber, 3);
});

test('ADV-SF7-MECH-BASECOUNT-PIT: base count reads bars 0..setup and benchmark closes up to the setup date only', () => {
  const b = mk(FOUR);
  for (const [s0, rows] of [[530, flatBench(b)], [530, corrBench(b)], [425, corrBench(b)], [340, flatBench(b)]]) {
    const ref = baseCountAt(b, s0, ctxOf(rows));
    // later bars corrupted, a crash of the benchmark after the setup date: unchanged
    const futureCrash = rows.map((x, k) => (k <= s0 ? x : { date: x.date, close: 10 + (k % 7) }));
    assert.deepEqual(baseCountAt(corruptAfter(b, s0), s0, ctxOf(futureCrash)), ref, `s0 ${s0}`);
    assert.deepEqual(baseCountAt(b.slice(0, s0 + 1), s0, ctxOf(rows.slice(0, s0 + 1))), ref, `truncated s0 ${s0}`);
  }
});

test('SF7-MECH-BASECOUNT-LOWER-BOUND: no reset in the measurable history -> flagged lower bound; tally counts buckets', () => {
  const up = mk(path([[0, 50], [300, 150], [325, 140], [340, 149]]));
  const r = baseCountAt(up, 340, null);
  assert.equal(r.reset, 'NONE'); assert.equal(r.baseCountLowerBound, true); assert.equal(r.baseNumber, 1); // a straight advance has no completed base
  const t = baseCountTally([r, baseCountAt(mk(FOUR), 530, null), { status: 'NOT_EVALUABLE' }]);
  assert.deepEqual(t.baseNumber, { 1: 1, 2: 0, 3: 0, 4: 1, '5+': 0, unknown: 1 }); assert.equal(t.lowerBound, 1); assert.equal(t.lateStage, 1);
});

test('SF7-MECH-TOPVOL: first post-entry down day on the highest volume since the Stage 2 start (B03 PDF 217), before the exit session', () => {
  const up = path([[0, 30], [320, 100]]);
  const bars = [...up.map((x, k) => bar(k, x, x * 1.002, x * 0.998, x, 1e6 + (k === 315 ? 4e6 : 0))), ...[101, 102, 103, 99, 100, 98, 97].map((x, j) => bar(321 + j, x, x * 1.002, x * 0.998, x, j === 3 ? 9e6 : j === 5 ? 3e6 : 1e6))];
  const t = { setupDate: bars[320].date, entryDate: bars[321].date, exitDate: null };
  const r = topVolumeDecline(bars, t);
  assert.equal(r.status, 'EVIDENCE'); assert.equal(r.topVolumeDeclineBeforeExit, true); assert.equal(r.sessionsFromEntry, 3);
  // the down day is the exit session: a closed trade never reads it
  assert.equal(topVolumeDecline(bars, { ...t, exitDate: bars[324].date }).topVolumeDeclineBeforeExit, false);
  // a down day whose volume is below the earlier peak (session 315, inside Stage 2) is no signal
  const quiet = bars.map((b, k) => (k === 324 ? { ...b, volume: 4.5e6 } : b));
  assert.equal(topVolumeDecline(quiet, t).topVolumeDeclineBeforeExit, false);
  // PIT: bars from the exit session on corrupted -> unchanged
  const closed = { ...t, exitDate: bars[326].date }, ref = topVolumeDecline(bars, closed);
  assert.equal(ref.topVolumeDeclineBeforeExit, true);
  assert.deepEqual(topVolumeDecline(corruptAfter(bars, 325), closed), ref);
  // no Stage 2 at the setup -> not evaluable
  const down = mk(path([[0, 100], [330, 40]]));
  assert.equal(topVolumeDecline(down, { setupDate: down[320].date, entryDate: down[321].date, exitDate: null }).status, 'NOT_IN_STAGE2_AT_SETUP');
});

test('SF7-MECH-RELDEPTH: base depth vs the market decline over the base window (B12 PDF 280), floor 10 %, PIT', () => {
  // base: 52-week high 100 at 300, low 70 (30 % deep), setup 340
  const b = mk(path([[0, 40], [300, 100], [320, 70], [340, 90], [360, 120]]));
  const m12 = b.map((x, k) => ({ date: x.date, close: k < 300 ? 100 : k <= 315 ? 100 - 0.8 * (k - 300) : 88 + 0.3 * (k - 315) }));
  const r = relativeBaseDepth(b, 340, benchIndex(m12));
  assert.equal(r.status, 'EVIDENCE'); assert.ok(Math.abs(r.baseDepth - (1 - 70 * 0.998 / (100 * 1.002))) < 1e-9);
  assert.ok(r.relativeDepth > 2 && r.relativeDepth < 3, String(r.relativeDepth)); assert.equal(r.aboveStrict, true); assert.equal(r.aboveLoose, false);
  // a 5 % market dip is below the floor: not evaluated
  const m5 = b.map((x, k) => ({ date: x.date, close: k < 300 ? 100 : k <= 310 ? 100 - 0.5 * (k - 300) : 95 }));
  assert.equal(relativeBaseDepth(b, 340, benchIndex(m5)).status, 'MARKET_DECLINE_BELOW_FLOOR');
  // PIT: a later benchmark crash and corrupted later bars do not change the reading
  const crash = m12.map((x, k) => (k <= 340 ? x : { date: x.date, close: 5 }));
  assert.deepEqual(relativeBaseDepth(corruptAfter(b, 340), 340, benchIndex(crash)), r);
});

test('SF7-MECH-ENTRY-DISTANCE: fill and gap distance over the pivot, buy-stop buffer 5/10/20 cents in raw dollars (B07 PDF 40/67/87, B12 PDF 297)', () => {
  const s = { id: 'A', bars: [bar(0, 10, 10.08, 9.9, 10), bar(1, 10.5, 10.6, 10.4, 10.55), bar(2, 9.9, 10.15, 9.8, 10.1)] };
  const s2 = { id: 'B', bars: [{ ...bar(0, 5, 5.04, 4.9, 5), splitAdj: 2 }] }; // raw price 2x the adjusted price
  const byId = new Map([[s.id, s], [s2.id, s2]]);
  const trades = [
    { id: 'A', entryDate: day(0), entryFill: 10, pivot: 10, entryBasis: 'INTRADAY_PIVOT_TOUCH' }, // high 0.08 over: no trigger at 10c and 20c
    { id: 'A', entryDate: day(1), entryFill: 10.5, pivot: 10.2, entryBasis: 'OPEN_GAP_AT_OR_ABOVE_PIVOT' }, // gap 2.94 %, high 0.40 over
    { id: 'A', entryDate: day(2), entryFill: 10, pivot: 10, entryBasis: 'INTRADAY_PIVOT_TOUCH' }, // high 0.15 over: no trigger at 20c
    { id: 'B', entryDate: day(0), entryFill: 5, pivot: 5, entryBasis: 'INTRADAY_PIVOT_TOUCH' }, // 0.04 adjusted = 0.08 raw
  ];
  const r = entryDistanceTally(trades, byId);
  assert.equal(r.fillAbovePivot['0'], 3); assert.equal(r.fillAbovePivot['2-3pct'], 1);
  assert.equal(r.gapOpenAbovePivot['2-3pct'], 1);
  assert.deepEqual(r.buyStopBuffer, { evaluated: 4, unknown: 0, noTriggerAt5c: 0, noTriggerAt10c: 2, noTriggerAt20c: 3 });
  assert.deepEqual(SF7_MECHANICAL_SOURCE_BOUNDS.pivotBufferUsd.value, [0.05, 0.10, 0.20]);
});

test('SF7-MECH-CLIMAX-BY-BASE: exit-variant signals counted by base number (F7-B03-225-092), no signal suppressed', () => {
  const trades = [
    { id: 'A', events: [{ type: 'EXIT_SCHEDULED_NEXT_OPEN', rule: 'SF7_EXIT_VARIANT' }] },
    { id: 'B', events: [{ type: 'EXIT_SCHEDULED_NEXT_OPEN', rule: 'SF7_EXIT_VARIANT' }, { type: 'EXIT_SCHEDULED_NEXT_OPEN', rule: 'REF' }] },
    { id: 'C', events: [] },
  ];
  const base = { A: { status: 'EVIDENCE', baseNumber: 1 }, B: { status: 'EVIDENCE', baseNumber: 6 }, C: { status: 'EVIDENCE', baseNumber: 2 } };
  assert.deepEqual(signalsByBaseNumber(trades, (t) => base[t.id]), { 1: 1, 2: 0, 3: 0, 4: 0, '5+': 1, unknown: 0 });
});

test('SF7-MECH-REGISTRY: package pre-registered and pinned; the 7.0 setup registry content is unchanged (only its version string)', () => {
  assert.equal(SF7_MECHANICAL_VERSION, 'sf7-minervini-mechanical-1.0.0'); assert.equal(SF7_MINERVINI_VERSION, 'sf7-minervini-1.4.0');
  assert.equal(sf7MechanicalRegistrySha256(), PINNED_SF7_MECHANICAL_REGISTRY_SHA256);
  assert.equal(sf7VariantRegistrySha256('sf7-minervini-1.3.0'), 'ce98c24feb40be85deba857d27a6a44a1aaec168570e63e114f217513385bd7e', 'bounds, assumptions and ALT-SEPA-* variants of minervini-sf7.mjs unchanged');
  assert.ok(SF7_MECHANICAL_MODEL_ASSUMPTIONS.every((m) => m.id.startsWith('MA-MIN7-') && m.why && m.reference));
  for (const b of Object.values(SF7_MECHANICAL_SOURCE_BOUNDS)) { assert.equal(b.translationUnverified, true); assert.match(b.source, /^(B12|B07|B03) PDF/); }
});

test('SF7-MECH-RUNNER: the runner reports the mechanical diagnostics per strategy, counts only; REF is unchanged by them', async () => {
  const { sf7Part } = await import('../source-faithful/research/run-sf7-minervini.mjs');
  const { SF7_EXIT_VARIANTS } = await import('../source-faithful/research/minervini-sf7-exits.mjs');
  const v = mk(path([[0, 40], [260, 100], [272, 80], [284, 98], [292, 88.2], [300, 96], [305, 91.2], [320, 95], [330, 97], [340, 120], [400, 130]]));
  const d = { calendar: v.map((b) => b.date), securities: [{ id: 'V', bars: v }], benchmark: flatBench(v), spyTR: null };
  const full = sf7Part(d, { from: null, to: null }), noExit = sf7Part(d, { from: null, to: null, exitVariants: [] });
  for (const st of ['SEPA', 'POWER_PLAY']) {
    const m = full.pub.strategies[st].diagnostics.mechanical;
    assert.equal(m.version, SF7_MECHANICAL_VERSION);
    for (const k of ['baseCount', 'topVolumeDecline', 'relativeBaseDepth', 'entryDistance']) assert.ok(m[k], k);
    assert.equal(full.pub.strategies[st].ref.ledgerSha256, noExit.pub.strategies[st].ref.ledgerSha256);
  }
  for (const id of ['EXIT-CLIMAX', 'EXIT-CLIMAX-UPCLOSES']) for (const st of SF7_EXIT_VARIANTS.find((x) => x.id === id).strategies) assert.ok(full.pub.strategies[st].exitVariants[id].signalsByBaseNumber, `${st} ${id}`);
  const txt = JSON.stringify(full.pub);
  for (const k of ['"pnl"', '"returnPct"', '"equity"', '"cagr"', '"sharpe"', '"metrics"', '"decline"', '"relativeDepth"']) assert.ok(!txt.includes(k), k);
});
