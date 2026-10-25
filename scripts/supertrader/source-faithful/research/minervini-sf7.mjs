/**
 * Supertrader 7.0 – Minervini source completion (C06 SEPA / VCP, C07 Power Play). Builds on the unchanged 4.0 lifecycle
 * (minervini-lifecycle.mjs, minervini-execution.mjs; research code fingerprint b1d81fb8… stays untouched: this file is
 * not part of run-sf4-lifecycle#FILES) and adds only what the 7.0 source inventory (docs/SUPERTRADER_7_MINERVINI_SOURCE_INVENTORY.md,
 * artifacts/STRATEGY-MINERVINI-SOURCE-INVENTORY.json) found in the owner-supplied books but not in the #709 rows:
 *
 * The English editions are not in the project: every book content below is a German / English PARAPHRASE of the
 * Indonesian (B12, B07) or Vietnamese (B03) translation, never a quotation of Minervini's English wording.
 *
 *  - staggeredStopRisk: paraphrase of Minervini's English 2018 answer as recorded by #709 (W-MIN18 / MIN-W18-1, HIGH,
 *    original wording checked on 2026-10-13, not re-verifiable from this container on 2026-10-24): staggered stops
 *    redistribute the planned risk, they never increase it. SOURCE_DERIVED with English corroboration, not SOURCE_EXACT.
 *  - flat-base setups (B12 PDF 306, paraphrase): a flat base without a real pivot other than its top may be bought above
 *    the base high if the base corrected no more than 10 to 15 percent. The 4.0 strict VCP proxy excludes flat bases
 *    (MIN-VCP-04); the variant ALT-SEPA-FLAT-BASE detects them up to 15 %, but the unchanged 4.0 eligibility keeps the
 *    10 % planned-loss bound with the stop at the base low, so only flat bases up to 10 % deep can be traded (counted
 *    as flatBaseAboveStopBound).
 *  - Trend Template, distance above the 52-week low: B12 PDF 114 prints 30 %, the licensed Vietnamese edition of Think &
 *    Trade Like a Champion (B03 PDF 143) prints 25 %, B12 PDF 101 prints 25 to 30 %. The reference keeps 30 %
 *    (MIN-TT-06); the variant ALT-SEPA-TT6-25 measures 25 %.
 *  - RS line (B03 PDF 143, paraphrase): besides the IBD RS rating (DATA_BLOCKED) the RS line should not be in a
 *    downtrend, preferably rising for at least 6 weeks (ideally 13). The RS line is computable (price relative to the
 *    market); ALT-SEPA-RS-LINE keeps only setups whose RS line rose over the last 6 weeks. No substitute for the rating.
 *  - Power Play: B12 PDF 341 requires VCP characteristics like every other setup; B03 PDF 189 exempts a base whose
 *    correction from peak to trough stays within 10 %. Together that is the 4.0 reference reading of MIN-PP-05 (TIGHT
 *    or VCP review): no variant, the source difference is resolved in favour of the reference.
 *  - two diagnostics on the reference trades (counts only, never a gate, never a variant choice): largest-decline sell
 *    signal (B12 PDF 130: the largest daily decline since the start of the Stage 2 advance is a sell signal in most
 *    cases; the weekly reading is not measured) and the half-average-gain stop rule (B12 PDF 398-399: cut losses at half
 *    the average gain, never more than 10 %).
 *
 * Every number the books do not give is a declared model assumption (SF7_MODEL_ASSUMPTIONS); the variants are
 * pre-registered before any 7.0 result was read (sf7VariantRegistrySha256, sf7CodeSha256 in the runner receipt).
 * Nothing here is SOURCE_EXACT. DIAGNOSTIC_NOT_CERTIFIED, MODEL_LIFECYCLE_STUDY.
 */
