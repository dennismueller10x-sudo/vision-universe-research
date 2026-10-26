// Supertrader 7.0 – Minervini package 1.4.0 (research/minervini-sf7-mechanical.mjs): golden and adversarial cases of
// the mechanical diagnostics. Diagnostics only: the 4.0 reference and the 7.0 variants stay unchanged; no diagnostic
// reads a bar after its cut-off (setup close, exit session - 1, fill bar).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseCountAt, marketCorrectionAnchors, baseCountTally, fieldTally, topVolumeDecline, relativeBaseDepth, entryDistanceTally, signalsByBaseNumber, sf7MechanicalRegistrySha256, SF7_MECHANICAL_MODEL_ASSUMPTIONS, SF7_MECHANICAL_SOURCE_BOUNDS, SF7_MECHANICAL_VERSION } from '../source-faithful/research/minervini-sf7-mechanical.mjs';
import { benchIndex, sf7VariantRegistrySha256, SF7_MINERVINI_VERSION } from '../source-faithful/research/minervini-sf7.mjs';
import { buildSetupIndex, runMinerviniLifecycle } from '../source-faithful/research/minervini-execution.mjs';
import { REFERENCE_CONFIG } from '../source-faithful/research/minervini-lifecycle.mjs';
import { trendTemplate } from '../source-faithful/methods/minervini.mjs';
import { smaAt } from '../source-faithful/common/series.mjs';

// mechanical 1.0.0: eb1ead15… (first pin), 0cc8cb2a… (review fixes, snapshot run 40226429160); re-pinned for mechanical
// 1.1.0 (review #940: both G-TOPVOL windows, both G-RELDEPTH windows, uncertainty with direction): 131746dc…; re-pinned for
// mechanical 1.2.0 (review #940, third round: MA-MIN7-BASECOUNT-BASE revision 2, intraday base high) before its snapshot run
const PINNED_SF7_MECHANICAL_REGISTRY_SHA256 = 'a122022acf1d436c1fa6eeaab47c4ae947aaa0805836ef854abf316f1ac766e9';
const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const mk = (closes, range = 0.002) => closes.map((c, k) => bar(k, c, c * (1 + range), c * (1 - range), c));
const path = (knots) => { const out = []; for (let s = 1; s < knots.length; s++) { const [a, pa] = knots[s - 1], [b, pb] = knots[s]; for (let k = a; k < b; k++) out.push(pa + ((pb - pa) * (k - a)) / (b - a)); } out.push(knots.at(-1)[1]); return out; };
const ctxOf = (rows) => { const bench = benchIndex(rows); return { bench, anchors: marketCorrectionAnchors(bench) }; };
// corrupt every bar after index cut (prices and volume): a PIT diagnostic must not change
const corruptAfter = (bars, cut) => bars.map((b, k) => (k <= cut ? b : { ...b, open: b.open * 3.1, high: b.high * 3.3, low: b.low * 0.2, close: b.close * (k % 2 ? 0.25 : 2.9), volume: b.volume * 50 }));

// below the 200-day mean around session 270-289 (stock reset), then four bases of >= 20 sessions, each completed by a
// close above the prior base high (intraday, MA-MIN7-BASECOUNT-BASE revision 2); the setup close 530 lies in the fourth base
const FOUR = path([[0, 100], [250, 100], [270, 85], [320, 120], [335, 108], [350, 119], [355, 124], [380, 140], [395, 128], [410, 139], [415, 145], [440, 160], [455, 148], [470, 159], [475, 165], [500, 180], [515, 168], [530, 178], [560, 200]]);
const flatBench = (bars) => bars.map((b) => ({ date: b.date, close: 100 }));
// a 15 % market correction with its low at session 430 (between the 2nd and 3rd breakout)
const corrBench = (bars) => bars.map((b, k) => ({ date: b.date, close: k < 420 ? 100 : k <= 430 ? 100 - 1.5 * (k - 420) : Math.min(100, 85 + (k - 430)) }));

