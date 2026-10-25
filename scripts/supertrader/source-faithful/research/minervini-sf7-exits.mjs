/**
 * Supertrader 7.0 – pre-registered research exit variants of the Minervini lifecycle (C06 SEPA / VCP, C07 Power Play).
 * Owner decision E7-7 (2026-10-25): "Minervini-Ausstiegsregeln dürfen als zusätzliche, vorregistrierte
 * Forschungsvarianten entwickelt werden. Keine neue Variante als Originalregel oder verbindliche Referenz aktivieren.
 * Keine Performanceoptimierung." Docs: docs/SUPERTRADER_7_MINERVINI_EXIT_VARIANTS.md.
 *
 * Every variant is the 4.0 REF configuration (lifecycle#REFERENCE_CONFIG, unchanged) plus ONE added exit rule, run by
 * research/minervini-sf7-exit-execution.mjs (the 4.0 engine is fingerprint-pinned and has no exit hook; it stays
 * untouched). Each rule is fixed here before any run: one value per parameter, taken from the printed numbers of the
 * finding (German paraphrase of the Indonesian B12 / Vietnamese B03 translation, never Minervini's English wording) or
 * declared as a model assumption (SF7_EXIT_MODEL_ASSUMPTIONS) where the source gives no number. No grid, no second
 * value, nothing chosen by a result. Status SOURCE_DERIVED_RESEARCH_VARIANT: never SOURCE_EXACT, never a reference,
 * never an original rule, never activated.
 *
 * Execution convention (same as the 4.0 MA50 exit): signal on the close of bar k from bars 0..k only, fill at the
 * next executable open (k + 1 or later) through the unchanged sell path (slippage, commission, dust policy).
 * Precedence on one close (MA-MIN7-EXIT-PRECEDENCE): the REF close rules run first; a REF full exit scheduled on the
 * same close stands (the variant signal is counted as suppressed); a variant full exit replaces a pending REF partial
 * exit (a full exit dominates a partial one, as in the engine); the stop on the next bar comes after the next-open exit.
 */
import crypto from 'node:crypto';
import { fin, smaAt } from '../common/series.mjs';
import { trendTemplate, MIN_PARAMS } from '../methods/minervini.mjs';
import { REFERENCE_CONFIG } from './minervini-lifecycle.mjs';
import { POST_BREAKOUT_WINDOW } from './minervini-sf7.mjs';

export const SF7_EXIT_VERSION = 'sf7-minervini-exits-1.0.0';

/** The decision the variants rest on; part of the pinned registry. */
export const SF7_EXIT_PREREGISTRATION = Object.freeze({
  ownerDecision: 'E7-7', decidedOn: '2026-10-25', preRegisteredOn: '2026-10-25', before: 'any snapshot run of an exit variant',
  scope: 'additional pre-registered research variants; no variant becomes an original rule or a binding reference; no performance optimisation',
  status: 'SOURCE_DERIVED_RESEARCH_VARIANT', certification: 'DIAGNOSTIC_NOT_CERTIFIED', activation: 'NONE', orders: 'NONE', productSurface: 'NONE',
  publicOutput: 'trade counts, exit and sell reasons, ledger / trade hashes and the trade-level comparison with REF; metrics sealed for the owner only',
});

/** Printed numbers the exit rules use (source page, finding, translation status). */
export const SF7_EXIT_SOURCE_BOUNDS = Object.freeze({
  climaxRunGain: Object.freeze({ value: 0.25, sessions: 15, source: 'B03 PDF 212 (F7-B03-212-085)', reading: 'climax top: typically +25 to 50 % in 1 to 3 weeks; lower bound of the gain over the upper end of the window (3 weeks = 15 sessions)', translationDoubt: false, ocrDigits: true }),
  climaxExtremeGain: Object.freeze({ value: 0.70, sessions: 10, source: 'B03 PDF 212 (F7-B03-212-085)', reading: 'extreme form: some stocks +70 to 80 % in 5 to 10 days; lower bound of the gain over the upper end of the window', translationDoubt: false, ocrDigits: true }),
  climaxUpCloseShare: Object.freeze({ value: 0.70, sessions: 15, source: 'B03 PDF 216 (F7-B03-216-086)', reading: 'extended stock: 70 % or more up days within 7 to 15 days; share of up closes over the upper end of the window (11 of 15)', translationDoubt: true, ocrDigits: true }),
  ma20HalfFraction: Object.freeze({ value: 0.5, source: 'B03 PDF 47 (F7-B03-047-016)', reading: 'a close below MA20 right after a VCP breakout: halve the position', translationDoubt: false, ocrDigits: true }),
});