import crypto from 'node:crypto';
import { fin, smaAt } from '../common/series.mjs';
import { trendTemplate, MIN_PARAMS } from '../methods/minervini.mjs';
import { COMPONENT_CONVENTIONS, vcpContractions } from './minervini-components.mjs';
import { REFERENCE_CONFIG, sepaSetupSeries } from './minervini-lifecycle.mjs';

export const SF7_MINERVINI_VERSION = 'sf7-minervini-1.2.0'; // 1.2.0: E7-2 post-breakout / setup evidence (diagnostics only); 1.1.0: independent review (calendar RS lookback, exit-bounded diagnostic, flat-base bound count)

/** Printed bounds used by the 7.0 additions (source, page, translation status). */
export const SF7_SOURCE_BOUNDS = Object.freeze({
  flatBaseMaxCorrection: Object.freeze({ value: 0.15, source: 'B12 PDF 306', reading: 'outer bound of the printed 10 to 15 percent (detection); trading stays bounded by the 10 % planned loss', translationUnverified: true }),
  maxPlannedLoss: Object.freeze({ value: 0.10, source: 'B12 PDF 370 / 399, B07 PDF 72, W-MIN18 (English: generally 8-10 %)', reading: 'absolute maximum loss in the books; the English answer corroborates about 8-10 % as a general maximum (STRONG_PREFERENCE)', translationUnverified: true }),
  stopAtHalfAverageGain: Object.freeze({ value: 0.5, source: 'B12 PDF 398-399', reading: 'cut losses at half the average gain', translationUnverified: true }),
  aboveLow52wAlt: Object.freeze({ value: 0.25, source: 'B03 PDF 143 (25 %), B12 PDF 101 (25-30 %); reference B12 PDF 114 (30 %)', reading: 'lower printed reading of the 52-week-low criterion', translationUnverified: true }),
  rsLineRisingWeeks: Object.freeze({ value: 6, source: 'B03 PDF 143', reading: 'RS line not in a downtrend, preferably rising for at least 6 weeks (ideally 13)', translationUnverified: true }),
});

/** Model assumptions of the 7.0 additions; none is a Minervini rule. */
export const SF7_MODEL_ASSUMPTIONS = Object.freeze([
  Object.freeze({ id: 'MA-MIN7-FLAT-BASE-WINDOW', phase: 'SETUP_QUALIFICATION', reference: 'base = sessions from the 52-week high (the 4.0 VCP base start, vcpContractions) to the setup close; at least 15 sessions', why: 'B12 PDF 306 names the flat base and its 10-15 % bound, not its length; 15 sessions is the lower end of the printed 3-5 week minimum of a primary base (B12 PDF 352); the base start is the one the 4.0 footprint already uses' }),
  Object.freeze({ id: 'MA-MIN7-FLAT-BASE-PIVOT', phase: 'SETUP_QUALIFICATION', reference: 'pivot = the base high (the 52-week high that starts the base), stop = the lowest low of the base (structure), the 10 % planned-loss bound of the 4.0 eligibility applies unchanged', why: 'B12 PDF 306 (paraphrase): buy as the price moves above the base high; the stop placement inside the 10 % bound stays the reviewer\'s (MA-MIN-STOP-PLACEMENT reading of the reference)' }),
  Object.freeze({ id: 'MA-MIN7-FLAT-BASE-MERGE', phase: 'SETUP_QUALIFICATION', reference: 'a 4.0 setup that meets the strict VCP proxy is kept unchanged; a flat-base setup is added only where the reference has no strict setup on that close', why: 'one-at-a-time change: the variant widens the reference by the flat-base family and changes nothing else' }),
  Object.freeze({ id: 'MA-MIN7-RS-LINE', phase: 'SETUP_QUALIFICATION', reference: 'RS line = split-adjusted close / split-adjusted SPY close of the same session (snapshot benchmark); rising for at least 6 weeks = RS line on the setup close above the RS line 30 benchmark sessions earlier (no value if the security has no bar on that date)', why: 'B03 PDF 143 gives the RS line and its 6-week preference, not a slope measure; the one-point comparison is the reading the 4.0 reference already uses for "MA200 rising for at least one month" (MIN-SF-TT-3)' }),
  Object.freeze({ id: 'MA-MIN7-STAGE2-START', phase: 'EXIT_CONDITIONS', reference: 'start of the Stage 2 advance = first session of the uninterrupted run of Trend Template 1-7 passes that contains the setup close', why: 'B12 PDF 130 measures the largest decline since the start of the Stage 2 advance without a mechanical start; the Trend Template is the source\'s own Stage 2 qualification (MIN-PROCESS-01)' }),
  Object.freeze({ id: 'MA-MIN7-POST-BREAKOUT-WINDOW', phase: 'EXIT_CONDITIONS', reference: 'the first 10 sessions from the entry session (diagnostics G-LOWERLOWS, G-MA20 only)', why: 'B03 PDF 47 and B12 PDF 311 speak of the time right after the breakout without a number; 10 sessions is the upper end of the printed normal pullback of 2-5 days to at most 1-2 weeks (B03 PDF 40)' }),
  Object.freeze({ id: 'MA-MIN7-AVG-GAIN', phase: 'INITIAL_STOP', reference: 'average gain = mean return of the winning reference trades closed before the entry date (point in time), at least 10 closed winners, otherwise not evaluated', why: 'B12 PDF 398-399 relates the stop to the trader\'s own average gain; the reference run is the only PIT trade history the model study has' }),
]);

