/**
 * Supertrader 5.0 – Weinstein Stage 2 Investor (C04) and Trader (C05) trade lifecycles (contracts/weinstein.mjs) on the
 * shared research engine. Built on the unchanged weekly screens of methods/weinstein.mjs; report
 * docs/SUPERTRADER_5_FULL_STRATEGY_ADVANCEMENT_REPORT.md.
 *
 * WITH DATA EXCEPTION: no long buy in a negative industry group (WEIN-SF-GROUP) and only in a positive market
 * (WEIN-SF-MARKET) are DATA_BLOCKED; they are NOT applied (no proxy unblocks them), so a run is a model study with a
 * data exception, never a Weinstein strategy backtest.
 *
 * Source-derived mechanics (#709 B09, 1988 reprint, English, original wording checked):
 *  - buy stop prepared from the completed prior week one raw cent above the resistance (WEIN-ORD HARD), valid for the
 *    following week; no long buy at or below a falling 30-week MA (WEIN-MA via maGate);
 *  - the stop is computed before the buy and placed right after it (WEIN-STOP1 HARD); its level is the machine
 *    proposal of the screen (lowest weekly low of the base / consolidation), the significance of the low is manual;
 *  - Investor: a buy stop filled without volume confirmation is sold on the first small strength (WEIN-VOL5 HARD);
 *  - trailing (CONTEXTUAL, printed numbers): Investor raises the stop after an 8-10 % correction and a return to the
 *    prior high, under the correction low and the rising MA (WEIN-TRAIL1 / -2); Trader ignores corrections under 7 % and
 *    raises the stop under the reaction low after a significant correction and recovery, also above the MA (WEIN-TR-TRAIL);
 *  - no non-technical exit (WEIN-SELL4); no "every close below MA30" exit (#709 false hard rule, WEIN-TRAIL4).
 * Manual by the source and substituted (MA-WEIN-MANUAL-SUBSTITUTE): stage, volume judgment at entry, RS, overhead
 * resistance, the pullback half of the Investor position, Stage 3 sales.
 * Point in time: a week is complete at its last session (the next calendar session belongs to another ISO week); every
 * weekly decision is taken at that close and is effective from the next session.
 */
import crypto from 'node:crypto';
import { fin, rawTickAdjusted } from '../common/series.mjs';
import { weeklyBars, ma30w, maGate, baseStart, lastSwingHigh, volumeAlternatives, WEINSTEIN_VERSION } from '../methods/weinstein.mjs';
import { eligibilityResult, STUDY_LABEL } from './lifecycle-engine.mjs';

export const WEIN_LIFECYCLE_VERSION = 'sf5-weinstein-lifecycle-1.0.0';
export const WEIN_DATA_EXCEPTION = Object.freeze(['WEIN-SF-GROUP (industry group stage, DATA_BLOCKED)', 'WEIN-SF-MARKET (market breadth, DATA_BLOCKED)']);