/** Model assumptions of the exit variants; none is a Minervini rule. MA-MIN7-STAGE2-START, -WEEKLY-STEP and -POST-BREAKOUT-WINDOW are reused unchanged from minervini-sf7.mjs. */
export const SF7_EXIT_MODEL_ASSUMPTIONS = Object.freeze([
  Object.freeze({ id: 'MA-MIN7-EXIT-NOT-EVALUABLE', phase: 'EXIT_CONDITIONS', reference: 'a rule that needs the Stage 2 start (MA-MIN7-STAGE2-START) is not evaluable for a trade whose setup close does not pass Trend Template 1-7, and the weekly rule also with fewer than 4 prior weeks (MA-MIN7-WEEKLY-STEP); such a trade keeps the REF exits unchanged', why: 'B12 PDF 130 and B03 PDF 217 measure from the Stage 2 start; without Stage 2 at the setup there is no start to measure from, and inventing one would be a new rule' }),
  Object.freeze({ id: 'MA-MIN7-EXIT-PRECEDENCE', phase: 'EXIT_CONDITIONS', reference: 'REF close rules first; a REF full exit on the same close stands (variant signal suppressed, counted); a variant full exit replaces a pending REF partial; next-open exit before the stop on the next bar (engine precedence)', why: 'one-at-a-time change: the variant adds one exit and never removes a REF exit; the order on one bar is the declared 4.0 precedence' }),
  Object.freeze({ id: 'MA-MIN7-EXIT-CATCH-UP', phase: 'EXIT_CONDITIONS', reference: 'the rule reads every close of the security from the entry session on in order, also closes of sessions on which the engine skips the close rules (no executable open); a signal fills at the next executable open after the close on which it is read', why: 'a halt must neither hide a signal nor let the rule read a later close early (no look-ahead)' }),
  Object.freeze({ id: 'MA-MIN7-CLIMAX-RUN', phase: 'EXIT_CONDITIONS', reference: 'climax run on close k: close(k) / close(k-15) - 1 >= 25 % or close(k) / close(k-10) - 1 >= 70 %, and the 15-session gain on k (its window starting at or after the Stage 2 start) is larger than every 15-session gain on the closes from the Stage 2 start + 15 to k - 1 (at least one such close)', why: 'B03 PDF 212 prints the ranges (+25-50 % in 1-3 weeks, +70-80 % in 5-10 days) and "the steepest slope of the trend" without a measure; the lower printed gain over the upper end of the printed window is the least restrictive reading inside the source, the 15-session gain is the one window the steepness can be compared on' }),
  Object.freeze({ id: 'MA-MIN7-CLIMAX-FRACTION', phase: 'EXIT_CONDITIONS', reference: 'the climax rules sell the whole position at the next open', why: 'B03 PDF 212 says sell part or all into strength and prints no fraction; any part would be an invented number, "all" is the only reading the source gives a quantity for' }),
  Object.freeze({ id: 'MA-MIN7-CLIMAX-EXTENDED', phase: 'EXIT_CONDITIONS', reference: 'extended (B03 PDF 216) = the gain part of MA-MIN7-CLIMAX-RUN (>= 25 % over 15 sessions or >= 70 % over 10 sessions); up closes: at least 11 of the 15 closes k-14..k above the prior close (>= 70 % of the upper end of the printed 7-15 days); the 6-10 vs 2-3 count (p. 214 / 216 inconsistent), largest up day, widest range, exhaustion gap and P/E doubling are not used', why: 'B03 PDF 216 conditions the up-day count on an extended stock without defining "extended"; the climax gain of the neighbouring page is the source\'s own measure of extension; the second count carries the translation doubt and stays out' }),
]);

const TT_PASS = 'TREND_TEMPLATE_1_7_PASS';
const ret = (bars, k, n) => (k - n >= 0 && fin(bars[k]?.close) && fin(bars[k - n]?.close) && bars[k - n].close > 0 ? bars[k].close / bars[k - n].close - 1 : null);