/**
 * MIN-W18-1 (W-MIN18, paraphrase of Minervini's English answer recorded by #709): staggered stops redistribute the
 * planned risk, they never increase it. plan: { entry, shares, singleStop, tranches: [{ shares, stop }] }. The
 * tranches must cover the position exactly; the planned loss of the staggered plan must not exceed the single-stop
 * plan. Returns { ok, plannedRiskSingle, plannedRiskStaggered, violations[] }.
 */
export function staggeredStopRisk(plan) {
  const violations = [];
  const { entry, shares, singleStop, tranches } = plan ?? {};
  if (!(fin(entry) && entry > 0 && fin(shares) && shares > 0 && fin(singleStop) && singleStop < entry)) return { ok: false, violations: ['INVALID_PLAN'] };
  if (!Array.isArray(tranches) || !tranches.length) return { ok: false, violations: ['NO_TRANCHES'] };
  let covered = 0, staggered = 0;
  for (const t of tranches) {
    if (!(fin(t.shares) && t.shares > 0 && fin(t.stop) && t.stop <= entry)) { violations.push('INVALID_TRANCHE'); continue; } // a break-even tranche carries zero risk
    covered += t.shares; staggered += t.shares * (entry - t.stop);
  }
  if (Math.abs(covered - shares) > 1e-9) violations.push('TRANCHES_DO_NOT_COVER_POSITION');
  const single = shares * (entry - singleStop);
  if (staggered > single * (1 + 1e-12)) violations.push('STAGGERED_RISK_ABOVE_PLANNED_RISK');
  return { ok: violations.length === 0, plannedRiskSingle: single, plannedRiskStaggered: staggered, violations, rule: 'MIN-W18-1' };
}

const FLAT_MIN_SESSIONS = 15; // MA-MIN7-FLAT-BASE-WINDOW

/**
 * Flat-base setup on the close of bar i (B12 PDF 306 under MA-MIN7-FLAT-BASE-*). Uses bars 0..i only. Returns null
 * unless Trend Template 1-7 holds, the base since the 52-week high is at least FLAT_MIN_SESSIONS long, the base high
 * is a confirmed swing (no later high reached it) and the base corrected no more than 15 %.
 */
