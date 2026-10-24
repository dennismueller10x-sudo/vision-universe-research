/**
 * Supertrader 7.0 – Minervini source completion (C06 SEPA / VCP, C07 Power Play). Builds on the unchanged 4.0 lifecycle
 * (minervini-lifecycle.mjs, minervini-execution.mjs; research code fingerprint b1d81fb8… stays untouched: this file is
 * not part of run-sf4-lifecycle#FILES) and adds only what the 7.0 source inventory (docs/SUPERTRADER_7_MINERVINI_SOURCE_INVENTORY.md,
 * artifacts/STRATEGY-MINERVINI-SOURCE-INVENTORY.json) found in the owner-supplied books but not in the #709 rows:
 *
 *  - staggeredStopRisk: Minervini's own English 2018 answer (W-MIN18 / MIN-W18-1, HIGH, original wording checked):
 *    staggered stops redistribute the planned risk, they never increase it. The only SOURCE_EXACT Minervini rule.
 *  - flat-base setups (B12 PDF 306): a flat base without a real pivot other than the top of the base may be bought as
 *    the price moves above the base high, provided the base corrected no more than 10 or 15 percent. The 4.0 strict
 *    VCP proxy excludes flat bases (MIN-VCP-04); the variant ALT-SEPA-FLAT-BASE admits them at the printed outer bound.
 *  - Trend Template criterion "above the 52-week low": B12 PDF 114 prints 30 %, the licensed Vietnamese edition of Think &
 *    Trade Like a Champion (B03 PDF 143) prints 25 %, and B12 PDF 101 itself says "at least 25 to 30 percent". The
 *    reference keeps 30 % (MIN-TT-06); the variant ALT-SEPA-TT6-25 measures the 25 % reading.
 *  - RS line (B03 PDF 143): besides the IBD RS rating (DATA_BLOCKED) the RS line should not be in a downtrend, preferably
 *    rising for at least 6 weeks (ideally 13). The RS line is computable (price relative to the market); the variant
 *    ALT-SEPA-RS-LINE keeps only setups whose RS line rose over the last 6 weeks. It is no substitute for the IBD rating.
 *  - Power Play: B12 PDF 341 requires VCP characteristics "as with all other setups", B03 PDF 189 adds the exception
 *    "if the correction from peak to trough does not exceed 10 %, you need not see the tightening as a contraction of
 *    volatility". That is exactly the 4.0 reference reading of MIN-PP-05 (TIGHT or VCP review): no variant, the source
 *    conflict is resolved in favour of the reference.
 *  - two diagnostics on the reference trades (counts only, never a gate, never a variant choice):
 *    largest-decline sell signal (B12 PDF 130: the largest daily decline since the start of the Stage 2 advance is a
 *    sell signal "in most cases") and the half-average-gain stop rule (B12 PDF 398-399: cut losses at half the average
 *    gain, never more than 10 %).
 *
 * Every number the books do not give is a declared model assumption (SF7_MODEL_ASSUMPTIONS); the variants are
 * pre-registered here before any 7.0 result exists and are all reported (sf7VariantRegistrySha256). Translation-only
 * sources: nothing except staggeredStopRisk is SOURCE_EXACT. DIAGNOSTIC_NOT_CERTIFIED, MODEL_LIFECYCLE_STUDY.
 */
import crypto from 'node:crypto';
import { fin, smaAt } from '../common/series.mjs';
import { trendTemplate, MIN_PARAMS } from '../methods/minervini.mjs';
import { COMPONENT_CONVENTIONS } from './minervini-components.mjs';
import { REFERENCE_CONFIG, sepaSetupSeries } from './minervini-lifecycle.mjs';

export const SF7_MINERVINI_VERSION = 'sf7-minervini-1.0.0';

/** Printed bounds used by the 7.0 additions (source, page, translation status). */
export const SF7_SOURCE_BOUNDS = Object.freeze({
  flatBaseMaxCorrection: Object.freeze({ value: 0.15, source: 'B12 PDF 306', reading: 'outer bound of "no more than 10 or 15 percent"', translationUnverified: true }),
  maxPlannedLoss: Object.freeze({ value: 0.10, source: 'B12 PDF 370 / 399, B07 PDF 72, W-MIN18 (English: generally 8-10 %)', reading: 'absolute maximum loss', translationUnverified: false }),
  stopAtHalfAverageGain: Object.freeze({ value: 0.5, source: 'B12 PDF 398-399', reading: 'cut losses at half the average gain', translationUnverified: true }),
  aboveLow52wAlt: Object.freeze({ value: 0.25, source: 'B03 PDF 143 (25 %), B12 PDF 101 (25-30 %); reference B12 PDF 114 (30 %)', reading: 'lower printed reading of the 52-week-low criterion', translationUnverified: true }),
  rsLineRisingWeeks: Object.freeze({ value: 6, source: 'B03 PDF 143', reading: 'RS line not in a downtrend, preferably rising for at least 6 weeks (ideally 13)', translationUnverified: true }),
});