/** Start of the Stage 2 advance for the setup close s0 (MA-MIN7-STAGE2-START), null without Stage 2 at s0. Uses bars 0..s0. */
export function stage2Start(bars, s0, P = MIN_PARAMS) {
  if (!(s0 >= 1) || trendTemplate(bars, s0, P).status !== TT_PASS) return null;
  let start = s0; while (start > 0 && trendTemplate(bars, start - 1, P).status === TT_PASS) start--;
  return start;
}

/**
 * The EXIT-CLIMAX-UPCLOSES condition on close j (MA-MIN7-CLIMAX-EXTENDED), reading bars j-15..j only. It is not anchored
 * at the entry or the Stage 2 advance: on the entry close it is often already true from the run-up BEFORE the entry
 * (review #917). Exported so the runner can report whether a signal was already knowable at the setup close.
 */
export function climaxUpClosesHolds(bars, j) {
  const B = SF7_EXIT_SOURCE_BOUNDS, w = B.climaxUpCloseShare.sessions, need = Math.ceil(B.climaxUpCloseShare.value * w - 1e-9);
  const g = ret(bars, j, B.climaxRunGain.sessions), g10 = ret(bars, j, B.climaxExtremeGain.sessions);
  if (!((g !== null && g >= B.climaxRunGain.value - 1e-12) || (g10 !== null && g10 >= B.climaxExtremeGain.value - 1e-12))) return false;
  let up = 0; for (let m = j - w + 1; m <= j; m++) if (m >= 1 && fin(bars[m].close) && fin(bars[m - 1].close) && bars[m].close > bars[m - 1].close) up++;
  return up >= need;
}

/**
 * Rule state for one trade. bars: the security's bars; e: entry bar index; s0: setup bar index (s0 < e);
 * stage2: optional memo (key -> start) shared by the variants of a run. The state reads bars 0..e - 1 at creation and
 * bar j only in onClose(j) (catch-up over skipped closes, MA-MIN7-EXIT-CATCH-UP). onClose returns null or
 * { fraction, reason, signalIndex } once; later calls return null.
 */