export function flatBaseSetupAt(bars, i, P = MIN_PARAMS) {
  const tt = trendTemplate(bars, i, P);
  if (tt.status !== 'TREND_TEMPLATE_1_7_PASS') return null;
  let hk = i - P.yearSessions + 1;
  for (let k = hk; k <= i; k++) { if (!fin(bars[k].high) || !fin(bars[k].low)) return null; if (bars[k].high >= bars[hk].high) hk = k; }
  if (i - hk < Math.max(FLAT_MIN_SESSIONS, COMPONENT_CONVENTIONS.swingSessions)) return null;
  let lo = Infinity; for (let k = hk + 1; k <= i; k++) lo = Math.min(lo, bars[k].low);
  const high = bars[hk].high, depth = 1 - lo / high;
  if (!(lo > 0) || depth > SF7_SOURCE_BOUNDS.flatBaseMaxCorrection.value + 1e-12) return null;
  // vcpProxyStrict is set only so that the unchanged 4.0 eligibility admits the setup; proxy names what it is
  return { i, date: bars[i].date, state: 'SETUP_DETECTED', pivot: high, pivotDate: bars[hk].date, stopStructure: lo, vcpProxyStrict: true, proxy: 'FLAT_BASE', flatBase: { depth, sessions: i - hk, rule: 'B12 PDF 306 (MA-MIN7-FLAT-BASE-*)' } };
}

/** Cheap exact prefilter of trendTemplate criteria 1-5 (same values and comparisons; skips only certain failures). */
function ttPrefilterFails(bars, i, P) {
  const c = bars[i].close, a = smaAt(bars, i, P.ma[0]), b = smaAt(bars, i, P.ma[1]), d = smaAt(bars, i, P.ma[2]), dp = smaAt(bars, i - P.ma200RisingSessions, P.ma[2]);
  return [c, a, b, d, dp].every(fin) && !(c > b && c > d && b > d && d > dp && a > b && a > d && c > a);
}

/**
 * ALT-SEPA-FLAT-BASE setup index: the 4.0 SEPA index (minervini-execution#buildSetupIndex) plus flat-base setups on
 * every close where the reference has no setup meeting the strict proxy (MA-MIN7-FLAT-BASE-MERGE). Returns a new index
 * with the same shape; the reference index is not mutated.
 */
export function withFlatBaseSetups(dataset, refIndex, { from = null, P = MIN_PARAMS } = {}) {
  if (refIndex.strategy !== 'SEPA') throw new Error('SEPA_INDEX_REQUIRED');
  const index = new Map(), counts = { flatBaseAdded: 0, flatBaseReplacedNonStrict: 0, flatBaseAboveStopBound: 0, referenceKept: 0 };
  const need = Math.max(P.ma[2] + P.ma200RisingSessions, P.yearSessions);
  for (const s of dataset.securities) {
    const ref = refIndex.index.get(s.id), out = new Map(ref ?? []);
    for (let i = need - 1; i < s.bars.length; i++) {
      if (from && s.bars[i].date < from) continue;
      const r = ref?.get(i);
      if (r && r.vcpProxyStrict) continue;
      if (ttPrefilterFails(s.bars, i, P)) continue;
      const f = flatBaseSetupAt(s.bars, i, P);
      if (!f) continue;
      out.set(i, f); counts[r ? 'flatBaseReplacedNonStrict' : 'flatBaseAdded']++;
      if (f.flatBase.depth > SF7_SOURCE_BOUNDS.maxPlannedLoss.value + 1e-12) counts.flatBaseAboveStopBound++;
    }
    counts.referenceKept += ref ? [...ref.values()].filter((x) => x.vcpProxyStrict).length : 0;
    if (out.size) index.set(s.id, new Map([...out.entries()].sort((a, b) => a[0] - b[0])));
  }
  return { strategy: 'SEPA', index, counts: { ...refIndex.counts, sf7: counts } };
}