test('SF7-MECH-BASECOUNT: four bases after the stock reset, base number 4 (late stage, B12 PDF 116; late, B03 PDF 207)', () => {
  const b = mk(FOUR), r = baseCountAt(b, 530, ctxOf(flatBench(b)));
  assert.equal(r.status, 'EVIDENCE'); assert.equal(r.baseNumber, 4); assert.equal(r.reset, 'BELOW_MA200'); assert.equal(r.baseCountUncertain, false); assert.deepEqual(r.uncertaintyReasons, []);
  assert.equal(r.earlyBase, false); assert.equal(r.lateBase, true); assert.equal(r.lateStage, true); assert.equal(r.likelyFailure, false);
  // without a benchmark the stock reset alone gives the same count
  assert.equal(baseCountAt(b, 530, null).baseNumber, 4);
  // inside the first base the setup is base 1
  assert.equal(baseCountAt(b, 340, null).baseNumber, 1);
  // review M1: a setup close above an old closing high (but below the intraday pivot) does not complete its own base
  const above = b.map((x, k) => (k === 530 ? { ...x, close: 180.2, high: 181, low: 179 } : x));
  assert.ok(above[530].close > b[500].close && above[530].close < b[500].high);
  assert.equal(baseCountAt(above, 530, null).baseNumber, 4);
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

test('SF7-MECH-BASECOUNT-UNCERTAIN: without a reset in the data the flags state the direction of the possible error (review #940 L2); tally counts buckets', () => {
  const up = mk(path([[0, 50], [300, 150], [325, 140], [340, 149]]));
  const r = baseCountAt(up, 340, null);
  // a straight advance has no completed base: earlier bases may be unseen (undercount), nothing counted can be spurious
  assert.equal(r.reset, 'NONE'); assert.equal(r.baseNumber, 1); assert.equal(r.baseCountUncertain, true);
  assert.equal(r.undercountPossible, true); assert.equal(r.overcountPossible, false); assert.deepEqual(r.uncertaintyReasons, ['NO_RESET_IN_DATA']);
  // a base completed before the first computable 200-day mean (session ~105): the counted base may be spurious (overcount)
  const early = mk(path([[0, 50], [60, 60], [90, 55], [110, 62], [300, 150], [325, 140], [340, 149]]));
  const e = baseCountAt(early, 340, null);
  assert.equal(e.baseNumber, 2); assert.equal(e.overcountPossible, true); assert.equal(e.undercountPossible, true);
  assert.deepEqual(e.uncertaintyReasons, ['NO_RESET_IN_DATA', 'RUNNING_HIGH_BEFORE_DATA_UNKNOWN', 'MA200_NOT_COMPUTABLE_AFTER_RESET']);
  // a market-correction low inside the data: no undercount, but a reset before the first 200-day mean could be missed
  const corr = up.map((x, k) => ({ date: x.date, close: k < 50 ? 100 : k <= 70 ? 100 - (k - 50) : 80 }));
  const m = baseCountAt(early, 340, ctxOf(corr));
  assert.equal(m.reset, 'MARKET_CORRECTION'); assert.equal(m.undercountPossible, false); assert.equal(m.overcountPossible, true); assert.deepEqual(m.uncertaintyReasons, ['RUNNING_HIGH_BEFORE_DATA_UNKNOWN', 'MA200_NOT_COMPUTABLE_AFTER_RESET']);
  // a known stock reset and a missing close inside the window (the 200-day mean undefined for 200 sessions): overcount
  // possible, flagged; the same series without the gap is certain
  const four = mk(FOUR), gap = four.map((x, k) => (k === 360 ? { ...x, close: null } : x));
  assert.equal(baseCountAt(four, 530, null).baseCountUncertain, false);
  const g = baseCountAt(gap, 530, null);
  assert.equal(g.overcountPossible, true); assert.equal(g.undercountPossible, false); assert.deepEqual(g.uncertaintyReasons, ['MA200_NOT_COMPUTABLE_AFTER_RESET']);
  // early bases: every base <= 2, and separately those after a market-correction reset (F7-B03-207-082)
  assert.equal(m.earlyBase, true); assert.equal(m.earlyBaseAfterMarketCorrection, true); assert.equal(e.earlyBase, true); assert.equal(e.earlyBaseAfterMarketCorrection, false);
  const t = baseCountTally([r, e, baseCountAt(mk(FOUR), 530, null), { status: 'NOT_EVALUABLE' }]);
  assert.deepEqual(t.baseNumber, { 1: 1, 2: 1, 3: 0, 4: 1, '5+': 0, unknown: 1 }); assert.equal(t.uncertain, 2); assert.equal(t.undercountPossible, 2); assert.equal(t.overcountPossible, 1); assert.equal(t.lateStage, 1); assert.equal(t.earlyBase, 2); assert.equal(t.earlyBaseAfterMarketCorrection, 0);
});

test('ADV-SF7-MECH-BASECOUNT-SETUP-SESSION: a setup close above an older closing high (below the intraday pivot) is no completed base (review #940 M1)', () => {
  // base 1 completes at ~283 (close above the closing high 100 of session 250); closing high 105 at 300, intraday high
  // 106.05; the setup close 105.2 on session 330 lies above 105 but below the pivot level: still the 2nd base
  const c = path([[0, 50], [250, 100], [280, 95], [300, 105], [315, 100], [330, 105.2], [340, 104]]);
  const b = c.map((x, k) => bar(k, x, x * 1.01, x * 0.99, x));
  assert.ok(b[330].close > 105 && b[330].close < b[300].high);
  for (const s0 of [325, 329, 330]) assert.equal(baseCountAt(b, s0, null).baseNumber, 2, `s0 ${s0}`);
  // MA-MIN7-BASECOUNT-BASE revision 2: once the setup session is in the past its close 105.2 is still below the intraday
  // base high 106.05 and completes nothing (revision 1 counted it against the closing high 105: base 3)
  assert.equal(baseCountAt(b, 331, null).baseNumber, 2);
  // a close above the intraday base high on session 331 completes the 2nd base: a setup on 332 is the 3rd
  const out = b.map((x, k) => (k === 331 ? bar(k, 105.5, 107.5, 105, 107) : x));
  assert.equal(baseCountAt(out, 331, null).baseNumber, 2); assert.equal(baseCountAt(out, 332, null).baseNumber, 3);
});

// review #940, third round (MEDIUM-1): restart below the 200-day mean around 270, base start 320 with intraday high 125
// and close 118, contraction to 108, recovery to the close 119.5 at 350 (above the close 118, below the high 125),
// pullback to 112, setup close 117 at 380
const RECOVERY = (top) => { const c = path([[0, 100], [250, 100], [270, 85], [320, 118], [335, 108], [350, top], [365, 112], [380, 117], [390, 116]]); return c.map((x, k) => bar(k, x, k === 320 ? 125 : x * 1.004, x * 0.996, x)); };

test('ADV-SF7-MECH-BASECOUNT-INTRADAY-PIVOT: a recovery close above the base-start close but below its intraday high is no breakout (MA-MIN7-BASECOUNT-BASE revision 2, review #940 MEDIUM-1)', () => {
  const b = RECOVERY(119.5);
  assert.ok(b[350].close > b[320].close && b[350].close < b[320].high);
  const r = baseCountAt(b, 380, null);
  assert.equal(r.baseNumber, 1); assert.equal(r.reset, 'BELOW_MA200'); assert.equal(r.baseCountUncertain, false); assert.deepEqual(r.uncertaintyReasons, []);
  // counter-check: a real breakout close above 125 (30 sessions after the base start) completes base 1, the setup is base 2
  const g = RECOVERY(126);
  assert.ok(g[350].close > g[320].high);
  assert.equal(baseCountAt(g, 380, null).baseNumber, 2); assert.equal(baseCountAt(g, 380, null).baseCountUncertain, false);
  // both PIT: later bars corrupted, same reading
  for (const x of [b, g]) assert.deepEqual(baseCountAt(corruptAfter(x, 380), 380, null), baseCountAt(x, 380, null));
});

test('ADV-SF7-MECH-BASECOUNT-YOUNG-AND-BOUNDARIES: a young base follows a higher intraday high; strict breakout; maturity at exactly 20 sessions (review #940, 1.2.0 delta, LOW-1/LOW-2)', () => {
  const poke = (b, k, h) => b.map((x, j) => (j === k ? { ...x, high: h } : x));
  // young base (start 320, high 125): session 330 trades to 127 -> base start 330, high 127; a close of 126 at 350 is no breakout
  assert.equal(baseCountAt(poke(RECOVERY(126), 330, 127), 380, null).baseNumber, 1, 'young-base rule moves the pivot');
  // a close of 128 at 350, exactly 20 sessions after the moved start 330: the breakout counts (>= 20)
  // (highs of 331-349 capped at 126, so the rising path makes no later intraday high of its own inside the young base)
  const m20 = poke(RECOVERY(128), 330, 127).map((x, j) => (j > 330 && j < 350 ? { ...x, high: Math.min(x.high, 126) } : x));
  assert.equal(baseCountAt(m20, 380, null).baseNumber, 2, 'maturity at exactly 20 sessions');
  // a poke exactly 20 sessions after the start (session 340) is in a mature base: ignored; the close 126 > 125 at 350 counts
  assert.equal(baseCountAt(poke(RECOVERY(126), 340, 127), 380, null).baseNumber, 2, 'mature base at 20 sessions ignores the poke');
  // a close equal to the base high is no breakout (strict >)
  const eq = RECOVERY(125); assert.equal(eq[350].close, 125); assert.equal(eq[320].high, 125);
  assert.equal(baseCountAt(eq, 380, null).baseNumber, 1, 'close = base high is no breakout');
});

test('ADV-SF7-MECH-MA200-EXACT: the stock reset uses the smaAt decision exactly, also where the rolling sum drifts (review #940, third round, LOW-3)', () => {
  // flat stretches after higher prices: the rolling sum and smaAt's summation differ in the last bits around the mean
  for (const [hiP, loP] of [[0.3, 0.1], [0.7, 0.1], [1.3, 0.3], [100.3, 100.1]]) {
    const b = mk([...Array(300).fill(hiP), ...Array(400).fill(loP), ...path([[0, loP], [60, loP * 1.3]])], 0);
    for (const s0 of [520, 650, 699, 720, b.length - 1]) {
      let want = -1; for (let k = 0; k <= s0; k++) { const m = smaAt(b, k, 200); if (m !== null && b[k].close < m) want = k; }
      assert.equal(baseCountAt(b, s0, null).resetDate, want >= 0 ? b[want].date : null, `${hiP}/${loP} s0 ${s0}`);
    }
  }
});

test('ADV-SF7-MECH-BASECOUNT-ATTEMPT: an intraday poke above a mature base high without a close above it moves neither the base start nor the pivot', () => {
  // mature base (start 320, high 125); session 349 trades up to 127 and closes 124; session 350 closes 125.5 (above the
  // base high 125, below the attempt high 127): the breakout of base 1, 30 sessions after its start
  const b = RECOVERY(119.5).map((x, k) => (k === 349 ? bar(k, 120, 127, 119, 124) : k === 350 ? bar(k, 124, 126, 123, 125.5) : x));
  assert.equal(baseCountAt(b, 380, null).baseNumber, 2);
  // without the close above 125 the attempt alone completes nothing
  const a = RECOVERY(119.5).map((x, k) => (k === 349 ? bar(k, 120, 127, 119, 124) : x));
  assert.equal(baseCountAt(a, 380, null).baseNumber, 1);
});

test('SF7-MECH-TOPVOL: first post-entry down day on the highest volume since the trend start (B03 PDF 217), before the exit session, both windows', () => {
  const up = path([[0, 30], [320, 100]]);
  const bars = [...up.map((x, k) => bar(k, x, x * 1.002, x * 0.998, x, 1e6 + (k === 315 ? 4e6 : 0))), ...[101, 102, 103, 99, 100, 98, 97].map((x, j) => bar(321 + j, x, x * 1.002, x * 0.998, x, j === 3 ? 9e6 : j === 5 ? 3e6 : 1e6))];
  const t = { setupDate: bars[320].date, entryDate: bars[321].date, exitDate: null };
  const r = topVolumeDecline(bars, t);
  for (const w of ['trendTemplateRun', 'aboveMa200Run']) { assert.equal(r[w].status, 'EVIDENCE', w); assert.equal(r[w].topVolumeDeclineBeforeExit, true, w); assert.equal(r[w].sessionsFromEntry, 3, w); }
  assert.equal(r.aboveMa200Run.windowTruncated, true); // a straight advance: no close below the 200-day mean in the data
  // the down day is the exit session: a closed trade never reads it
  // exit on the entry session: no session seen, not evaluable (not "false")
  const same = topVolumeDecline(bars, { ...t, exitDate: bars[321].date });
  assert.equal(same.trendTemplateRun.status, 'NO_SESSION_BEFORE_EXIT'); assert.equal(same.aboveMa200Run.status, 'NO_SESSION_BEFORE_EXIT');
  const atExit = topVolumeDecline(bars, { ...t, exitDate: bars[324].date });
  assert.equal(atExit.trendTemplateRun.topVolumeDeclineBeforeExit, false); assert.equal(atExit.aboveMa200Run.topVolumeDeclineBeforeExit, false);
  // a down day whose volume is below the earlier peak (session 315, inside both windows) is no signal
  const quiet = bars.map((b, k) => (k === 324 ? { ...b, volume: 4.5e6 } : b));
  assert.equal(topVolumeDecline(quiet, t).trendTemplateRun.topVolumeDeclineBeforeExit, false); assert.equal(topVolumeDecline(quiet, t).aboveMa200Run.topVolumeDeclineBeforeExit, false);
  // PIT: bars from the exit session on corrupted -> unchanged
  const closed = { ...t, exitDate: bars[326].date }, ref = topVolumeDecline(bars, closed);
  assert.equal(ref.trendTemplateRun.topVolumeDeclineBeforeExit, true);
  assert.deepEqual(topVolumeDecline(corruptAfter(bars, 325), closed), ref);
  // a volume peak early in the advance (session 250) lies inside the MA200 window: no signal there; the Trend Template
  // run (needs 252 sessions of history) starts later and does not see it (review M2: the two windows are reported apart)
  const early = bars.map((b, k) => (k === 250 ? { ...b, volume: 9.5e6 } : b)), ev = topVolumeDecline(early, t);
  assert.equal(ev.aboveMa200Run.topVolumeDeclineBeforeExit, false); assert.equal(ev.trendTemplateRun.topVolumeDeclineBeforeExit, true); assert.ok(ev.trendTemplateRun.windowStartDate > day(250));
  // open trade (review #940, third round, LOW-1): the scan ends at the run's markDate; bars after it are never read
  const marked = { ...t, markDate: bars[323].date };
  const mr = topVolumeDecline(bars, marked);
  assert.equal(mr.trendTemplateRun.topVolumeDeclineBeforeExit, false); assert.equal(mr.aboveMa200Run.topVolumeDeclineBeforeExit, false);
  assert.deepEqual(topVolumeDecline(corruptAfter(bars, 323), marked), mr);
  assert.equal(topVolumeDecline(bars, { ...t, markDate: bars[324].date }).trendTemplateRun.topVolumeDeclineBeforeExit, true);
  // no Stage 2 at the setup -> not evaluable in both windows
  const down = mk(path([[0, 100], [330, 40]]));
  const dn = topVolumeDecline(down, { setupDate: down[320].date, entryDate: down[321].date, exitDate: null });
  assert.equal(dn.trendTemplateRun.status, 'NOT_IN_STAGE2_AT_SETUP'); assert.equal(dn.aboveMa200Run.status, 'NOT_IN_STAGE2_AT_SETUP');
});

test('ADV-SF7-MECH-TOPVOL-WINDOWS: the Trend Template run starts after the MA50 break inside the base; the MA200 window reaches the earlier Stage 2 volume (review #940 M2)', () => {
  // below the 200-day mean around 235-241, Stage 2 advance with a 9M-share session at 350, base with a dip below the
  // 50-day mean (400-425), setup 428, entry 429, down day on 5M shares at 432
  const c = path([[0, 30], [220, 30], [235, 27], [400, 100], [410, 90], [425, 101], [431, 103], [432, 101], [440, 104]]);
  const bars = c.map((x, k) => bar(k, x, x * 1.002, x * 0.998, x, k === 350 ? 9e6 : k === 432 ? 5e6 : 1e6));
  let ttStart = 428; while (ttStart > 0 && trendTemplate(bars, ttStart - 1).pass) ttStart--;
  assert.ok(ttStart > 350 && ttStart < 428, String(ttStart));
  const r = topVolumeDecline(bars, { setupDate: day(428), entryDate: day(429), exitDate: null });
  assert.equal(r.trendTemplateRun.windowStartDate, day(ttStart)); assert.equal(r.trendTemplateRun.topVolumeDeclineBeforeExit, true);
  assert.equal(r.aboveMa200Run.windowTruncated, false); assert.ok(r.aboveMa200Run.windowStartDate < day(350)); assert.equal(r.aboveMa200Run.topVolumeDeclineBeforeExit, false);
  // exact window start: the session after the last close below smaAt(200) up to the setup (pre-merge verification of #940, N1)
  let lb = -1; for (let k = 0; k <= 428; k++) { const m = smaAt(bars, k, 200); if (m !== null && bars[k].close < m) lb = k; }
  assert.ok(lb > 0); assert.equal(r.aboveMa200Run.windowStartDate, day(lb + 1));
  // the windows start at or before the setup: corrupting everything after the scan end changes nothing
  const closed = { setupDate: day(428), entryDate: day(429), exitDate: day(434) };
  assert.deepEqual(topVolumeDecline(corruptAfter(bars, 433), closed), topVolumeDecline(bars, closed));
});

test('SF7-MECH-RELDEPTH: stock vs market decline from closes, SAME_WINDOW and TRAILING_HIGH (B12 PDF 280), floor 10 %, PIT', () => {
  // base: 52-week high at 300 (close 100), close low 70 at 320 (30 % deep), setup 340
  const b = mk(path([[0, 40], [300, 100], [320, 70], [340, 90], [360, 120]]));
  const m12 = b.map((x, k) => ({ date: x.date, close: k < 300 ? 100 : k <= 315 ? 100 - 0.8 * (k - 300) : 88 + 0.3 * (k - 315) }));
  const r = relativeBaseDepth(b, 340, benchIndex(m12));
  assert.equal(r.status, 'EVIDENCE'); assert.equal(r.baseStartDate, day(300));
  for (const w of ['sameWindow', 'trailingHigh']) {
    // closes on both sides (review #940 L3): 30 % / 12 % = 2.5
    assert.ok(Math.abs(r[w].stockDecline - 0.30) < 1e-9, w); assert.ok(Math.abs(r[w].marketDecline - 0.12) < 1e-9, w);
    assert.ok(Math.abs(r[w].relativeDepth - 2.5) < 1e-9, w); assert.equal(r[w].aboveStrict, true); assert.equal(r[w].aboveLoose, false);
  }
  // closes, not lows: a deep intraday low inside the base leaves the reading unchanged (pre-merge verification of #940, N2)
  const deepLow = b.map((x, k) => (k === 320 ? { ...x, low: 40 } : x));
  assert.deepEqual(relativeBaseDepth(deepLow, 340, benchIndex(m12)), r);
  // a 5 % market dip is below the floor in both windows
  const m5 = b.map((x, k) => ({ date: x.date, close: k < 300 ? 100 : k <= 310 ? 100 - 0.5 * (k - 300) : 95 }));
  const r5 = relativeBaseDepth(b, 340, benchIndex(m5));
  assert.equal(r5.sameWindow.status, 'MARKET_DECLINE_BELOW_FLOOR'); assert.equal(r5.trailingHigh.status, 'MARKET_DECLINE_BELOW_FLOOR');
  // PIT: a later benchmark crash and corrupted later bars do not change the reading
  const crash = m12.map((x, k) => (k <= 340 ? x : { date: x.date, close: 5 }));
  assert.deepEqual(relativeBaseDepth(corruptAfter(b, 340), 340, benchIndex(crash)), r);
});

test('ADV-SF7-MECH-RELDEPTH-RUNNING-CORRECTION: a market correction already running at the base start is cut by SAME_WINDOW, measured by TRAILING_HIGH (review #940 L3)', () => {
  const b = mk(path([[0, 40], [300, 100], [320, 70], [340, 90], [360, 120]]));
  // market high 100 at 280, 90 at the base start 300, low 86 at 315: 4.4 % inside the window, 14 % below the trailing high
  const m = b.map((x, k) => ({ date: x.date, close: k <= 280 ? 100 : k <= 300 ? 100 - 0.5 * (k - 280) : k <= 315 ? 90 - (4 / 15) * (k - 300) : 86 }));
  const r = relativeBaseDepth(b, 340, benchIndex(m));
  assert.equal(r.sameWindow.status, 'MARKET_DECLINE_BELOW_FLOOR'); assert.ok(Math.abs(r.sameWindow.marketDecline - (1 - 86 / 90)) < 1e-9);
  assert.equal(r.trailingHigh.status, 'EVIDENCE'); assert.ok(Math.abs(r.trailingHigh.marketDecline - 0.14) < 1e-9);
  assert.ok(Math.abs(r.trailingHigh.relativeDepth - 0.30 / 0.14) < 1e-9); assert.equal(r.trailingHigh.aboveStrict, true); assert.equal(r.trailingHigh.aboveLoose, false);
  // benchmark history after the setup date is never read
  assert.deepEqual(relativeBaseDepth(b, 340, benchIndex(m.slice(0, 341))), r);
  // the stock side never reaches before the base start (review #940, second round): an older high of 150 before a crash
  // leaves the base decline at 30 % in both variants
  const old = mk(path([[0, 40], [40, 150], [85, 60], [300, 100], [320, 70], [340, 90], [360, 120]]));
  const o = relativeBaseDepth(old, 340, benchIndex(m));
  assert.equal(o.baseStartDate, day(300)); assert.ok(Math.abs(o.trailingHigh.stockDecline - 0.30) < 1e-9); assert.equal(o.trailingHigh.aboveLoose, false);
  assert.equal(o.trailingHigh.stockDecline, o.sameWindow.stockDecline);
});

test('SF7-MECH-ENTRY-DISTANCE: fill and gap distance over the pivot, buy-stop buffer 5/10/20 cents in raw dollars (B07 PDF 40/67/87, B12 PDF 297)', () => {
  const s = { id: 'A', bars: [bar(0, 10, 10.08, 9.9, 10), bar(1, 10.5, 10.6, 10.4, 10.55), bar(2, 9.9, 10.15, 9.8, 10.1)] };
  const s2 = { id: 'B', bars: [{ ...bar(0, 5, 5.04, 4.9, 5), splitAdj: 2 }] }; // raw price 2x the adjusted price
  const byId = new Map([[s.id, s], [s2.id, s2]]);
  const trades = [
    { id: 'A', entryDate: day(0), entryFill: 10, pivot: 10, entryBasis: 'OPEN_GAP_AT_OR_ABOVE_PIVOT' }, // open at the pivot (the engine's basis), high 0.08 over: no trigger at 10c and 20c
    { id: 'A', entryDate: day(1), entryFill: 10.5, pivot: 10.2, entryBasis: 'OPEN_GAP_AT_OR_ABOVE_PIVOT' }, // gap 2.94 %, high 0.40 over
    { id: 'A', entryDate: day(2), entryFill: 10, pivot: 10, entryBasis: 'INTRADAY_PIVOT_TOUCH' }, // open below: no gap; high 0.15 over: no trigger at 20c
    { id: 'B', entryDate: day(0), entryFill: 5, pivot: 5, entryBasis: 'OPEN_GAP_AT_OR_ABOVE_PIVOT' }, // open at the pivot; 0.04 adjusted = 0.08 raw
  ];
  const r = entryDistanceTally(trades, byId);
  assert.equal(r.fillAbovePivot['0'], 3); assert.equal(r.fillAbovePivot['2-3pct'], 1);
  // the gap reading uses the fill-bar open: an open exactly at the pivot is a 0 % gap
  assert.equal(r.gapOpenAbovePivot['2-3pct'], 1); assert.equal(r.gapOpenAbovePivot['0'], 2); assert.equal(r.gapOpenAbovePivot.unknown, 0);
  assert.deepEqual(r.buyStopBuffer, { evaluated: 4, unknown: 0, noTriggerAt5c: 0, noTriggerAt10c: 2, noTriggerAt20c: 3 });
  assert.equal(r.ordersNotExecutedAboveLimit, null);
  assert.deepEqual(SF7_MECHANICAL_SOURCE_BOUNDS.pivotBufferUsd.value, [0.05, 0.10, 0.20]);
});

test('ADV-SF7-MECH-GAP-LIMIT-FILL: a large opening gap filled at the limit counts as a gap; non-executed orders are a count, not trades (review #940 M4)', () => {
  // pivot 100, open 108 above the limit 104, filled at the limit after the open
  const s = { id: 'L', bars: [bar(0, 108, 109, 103, 106)] }, byId = new Map([[s.id, s]]);
  const t = { id: 'L', entryDate: day(0), entryFill: 104, pivot: 100, entryBasis: 'LIMIT_FILL_AFTER_OPEN' };
  const r = entryDistanceTally([t], byId, { notExecutedAboveLimit: 2 });
  assert.equal(r.gapOpenAbovePivot.above5pct, 1); assert.deepEqual(r.gapOpenAbovePivot.byEntryBasis, { LIMIT_FILL_AFTER_OPEN: 1 });
  assert.equal(r.fillAbovePivot['3-5pct'], 1); assert.equal(r.ordersNotExecutedAboveLimit, 2); assert.equal(r.trades, 1);
  // no bar or no pivot: unknown, never a silent "no gap"
  const u = entryDistanceTally([{ ...t, pivot: undefined, entryBasis: 'OPEN' }, { ...t, id: 'X' }], byId);
  assert.equal(u.gapOpenAbovePivot.unknown, 2); assert.equal(u.buyStopBuffer.unknown, 2);
  // the diagnostic reads, never writes: the trade and the bars are unchanged
  const before = JSON.stringify([t, s]); entryDistanceTally([t], byId, { notExecutedAboveLimit: 2 }); assert.equal(JSON.stringify([t, s]), before);
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
  assert.equal(SF7_MECHANICAL_VERSION, 'sf7-minervini-mechanical-1.2.0');
  assert.equal(SF7_MECHANICAL_MODEL_ASSUMPTIONS.find((m) => m.id === 'MA-MIN7-BASECOUNT-BASE').revision, 2); assert.equal(SF7_MINERVINI_VERSION, 'sf7-minervini-1.4.0');
  assert.equal(sf7MechanicalRegistrySha256(), PINNED_SF7_MECHANICAL_REGISTRY_SHA256);
  assert.equal(sf7VariantRegistrySha256('sf7-minervini-1.3.0'), 'ce98c24feb40be85deba857d27a6a44a1aaec168570e63e114f217513385bd7e', 'bounds, assumptions and ALT-SEPA-* variants of minervini-sf7.mjs unchanged');
  assert.ok(SF7_MECHANICAL_MODEL_ASSUMPTIONS.every((m) => m.id.startsWith('MA-MIN7-') && m.why && m.reference));
  for (const b of Object.values(SF7_MECHANICAL_SOURCE_BOUNDS)) { assert.equal(b.translationUnverified, true); assert.match(b.source, /^(B12|B07|B03) PDF/); }
});

// synthetic universe with SEPA and Power Play REF trades: VCPs (run, failure), three breakouts with an opening gap of
// ~2 % (OPEN_GAP_AT_OR_ABOVE_PIVOT), ~8 % (above the limit, LIMIT_FILL_AFTER_OPEN) and ~13 % (above the limit, never
// reaching it: NOT_EXECUTED_ABOVE_LIMIT), and two Power Plays (+125 % in 30 sessions, tight flag)
const VOLF = (k) => (k <= 260 ? 2e6 : k <= 284 ? 1.5e6 : k <= 300 ? 1e6 : k <= 330 ? 5e5 : 3e6);
const vcp = (id, tail, noise = 0) => {
  let seed = 7 + id.length; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const c = path([[0, 40], [260, 100], [272, 80], [284, 98], [292, 88.2], [300, 96], [305, 91.2], [320, 95], [330, 97], ...tail]);
  return { id, bars: c.map((x, k) => { const z = x * (1 + (rnd() - 0.5) * noise); return bar(k, z, Math.max(x, z) * 1.004, Math.min(x, z) * 0.996, x, VOLF(k)); }) };
};
const pp = (id, tail) => ({ id, bars: mk(path([[0, 20], [80, 20], [110, 45], [125, 44.2], [126, 46], ...tail])) });
const RUN = [[340, 120], [400, 130]];
const universe = () => {
  const secs = [vcp('V-RUN', RUN, 0.004), vcp('V-FAIL', [[335, 104], [345, 96], [360, 99], [400, 92]], 0.004), pp('P-RUN', [[150, 52]]), pp('P-FAST', [[140, 75], [150, 66]])];
  for (const [id, open, low] of [['V-GAP', 98.5, 95], ['V-LIMIT', 104, 95], ['V-NOFILL', 109, 107]]) {
    const s = vcp(id, RUN, 0), b = s.bars[325]; // 325 = entry session of the plain VCP
    s.bars[325] = { ...b, open, high: Math.max(open, b.high) * 1.01, low: id === 'V-NOFILL' ? low : Math.min(b.low, low) };
    secs.push(s);
  }
  const calendar = [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort();
  // a 15 % market correction with its low at session 285 (inside the VCP bases)
  return { calendar, securities: secs, benchmark: calendar.map((date, k) => ({ date, close: k < 255 ? 100 : k <= 285 ? 100 - 0.5 * (k - 255) : Math.min(100, 85 + 0.3 * (k - 285)) })), spyTR: null };
};

test('SF7-MECH-RUNNER: the runner reports the mechanical diagnostics of real SEPA and Power Play REF trades, joined to the right trades; REF is unchanged (review #940 M3)', async () => {
  const { sf7Part } = await import('../source-faithful/research/run-sf7-minervini.mjs');
  const { lifecyclePart } = await import('../source-faithful/research/run-sf4-lifecycle.mjs');
  const { RUN_VARIANTS } = await import('../source-faithful/research/minervini-lifecycle.mjs');
  const { SF7_EXIT_VARIANTS } = await import('../source-faithful/research/minervini-sf7-exits.mjs');
  const d = universe(), bench = benchIndex(d.benchmark), ctx = { bench, anchors: marketCorrectionAnchors(bench) };
  const full = sf7Part(d, { from: null, to: null });
  // REF without any 7.0 code: the 4.0 lifecycle runner on the same dataset
  const r4 = lifecyclePart(d, { variants: RUN_VARIANTS.filter((x) => x.id === 'REF'), sf7Variants: [], from: null, to: null });
  const byId = new Map(d.securities.map((s) => [s.id, s]));
  const seen = {}, scheduled = {};
  for (const st of ['SEPA', 'POWER_PLAY']) {
    const p = full.pub.strategies[st], m = p.diagnostics.mechanical;
    assert.equal(p.ref.ledgerSha256, r4.pub.strategies[st].variants.REF.ledgerSha256, `${st} REF ledger = 4.0 REF`);
    // independent recomputation per trade from a plain REF run
    const ref = runMinerviniLifecycle(d, { strategy: st, setupIndex: buildSetupIndex(d, st), config: REFERENCE_CONFIG });
    const tradesBefore = JSON.stringify(ref.trades);
    assert.equal(p.ref.trades, ref.trades.length); seen[st] = ref.trades.length;
    const s0 = (t) => byId.get(t.id).bars.findIndex((x) => x.date === t.setupDate);
    const bc = ref.trades.map((t) => baseCountAt(byId.get(t.id).bars, s0(t), ctx));
    assert.ok(bc.every((r) => r.status === 'EVIDENCE'), `${st} every trade joined to its setup`);
    assert.deepEqual({ ...m.baseCount, rule: undefined }, { ...baseCountTally(bc), rule: undefined });
    assert.equal(Object.values(m.baseCount.baseNumber).reduce((a, b) => a + b, 0), ref.trades.length);
    const tv = ref.trades.map((t) => topVolumeDecline(byId.get(t.id).bars, t));
    assert.deepEqual(m.topVolumeDecline.trendTemplateRun, fieldTally(tv.map((r) => r.trendTemplateRun), 'topVolumeDeclineBeforeExit'));
    assert.deepEqual(m.topVolumeDecline.aboveMa200Run, { ...fieldTally(tv.map((r) => r.aboveMa200Run), 'topVolumeDeclineBeforeExit'), windowTruncated: tv.filter((r) => r.aboveMa200Run.windowTruncated === true).length });
    const rd = ref.trades.map((t) => relativeBaseDepth(byId.get(t.id).bars, s0(t), bench));
    for (const w of ['sameWindow', 'trailingHigh']) assert.deepEqual({ above2x: m.relativeBaseDepth[w].above2x, above3x: m.relativeBaseDepth[w].above3x }, { above2x: fieldTally(rd.map((r) => r[w]), 'aboveStrict'), above3x: fieldTally(rd.map((r) => r[w]), 'aboveLoose') }, `${st} ${w}`);
    assert.deepEqual(m.entryDistance, entryDistanceTally(ref.trades, byId, ref.counts));
    assert.equal(JSON.stringify(ref.trades), tradesBefore, 'the diagnostics do not mutate trades');
    for (const id of ['EXIT-CLIMAX', 'EXIT-CLIMAX-UPCLOSES']) if (SF7_EXIT_VARIANTS.find((x) => x.id === id).strategies.includes(st)) {
      const sb = p.exitVariants[id].signalsByBaseNumber, n = Object.values(sb).reduce((a, b) => a + b, 0);
      assert.equal(sb.unknown, 0, `${st} ${id} every signal joined to a base number`); assert.equal(n, p.exitVariants[id].ruleCounts.scheduled, `${st} ${id} every scheduled signal counted once`); scheduled[`${st} ${id}`] = n;
    }
  }
  assert.ok(seen.SEPA >= 4 && seen.POWER_PLAY >= 2, JSON.stringify(seen)); assert.ok(Object.values(scheduled).some((n) => n > 0), JSON.stringify(scheduled));
  // the fixture exercises every gap path of M4: open gap, limit fill after a large gap, order not executed above the limit
  const ed = full.pub.strategies.SEPA.diagnostics.mechanical.entryDistance;
  assert.deepEqual(ed.gapOpenAbovePivot.byEntryBasis, { LIMIT_FILL_AFTER_OPEN: 1, OPEN_GAP_AT_OR_ABOVE_PIVOT: 1 });
  assert.equal(ed.gapOpenAbovePivot.above5pct, 1); assert.equal(ed.gapOpenAbovePivot['2-3pct'], 1); assert.equal(ed.ordersNotExecutedAboveLimit, 1);
  assert.equal(full.pub.strategies.SEPA.diagnostics.mechanical.baseCount.reset.MARKET_CORRECTION, seen.SEPA);
  const txt = JSON.stringify(full.pub);
  for (const k of ['"pnl"', '"returnPct"', '"equity"', '"cagr"', '"sharpe"', '"metrics"', '"decline"', '"relativeDepth"', '"stockDecline"', '"marketDecline"']) assert.ok(!txt.includes(k), k);
});