export function createExitRule(rule, bars, { e, s0, stage2 = null, key = null, P = MIN_PARAMS }) {
  const start = () => { if (stage2 && key != null && stage2.has(key)) return stage2.get(key); const v = stage2Start(bars, s0, P); if (stage2 && key != null) stage2.set(key, v); return v; };
  let next = e, fired = false;
  const scan = (test) => (k) => {
    if (fired) return null;
    for (; next <= k; next++) { const hit = test(next); if (hit) { fired = true; next = k + 1; return { ...hit, signalIndex: hit.signalIndex ?? null }; } }
    return null;
  };
  const off = (status) => ({ status, onClose: () => null });
  switch (rule.kind) {
    case 'LARGEST_DECLINE_DAILY': {
      // B12 PDF 130 (F7-B12-130-210, F7-B03-217-088): first daily close-to-close decline larger than every daily decline since the Stage 2 start
      const st = start(); if (st === null) return off('NOT_EVALUABLE_NO_STAGE2_AT_SETUP');
      let worst = 0; for (let k = Math.max(st, 1); k < e; k++) { const r = ret(bars, k, 1); if (r !== null) worst = Math.min(worst, r); }
      return { status: 'EVALUATED', onClose: scan((j) => { const r = ret(bars, j, 1); if (r === null) return null; if (r < worst) return { fraction: 1, reason: rule.reason, signalIndex: j }; worst = Math.min(worst, r); return null; }) };
    }
    case 'LARGEST_DECLINE_WEEKLY': {
      // B03 PDF 217 (F7-B03-217-088): weekly reading, 5-session steps anchored at the entry (MA-MIN7-WEEKLY-STEP)
      const st = start(); if (st === null) return off('NOT_EVALUABLE_NO_STAGE2_AT_SETUP');
      let worstW = 0, weeks = 0; for (let k = e - 5; k >= st + 5; k -= 5) { const r = ret(bars, k, 5); if (r !== null) { worstW = Math.min(worstW, r); weeks++; } }
      if (weeks < 4) return off('NOT_EVALUABLE_FEWER_THAN_4_PRIOR_WEEKS');
      return { status: 'EVALUATED', onClose: scan((j) => { if (j <= e || (j - e) % 5 !== 0) return null; const r = ret(bars, j, 5); if (r === null) return null; if (r < worstW) return { fraction: 1, reason: rule.reason, signalIndex: j }; worstW = Math.min(worstW, r); return null; }) };
    }
    case 'MA20_HALF_POST_BREAKOUT': {
      // B03 PDF 47 (F7-B03-047-016): first close below MA20 in the first 10 sessions from the entry (MA-MIN7-POST-BREAKOUT-WINDOW) -> half
      const last = e + POST_BREAKOUT_WINDOW - 1;
      return { status: 'EVALUATED', onClose: scan((j) => { if (j > last) { fired = true; return null; } const m = smaAt(bars, j, 20); return fin(m) && fin(bars[j].close) && bars[j].close < m ? { fraction: SF7_EXIT_SOURCE_BOUNDS.ma20HalfFraction.value, reason: rule.reason, signalIndex: j } : null; }) };
    }
    case 'CLIMAX_RUN': {
      // B03 PDF 212 (F7-B03-212-085): extended run and the steepest 15-session gain since the Stage 2 start (MA-MIN7-CLIMAX-RUN)
      const st = start(); if (st === null) return off('NOT_EVALUABLE_NO_STAGE2_AT_SETUP');
      const B = SF7_EXIT_SOURCE_BOUNDS, n = B.climaxRunGain.sessions;
      let best = -Infinity; for (let k = st + n; k < e; k++) { const g = ret(bars, k, n); if (g !== null) best = Math.max(best, g); }
      return { status: 'EVALUATED', onClose: scan((j) => {
        const g = ret(bars, j, n); if (g === null) return null;
        const g10 = ret(bars, j, B.climaxExtremeGain.sessions);
        const extended = g >= B.climaxRunGain.value - 1e-12 || (g10 !== null && g10 >= B.climaxExtremeGain.value - 1e-12);
        const hit = extended && Number.isFinite(best) && g > best && j - n >= st;
        if (j - n >= st) best = Math.max(best, g);
        return hit ? { fraction: 1, reason: rule.reason, signalIndex: j } : null;
      }) };
    }
    case 'CLIMAX_UP_CLOSES': {
      // B03 PDF 216 (F7-B03-216-086, translation doubt): extended and >= 70 % up closes in the last 15 sessions (MA-MIN7-CLIMAX-EXTENDED)
      return { status: 'EVALUATED', onClose: scan((j) => (climaxUpClosesHolds(bars, j) ? { fraction: 1, reason: rule.reason, signalIndex: j } : null)) };
    }
    default: throw new Error(`SF7_EXIT_RULE_UNKNOWN:${rule.kind}`);
  }
}

const v = (id, kind, reason, extra) => Object.freeze({
  id, compareTo: 'REF', strategies: Object.freeze(['SEPA', 'POWER_PLAY']), config: REFERENCE_CONFIG,
  status: 'SOURCE_DERIVED_RESEARCH_VARIANT', originalRule: false, reference: false, activated: false, sourceExact: false,
  exitRule: Object.freeze({ kind, reason, ...extra.exitRule }), ...extra.meta,
});