/**
 * ALT-SEPA-TT6-25 setup index: the 4.0 SEPA setup series with the lower printed reading of the 52-week-low criterion
 * (25 % instead of 30 %, SF7_SOURCE_BOUNDS.aboveLow52wAlt); everything else is the reference.
 */
export function withTrendTemplateLow25(dataset, { from = null } = {}) {
  const P = Object.freeze({ ...MIN_PARAMS, aboveLow: SF7_SOURCE_BOUNDS.aboveLow52wAlt.value });
  const index = new Map(), counts = {};
  for (const s of dataset.securities) {
    const r = sepaSetupSeries(s, { P, from });
    if (r.setups.size) index.set(s.id, r.setups);
    for (const [k, v] of Object.entries(r.counts)) counts[k] = (counts[k] || 0) + v;
  }
  return { strategy: 'SEPA', index, counts: { ...counts, sf7: { aboveLow: P.aboveLow } } };
}

const RS_LINE_SESSIONS = 30; // 6 weeks (MA-MIN7-RS-LINE)

/**
 * RS line rising over the last 6 weeks on the close of bar i (bars 0..i). bench: { dates[], close: Map(date -> close),
 * pos: Map(date -> index) } from benchIndex. The lookback is 30 benchmark sessions, not 30 bars of the security; the
 * security must have a bar on that earlier date (byDate), otherwise null (not measurable).
 */
export function rsLineRising(bars, i, bench, byDate = null) {
  const a = bars[i], p = a ? bench.pos.get(a.date) : undefined;
  if (p === undefined || p < RS_LINE_SESSIONS) return null;
  const d0 = bench.dates[p - RS_LINE_SESSIONS], k = byDate ? byDate.get(d0) : bars.findIndex((x) => x.date === d0);
  const b = k === undefined || k < 0 ? null : bars[k], ma = bench.close.get(a.date), mb = bench.close.get(d0);
  if (!(b && fin(a.close) && fin(b.close) && fin(ma) && fin(mb) && ma > 0 && mb > 0 && b.close > 0)) return null;
  return a.close / ma > b.close / mb;
}

/** Benchmark index for rsLineRising (snapshot SPY bars, split-adjusted). */
export function benchIndex(benchmark) {
  const rows = (benchmark ?? []).filter((b) => fin(b.close)).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return { dates: rows.map((b) => b.date), close: new Map(rows.map((b) => [b.date, b.close])), pos: new Map(rows.map((b, k) => [b.date, k])) };
}

/**
 * ALT-SEPA-RS-LINE setup index: the 4.0 SEPA index restricted to setups whose RS line rose over the last 6 weeks
 * (B03 PDF 143). A setup whose RS line is not measurable is removed (no setup without its evidence).
 */
export function withRsLineRising(dataset, refIndex) {
  if (refIndex.strategy !== 'SEPA') throw new Error('SEPA_INDEX_REQUIRED');
  const bench = benchIndex(dataset.benchmark);
  const byId = new Map(dataset.securities.map((s) => [s.id, s]));
  const byDate = new Map([...refIndex.index.keys()].map((id) => [id, new Map((byId.get(id)?.bars ?? []).map((b, k) => [b.date, k]))]));
  const index = new Map(), counts = { kept: 0, removedRsLineNotRising: 0, removedNotMeasurable: 0 };
  for (const [id, setups] of refIndex.index) {
    const bars = byId.get(id)?.bars, out = new Map();
    for (const [i, st] of setups) {
      const r = bars ? rsLineRising(bars, i, bench, byDate.get(id)) : null;
      if (r === true) { out.set(i, st); counts.kept++; } else counts[r === false ? 'removedRsLineNotRising' : 'removedNotMeasurable']++;
    }
    if (out.size) index.set(id, out);
  }
  return { strategy: 'SEPA', index, counts: { ...refIndex.counts, sf7: counts } };
}