export const WEIN_MODEL_ASSUMPTIONS = Object.freeze([
  { id: 'MA-WEIN-MANUAL-SUBSTITUTE', phase: 'ENTRY_ELIGIBILITY', strategies: ['INVESTOR', 'TRADER'], reference: 'ACCEPT_AS_MODEL_ASSUMPTION (simulation only): every MA-gated breakout of the screen is taken', alternatives: [], why: 'stage, volume judgment, RS and overhead resistance are the reviewer\'s (WEIN-MR-*); a run with them substituted is a model study' },
  { id: 'MA-WEIN-DATA-EXCEPTION', phase: 'ENTRY_ELIGIBILITY', strategies: ['INVESTOR', 'TRADER'], reference: 'group and market filters NOT applied (DATA_BLOCKED); the run is labelled WITH_DATA_EXCEPTION', alternatives: [], why: 'no point-in-time group stage or NYSE breadth in the snapshot; the SIC proxy and the universe breadth never unblock the rules' },
  { id: 'MA-WEIN-ORDER-WEEK', phase: 'ENTRY_EXECUTION', strategies: ['INVESTOR', 'TRADER'], reference: 'the buy stop prepared from the completed week rests for every session of the following week (re-armed daily), fill max(open, trigger)', alternatives: [], why: 'WEIN-ORD prepares a buy stop; its lifetime of one week follows the weekly screen (WEIN-GTC practice is execution judgment)' },
  { id: 'MA-WEIN-WEEK-END', phase: 'SETUP_QUALIFICATION', strategies: ['INVESTOR', 'TRADER'], reference: 'a week is complete at its last session; whether the next session opens a new ISO week is read from the trading calendar, not from prices', alternatives: [], why: 'weeklyBars marks a week complete when a later bar belongs to another week; the lifecycle takes the weekly decision at that close' },
  { id: 'MA-WEIN-INITIAL-STOP', phase: 'INITIAL_STOP', strategies: ['INVESTOR', 'TRADER'], reference: 'one raw cent below the machine proposal of the screen (Investor: lowest weekly low of the base; Trader: lowest weekly low of the consolidation)', alternatives: ['RISK_GUIDE_15: orders whose planned loss exceeds 15 % are not executed (WEIN-STOP4 guide)'], why: 'WEIN-STOP2 / WEIN-TR-STOP leave the significant low to the reviewer; WEIN-STOP4 is a guide with exceptions, so only an alternative uses it' },
  { id: 'MA-WEIN-INTRABAR-ORDER', phase: 'INITIAL_STOP', strategies: ['INVESTOR', 'TRADER'], reference: 'PESSIMISTIC', alternatives: [], why: 'a daily bar does not show the order of the trigger and a low below the stop' },
  { id: 'MA-WEIN-VOL5-STRENGTH', phase: 'EXIT_CONDITIONS', strategies: ['INVESTOR'], reference: 'volume confirmation is judged at the end of the breakout week by the three printed alternatives (volumeAlternatives); with none holding, the first later daily close above the prior close is the "first small strength": exit at the next open', alternatives: ['NO_VOL5_EXIT'], why: 'WEIN-VOL5 is HARD; "clear confirmation" (WEIN-VOL4) and "first small strength" have no numbers' },
  { id: 'MA-WEIN-TRAIL', phase: 'POSITION_MANAGEMENT', strategies: ['INVESTOR', 'TRADER'], reference: 'weekly: a correction of the weekly lows from the highest weekly high since entry by >= 8 % (Investor, lower printed end of 8-10 %) / >= 7 % (Trader), followed by a weekly high at or above that high, raises the stop one raw cent under the correction low (Investor: under the lower of the correction low and MA30w)', alternatives: ['INVESTOR_10PCT: 10 % (upper printed end)'], why: 'WEIN-TRAIL1/2 and WEIN-TR-TRAIL are CONTEXTUAL; "return near the prior high" has no number, so the stricter reading (at or above) is used' },
  { id: 'MA-WEIN-SIZING', phase: 'POSITION_SIZING', strategies: ['INVESTOR', 'TRADER'], reference: 'equal dollar amounts (WEIN-DIVERS2): planned position 10 % of equity; Investor buys half (5 %) at the breakout and does not add (the pullback half is manual); Trader buys the full 10 % (WEIN-TR-CONT-SIZE)', alternatives: ['INVESTOR_FULL_AT_BREAKOUT (10 %)'], why: 'the amount is the reviewer\'s; the halves follow WEIN-BUY2 / WEIN-TR-CONT-SIZE' },
  { id: 'MA-WEIN-RESEARCH-UNIVERSE', phase: 'ENTRY_ELIGIBILITY', strategies: ['INVESTOR', 'TRADER'], reference: 'VU_TOURNAMENT_UNIVERSE_705 at the session before the fill', alternatives: [], why: 'measurement convention shared by every method' },
  { id: 'MA-WEIN-COSTS', phase: 'ENTRY_EXECUTION', strategies: ['INVESTOR', 'TRADER'], reference: '10 bps slippage per side, 1 bp commission (platform policy)', alternatives: [], why: 'no costs in the source (stop-limit spacing WEIN-LIM is an execution example)' },
]);

const BASE = Object.freeze({ manualSubstitute: 'ACCEPT_AS_MODEL_ASSUMPTION', dataException: 'GROUP_AND_MARKET_NOT_APPLIED', intrabarOrder: 'PESSIMISTIC', riskGuide: null });
export const WEIN_INVESTOR_REFERENCE_CONFIG = Object.freeze({ ...BASE, vol5: true, trailThreshold: 0.08, sizing: Object.freeze({ mode: 'WEIGHT', weight: 0.05 }) });
export const WEIN_TRADER_REFERENCE_CONFIG = Object.freeze({ ...BASE, vol5: false, trailThreshold: 0.07, sizing: Object.freeze({ mode: 'WEIGHT', weight: 0.10 }) });
const variants = (ref, list) => Object.freeze(list.map((v) => Object.freeze({ ...v, config: Object.freeze({ ...ref, ...v.changes }) })));
export const WEIN_INVESTOR_RUN_VARIANTS = variants(WEIN_INVESTOR_REFERENCE_CONFIG, [
  { id: 'REF', changes: {} },
  { id: 'ALT-NO-VOL5-EXIT', changes: { vol5: false } },
  { id: 'ALT-TRAIL-10PCT', changes: { trailThreshold: 0.10 } },
  { id: 'ALT-RISK-GUIDE-15', changes: { riskGuide: 0.15 } },
  { id: 'ALT-FULL-AT-BREAKOUT', changes: { sizing: { mode: 'WEIGHT', weight: 0.10 } } },
]);
export const WEIN_TRADER_RUN_VARIANTS = variants(WEIN_TRADER_REFERENCE_CONFIG, [
  { id: 'REF', changes: {} },
  { id: 'ALT-RISK-GUIDE-15', changes: { riskGuide: 0.15 } },
]);