/** Pre-registered exit variants (one fixed setting each). Order is the run order. */
export const SF7_EXIT_VARIANTS = Object.freeze([
  v('EXIT-LARGEST-DECLINE-DAILY', 'LARGEST_DECLINE_DAILY', 'LARGEST_DECLINE_DAILY_EXIT', {
    exitRule: { fraction: 1, rule: 'full exit at the next open after the first close-to-close daily decline (from the entry session on) larger than every daily decline since the Stage 2 start; no Stage 2 at the setup: REF exits' },
    meta: { findings: Object.freeze(['F7-B12-130-210', 'F7-B03-217-088']), source: 'B12 PDF 130, B03 PDF 217', modelAssumptions: Object.freeze(['MA-MIN7-STAGE2-START', 'MA-MIN7-EXIT-NOT-EVALUABLE', 'MA-MIN7-EXIT-PRECEDENCE', 'MA-MIN7-EXIT-CATCH-UP']), translationDoubt: false, note: 'the source says "in most cases" (B12) / clear sell signal (B03); the variant applies it in every evaluable case' },
  }),
  v('EXIT-LARGEST-DECLINE-WEEKLY', 'LARGEST_DECLINE_WEEKLY', 'LARGEST_DECLINE_WEEKLY_EXIT', {
    exitRule: { fraction: 1, rule: 'full exit at the next open after the first 5-session step (anchored at the entry) whose decline is larger than every 5-session decline since the Stage 2 start; fewer than 4 prior weeks or no Stage 2 at the setup: REF exits' },
    meta: { findings: Object.freeze(['F7-B03-217-088', 'F7-B12-130-210']), source: 'B03 PDF 217, B12 PDF 130', modelAssumptions: Object.freeze(['MA-MIN7-STAGE2-START', 'MA-MIN7-WEEKLY-STEP', 'MA-MIN7-EXIT-NOT-EVALUABLE', 'MA-MIN7-EXIT-PRECEDENCE', 'MA-MIN7-EXIT-CATCH-UP']), translationDoubt: false, note: 'the classification reads Friday-to-Friday weeks; the variant keeps the 5-session step of the 1.3.0 diagnostic (MA-MIN7-WEEKLY-STEP)' },
  }),
  v('EXIT-MA20-HALF', 'MA20_HALF_POST_BREAKOUT', 'MA20_HALF_POST_BREAKOUT', {
    exitRule: { fraction: 0.5, rule: 'sell half at the next open after the first close below MA20 within the first 10 sessions from the entry session; once per trade; the rest keeps the REF stop and exit policy' },
    meta: { findings: Object.freeze(['F7-B03-047-016']), source: 'B03 PDF 47', modelAssumptions: Object.freeze(['MA-MIN7-POST-BREAKOUT-WINDOW', 'MA-MIN7-EXIT-PRECEDENCE', 'MA-MIN7-EXIT-CATCH-UP']), translationDoubt: false, note: 'the additional MA50-on-volume reading of the finding is not part of the variant' },
  }),
  v('EXIT-CLIMAX', 'CLIMAX_RUN', 'CLIMAX_RUN_EXIT', {
    exitRule: { fraction: 1, rule: 'full exit at the next open after a close with a gain of >= 25 % over 15 sessions or >= 70 % over 10 sessions whose 15-session gain is the steepest since the Stage 2 start; no Stage 2 at the setup: REF exits' },
    meta: { findings: Object.freeze(['F7-B03-212-085']), source: 'B03 PDF 212', modelAssumptions: Object.freeze(['MA-MIN7-CLIMAX-RUN', 'MA-MIN7-CLIMAX-FRACTION', 'MA-MIN7-STAGE2-START', 'MA-MIN7-EXIT-NOT-EVALUABLE', 'MA-MIN7-EXIT-PRECEDENCE', 'MA-MIN7-EXIT-CATCH-UP']), translationDoubt: false, note: 'source: part or all; the variant sells all (MA-MIN7-CLIMAX-FRACTION); B03 digits are OCR-read' },
  }),
  v('EXIT-CLIMAX-UPCLOSES', 'CLIMAX_UP_CLOSES', 'CLIMAX_UPCLOSES_EXIT', {
    exitRule: { fraction: 1, rule: 'full exit at the next open after a close on which the stock is extended (>= 25 % over 15 sessions or >= 70 % over 10 sessions) and at least 11 of the last 15 closes were up closes' },
    meta: { findings: Object.freeze(['F7-B03-216-086']), source: 'B03 PDF 216', modelAssumptions: Object.freeze(['MA-MIN7-CLIMAX-EXTENDED', 'MA-MIN7-CLIMAX-FRACTION', 'MA-MIN7-EXIT-PRECEDENCE', 'MA-MIN7-EXIT-CATCH-UP']), translationDoubt: true, note: 'TRANSLATION DOUBT (F7-B03-216-086): p. 214 and p. 216 give inconsistent counts; only the 70 % share is used, the 6-10 vs 2-3 count stays out' },
  }),
]);

/** Fingerprint of the exit pre-registration (version, bounds, assumptions, variants). Pinned in tests/sf-sf7-minervini-exits.test.mjs before the run. */
export function sf7ExitRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: SF7_EXIT_VERSION, preRegistration: SF7_EXIT_PREREGISTRATION, bounds: SF7_EXIT_SOURCE_BOUNDS, assumptions: SF7_EXIT_MODEL_ASSUMPTIONS, postBreakoutWindow: POST_BREAKOUT_WINDOW, variants: SF7_EXIT_VARIANTS })).digest('hex');
}