/** Pre-registered 7.0 variants: one-at-a-time changes of the setup index; the configuration stays the 4.0 reference. */
export const SF7_VARIANTS = Object.freeze([
  Object.freeze({ id: 'ALT-SEPA-FLAT-BASE', strategy: 'SEPA', index: 'withFlatBaseSetups', config: REFERENCE_CONFIG, source: 'B12 PDF 306' }),
  Object.freeze({ id: 'ALT-SEPA-TT6-25', strategy: 'SEPA', index: 'withTrendTemplateLow25', config: REFERENCE_CONFIG, source: 'B03 PDF 143, B12 PDF 101' }),
  Object.freeze({ id: 'ALT-SEPA-RS-LINE', strategy: 'SEPA', index: 'withRsLineRising', config: REFERENCE_CONFIG, source: 'B03 PDF 143' }),
]);

/** Fingerprint of the 7.0 additions' pre-registration (bounds, assumptions, variants). */
export function sf7VariantRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: SF7_MINERVINI_VERSION, bounds: SF7_SOURCE_BOUNDS, assumptions: SF7_MODEL_ASSUMPTIONS, variants: SF7_VARIANTS, flatMinSessions: FLAT_MIN_SESSIONS, rsLineSessions: RS_LINE_SESSIONS })).digest('hex');
}

/**
 * Largest-decline sell signal (B12 PDF 130) for one trade, diagnostic only: the first session after the entry (and up
 * to the exit) whose close-to-close decline is larger than every daily decline since the start of the Stage 2 advance
 * (MA-MIN7-STAGE2-START). Uses bars up to the signal session only. Returns { status, signalDate, sessionsBeforeExit }.
 */
export function largestDeclineSignal(bars, trade, P = MIN_PARAMS) {
  // index of the last bar on or before date d (-1 if none): an exit on a date without a bar never lets the scan pass it
  const atOrBefore = (d) => { let lo = 0, hi = bars.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].date <= d) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
  const exact = (d) => { const k = atOrBefore(d); return k >= 0 && bars[k].date === d ? k : -1; };
  const e = exact(trade.entryDate), s0 = exact(trade.setupDate ?? trade.signalDate ?? trade.entryDate);
  if (e < 1 || s0 < 1) return { status: 'NOT_EVALUABLE' };
  const open = !trade.exitDate, x = open ? bars.length - 1 : atOrBefore(trade.exitDate);
  if (x < e) return { status: 'NOT_EVALUABLE' };
  let start = s0; while (start > 0 && trendTemplate(bars, start - 1, P).status === 'TREND_TEMPLATE_1_7_PASS') start--;
  let worst = 0; // most negative daily return since the Stage 2 start, up to the session before the entry
  for (let k = Math.max(start, 1); k < e; k++) { const a = bars[k - 1].close, b = bars[k].close; if (fin(a) && fin(b) && a > 0) worst = Math.min(worst, b / a - 1); }
  // from the entry session (close-to-close return of the entry day) to the exit session
  for (let k = e; k <= x; k++) {
    const a = bars[k - 1].close, b = bars[k].close; if (!(fin(a) && fin(b) && a > 0)) continue;
    const r = b / a - 1;
    if (r < worst) return { status: open ? 'SIGNAL_OPEN_TRADE' : 'SIGNAL', signalDate: bars[k].date, sessionsBeforeExit: open ? null : x - k, decline: r, priorWorst: worst };
    worst = Math.min(worst, r);
  }
  return { status: open ? 'NO_SIGNAL_OPEN_TRADE' : 'NO_SIGNAL_BEFORE_EXIT' };
}

/**
 * Half-average-gain stop rule (B12 PDF 398-399, MA-MIN7-AVG-GAIN), diagnostic only: for every trade, the average
 * return of the winning trades closed before its entry date; the planned loss is compared with half of it and with the
 * absolute 10 % bound. Counts only.
 */