/** Model assumptions of the 7.0 additions; none is a Minervini rule. */
export const SF7_MODEL_ASSUMPTIONS = Object.freeze([
  Object.freeze({ id: 'MA-MIN7-FLAT-BASE-WINDOW', phase: 'SETUP_QUALIFICATION', reference: 'base = sessions from the 52-week high (the 4.0 VCP base start, vcpContractions) to the setup close; at least 15 sessions', why: 'B12 PDF 306 names the flat base and its 10-15 % bound, not its length; 15 sessions is the lower end of the printed 3-5 week minimum of a primary base (B12 PDF 352); the base start is the one the 4.0 footprint already uses' }),
  Object.freeze({ id: 'MA-MIN7-FLAT-BASE-PIVOT', phase: 'SETUP_QUALIFICATION', reference: 'pivot = the base high (the 52-week high that starts the base), stop = the lowest low of the base (structure), the 10 % planned-loss bound of the 4.0 eligibility applies unchanged', why: 'B12 PDF 306: buy "as the stock moves above the high at the top of the base"; the stop placement inside the 10 % bound stays the reviewer\'s (MA-MIN-STOP-PLACEMENT reading of the reference)' }),
  Object.freeze({ id: 'MA-MIN7-FLAT-BASE-MERGE', phase: 'SETUP_QUALIFICATION', reference: 'a 4.0 setup that meets the strict VCP proxy is kept unchanged; a flat-base setup is added only where the reference has no strict setup on that close', why: 'one-at-a-time change: the variant widens the reference by the flat-base family and changes nothing else' }),
  Object.freeze({ id: 'MA-MIN7-RS-LINE', phase: 'SETUP_QUALIFICATION', reference: 'RS line = split-adjusted close / split-adjusted SPY close of the same session (snapshot benchmark); "rising for at least 6 weeks" = RS line on the setup close above the RS line 30 sessions earlier', why: 'B03 PDF 143 gives the RS line and its 6-week preference, not a slope measure; the one-point comparison is the reading the 4.0 reference already uses for "MA200 rising for at least one month" (MIN-SF-TT-3)' }),
  Object.freeze({ id: 'MA-MIN7-STAGE2-START', phase: 'EXIT_CONDITIONS', reference: 'start of the Stage 2 advance = first session of the uninterrupted run of Trend Template 1-7 passes that contains the setup close', why: 'B12 PDF 130 measures the largest decline "since the start of the Stage 2 advance" without a mechanical start; the Trend Template is the source\'s own Stage 2 qualification (MIN-PROCESS-01)' }),
  Object.freeze({ id: 'MA-MIN7-AVG-GAIN', phase: 'INITIAL_STOP', reference: 'average gain = mean return of the winning reference trades closed before the entry date (point in time), at least 10 closed winners, otherwise not evaluated', why: 'B12 PDF 398-399 relates the stop to the trader\'s own average gain; the reference run is the only PIT trade history the model study has' }),
]);

/**
 * MIN-W18-1 (W-MIN18, Minervini's English answer, HIGH, original wording checked): staggered stops redistribute the
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
    if (!(fin(t.shares) && t.shares > 0 && fin(t.stop) && t.stop < entry)) { violations.push('INVALID_TRANCHE'); continue; }
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
  return { i, date: bars[i].date, state: 'SETUP_DETECTED', pivot: high, pivotDate: bars[hk].date, stopStructure: lo, vcpProxyStrict: true, flatBase: { depth, sessions: i - hk, rule: 'B12 PDF 306 (MA-MIN7-FLAT-BASE-*)' } };
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
  const index = new Map(), counts = { flatBaseAdded: 0, flatBaseReplacedNonStrict: 0, referenceKept: 0 };
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

/** RS line rising over the last 6 weeks on the close of bar i (bars 0..i, benchmark by date; null if not measurable). */
export function rsLineRising(bars, i, benchByDate) {
  if (i < RS_LINE_SESSIONS) return null;
  const a = bars[i], b = bars[i - RS_LINE_SESSIONS], ma = benchByDate.get(a.date), mb = benchByDate.get(b.date);
  if (!(fin(a.close) && fin(b.close) && fin(ma) && fin(mb) && ma > 0 && mb > 0 && b.close > 0)) return null;
  return a.close / ma > b.close / mb;
}