export const WEIN_OPEN_MANUAL_DECISIONS = Object.freeze({ INVESTOR: Object.freeze(['WEIN-MR-STAGE', 'WEIN-MR-VOLUME', 'WEIN-MR-RS', 'WEIN-MR-OVERHEAD', 'WEIN-MR-GROUP', 'WEIN-MR-STOP']), TRADER: Object.freeze(['WEIN-MR-STAGE', 'WEIN-MR-VOLUME', 'WEIN-MR-GROUP', 'WEIN-MR-STOP']) });

function validate(cfg, kind) {
  const errs = [];
  if (cfg.manualSubstitute !== 'ACCEPT_AS_MODEL_ASSUMPTION') errs.push('MANUAL_SUBSTITUTE_REQUIRED');
  if (cfg.dataException !== 'GROUP_AND_MARKET_NOT_APPLIED') errs.push('DATA_EXCEPTION_MUST_BE_DECLARED');
  if (!['PESSIMISTIC', 'OPTIMISTIC'].includes(cfg.intrabarOrder)) errs.push('INTRABAR_ORDER');
  if (!(cfg.riskGuide === null || cfg.riskGuide === 0.15)) errs.push('RISK_GUIDE');
  if (kind === 'TRADER' && cfg.vol5) errs.push('VOL5_IS_AN_INVESTOR_RULE');
  if (![0.07, 0.08, 0.10].includes(cfg.trailThreshold)) errs.push('TRAIL_THRESHOLD_NOT_PRINTED');
  if (!(cfg.sizing?.mode === 'WEIGHT' && cfg.sizing.weight > 0 && cfg.sizing.weight <= 0.25)) errs.push('SIZING');
  return errs;
}

/**
 * Weekly setups of a security for both methods, mapped to daily bars: setupFor[w] is the buy stop for week w prepared
 * from the completed weeks 0..w-1 exactly as investorScreen / traderScreen do (test GC-SF5-WEIN-SCREEN-EQUIV).
 */
export function weinsteinWeeklySetups(bars, kind) {
  const weeks = weeklyBars(bars), ma = ma30w(weeks), setupFor = new Map();
  for (let w = 2; w < weeks.length; w++) {
    if (!weeks[w - 1].complete) continue;
    let level, low, start;
    if (kind === 'INVESTOR') {
      const s = baseStart(ma, w); if (s === null || s > w - 1) continue;
      level = -Infinity; low = Infinity; for (let k = s; k <= w - 1; k++) { level = Math.max(level, weeks[k].high); low = Math.min(low, weeks[k].low); }
      start = s;
    } else {
      if (w < 3) continue;
      const p = lastSwingHigh(weeks, w); if (p === null) continue;
      level = weeks[p].high; low = Infinity; for (let k = p + 1; k <= w - 1; k++) low = Math.min(low, weeks[k].low);
      start = p;
    }
    const trigger = level + rawTickAdjusted(weeks[w - 1]);
    if (!fin(trigger) || !maGate(weeks, ma, w - 1, trigger).pass) continue;
    if (kind === 'TRADER' && !(ma[w - 1] > ma[w - 2])) continue;
    if (!fin(low)) continue;
    setupFor.set(w, { week: w, weekKey: weeks[w].key, level, trigger, stopProposal: low, rangeStartWeek: start, ma30w: ma[w - 1] });
  }
  const weekOf = new Int32Array(bars.length);
  weeks.forEach((wk, w) => { for (let i = wk.firstIndex; i <= wk.lastIndex; i++) weekOf[i] = w; });
  return { weeks, ma, setupFor, weekOf };
}