export function halfAverageGainStopCheck(trades, { minWinners = 10 } = {}) {
  const closed = trades.filter((t) => t.status === 'CLOSED' && fin(t.returnPct) && t.returnPct > 0 && t.exitDate);
  const out = { evaluated: 0, notEvaluated: 0, plannedLossWithinHalfAvgGain: 0, plannedLossAboveHalfAvgGain: 0, plannedLossAbove10pct: 0 };
  for (const t of trades) {
    const winners = closed.filter((c) => c.exitDate < t.entryDate); // point in time: closed strictly before the entry
    if (winners.length < minWinners || !(fin(t.entryFill) && fin(t.initialStop) && t.entryFill > 0)) { out.notEvaluated++; continue; }
    const avg = winners.reduce((s, c) => s + c.returnPct, 0) / winners.length, planned = 1 - t.initialStop / t.entryFill;
    out.evaluated++;
    if (planned > SF7_SOURCE_BOUNDS.maxPlannedLoss.value + 1e-12) out.plannedLossAbove10pct++;
    if (planned <= SF7_SOURCE_BOUNDS.stopAtHalfAverageGain.value * avg + 1e-12) out.plannedLossWithinHalfAvgGain++; else out.plannedLossAboveHalfAvgGain++;
  }
  return out;
}

/**
 * Supertrader 7.0 owner decision E7-2 (2026-10-25): post-breakout and setup evidence from the 154 re-read findings that
 * give a concrete operational criterion (classification docs/SUPERTRADER_7_MINERVINI_FINDINGS_CLASSIFICATION.md).
 * Diagnostics on the reference trades only: counts, never a gate, never an exit, never a variant choice.
 *  - G-UPDAYS (B03 PDF 41): up closes in the first 4 / 8 sessions after the entry; healthy at >= 3 of 4 / >= 6 of 8;
 *  - G-LOWERLOWS (B03 PDF 47-48): three consecutive lower lows on volume above the 50-day mean in the first 10 sessions;
 *  - G-MA20 (B03 PDF 47, B12 PDF 311): a close below MA20 in the first 10 sessions after the entry
 *    (MA-MIN7-POST-BREAKOUT-WINDOW: the books say "right after the breakout" without a number);
 *  - G-WEEKLY-DECLINE (B03 PDF 217, refines B12 PDF 130): a weekly (5-session) close-to-close decline larger than every
 *    weekly decline since the Stage 2 start, before the exit;
 *  - G-BASE-DEPTH (B12 PDF 250 / 280, B03 PDF 160): the deepest contraction of the setup base above 50 % / 60 %;
 *  - G-RSLINE-HIGH (B03 PDF 168): on the setup close the RS line is at its 252-session high while the price is below the pivot.
 */
export const POST_BREAKOUT_WINDOW = 10; // MA-MIN7-POST-BREAKOUT-WINDOW

