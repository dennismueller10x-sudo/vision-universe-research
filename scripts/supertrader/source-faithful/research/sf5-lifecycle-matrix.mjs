/**
 * Supertrader 5.0 – Source-to-Execution matrix of the lifecycles on the shared research engine (Darvas C03, Kullamaegi
 * Common Breakout C08, Pocket Pivot C11, Buyable Gap-Up C12, Weinstein Investor C04 / Trader C05 with data exception,
 * Holy Grail research variant C13). Same row shape and the
 * same ten phases as the Supertrader 4.0 Minervini matrix (research/minervini-lifecycle-matrix.mjs); the contract
 * RULE_STATUS stays the binding registry term.
 *
 * Classes: SOURCE_EXACT (contract rule SOURCE_EXACT on a hardenable #709 rule), SOURCE_DERIVED (contract rule
 * SOURCE_EXACT / SOURCE_DERIVED: the source rule with a declared convention), SOURCE_BOUNDED (a printed number used as
 * a bound), MODEL_ASSUMPTION, MANUAL_REVIEW, DATA_BLOCKED, SOURCE_BLOCKED (the sources give no executable rule).
 * validateSf5Matrix rejects every upgrade: a class above its contract rules, an undeclared model assumption, an unknown
 * #709 id or contract rule, code or tests that cannot be found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIFECYCLE_PHASES } from './minervini-lifecycle.mjs';
import { ROW_READINESS } from './minervini-lifecycle-matrix.mjs';
import { SF5_LIFECYCLES } from './sf5-lifecycles.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SF = path.resolve(HERE, '..');
const TESTS = path.resolve(SF, '..', 'tests');
export const SF5_MATRIX_VERSION = 'sf5-lifecycle-matrix-1.0.0';
export const SF5_CLASS = Object.freeze({ SOURCE_EXACT: 'SOURCE_EXACT', SOURCE_DERIVED: 'SOURCE_DERIVED', SOURCE_BOUNDED: 'SOURCE_BOUNDED', MODEL_ASSUMPTION: 'MODEL_ASSUMPTION', MANUAL_REVIEW: 'MANUAL_REVIEW', DATA_BLOCKED: 'DATA_BLOCKED', SOURCE_BLOCKED: 'SOURCE_BLOCKED' });
const C = SF5_CLASS, RD = ROW_READINESS;

const row = (id, phase, condition, o) => ({ id, phase, condition, psr709: o.psr ?? [], contractRules: o.contract ?? [], implemented: o.code ? { code: o.code, tests: o.tests ?? [] } : null, missing: o.missing ?? null, data: o.data ?? [], pit: o.pit ?? 'n/a', class: o.cls, modelAssumptions: o.ma ?? [], readiness: o.ready, note: o.note ?? null });
const OHLCV = 'daily split-adjusted OHLCV (snapshot)', PIT_CLOSE = 'PIT: bars up to the decision close only', PIT_NEXT = 'PIT: armed at the close of bar i, filled on session i + 1 only';
const EN = 'research/lifecycle-engine.mjs', DL = 'research/darvas-lifecycle.mjs', KL = 'research/kk-breakout-lifecycle.mjs', ML = 'research/moka-lifecycle.mjs', HL = 'research/holy-grail-lifecycle.mjs';
const D = (id) => `sf-sf5-darvas-lifecycle: ${id}`, K = (id) => `sf-sf5-kk-moka-lifecycle: ${id}`;

/** rows every engine lifecycle shares (accounting, diagnostics, readiness) */
const common = (s, ma, tests) => [
  row(`${s}-ACC-RESEARCH-V1`, 'TRADE_ACCOUNTING', 'research-v1: orders only on real source bars, dividends on held shares, stale limit, economic delisting, ledger replay reconciliation', { code: `${EN}#runResearchLifecycle`, tests: [D('GC-SF5-ENGINE-DELIST-STALE'), D('GC-SF5-ENGINE-PORTFOLIO')], data: [OHLCV, 'listing table incl. inactive listings'], pit: 'PIT: causal terminal dates of the snapshot', cls: C.MODEL_ASSUMPTION, ma: [ma.costs], ready: RD.MODEL, note: 'platform accounting, not a method rule' }),
  row(`${s}-ACC-PORTFOLIO-POLICY`, 'TRADE_ACCOUNTING', 'platform research portfolio policy: cash only, 100 000 start, 20 open positions, 25 % weight cap, neutral date-seeded fill order', { code: `${EN}#plannedShares`, tests: [D('GC-SF5-ENGINE-FILL'), D('GC-SF5-ENGINE-PORTFOLIO')], cls: C.MODEL_ASSUMPTION, ma: [ma.costs], ready: RD.MODEL, note: 'separate from the original strategy' }),
  row(`${s}-DIAG-DETERMINISM`, 'BACKTEST_DIAGNOSTICS', 'deterministic, prefix-stable (no lookahead) lifecycle; public counts, sealed metrics', { code: 'research/run-sf5-lifecycle.mjs#lifecyclePart', tests: [...tests, 'sf-sf5-lifecycle-runner: SF5-RUNNER-PUBLIC-COUNTS-ONLY'], cls: C.MODEL_ASSUMPTION, ma: [ma.manual], ready: RD.MODEL, note: 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST, DIAGNOSTIC_NOT_CERTIFIED' }),
  row(`${s}-READINESS`, 'STRATEGY_READINESS', 'readiness in six dimensions; LIVE_NOT_APPROVED, NOT_A_TRADABLE_STRATEGY, performanceClaim NONE', { cls: C.MANUAL_REVIEW, ready: RD.MANUAL, note: 'assessment, not a trading phase' }),
];

const DAR_MA = { costs: 'MA-DAR-COSTS', manual: 'MA-DAR-MANUAL-SUBSTITUTE' };
const DARVAS = [
  row('DAR-SETUP-TOP', 'SETUP_QUALIFICATION', 'box top: a new high not reached on the three following sessions; a touch restarts the count', { psr: ['DAR-Q1'], contract: ['DAR-SF-TOP'], code: 'methods/darvas.mjs#createDarvasBoxMachine', tests: ['sf-darvas: GC-DAR-TOP-CONFIRM', 'sf-darvas: GC-DAR-TOP-TOUCH-RESET', D('GC-SF5-DAR-EQUIV-COMPONENT')], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_EXACT, ready: RD.MECHANICAL }),
  row('DAR-SETUP-BOTTOM', 'SETUP_QUALIFICATION', 'box bottom by the reverse three-day procedure after the top; start of the search pre-registered in both readings', { psr: ['DAR-Q2'], contract: ['DAR-SF-BOTTOM', 'DAR-SF-BOTTOM-START'], code: `${DL}#darvasBoxSeries`, tests: ['sf-darvas: GC-DAR-BOTTOM-START-VARIANTS', D('GC-SF5-DAR-VARIANTS')], data: [OHLCV], pit: PIT_CLOSE, cls: C.MODEL_ASSUMPTION, ma: ['MA-DAR-BOTTOM-START'], ready: RD.MODEL, note: 'DAR-SF-BOTTOM-START is SOURCE_AMBIGUOUS: the executed rule depends on a declared reading' }),
  row('DAR-SETUP-ATH', 'SETUP_QUALIFICATION', 'the breakout must be to an all-time high; checked within the available history (snapshot from 2015), unverified records are traded in the simulation', { psr: ['DAR-Q9'], contract: ['DAR-SF-ATH'], code: `${DL}#DARVAS_ADAPTER`, tests: [D('GC-SF5-DAR-ATH-BLOCK')], data: [OHLCV, 'listing-to-date history (partial: snapshot starts 2015)'], pit: PIT_CLOSE, cls: C.MODEL_ASSUMPTION, ma: ['MA-DAR-ATH-AVAILABLE-HISTORY'], ready: RD.MODEL, note: 'DAR-Q9 is HARD; the contract sends an unverified all-time high to review, the simulation substitutes that review' }),
  row('DAR-SETUP-SELECTION', 'SETUP_QUALIFICATION', 'techno-fundamental selection, volume relative to own history, market trend', { psr: ['DAR-Q12', 'DAR-Q14', 'DAR-Q10', 'DAR-Q13'], contract: ['DAR-SF-SELECTION', 'DAR-SF-VOLUME', 'DAR-SF-MARKET'], code: `${DL}#DARVAS_ADAPTER`, tests: [D('GC-SF5-DAR-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-DAR-MANUAL-SUBSTITUTE'], ready: RD.MODEL, note: 'substituted in the simulation (every ATH box breakout is taken); never substituted in a product record' }),
  row('DAR-EL-NO-WAIT', 'ENTRY_ELIGIBILITY', 'no waiting after the box is complete: the order is armed at the completing close', { psr: ['DAR-Q3'], contract: ['DAR-SF-NO-WAIT'], code: `${DL}#DARVAS_ADAPTER`, tests: [D('GC-SF5-DAR-LIFECYCLE')], data: [OHLCV], pit: PIT_NEXT, cls: C.SOURCE_EXACT, ready: RD.MECHANICAL }),
  row('DAR-EL-ORDER-VALIDITY', 'ENTRY_ELIGIBILITY', 'the resting buy stop is re-armed at every close while the box stands', { psr: ['DAR-B5', 'DAR-Q4'], code: `${EN}#runResearchLifecycle`, tests: [D('GC-SF5-DAR-EQUIV-COMPONENT')], cls: C.MODEL_ASSUMPTION, ma: ['MA-DAR-ORDER-VALIDITY'], ready: RD.MODEL }),
  row('DAR-EL-UNIVERSE', 'ENTRY_ELIGIBILITY', 'research population (no Darvas liquidity number)', { psr: ['DAR-Q10'], contract: ['DAR-SF-RESEARCH-POPULATION'], code: `${EN}#runResearchLifecycle`, tests: [D('GC-SF5-DAR-LIFECYCLE')], data: ['raw close and raw volume'], pit: 'PIT: prior session', cls: C.MODEL_ASSUMPTION, ma: ['MA-DAR-RESEARCH-UNIVERSE'], ready: RD.MODEL }),
  row('DAR-EL-REENTRY', 'ENTRY_ELIGIBILITY', 'after a stop-out a later all-time-high box can be bought again', { psr: ['DAR-Q11'], contract: ['DAR-SF-REENTRY'], code: `${EN}#runResearchLifecycle`, tests: [D('GC-SF5-DAR-EQUIV-COMPONENT')], cls: C.MODEL_ASSUMPTION, ma: ['MA-DAR-REENTRY'], ready: RD.MODEL }),
  row('DAR-EX-BUY-STOP', 'ENTRY_EXECUTION', 'buy stop a fraction (one raw cent) above the top; fill max(open, trigger)', { psr: ['DAR-Q4', 'DAR-B5'], contract: ['DAR-SF-ENTRY'], code: `${EN}#fillOrder`, tests: [D('GC-SF5-ENGINE-FILL'), D('GC-SF5-DAR-ENTRY-BAR-STOP')], data: [OHLCV], pit: PIT_NEXT, cls: C.SOURCE_DERIVED, ma: ['MA-DAR-FRACTION'], ready: RD.MECHANICAL }),
  row('DAR-EX-COSTS', 'ENTRY_EXECUTION', 'slippage and commission', { code: `${EN}#runResearchLifecycle`, tests: [D('GC-SF5-ENGINE-PORTFOLIO')], cls: C.MODEL_ASSUMPTION, ma: ['MA-DAR-COSTS'], ready: RD.MODEL }),
  row('DAR-STOP-INIT', 'INITIAL_STOP', 'stop placed with the buy, a fraction below the broken top, never inside the box', { psr: ['DAR-B6', 'DAR-Q5', 'DAR-Q7'], contract: ['DAR-SF-PROTECT', 'DAR-SF-STOP-INIT'], code: `${DL}#DARVAS_ADAPTER`, tests: [D('GC-SF5-DAR-LIFECYCLE')], data: [OHLCV], pit: PIT_NEXT, cls: C.SOURCE_DERIVED, ready: RD.MECHANICAL }),
  row('DAR-STOP-ENTRY-BAR', 'INITIAL_STOP', 'a low at or below the stop on the trigger bar: pessimistic by default', { psr: ['DAR-Q5'], contract: ['DAR-SF-STOP-INIT'], code: `${EN}#runResearchLifecycle`, tests: [D('GC-SF5-DAR-ENTRY-BAR-STOP')], cls: C.MODEL_ASSUMPTION, ma: ['MA-DAR-INTRABAR-ORDER'], ready: RD.MODEL }),
  row('DAR-SIZE', 'POSITION_SIZING', 'position size and pilot buys', { psr: ['DAR-B15', 'DAR-B18'], contract: ['DAR-SF-SIZING'], code: `${EN}#plannedShares`, tests: [D('GC-SF5-DAR-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-DAR-SIZING'], ready: RD.MODEL, note: 'reviewer decision in the source; fixed weight in the simulation' }),
  row('DAR-MGMT-RAISE', 'POSITION_MANAGEMENT', 'stop raised a fraction below the bottom of every later completed box, from the next session, never lowered', { psr: ['DAR-Q6', 'DAR-Q8'], contract: ['DAR-SF-STOP-RAISE'], code: `${DL}#DARVAS_ADAPTER`, tests: [D('GC-SF5-DAR-LIFECYCLE'), D('GC-SF5-DAR-EQUIV-COMPONENT')], data: [OHLCV], pit: 'PIT: effective from the session after the box is complete', cls: C.SOURCE_DERIVED, ready: RD.MECHANICAL }),
  row('DAR-MGMT-PYRAMID', 'POSITION_MANAGEMENT', 'further buys while the confirmed up-trend continues', { psr: ['DAR-B8'], contract: ['DAR-SF-PYRAMID'], cls: C.MANUAL_REVIEW, ready: RD.MANUAL, missing: 'not modelled (manual)' }),
  row('DAR-EXIT-STOP-ONLY', 'EXIT_CONDITIONS', 'no profit target; the exit is the stop (stop-market fill min(open, stop))', { psr: ['DAR-B7'], contract: ['DAR-SF-STOP-RAISE'], code: `${EN}#protectiveHit`, tests: [D('GC-SF5-ENGINE-FILL'), D('GC-SF5-DAR-LIFECYCLE')], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_DERIVED, ready: RD.MECHANICAL }),
  ...common('DAR', DAR_MA, [D('GC-SF5-DAR-PIT-PREFIX')]),
];

const KK_MA = { costs: 'MA-KK-COSTS', manual: 'MA-KK-MANUAL-SUBSTITUTE' };
const KK = [
  row('KK-SETUP-PROXY', 'SETUP_QUALIFICATION', 'prior move, consolidation length, rising 10 / 20-day MA, breakout level (higher lows and orderly tightening, KK-007, are not modelled)', { psr: ['KK-006', 'KK-008', 'KK-009', 'KK-011'], contract: ['KK-SF-BO-SETUP', 'KK-SF-BO-ENTRY'], code: `${KL}#kkBreakoutSetupAt`, tests: [K('GC-SF5-KK-SETUP-PIT'), K('GC-SF5-KK-LIFECYCLE')], data: [OHLCV], pit: PIT_CLOSE, cls: C.MODEL_ASSUMPTION, ma: ['MA-KK-SETUP-PROXY', 'MA-KK-MANUAL-SUBSTITUTE'], ready: RD.MODEL, note: 'KK-MR-SETUP / KK-MR-LEVEL are manual; the proxy uses the printed lower ends as bounds' }),
  row('KK-SETUP-TIGHTENING', 'SETUP_QUALIFICATION', 'higher lows, orderly tightening', { psr: ['KK-007'], contract: ['KK-SF-BO-SETUP'], cls: C.MANUAL_REVIEW, ready: RD.EVIDENCE, note: 'reported by breakoutEvidence, not part of the simulated proxy' }),
  row('KK-SETUP-MOMENTUM', 'SETUP_QUALIFICATION', 'top 1-2 % by 1 / 3 / 6-month performance and the review priority', { psr: ['KK-005', 'KK-048'], contract: ['KK-SF-BO-MOMENTUM', 'KK-SF-PRIORITY'], cls: C.MANUAL_REVIEW, ready: RD.EVIDENCE, note: 'ranking evidence (momentumRanks), never used to select in the simulation' }),
  row('KK-EL-STOP-WIDTH', 'ENTRY_ELIGIBILITY', 'the low-of-day stop may not be wider than ADR20: a wider stop rejects the trade, never tightened', { psr: ['KK-012', 'KK-031'], contract: ['KK-SF-BO-STOP', 'KK-SF-ADR'], code: `${KL}#KK_BREAKOUT_ADAPTER`, tests: [K('GC-SF5-KK-WIDE-STOP-REJECT'), 'sf-kullamagi: GC-KK-STOP-REJECT-WIDE'], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_EXACT, ready: RD.MECHANICAL }),
  row('KK-EL-UNIVERSE', 'ENTRY_ELIGIBILITY', 'liquidity first (no number)', { psr: ['KK-048'], code: `${EN}#runResearchLifecycle`, tests: [K('GC-SF5-KK-LIFECYCLE')], cls: C.MODEL_ASSUMPTION, ma: ['MA-KK-RESEARCH-UNIVERSE'], ready: RD.MODEL }),
  row('KK-EX-DAILY-CLOSE', 'ENTRY_EXECUTION', 'daily breakout entry at the breakout-day close (written alternative to the ORH)', { psr: ['KK-011'], contract: ['KK-SF-BO-ENTRY'], code: `${EN}#runResearchLifecycle`, tests: [K('GC-SF5-KK-LIFECYCLE'), K('GC-SF5-KK-NEXT-OPEN')], data: [OHLCV], pit: 'CLOSE_DECISION_USES_FINAL_BAR: the closing decision uses the final close and low of the breakout day (declared, small daily-bar lookahead against a real closing order); alternative next open is strictly PIT', cls: C.MODEL_ASSUMPTION, ma: ['MA-KK-ENTRY-TIMING'], ready: RD.MODEL }),
  row('KK-EX-ORH', 'ENTRY_EXECUTION', 'opening range high entry (1 / 5 / 60 minutes)', { psr: ['KK-010'], contract: ['KK-SF-BO-ORH'], data: ['intraday bars (missing)'], cls: C.DATA_BLOCKED, ready: RD.BLOCKED, missing: 'no frozen intraday history' }),
  row('KK-EX-COSTS', 'ENTRY_EXECUTION', 'slippage and commission', { code: `${EN}#runResearchLifecycle`, tests: [K('GC-SF5-KK-LIFECYCLE')], cls: C.MODEL_ASSUMPTION, ma: ['MA-KK-COSTS'], ready: RD.MODEL }),
  row('KK-STOP-LOD', 'INITIAL_STOP', 'initial stop = low of the entry day, stop-market', { psr: ['KK-012', 'KK-027'], contract: ['KK-SF-BO-STOP', 'KK-SF-STOPMARKET'], code: `${EN}#protectiveHit`, tests: [K('GC-SF5-KK-LIFECYCLE'), D('GC-SF5-ENGINE-FILL')], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_EXACT, ready: RD.MECHANICAL }),
  row('KK-SIZE-CAP', 'POSITION_SIZING', 'never more than 30 % of equity in one stock overnight', { psr: ['KK-001'], contract: ['KK-SF-CAP'], code: `${EN}#plannedShares`, tests: [K('GC-SF5-KK-MOKA-VARIANTS'), D('GC-SF5-ENGINE-FILL')], cls: C.SOURCE_EXACT, ready: RD.MECHANICAL, note: 'the platform cap (25 %) is stricter and applies' }),
  row('KK-SIZE-RISK', 'POSITION_SIZING', 'risk per trade inside the printed context ranges', { psr: ['KK-003', 'KK-025', 'KK-002', 'KK-026'], contract: ['KK-SF-SIZE'], code: `${EN}#plannedShares`, tests: [K('GC-SF5-KK-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-KK-RISK-FRACTION'], ready: RD.MODEL }),
  row('KK-MGMT-PARTIAL', 'POSITION_MANAGEMENT', 'after 3-5 days sell 1/3-1/2, rest to break-even', { psr: ['KK-013'], contract: ['KK-SF-BO-PARTIAL'], code: `${KL}#KK_BREAKOUT_ADAPTER`, tests: [K('GC-SF5-KK-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-KK-EXIT-POLICY'], ready: RD.MODEL, note: 'printed ranges; the reference uses day 3 and 1/3, alternatives pre-registered' }),
  row('KK-EXIT-TRAIL', 'EXIT_CONDITIONS', 'trail the rest with the 10 / 20-day MA; beginners: first close below the 10-day MA', { psr: ['KK-014'], contract: ['KK-SF-BO-TRAIL'], code: `${KL}#KK_BREAKOUT_ADAPTER`, tests: [K('GC-SF5-KK-TRAIL-MA10')], data: [OHLCV], pit: 'PIT: close below the MA, exit at the next open', cls: C.MANUAL_REVIEW, ma: ['MA-KK-EXIT-POLICY'], ready: RD.MODEL }),
  row('KK-EXIT-STOP', 'EXIT_CONDITIONS', 'stop-market exit at min(open, stop), never skipped', { psr: ['KK-027'], contract: ['KK-SF-STOPMARKET'], code: `${EN}#protectiveHit`, tests: [D('GC-SF5-ENGINE-FILL')], cls: C.SOURCE_EXACT, ready: RD.MECHANICAL }),
  ...common('KK', KK_MA, [K('GC-SF5-KK-SETUP-PIT')]),
];

const MO_MA = { costs: 'MA-MOKA-COSTS', manual: 'MA-MOKA-MANUAL-SUBSTITUTE' };
const mokaExit = (p) => [
  row(`${p}-MGMT-GUIDE`, 'POSITION_MANAGEMENT', 'sell guide: 10DMA after >= 7 weeks of respect, otherwise 50DMA', { psr: ['MOKA12-008', 'MOKASTOP-001'], contract: ['MOKA-SF-EXIT-MA', 'MOKA-SF-EXIT-GUIDE-EVIDENCE'], code: `${ML}#sellGuideSeries`, tests: [K('GC-SF5-MOKA-GUIDE-EQUIV')], data: [OHLCV], pit: PIT_CLOSE, cls: C.MANUAL_REVIEW, ma: ['MA-MOKA-SELL-GUIDE'], ready: RD.MODEL }),
  row(`${p}-EXIT-VIOLATION`, 'EXIT_CONDITIONS', 'MA violation: close below the guide MA, then a lower low (next day vs later days)', { psr: ['MOKA12-009', 'MOKASTOP-002'], contract: ['MOKA-SF-EXIT-VIOLATION'], code: `${EN}#protectiveHit`, tests: [K('GC-SF5-PP-LIFECYCLE'), D('GC-SF5-ENGINE-FILL')], data: [OHLCV], pit: 'PIT: the undercut on a later session than the close below the MA', cls: C.MODEL_ASSUMPTION, ma: ['MA-MOKA-VIOLATION-READING'], ready: RD.MODEL, note: 'SOURCE_AMBIGUOUS (MOKA-C2); both readings pre-registered' }),
  row(`${p}-EXIT-CONTEXT`, 'EXIT_CONDITIONS', 'weak market, partial vs full exit, laggards', { psr: ['MOKASTOP-003', 'MOKASTOP-004', 'MOKASTOP-005'], contract: ['MOKA-SF-EXIT-CONTEXT'], cls: C.MANUAL_REVIEW, ready: RD.MANUAL, missing: 'reviewer decisions; the simulation sells all at the violation' }),
];
const PP = [
  row('PP-SETUP-SIGNATURE', 'SETUP_QUALIFICATION', 'up-day volume greater than the highest down-day volume of the ten prior sessions', { psr: ['MOKAPP-003'], contract: ['MOKA-SF-PP-VOLUME', 'MOKA-SF-PP-UPDAY', 'MOKA-SF-PP-DOWNDAY'], code: `${ML}#pocketPivotSignal`, tests: ['sf-morales-kacher: GC-PP-SIGNATURE', K('GC-SF5-PP-LIFECYCLE')], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_DERIVED, ready: RD.MECHANICAL, note: 'MOKA-SF-PP-VOLUME SOURCE_EXACT; up / down day SOURCE_DERIVED' }),
  row('PP-SETUP-CONTEXT', 'SETUP_QUALIFICATION', 'constructive base, theme, critical MA, not extended', { psr: ['MOKAPP-001', 'MOKAPP-002', 'MOKAPP-007', 'MOKAPP-010'], contract: ['MOKA-SF-PP-CONTEXT'], code: `${ML}#pocketPivotSignal`, tests: [K('GC-SF5-PP-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-MOKA-CONTEXT-PROXY', 'MA-MOKA-MANUAL-SUBSTITUTE'], ready: RD.MODEL }),
  row('PP-EL-UNIVERSE', 'ENTRY_ELIGIBILITY', 'research population', { code: `${EN}#runResearchLifecycle`, tests: [K('GC-SF5-PP-LIFECYCLE')], cls: C.MODEL_ASSUMPTION, ma: ['MA-MOKA-RESEARCH-UNIVERSE'], ready: RD.MODEL }),
  row('PP-EX-NEXT-OPEN', 'ENTRY_EXECUTION', 'buy at the next open after the signal close (full-day volume known)', { code: `${EN}#fillOrder`, tests: [K('GC-SF5-MOKA-NO-SIGNAL-CLOSE-FILL')], pit: PIT_NEXT, cls: C.MODEL_ASSUMPTION, ma: ['MA-MOKA-ENTRY-TIMING'], ready: RD.MODEL }),
  row('PP-EX-INTRADAY', 'ENTRY_EXECUTION', 'intraday buy on projected volume', { data: ['intraday volume (missing)'], cls: C.DATA_BLOCKED, ready: RD.BLOCKED, missing: 'no intraday history; the authors\' own entry' }),
  row('PP-STOP', 'INITIAL_STOP', 'numeric stop', { psr: ['MOKAPP-004'], contract: ['MOKA-SF-PP-STOP'], cls: C.SOURCE_BLOCKED, ready: RD.MANUAL, missing: 'no numeric stop in the Pocket Pivot sources; none invented (the sell guide is the only exit)' }),
  row('PP-SIZE', 'POSITION_SIZING', 'position size', { psr: ['MOKAPP-002'], contract: ['MOKA-SF-PP-SIZE'], code: `${EN}#plannedShares`, tests: [K('GC-SF5-PP-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-MOKA-SIZING'], ready: RD.MODEL }),
  ...mokaExit('PP'),
  ...common('PP', MO_MA, [K('GC-SF5-MOKA-NO-SIGNAL-CLOSE-FILL')]),
];
const BGU = [
  row('BGU-SETUP-GAP', 'SETUP_QUALIFICATION', 'gap >= 0.75 x ATR40', { psr: ['MOKA12-004'], contract: ['MOKA-SF-BGU-GAP', 'MOKA-SF-BGU-GAP-MEASURE'], code: `${ML}#buyableGapUpSignal`, tests: ['sf-morales-kacher: GC-BGU-CANDIDATE', K('GC-SF5-BGU-LIFECYCLE')], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_DERIVED, ready: RD.MECHANICAL }),
  row('BGU-SETUP-VOLUME', 'SETUP_QUALIFICATION', 'standard volume 150 % of the average (window not recorded)', { psr: ['MOKA24-VOL'], contract: ['MOKA-SF-BGU-VOLUME', 'MOKA-SF-BGU-VOLWINDOW'], code: `${ML}#buyableGapUpSignal`, tests: ['sf-morales-kacher: GC-BGU-CANDIDATE', 'sf-morales-kacher: GC-BGU-MCD-EXCEPTION'], data: [OHLCV], pit: PIT_CLOSE, cls: C.MODEL_ASSUMPTION, ma: ['MA-MOKA-BGU-VOLWINDOW'], ready: RD.MODEL, note: '1.5x SOURCE_EXACT, the 50-session window SOURCE_AMBIGUOUS (MOKA-MR-VOLWINDOW)' }),
  row('BGU-SETUP-EXCEPTION', 'SETUP_QUALIFICATION', 'megacap exception below the standard volume', { psr: ['MOKA24-MEGA'], contract: ['MOKA-SF-BGU-MEGA'], cls: C.MANUAL_REVIEW, ready: RD.MANUAL, missing: 'exception records are never simulated' }),
  row('BGU-SETUP-CONTEXT', 'SETUP_QUALIFICATION', 'leadership / theme, uptrend or constructive consolidation', { psr: ['MOKA12-003', 'MOKA12-006'], contract: ['MOKA-SF-BGU-CONTEXT'], code: `${ML}#buyableGapUpSignal`, tests: [K('GC-SF5-BGU-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-MOKA-CONTEXT-PROXY', 'MA-MOKA-MANUAL-SUBSTITUTE'], ready: RD.MODEL }),
  row('BGU-EL-UNIVERSE', 'ENTRY_ELIGIBILITY', 'research population', { code: `${EN}#runResearchLifecycle`, tests: [K('GC-SF5-BGU-LIFECYCLE')], cls: C.MODEL_ASSUMPTION, ma: ['MA-MOKA-RESEARCH-UNIVERSE'], ready: RD.MODEL }),
  row('BGU-EX-NEXT-OPEN', 'ENTRY_EXECUTION', 'buy at the next open after the gap-day close; an open at or below the gap-day low is not executed', { code: `${EN}#fillOrder`, tests: [K('GC-SF5-BGU-LIFECYCLE')], pit: PIT_NEXT, cls: C.MODEL_ASSUMPTION, ma: ['MA-MOKA-ENTRY-TIMING'], ready: RD.MODEL }),
  row('BGU-EX-INTRADAY', 'ENTRY_EXECUTION', 'gap-day buy on projected volume', { data: ['intraday volume (missing)'], cls: C.DATA_BLOCKED, ready: RD.BLOCKED, missing: 'no intraday history' }),
  row('BGU-STOP-GAPLOW', 'INITIAL_STOP', 'gap-day low as the risk reference; below it generally sell at least half', { psr: ['MOKA12-007', 'MOKASTOP-006'], contract: ['MOKA-SF-BGU-SELLGUIDE'], code: `${EN}#protectiveHit`, tests: [K('GC-SF5-BGU-LIFECYCLE')], data: [OHLCV], pit: PIT_NEXT, cls: C.MANUAL_REVIEW, ma: ['MA-MOKA-BGU-STOP'], ready: RD.MODEL, note: 'preference; the simulation sells all (inside "at least half")' }),
  row('BGU-SIZE', 'POSITION_SIZING', 'position size', { psr: ['MOKA12-003'], contract: ['MOKA-SF-BGU-SIZE'], code: `${EN}#plannedShares`, tests: [K('GC-SF5-BGU-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-MOKA-SIZING'], ready: RD.MODEL }),
  ...mokaExit('BGU'),
  ...common('BGU', MO_MA, [K('GC-SF5-MOKA-NO-SIGNAL-CLOSE-FILL')]),
];

const WN_MA = { costs: 'MA-WEIN-COSTS', manual: 'MA-WEIN-MANUAL-SUBSTITUTE' };
const W5 = (id) => `sf-sf5-weinstein-lifecycle: ${id}`, WL = 'research/weinstein-lifecycle.mjs';
const weinShared = (p) => [
  row(`${p}-SETUP-WEEKLY`, 'SETUP_QUALIFICATION', 'weekly bars and the 30-week MA; a week is decided at its last session', { psr: ['WEIN-S2'], contract: ['WEIN-SF-WEEKLY'], code: `${WL}#weinsteinWeeklySetups`, tests: [W5('GC-SF5-WEIN-SCREEN-EQUIV')], data: [OHLCV], pit: 'PIT: completed weeks only; week end read from the trading calendar', cls: C.SOURCE_DERIVED, ma: ['MA-WEIN-WEEK-END'], ready: RD.MECHANICAL }),
  row(`${p}-SETUP-MA-GATE`, 'SETUP_QUALIFICATION', 'no long buy at or below a falling 30-week MA', { psr: ['WEIN-MA'], contract: ['WEIN-SF-MA-GATE'], code: `${WL}#weinsteinWeeklySetups`, tests: [W5('GC-SF5-WEIN-SCREEN-EQUIV')], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_DERIVED, ready: RD.MECHANICAL }),
  row(`${p}-SETUP-STAGE`, 'SETUP_QUALIFICATION', 'stage classification (no Stage 3 / Stage 4 buys), volume judgment, RS (no buy when negative and still poor), overhead resistance', { psr: ['WEIN-S1', 'WEIN-S2', 'WEIN-NO3', 'WEIN-NO4', 'WEIN-VOL', 'WEIN-RS', 'WEIN-RSNO', 'WEIN-OH'], contract: ['WEIN-SF-STAGE', 'WEIN-SF-VOLUME', 'WEIN-SF-RS', 'WEIN-SF-OVERHEAD'], code: `${WL}#weinsteinWeeklySetups`, tests: [W5(`GC-SF5-WEIN-${p === 'WI' ? 'INVESTOR' : 'TRADER'}-LIFECYCLE`)], cls: C.MANUAL_REVIEW, ma: ['MA-WEIN-MANUAL-SUBSTITUTE'], ready: RD.MODEL }),
  row(`${p}-EL-GROUP`, 'ENTRY_ELIGIBILITY', 'no long buy in a negative industry group', { psr: ['WEIN-GROUP'], contract: ['WEIN-SF-GROUP'], data: ['PIT industry group stage (missing; SIC proxy never unblocks)'], cls: C.DATA_BLOCKED, ready: RD.BLOCKED, missing: 'not applied in the run (MA-WEIN-DATA-EXCEPTION)' }),
  row(`${p}-EL-MARKET`, 'ENTRY_ELIGIBILITY', 'normal long selection only in a positive overall market', { psr: ['WEIN-MARKET'], contract: ['WEIN-SF-MARKET'], data: ['NYSE breadth history (missing; universe breadth never unblocks)'], cls: C.DATA_BLOCKED, ready: RD.BLOCKED, missing: 'not applied in the run (MA-WEIN-DATA-EXCEPTION)' }),
  row(`${p}-EL-UNIVERSE`, 'ENTRY_ELIGIBILITY', 'research population', { code: `${EN}#runResearchLifecycle`, tests: [W5('GC-SF5-WEIN-INVESTOR-LIFECYCLE')], cls: C.MODEL_ASSUMPTION, ma: ['MA-WEIN-RESEARCH-UNIVERSE'], ready: RD.MODEL }),
  row(`${p}-EX-BUY-STOP`, 'ENTRY_EXECUTION', 'breakout buy prepared as a buy stop one raw cent above the resistance, resting through the next week', { psr: ['WEIN-ORD'], contract: ['WEIN-SF-ORDER'], code: `${EN}#fillOrder`, tests: [W5('GC-SF5-WEIN-INVESTOR-LIFECYCLE'), D('GC-SF5-ENGINE-FILL')], data: [OHLCV], pit: 'PIT: prepared from the completed prior week', cls: C.SOURCE_DERIVED, ma: ['MA-WEIN-ORDER-WEEK'], ready: RD.MECHANICAL }),
  row(`${p}-EX-COSTS`, 'ENTRY_EXECUTION', 'slippage and commission', { code: `${EN}#runResearchLifecycle`, tests: [W5('GC-SF5-WEIN-INVESTOR-LIFECYCLE')], cls: C.MODEL_ASSUMPTION, ma: ['MA-WEIN-COSTS'], ready: RD.MODEL }),
  row(`${p}-STOP-PLAN`, 'INITIAL_STOP', 'the stop is computed before the buy and placed right after it', { psr: ['WEIN-STOP1'], contract: ['WEIN-SF-STOP-PLAN'], code: `${WL}#weinsteinWeeklySetups`, tests: [W5('GC-SF5-WEIN-SCREEN-EQUIV')], cls: C.SOURCE_DERIVED, ready: RD.MECHANICAL }),
  row(`${p}-EXIT-STAGE4`, 'EXIT_CONDITIONS', 'no long hold in Stage 4', { psr: ['WEIN-NO4'], contract: ['WEIN-SF-STAGE'], cls: C.MANUAL_REVIEW, ready: RD.MANUAL, missing: 'stage judgment is manual; only the price stop exits a Stage 4 decline in the simulation' }),
  row(`${p}-MGMT-NO-AVG-DOWN`, 'POSITION_MANAGEMENT', 'never average down; add only on confirmation', { psr: ['WEIN-AVG'], contract: ['WEIN-SF-NO-AVG-DOWN'], cls: C.MANUAL_REVIEW, ready: RD.MANUAL, missing: 'adds are manual; the simulation never adds, so it never averages down' }),
  row(`${p}-EXIT-VOL5`, 'EXIT_CONDITIONS', 'buy stop filled without volume confirmation: sell into the first small strength (shared rule of C04 / C05)', { psr: ['WEIN-VOL5'], contract: p === 'WI' ? ['WEIN-SF-VOL5'] : [], code: `${WL}#${p === 'WI' ? 'WEINSTEIN_INVESTOR_ADAPTER' : 'WEINSTEIN_TRADER_ADAPTER'}`, tests: [W5('GC-SF5-WEIN-VOL5')], cls: C.MANUAL_REVIEW, ma: ['MA-WEIN-VOL5-STRENGTH'], ready: RD.MODEL, note: 'WEIN-VOL5 is HARD in #709; "clear confirmation" and "first small strength" need judgment, so the contract keeps the rule manual' }),
  row(`${p}-EXIT-NONTECH`, 'EXIT_CONDITIONS', 'no tax, dividend or P/E exit', { psr: ['WEIN-SELL4'], contract: ['WEIN-SF-NONTECH'], code: `${EN}#runResearchLifecycle`, tests: [W5('GC-SF5-WEIN-INVESTOR-LIFECYCLE')], cls: C.SOURCE_EXACT, ready: RD.MECHANICAL, note: 'the engine has no non-technical exit' }),
];
const WEIN_I = [
  row('WI-SETUP-BREAKOUT', 'SETUP_QUALIFICATION', 'early Stage 2 breakout above the base resistance (base since the MA30w stopped falling)', { psr: ['WEIN-BUY1', 'WEIN-BASE'], contract: ['WEIN-SF-INV-BREAKOUT'], code: `${WL}#weinsteinWeeklySetups`, tests: [W5('GC-SF5-WEIN-SCREEN-EQUIV')], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_DERIVED, ready: RD.MECHANICAL }),
  ...weinShared('WI'),
  row('WI-STOP-LEVEL', 'INITIAL_STOP', 'investor stop below a significant correction low (machine proposal: lowest weekly low of the base)', { psr: ['WEIN-STOP2'], contract: ['WEIN-SF-INV-STOP'], code: `${WL}#weinsteinWeeklySetups`, tests: [W5('GC-SF5-WEIN-INVESTOR-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-WEIN-INITIAL-STOP', 'MA-WEIN-INTRABAR-ORDER'], ready: RD.MODEL }),
  row('WI-SIZE', 'POSITION_SIZING', 'half of the planned position at the breakout, half on a constructive pullback; equal dollar amounts', { psr: ['WEIN-BUY2', 'WEIN-PB', 'WEIN-DIVERS2'], contract: ['WEIN-SF-INV-SIZE'], code: `${EN}#plannedShares`, tests: [W5('GC-SF5-WEIN-INVESTOR-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-WEIN-SIZING'], ready: RD.MODEL, note: 'the pullback half is not bought (manual)' }),
  row('WI-MGMT-TRAIL', 'POSITION_MANAGEMENT', 'raise the stop after an 8-10 % correction and a return to the prior high, under the low and the rising MA', { psr: ['WEIN-TRAIL1', 'WEIN-TRAIL2', 'WEIN-TRAIL4'], contract: ['WEIN-SF-INV-TRAIL'], code: `${WL}#WEINSTEIN_INVESTOR_ADAPTER`, tests: [W5('GC-SF5-WEIN-INVESTOR-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-WEIN-TRAIL'], ready: RD.MODEL }),
  row('WI-MGMT-STAGE3', 'POSITION_MANAGEMENT', 'Stage 3: sell half, protect the rest under new support', { psr: ['WEIN-SELL3', 'WEIN-TRAIL3'], contract: ['WEIN-SF-INV-TRAIL'], cls: C.MANUAL_REVIEW, ready: RD.MANUAL, missing: 'stage judgment is manual; not modelled' }),
  ...common('WI', WN_MA, [W5('GC-SF5-WEIN-PIT-PREFIX')]),
];
const WEIN_T = [
  row('WT-SETUP-CONTINUATION', 'SETUP_QUALIFICATION', 'continuation breakout over new resistance after a consolidation near a clearly rising MA30w', { psr: ['WEIN-TR-CONT'], contract: ['WEIN-SF-TR-CONT'], code: `${WL}#weinsteinWeeklySetups`, tests: [W5('GC-SF5-WEIN-SCREEN-EQUIV')], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_DERIVED, ready: RD.MECHANICAL }),
  ...weinShared('WT'),
  row('WT-STOP-LEVEL', 'INITIAL_STOP', 'trader stop below the next relevant reaction low (machine proposal: consolidation low)', { psr: ['WEIN-TR-STOP'], contract: ['WEIN-SF-TR-STOP'], code: `${WL}#weinsteinWeeklySetups`, tests: [W5('GC-SF5-WEIN-SCREEN-EQUIV')], cls: C.MANUAL_REVIEW, ma: ['MA-WEIN-INITIAL-STOP', 'MA-WEIN-INTRABAR-ORDER'], ready: RD.MODEL }),
  row('WT-SIZE', 'POSITION_SIZING', 'full planned position at the continuation breakout', { psr: ['WEIN-TR-CONT-SIZE'], contract: ['WEIN-SF-TR-SIZE'], code: `${EN}#plannedShares`, tests: [W5('GC-SF5-WEIN-TRADER-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-WEIN-SIZING'], ready: RD.MODEL }),
  row('WT-MGMT-TRAIL', 'POSITION_MANAGEMENT', 'ignore corrections under 7 %; after a significant correction and recovery raise the stop under the reaction low, also above the MA', { psr: ['WEIN-TR-TRAIL'], contract: ['WEIN-SF-TR-TRAIL'], code: `${WL}#WEINSTEIN_TRADER_ADAPTER`, tests: [W5('GC-SF5-WEIN-TRADER-LIFECYCLE')], cls: C.MANUAL_REVIEW, ma: ['MA-WEIN-TRAIL'], ready: RD.MODEL }),
  row('WT-EXIT-EARLY', 'EXIT_CONDITIONS', 'do not wait for the MA break; exit earlier than investors at a Stage 3 top', { psr: ['WEIN-TR-EARLY', 'WEIN-TR-SELL3'], contract: ['WEIN-SF-TR-TRAIL'], cls: C.MANUAL_REVIEW, ready: RD.MANUAL, missing: 'stage judgment is manual; the trailed stop is the only mechanical exit' }),
  ...common('WT', WN_MA, [W5('GC-SF5-WEIN-PIT-PREFIX')]),
];

const HG_MA = { costs: 'MA-RAS-COSTS', manual: 'MA-RAS-SOURCE-W-RAS97' };
const HG = [
  row('HG-SETUP-ADX', 'SETUP_QUALIFICATION', 'ADX(14) > 30 on the same timeframe before the pullback (Wilder)', { psr: ['RAS04-002'], contract: ['RAS-SF-ADX'], code: `${HL}#holyGrailSetupSeries`, tests: ['sf-holy-grail: GC-RAS-ADX-WILDER', K('GC-SF5-HG-RESEARCH-VARIANT')], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_EXACT, ready: RD.MECHANICAL }),
  row('HG-SETUP-ADX-READING', 'SETUP_QUALIFICATION', 'W-RAS97 "initially greater than 30 and rising": which bars must carry ADX > 30', { psr: ['RAS04-002'], contract: ['RAS-SF-ADX'], code: `${HL}#holyGrailSetupSeries`, tests: [K('GC-SF5-HG-RESEARCH-VARIANT'), K('GC-SF5-HG-READINGS')], cls: C.MODEL_ASSUMPTION, ma: ['MA-RAS-ADX-READING'], ready: RD.MODEL }),
  row('HG-SETUP-PULLBACK', 'SETUP_QUALIFICATION', 'touch of the 20 EMA while ADX(14) > 30 (the contract component)', { psr: ['RAS04-001'], contract: ['RAS-SF-PULLBACK'], code: `${HL}#holyGrailSetupSeries`, tests: [K('GC-SF5-HG-RESEARCH-VARIANT')], data: [OHLCV], pit: PIT_CLOSE, cls: C.SOURCE_DERIVED, ready: RD.MECHANICAL }),
  row('HG-SETUP-IMPULSE-FIRST', 'SETUP_QUALIFICATION', 'strong impulse; FIRST pullback to the 20 EMA', { psr: ['RAS04-001'], contract: ['RAS-SF-PULLBACK'], code: `${HL}#holyGrailSetupSeries`, tests: [K('GC-SF5-HG-READINGS')], cls: C.MANUAL_REVIEW, ma: ['MA-RAS-MANUAL-SUBSTITUTE'], ready: RD.MODEL, note: 'review flags RAS-MR-IMPULSE / RAS-MR-NOT-FIRST in the contract; substituted in the simulation' }),
  row('HG-EL-SOURCE', 'ENTRY_ELIGIBILITY', 'entry and stop from W-RAS97 (newsletter sidebar on the author\'s site): owner decision D-RAS97 pending', { psr: ['RAS04-001'], contract: ['RAS-SF-ENTRY'], code: `${HL}#HOLY_GRAIL_RESEARCH_ADAPTER`, tests: [K('GC-SF5-HG-RESEARCH-VARIANT')], cls: C.MODEL_ASSUMPTION, ma: ['MA-RAS-SOURCE-W-RAS97'], ready: RD.MODEL, note: 'contract status stays SOURCE_AMBIGUOUS' }),
  row('HG-EX-BUY-STOP', 'ENTRY_EXECUTION', 'buy stop above the high of the previous bar after the touch', { psr: ['RAS04-001'], contract: ['RAS-SF-ENTRY'], code: `${EN}#fillOrder`, tests: [K('GC-SF5-HG-RESEARCH-VARIANT')], pit: PIT_NEXT, cls: C.MODEL_ASSUMPTION, ma: ['MA-RAS-PREVIOUS-BAR'], ready: RD.MODEL }),
  row('HG-EX-INTRADAY', 'ENTRY_EXECUTION', 'intraday timeframes (5-120 minutes)', { psr: ['RAS04-006'], contract: ['RAS-SF-TIMEFRAME'], data: ['intraday bars (missing)'], cls: C.DATA_BLOCKED, ready: RD.BLOCKED, missing: 'daily timeframe only' }),
  row('HG-STOP-SWING-LOW', 'INITIAL_STOP', 'protective stop at the newly formed swing low', { psr: ['RAS04-001'], contract: ['RAS-SF-STOP'], code: `${HL}#holyGrailSetupSeries`, tests: [K('GC-SF5-HG-RESEARCH-VARIANT')], cls: C.MODEL_ASSUMPTION, ma: ['MA-RAS-SWING-LOW', 'MA-RAS-INTRABAR-ORDER'], ready: RD.MODEL }),
  row('HG-SIZE', 'POSITION_SIZING', 'position size (not disclosed)', { contract: ['RAS-SF-SIZE'], code: `${EN}#plannedShares`, tests: [K('GC-SF5-HG-RESEARCH-VARIANT')], cls: C.MODEL_ASSUMPTION, ma: ['MA-RAS-SIZING'], ready: RD.MODEL }),
  row('HG-MGMT-TRAIL', 'POSITION_MANAGEMENT', '"trail stops as profits grow"', { cls: C.SOURCE_BLOCKED, ready: RD.MANUAL, missing: 'no trailing mechanics in any free source; not trailed' }),
  row('HG-EXIT-NEW-HIGH', 'EXIT_CONDITIONS', 'a new high is an exit opportunity', { psr: ['RAS04-003'], contract: ['RAS-SF-EXIT'], code: `${HL}#HOLY_GRAIL_RESEARCH_ADAPTER`, tests: [K('GC-SF5-HG-RESEARCH-VARIANT')], cls: C.MANUAL_REVIEW, ma: ['MA-RAS-EXIT'], ready: RD.MODEL }),
  ...common('HG', HG_MA, [K('GC-SF5-HG-RESEARCH-VARIANT')]),
];

export const SF5_MATRIX = Object.freeze({ DARVAS, KK_BREAKOUT: KK, POCKET_PIVOT: PP, BUYABLE_GAP_UP: BGU, WEINSTEIN_INVESTOR: WEIN_I, WEINSTEIN_TRADER: WEIN_T, HOLY_GRAIL_W_RAS97: HG });

const titleExists = (() => {
  const cache = new Map();
  return (ref) => {
    const [file, id] = ref.split(': ');
    const p = path.join(TESTS, `${file}.test.mjs`);
    if (!cache.has(p)) cache.set(p, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
    const src = cache.get(p);
    return Boolean(src) && new RegExp(`test\\('${id.replace(/[-]/g, '\\-')}[:'\\s]`).test(src);
  };
})();

/** Validates the matrix against the #709 extract, the contracts and the declared model assumptions (no upgrade). */
export async function validateSf5Matrix(matrix, extract, contractsByKey) {
  const errors = [], R = new Map(extract.rules.map((r) => [r.rule_id, r])), exportsOf = new Map();
  for (const [key, rows] of Object.entries(matrix)) {
    const lc = SF5_LIFECYCLES.find((l) => l.key === key), contract = contractsByKey[key];
    if (!lc || !contract) { errors.push(`UNKNOWN_LIFECYCLE:${key}`); continue; }
    const MA = new Set(lc.modelAssumptions.map((m) => m.id)), seen = new Set();
    for (const r of rows) {
      if (seen.has(r.id)) errors.push(`DUPLICATE_ROW:${key}:${r.id}`); seen.add(r.id);
      if (!LIFECYCLE_PHASES.includes(r.phase)) errors.push(`PHASE:${r.id}`);
      if (!SF5_CLASS[r.class]) errors.push(`CLASS:${r.id}`);
      for (const p of r.psr709) if (!R.has(p)) errors.push(`UNKNOWN_PSR709:${r.id}:${p}`);
      const cst = r.contractRules.map((c) => contract.rules.find((x) => x.id === c)?.status);
      cst.forEach((s, k) => { if (!s) errors.push(`UNKNOWN_CONTRACT_RULE:${r.id}:${r.contractRules[k]}`); });
      for (const m of r.modelAssumptions) if (!MA.has(m)) errors.push(`UNDECLARED_MODEL_ASSUMPTION:${r.id}:${m}`);
      if (r.class === C.MODEL_ASSUMPTION && !r.modelAssumptions.length) errors.push(`MODEL_ASSUMPTION_WITHOUT_ID:${r.id}`);
      if (!r.psr709.length && ![C.MODEL_ASSUMPTION, C.MANUAL_REVIEW, C.DATA_BLOCKED, C.SOURCE_BLOCKED].includes(r.class)) errors.push(`SOURCE_CLASS_WITHOUT_SOURCE:${r.id}`);
      if (r.class === C.SOURCE_EXACT) {
        for (const p of r.psr709) { const s = R.get(p); if (!s || !(s.modal_strength === 'HARD' && s.confidence === 'HIGH' && s.original_wording_checked === true && s.hard_coding_clearance === 'SCOPE_AND_EXCEPTIONS_REQUIRED')) errors.push(`EXACT_ON_NON_HARDENABLE_RULE:${r.id}:${p}`); }
        if (!cst.length || cst.some((s) => s !== 'SOURCE_EXACT')) errors.push(`EXACT_ABOVE_CONTRACT:${r.id}`);
      }
      if (r.class === C.SOURCE_DERIVED && (!cst.length || cst.some((s) => !['SOURCE_EXACT', 'SOURCE_DERIVED'].includes(s)))) errors.push(`DERIVED_ABOVE_CONTRACT:${r.id}`);
      if (r.class === C.SOURCE_BOUNDED && !r.psr709.some((p) => R.get(p)?.modal_strength === 'HARD')) errors.push(`BOUNDED_WITHOUT_HARD_RULE:${r.id}`);
      if (r.class === C.DATA_BLOCKED && r.readiness !== RD.BLOCKED) errors.push(`DATA_BLOCKED_NOT_BLOCKED:${r.id}`);
      if ([C.MANUAL_REVIEW, C.SOURCE_BLOCKED].includes(r.class) && r.readiness === RD.MECHANICAL) errors.push(`MANUAL_MARKED_MECHANICAL:${r.id}`);
      if (r.class === C.MANUAL_REVIEW && r.readiness === RD.MODEL && !r.modelAssumptions.length) errors.push(`MANUAL_SUBSTITUTED_WITHOUT_ASSUMPTION:${r.id}`);
      if (r.implemented) {
        const [file, fn] = r.implemented.code.split('#'), abs = path.join(SF, file);
        if (!fs.existsSync(abs)) errors.push(`CODE_FILE:${r.id}:${file}`);
        else { if (!exportsOf.has(abs)) exportsOf.set(abs, await import(abs)); if (!(fn in exportsOf.get(abs))) errors.push(`CODE_EXPORT:${r.id}:${r.implemented.code}`); }
        if (!r.implemented.tests.length) errors.push(`IMPLEMENTED_WITHOUT_TEST:${r.id}`);
        for (const t of r.implemented.tests) if (!titleExists(t)) errors.push(`TEST_NOT_FOUND:${r.id}:${t}`);
      } else if (r.readiness === RD.MECHANICAL || r.readiness === RD.MODEL) errors.push(`MECHANICAL_WITHOUT_CODE:${r.id}`);
    }
    for (const ph of LIFECYCLE_PHASES) if (!rows.some((r) => r.phase === ph)) errors.push(`PHASE_WITHOUT_ROW:${key}:${ph}`);
  }
  return { ok: errors.length === 0, errors };
}