/**
 * ALT-SEPA-RS-LINE setup index: the 4.0 SEPA index restricted to setups whose RS line rose over the last 6 weeks
 * (B03 PDF 143). A setup whose RS line is not measurable is removed (no setup without its evidence).
 */
export function withRsLineRising(dataset, refIndex) {
  if (refIndex.strategy !== 'SEPA') throw new Error('SEPA_INDEX_REQUIRED');
  const bench = new Map((dataset.benchmark ?? []).map((b) => [b.date, b.close]));
  const byId = new Map(dataset.securities.map((s) => [s.id, s]));
  const index = new Map(), counts = { kept: 0, removedRsLineNotRising: 0, removedNotMeasurable: 0 };
  for (const [id, setups] of refIndex.index) {
    const bars = byId.get(id)?.bars, out = new Map();
    for (const [i, st] of setups) {
      const r = bars ? rsLineRising(bars, i, bench) : null;
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
  const idx = (d) => { let lo = 0, hi = bars.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].date < d) lo = m + 1; else if (bars[m].date > d) hi = m - 1; else return m; } return -1; };
  const e = idx(trade.entryDate), s0 = idx(trade.setupDate ?? trade.signalDate ?? trade.entryDate);
  if (e < 1 || s0 < 1) return { status: 'NOT_EVALUABLE' };
  let start = s0; while (start > 0 && trendTemplate(bars, start - 1, P).status === 'TREND_TEMPLATE_1_7_PASS') start--;
  let worst = 0; // most negative daily return since the Stage 2 start, before the entry
  for (let k = Math.max(start, 1); k < e; k++) { const a = bars[k - 1].close, b = bars[k].close; if (fin(a) && fin(b) && a > 0) worst = Math.min(worst, b / a - 1); }
  const x = trade.exitDate ? idx(trade.exitDate) : bars.length - 1;
  for (let k = e + 1; k <= (x >= 0 ? x : bars.length - 1); k++) {
    const a = bars[k - 1].close, b = bars[k].close; if (!(fin(a) && fin(b) && a > 0)) continue;
    const r = b / a - 1;
    if (r < worst) return { status: 'SIGNAL', signalDate: bars[k].date, sessionsBeforeExit: x >= 0 ? x - k : null, decline: r, priorWorst: worst };
    worst = Math.min(worst, r);
  }
  return { status: 'NO_SIGNAL_BEFORE_EXIT' };
}

/**
 * Half-average-gain stop rule (B12 PDF 398-399, MA-MIN7-AVG-GAIN), diagnostic only: for every trade, the average
 * return of the winning trades closed before its entry date; the planned loss is compared with half of it and with the
 * absolute 10 % bound. Counts only.
 */
export function halfAverageGainStopCheck(trades, { minWinners = 10 } = {}) {
  const closed = trades.filter((t) => t.status === 'CLOSED' && fin(t.returnPct)).sort((a, b) => (a.exitDate < b.exitDate ? -1 : a.exitDate > b.exitDate ? 1 : 0));
  const out = { evaluated: 0, notEvaluated: 0, plannedLossWithinHalfAvgGain: 0, plannedLossAboveHalfAvgGain: 0, plannedLossAbove10pct: 0 };
  for (const t of trades) {
    const winners = closed.filter((c) => c.exitDate < t.entryDate && c.returnPct > 0);
    if (winners.length < minWinners || !(fin(t.entryFill) && fin(t.initialStop) && t.entryFill > 0)) { out.notEvaluated++; continue; }
    const avg = winners.reduce((s, c) => s + c.returnPct, 0) / winners.length, planned = 1 - t.initialStop / t.entryFill;
    out.evaluated++;
    if (planned > SF7_SOURCE_BOUNDS.maxPlannedLoss.value + 1e-12) out.plannedLossAbove10pct++;
    if (planned <= SF7_SOURCE_BOUNDS.stopAtHalfAverageGain.value * avg + 1e-12) out.plannedLossWithinHalfAvgGain++; else out.plannedLossAboveHalfAvgGain++;
  }
  return out;
}