export function postBreakoutEvidence(bars, trade, { bench = null, P = MIN_PARAMS } = {}) {
  const pos = new Map(bars.map((b, k) => [b.date, k]));
  const e = pos.get(trade.entryDate), s0 = pos.get(trade.setupDate ?? trade.signalDate ?? trade.entryDate);
  if (e === undefined || s0 === undefined || e < 60) return { status: 'NOT_EVALUABLE' };
  const atOrBefore = (d) => { let lo = 0, hi = bars.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].date <= d) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
  const x = trade.exitDate ? atOrBefore(trade.exitDate) : bars.length - 1;
  const up = (k) => fin(bars[k]?.close) && fin(bars[k - 1]?.close) && bars[k].close > bars[k - 1].close;
  const count = (n) => { let c = 0, m = 0; for (let k = e; k < e + n && k <= x; k++) { m++; if (up(k)) c++; } return { up: c, sessions: m }; };
  const w4 = count(4), w8 = count(8), end = Math.min(e + POST_BREAKOUT_WINDOW - 1, x);
  let lowerLowsOnVolume = false, run = 0;
  for (let k = e; k <= end; k++) {
    let v = 0, n = 0; for (let j = k - 50; j < k; j++) if (j >= 0 && fin(bars[j].volume)) { v += bars[j].volume; n++; }
    const ll = fin(bars[k].low) && fin(bars[k - 1].low) && bars[k].low < bars[k - 1].low && n === 50 && bars[k].volume > v / n;
    run = ll ? run + 1 : 0; if (run >= 3) { lowerLowsOnVolume = true; break; }
  }
  let closeBelowMa20 = false;
  for (let k = e; k <= end; k++) { const m = smaAt(bars, k, 20); if (fin(m) && fin(bars[k].close) && bars[k].close < m) { closeBelowMa20 = true; break; } }
  // weekly decline since the Stage 2 start (MA-MIN7-STAGE2-START), 5-session steps anchored at the entry
  let start = s0; while (start > 0 && trendTemplate(bars, start - 1, P).status === 'TREND_TEMPLATE_1_7_PASS') start--;
  const wret = (k) => (k - 5 >= 0 && fin(bars[k].close) && fin(bars[k - 5].close) && bars[k - 5].close > 0 ? bars[k].close / bars[k - 5].close - 1 : null);
  let worstW = 0; for (let k = e - 5; k >= start + 5; k -= 5) { const r = wret(k); if (r !== null) worstW = Math.min(worstW, r); }
  let weeklySignalBeforeExit = false; for (let k = e + 5; k <= x; k += 5) { const r = wret(k); if (r !== null && r < worstW) { weeklySignalBeforeExit = k < x; break; } }
  const v = vcpContractions(bars, s0), maxDepth = v.status === 'EVIDENCE_ONLY' && v.contractions.length ? Math.max(...v.contractions.map((c) => c.depth)) : null;
  let rsLineHighBeforePrice = null;
  if (bench && s0 >= 252) {
    const rs = (k) => { const m = bench.close.get(bars[k].date); return fin(m) && m > 0 && fin(bars[k].close) ? bars[k].close / m : null; };
    const now = rs(s0); let hi = -Infinity; for (let k = s0 - 251; k < s0; k++) { const r = rs(k); if (r !== null) hi = Math.max(hi, r); }
    rsLineHighBeforePrice = now !== null && Number.isFinite(hi) ? now >= hi && fin(trade.entryFill) && bars[s0].close < trade.entryFill : null;
  }
  return {
    status: 'EVIDENCE', upDays4: w4, upDays8: w8, healthy3of4: w4.sessions === 4 ? w4.up >= 3 : null, healthy6of8: w8.sessions === 8 ? w8.up >= 6 : null,
    lowerLowsOnVolume, closeBelowMa20InWindow: closeBelowMa20, weeklyDeclineSignalBeforeExit: weeklySignalBeforeExit,
    baseDepthAbove50: maxDepth === null ? null : maxDepth > 0.5, baseDepthAbove60: maxDepth === null ? null : maxDepth > 0.6, rsLineHighBeforePrice,
  };
}

/** Tally of postBreakoutEvidence over the reference trades (counts of true / false / null per field). */
export function postBreakoutTally(rows) {
  const keys = ['healthy3of4', 'healthy6of8', 'lowerLowsOnVolume', 'closeBelowMa20InWindow', 'weeklyDeclineSignalBeforeExit', 'baseDepthAbove50', 'baseDepthAbove60', 'rsLineHighBeforePrice'];
  const out = { evaluated: rows.filter((r) => r.status === 'EVIDENCE').length, notEvaluable: rows.filter((r) => r.status !== 'EVIDENCE').length };
  for (const k of keys) out[k] = { true: rows.filter((r) => r[k] === true).length, false: rows.filter((r) => r[k] === false).length, null: rows.filter((r) => r.status === 'EVIDENCE' && (r[k] === null || r[k] === undefined)).length };
  return out;
}