function makeAdapter(kind, version) {
  const validateConfig = (cfg) => validate(cfg, kind);
  return Object.freeze({
    strategy: `WEINSTEIN_${kind}`, version, methodVersion: WEINSTEIN_VERSION, label: 'MODEL_LIFECYCLE_STUDY_WITH_DATA_EXCEPTION_NOT_A_STRATEGY_BACKTEST',
    dataException: WEIN_DATA_EXCEPTION,
    validateConfig,
    prepareKey: () => kind,
    prepare(security) { const r = weinsteinWeeklySetups(security.bars, kind); return r.setupFor.size ? { ...r, bars: security.bars } : null; },
    // at the close of bar i: the last bar of week W arms the order for week W + 1; any other bar re-arms week W's order
    signalAt(ctx, i) {
      const W = ctx.weekOf[i], wk = ctx.weeks[W], target = i === wk.lastIndex ? (wk.complete ? W + 1 : null) : W;
      const s = target === null ? null : ctx.setupFor.get(target);
      return s ? { ...s, i, date: ctx.bars[i].date, evidence: { level: s.level, stopProposal: s.stopProposal, ma30w: s.ma30w, weekKey: s.weekKey } } : null;
    },
    eligibility({ setup, bars, i, cfg }) {
      const stop = setup.stopProposal - rawTickAdjusted(bars[i]), blockers = [];
      if (!(stop > 0 && stop < setup.trigger)) blockers.push({ code: 'NO_STOP_BELOW_TRIGGER', rule: 'WEIN-SF-STOP-PLAN (WEIN-STOP1)', class: 'SOURCE_DERIVED' });
      return eligibilityResult({ strategy: `WEINSTEIN_${kind}`, bars, i, blockers, openManualDecisions: WEIN_OPEN_MANUAL_DECISIONS[kind], order: { type: 'BUY_STOP', level: setup.trigger, stop, maxPlannedLoss: cfg.riskGuide ?? undefined, rule: 'WEIN-SF-ORDER / WEIN-SF-STOP-PLAN' }, extra: { dataException: WEIN_DATA_EXCEPTION } });
    },
    onClose(pos, ctx, i, api, cfg) {
      const { weeks, ma, bars } = ctx, W = ctx.weekOf[i], wk = weeks[W], st = pos.state;
      // WEIN-VOL5 (Investor): unconfirmed breakout -> exit at the next open after the first small strength
      if (st.vol5 === 'UNCONFIRMED' && i > (st.vol5JudgedAt ?? Infinity) && fin(bars[i].close) && fin(bars[i - 1]?.close) && bars[i].close > bars[i - 1].close) api.scheduleExit(1, 'WEIN_VOL5_FIRST_STRENGTH');
      if (i !== wk.lastIndex || !wk.complete) return; // weekly decisions at the close of a completed week only
      if (st.entryWeek === undefined) { st.entryWeek = ctx.weekOf[pos.entryIndex]; st.peak = -Infinity; st.corrLow = Infinity; }
      if (cfg.vol5 && W === st.entryWeek && st.vol5 === undefined) {
        const v = volumeAlternatives(weeks, W, bars, pos.entryIndex);
        st.vol5 = v.anyAlternative ? 'CONFIRMED' : 'UNCONFIRMED'; st.vol5JudgedAt = i;
        if (!v.anyAlternative) pos.events.push({ date: bars[i].date, type: 'WEIN_VOL5_UNCONFIRMED', rule: 'WEIN-VOL5' });
      }
      // MA-WEIN-TRAIL: correction >= threshold from the peak, then a weekly high at or above the peak raises the stop
      if (wk.high > st.peak) {
        if (st.peak > 0 && st.corrLow < Infinity && (st.peak - st.corrLow) / st.peak >= cfg.trailThreshold - 1e-12) {
          const base = kind === 'INVESTOR' && fin(ma[W]) ? Math.min(st.corrLow, ma[W]) : st.corrLow;
          api.raiseStop(base - rawTickAdjusted(bars[i]), kind === 'INVESTOR' ? 'WEIN-TRAIL1-2' : 'WEIN-TR-TRAIL');
        }
        st.peak = wk.high; st.corrLow = Infinity;
      } else if (fin(wk.low)) st.corrLow = Math.min(st.corrLow, wk.low);
    },
  });
}

export const WEINSTEIN_INVESTOR_ADAPTER = makeAdapter('INVESTOR', WEIN_LIFECYCLE_VERSION);
export const WEINSTEIN_TRADER_ADAPTER = makeAdapter('TRADER', WEIN_LIFECYCLE_VERSION);
export const validateWeinInvestorConfig = (cfg) => validate(cfg, 'INVESTOR');
export const validateWeinTraderConfig = (cfg) => validate(cfg, 'TRADER');

export function weinVariantRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ investor: { reference: WEIN_INVESTOR_REFERENCE_CONFIG, variants: WEIN_INVESTOR_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })) }, trader: { reference: WEIN_TRADER_REFERENCE_CONFIG, variants: WEIN_TRADER_RUN_VARIANTS.map((v) => ({ id: v.id, changes: v.changes })) } })).digest('hex');
}
