/**
 * Supertrader 4.0 – Minervini Source-to-Execution matrix (mandate phase A). One row per condition of the ten lifecycle
 * phases, separately for SEPA / VCP (C06) and Power Play (C07). A row states the #709 rule ids, the binding contract
 * rules (contracts/minervini.mjs, whose RULE_STATUS stays the registry term), what is implemented (code, tests), what is
 * missing, the data and their point-in-time availability, whether the condition is mechanical or qualitative, the
 * lifecycle class (lifecycle#CLASS), the model assumptions it needs and its readiness.
 *
 * Nothing here upgrades a status: validateLifecycleMatrix rejects SOURCE_EXACT on a rule that is not hardenable, a model
 * assumption that is not declared, a contract rule that does not exist, and code or tests that cannot be found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASS, LIFECYCLE_PHASES, MODEL_ASSUMPTIONS } from './minervini-lifecycle.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SF = path.resolve(HERE, '..');
const TESTS = path.resolve(SF, '..', 'tests');
export const MATRIX_VERSION = 'sf4-minervini-lifecycle-matrix-1.0.0';

const LC = 'research/minervini-lifecycle.mjs', EX = 'research/minervini-execution.mjs', CO = 'research/minervini-components.mjs', ME = 'methods/minervini.mjs', VW = 'research/minervini-trade-view.mjs';
const T = (f, id) => `${f}: ${id}`;
const MLC = (id) => T('sf-minervini-lifecycle', id);
/** readiness of a row: what a machine can do with the condition today */
export const ROW_READINESS = Object.freeze({ MECHANICAL: 'MECHANICAL_IMPLEMENTED', MODEL: 'MECHANICAL_UNDER_MODEL_ASSUMPTION', EVIDENCE: 'EVIDENCE_FOR_REVIEWER', MANUAL: 'MANUAL_NOT_AUTOMATED', BLOCKED: 'BLOCKED' });

const row = (id, phase, condition, o) => ({ id, phase, condition, psr709: o.psr ?? [], contractRules: o.contract ?? [], implemented: o.code ? { code: o.code, tests: o.tests ?? [] } : null, missing: o.missing ?? null, data: o.data ?? [], pit: o.pit ?? 'n/a', mechanical: o.mech, class: o.cls, modelAssumptions: o.ma ?? [], testability: o.testability ?? (o.tests?.length ? 'GOLDEN_OR_ADVERSARIAL_TEST' : 'NOT_TESTABLE_BY_MACHINE'), readiness: o.ready, note: o.note ?? null });
const OHLCV = 'daily split-adjusted OHLCV (snapshot)';
const PIT_BARS = 'PIT: bars up to the decision close only';

const SHARED_EXECUTION = (s) => {
  const p = s === 'SEPA' ? '' : 'PP-';
  const stopRule = s === 'SEPA' ? 'MIN-SF-STOP' : 'MIN-SF-PP-STOP', sizeRule = s === 'SEPA' ? 'MIN-SF-SIZE' : 'MIN-SF-PP-SIZE', entryRule = s === 'SEPA' ? 'MIN-SF-PIVOT' : 'MIN-SF-PP-ENTRY', exitRule = s === 'SEPA' ? 'MIN-SF-SELL' : 'MIN-SF-PP-EXIT';
  return [
    row(`${p}EL-PRICE-CONFIRMATION`, 'ENTRY_ELIGIBILITY', 'price confirmation before the entry: a buy stop at the pivot, no order when the prior close is already at or above it', { psr: ['MIN-PRICE-01', 'MIN-VCP-07'], contract: [entryRule], code: `${LC}#entryEligibility`, tests: [MLC('ADV-MLC-PIVOT-BEFORE-CONTRACTIONS')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL, note: 'translation-unverified wording' }),
    row(`${p}EL-STOP-BEFORE-ENTRY`, 'ENTRY_ELIGIBILITY', 'a stop below the pivot exists before the order (MIN-RISK-01)', { psr: ['MIN-RISK-01'], contract: [stopRule], code: `${LC}#entryEligibility`, tests: [MLC('ADV-MLC-PLANNED-LOSS')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL }),
    row(`${p}EL-MAX-PLANNED-LOSS`, 'ENTRY_ELIGIBILITY', 'planned loss at the pivot at most 10 % (MIN-MM-STOP-02); otherwise blocked', { psr: ['MIN-MM-STOP-02'], contract: [stopRule], code: `${LC}#entryEligibility`, tests: [MLC('ADV-MLC-PLANNED-LOSS'), T('sf-minervini', 'GC-MIN-STOP-10PCT-FLAG')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL, note: 'the contract keeps the 10 % as a flag of the reviewer stop; the lifecycle uses it as the printed maximum (translation-unverified)' }),
    row(`${p}EL-SETUP-LIFETIME`, 'ENTRY_ELIGIBILITY', 'how long a setup stays valid and when it is invalidated before the execution', { psr: [], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('SF4-NO-LOOKAHEAD')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-SETUP-VALIDITY'], ready: ROW_READINESS.MODEL, missing: 'no setup lifetime in #709 (SOURCE_BLOCKED as a number); re-evaluation at every close adds none' }),
    row(`${p}EL-UNIVERSE`, 'ENTRY_ELIGIBILITY', 'liquidity and price floor of the candidate', { psr: ['MIN-MM-LIQ-01', 'MIN-MM-PRC-01'], code: `${LC}#entryEligibility`, tests: [MLC('ADV-MLC-HALT-AND-MISSING-BARS')], data: [OHLCV, 'raw close and raw volume'], pit: 'PIT: prior session', mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-RESEARCH-UNIVERSE'], ready: ROW_READINESS.MODEL }),
    row(`${p}EL-MANUAL-DECISIONS`, 'ENTRY_ELIGIBILITY', 'open manual decisions of the setup (listed on every eligibility)', { psr: s === 'SEPA' ? ['MIN-PROCESS-04', 'MIN-QUALITY-01', 'MIN-VCP-01', 'MIN-TT-08'] : ['MIN-PP-02'], contract: s === 'SEPA' ? ['MIN-SF-PRIORITY', 'MIN-SF-FUNDAMENTALS', 'MIN-SF-VCP'] : ['MIN-SF-PP-ENTRY'], code: `${LC}#entryEligibility`, tests: [MLC('GC-MLC-NOT-A-STRATEGY')], mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ma: ['MA-MIN-MANUAL-SUBSTITUTE'], ready: ROW_READINESS.MANUAL, note: 'product: ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW; simulation: substituted by the declared model assumption, therefore a MODEL study' }),
    row(`${p}EL-DUPLICATE`, 'ENTRY_ELIGIBILITY', 'no second entry while a position is open; adds are manual', { psr: ['MIN-ADD-01'], code: `${LC}#entryEligibility`, tests: [MLC('ADV-MLC-DUPLICATE-SIGNALS')], mech: 'MECHANICAL', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.MECHANICAL, note: 'the duplicate block is mechanical; the add decision itself stays manual' }),
    row(`${p}EX-SIGNAL-TIME`, 'ENTRY_EXECUTION', 'signal on the setup close, order valid for the next session only', { psr: ['MIN-VCP-07'], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('SF4-NO-LOOKAHEAD'), MLC('GC-MLC-SEPA-LIFECYCLE')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-SETUP-VALIDITY'], ready: ROW_READINESS.MODEL }),
    row(`${p}EX-VOLUME`, 'ENTRY_EXECUTION', '"with increasing volume" vs "buy on price first, judge volume afterwards"', { psr: ['MIN-VCP-07', 'MIN-MM-VOL-EX', 'MIN-MM-VOL-RET', 'MIN-MM-VOL-NUM'], contract: [entryRule], code: `${LC}#breakoutVolumeVs50d`, tests: [MLC('ADV-MLC-BREAKOUT-NO-VOLUME'), T('sf-minervini-components', 'GC-MIN-PIVOT-VOLUME')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-ENTRY-TIMING'], ready: ROW_READINESS.MODEL }),
    row(`${p}EX-ORDER-AND-GAP`, 'ENTRY_EXECUTION', 'order type and gap over the entry', { psr: ['MIN-MM-STOP-02'], code: `${LC}#fillBuyOrder`, tests: [MLC('ADV-MLC-GAP-OVER-ENTRY'), MLC('ADV-MLC-NOT-EXECUTABLE-ORDER')], data: [OHLCV], pit: 'PIT: the bar of the fill', mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-ORDER-TYPE'], ready: ROW_READINESS.MODEL }),
    row(`${p}EX-INTRABAR`, 'ENTRY_EXECUTION', 'entry and stop inside the same daily bar', { psr: [], code: `${LC}#fillBuyOrder`, tests: [MLC('ADV-MLC-ENTRY-AND-STOP-SAME-BAR')], data: [OHLCV, 'intraday order (not in the snapshot)'], pit: 'unknown inside the bar', mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-INTRABAR-ORDER'], ready: ROW_READINESS.MODEL, missing: 'intraday sequence: DATA_BLOCKED for the snapshot; both readings run' }),
    row(`${p}EX-COSTS`, 'ENTRY_EXECUTION', 'slippage and commission', { psr: [], code: `${EX}#EQUITY_RESEARCH_PORTFOLIO_POLICY`, tests: [MLC('ADV-MLC-GAP-THROUGH-STOP')], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-COSTS'], ready: ROW_READINESS.MODEL }),
    row(`${p}ST-PLACEMENT`, 'INITIAL_STOP', 'where the stop is placed inside the 10 % bound', { psr: ['MIN-RISK-01', 'MIN-MM-STOP-02', 'MIN-TTC-AVGLOSS'], contract: [stopRule], code: `${LC}#stopFor`, tests: [MLC('ADV-MLC-PLANNED-LOSS')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-STOP-PLACEMENT'], ready: ROW_READINESS.MODEL, note: 'reviewer decision in the source' }),
    row(`${p}ST-EXECUTION`, 'INITIAL_STOP', 'a stop hit exits regardless of the day\'s volume', { psr: ['MIN-MM-STOP-01'], contract: [stopRule], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('ADV-MLC-GAP-THROUGH-STOP'), T('sf-minervini-components', 'GC-MIN-STOP-EXECUTION')], data: [OHLCV], pit: 'PIT: the bar of the exit', mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL }),
    row(`${p}ST-GAP-FILL`, 'INITIAL_STOP', 'fill when the price gaps through the stop', { psr: ['MIN-MM-STOP-01'], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('ADV-MLC-GAP-THROUGH-STOP')], data: [OHLCV], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-STOP-FILL'], ready: ROW_READINESS.MODEL }),
    row(`${p}SZ-RISK`, 'POSITION_SIZING', 'shares from the accepted equity risk and the stop distance', { psr: ['MIN-TTC-SIZING', 'MIN-MM-SIZE-03', 'MIN-MM-SIZE-04'], contract: [sizeRule], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('ADV-MLC-SIZE-ZERO-AND-CAPITAL'), T('sf-minervini-components', 'GC-MIN-SIZING')], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-RISK-FRACTION'], ready: ROW_READINESS.MODEL, note: 'the formula is source-bounded (MIN-TTC-SIZING); the risk fraction is the reviewer\'s' }),
    row(`${p}SZ-MAX-WEIGHT`, 'POSITION_SIZING', 'at most 25 % of equity per position', { psr: ['MIN-MM-SIZE-01'], contract: [sizeRule], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('ADV-MLC-SIZE-ZERO-AND-CAPITAL')], mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL }),
    row(`${p}SZ-CAPITAL`, 'POSITION_SIZING', 'available cash, at most 20 open positions, simultaneous signals', { psr: ['MIN-RISK-10', 'MIN-PROCESS-04'], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('ADV-MLC-SIZE-ZERO-AND-CAPITAL'), MLC('SF4-DETERMINISM')], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-SIGNAL-ORDER'], ready: ROW_READINESS.MODEL, note: '20 positions is the 2013 upper bound (strong preference); the order of simultaneous fills replaces the manual priority' }),
    row(`${p}SZ-EXPOSURE`, 'POSITION_SIZING', 'pilot buys, exposure build-up and reduction, margin', { psr: ['MIN-RISK-02', 'MIN-RISK-03', 'MIN-RISK-04', 'MIN-RISK-08', 'MIN-MM-SIZE-02'], mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.MANUAL, missing: 'no mechanical rule; not modelled (EQUITY_RESEARCH_PORTFOLIO_POLICY.notModelled)' }),
    row(`${p}PM-BREAKEVEN`, 'POSITION_MANAGEMENT', 'at about 3R raise the stop at least to break-even ("almost always")', { psr: ['MIN-RISK-05'], contract: [stopRule], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('GC-MLC-SEPA-LIFECYCLE'), MLC('ADV-MLC-EXIT-PRECEDENCE')], data: [OHLCV], pit: 'PIT: close, effective next session', mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ma: ['MA-MIN-EXIT-POLICY'], ready: ROW_READINESS.MODEL, note: 'no absolute 3R obligation in the source; part of the reference exit policy, absent in the free-roll variants' }),
    row(`${p}PM-ADD`, 'POSITION_MANAGEMENT', 'adds after proof of profit, bringing a starter position to full size', { psr: ['MIN-ADD-01', 'MIN-MM-ADD-02', 'MIN-MM-ADD-03'], mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.MANUAL, missing: 'no level or size given; not simulated' }),
    row(`${p}PM-TRAIL`, 'POSITION_MANAGEMENT', 'after break-even a later profit stop just below MA50 (early leaders)', { psr: ['MIN-TTC-TRAIL', 'MIN-MM-SELL-02'], contract: [exitRule], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('ADV-MLC-EXIT-PRECEDENCE')], data: [OHLCV], pit: 'PIT: close, exit next open', mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-EXIT-POLICY'], ready: ROW_READINESS.MODEL, note: '"just below" and "sometimes wait for the weekly close" are not mechanised: a daily close below MA50 is the model reading' }),
    row(`${p}PM-BACKSTOP-EARNINGS`, 'POSITION_MANAGEMENT', 'backstop on a chosen profit area, holding over earnings', { psr: ['MIN-TTC-BACKSTOP', 'MIN-MM-EARN-HOLD', 'MIN-EPS-04'], mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.MANUAL, missing: 'reviewer choice; earnings dates are not in the snapshot as a PIT calendar' }),
    row(`${p}XC-SELL-STRENGTH`, 'EXIT_CONDITIONS', 'sell into strength, keep a remainder of early leaders, no universal target', { psr: ['MIN-RISK-06', 'MIN-MM-SELL-01', 'MIN-MM-SELL-03', 'MIN-TTC-EARLY'], contract: [exitRule], mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.MANUAL, missing: 'no mechanical rule (MIN-MM-SELL-03: no fixed target)' }),
    row(`${p}XC-FREEROLL`, 'EXIT_CONDITIONS', 'half at 2-3R with a break-even stop (optional example)', { psr: ['MIN-TTC-FREEROLL'], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('ADV-MLC-EXIT-PRECEDENCE')], data: [OHLCV], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-EXIT-POLICY'], ready: ROW_READINESS.MODEL, note: 'research variants FREEROLL_2R / FREEROLL_3R, not activated' }),
    row(`${p}XC-BEHAVIOUR`, 'EXIT_CONDITIONS', 'accumulating violations, heavy later selling volume', { psr: ['MIN-MM-SELL-04', 'MIN-MM-VOL-RET'], mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.MANUAL, missing: 'violations are not enumerated in #709' }),
    row(`${p}XC-REENTRY`, 'EXIT_CONDITIONS', 're-entry after an exit only through a new low-risk setup, no universal lock-out', { psr: ['MIN-MM-REEN-01', 'MIN-MM-REEN-02'], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('SF4-NO-LOOKAHEAD')], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-SETUP-VALIDITY'], ready: ROW_READINESS.MODEL }),
    row(`${p}XC-CONFLICT`, 'EXIT_CONDITIONS', 'conflicting exit signals on one bar', { psr: [], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('ADV-MLC-EXIT-PRECEDENCE')], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-EXIT-POLICY'], ready: ROW_READINESS.MODEL, note: 'declared precedence: next-open exit > stop > close rules; full exit dominates partial' }),
    row(`${p}AC-LEDGER`, 'TRADE_ACCOUNTING', 'ledger, dividends, dust, reconciliation, realized and unrealized P&L, open position at the data end', { psr: [], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('GC-MLC-SEPA-LIFECYCLE'), MLC('SF4-DETERMINISM')], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-ACCOUNTING-RESEARCH-V1'], ready: ROW_READINESS.MODEL }),
    row(`${p}AC-DATA-EVENTS`, 'TRADE_ACCOUNTING', 'halts and missing bars, delisting, corporate actions', { psr: [], code: `${EX}#runMinerviniLifecycle`, tests: [MLC('ADV-MLC-HALT-AND-MISSING-BARS'), MLC('ADV-MLC-DELISTING'), MLC('ADV-MLC-CORPORATE-ACTION')], data: ['snapshot terminal causes', 'split-adjusted prices (ADR-002)'], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-ACCOUNTING-RESEARCH-V1'], ready: ROW_READINESS.MODEL, note: 'V4-D1 (undeclared reverse splits, about 1 % of security-months) is inherited and open; results stay DIAGNOSTIC_NOT_CERTIFIED' }),
    row(`${p}BD-MEASUREMENT`, 'BACKTEST_DIAGNOSTICS', 'what a snapshot run may be called', { psr: [], code: 'research/run-sf4-lifecycle.mjs#lifecyclePart', tests: [T('sf-sf4-lifecycle-runner', 'SF4-RUNNER-PUBLIC-COUNTS-ONLY')], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-MANUAL-SUBSTITUTE'], ready: ROW_READINESS.MODEL, note: 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST: manual source rules are substituted, so no run is a strategy backtest' }),
    row(`${p}RD-PRODUCT`, 'STRATEGY_READINESS', 'product states: setup, entry possible / blocked, simulated entry, stop, risk, size, position, exit reason, data quality, manual review', { psr: [], code: `${VW}#tradeView`, tests: [MLC('SF4-VIEW-SIMULATED-NOT-A-POSITION'), MLC('ADV-MLC-FUNDAMENTALS-AND-RS')], mech: 'MECHANICAL', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.EVIDENCE, note: 'data contract only; no UI change, never a depot position, never a buy' }),
  ];
};

export const MATRIX = Object.freeze({
  SEPA: Object.freeze([
    row('SQ-TREND-TEMPLATE', 'SETUP_QUALIFICATION', 'Trend Template criteria 1-7', { psr: ['MIN-TT-01', 'MIN-TT-02', 'MIN-TT-03', 'MIN-TT-04', 'MIN-TT-05', 'MIN-TT-06', 'MIN-TT-07', 'MIN-PROCESS-01'], contract: ['MIN-SF-TT-1', 'MIN-SF-TT-2', 'MIN-SF-TT-3', 'MIN-SF-TT-4', 'MIN-SF-TT-5', 'MIN-SF-TT-6', 'MIN-SF-TT-7', 'MIN-SF-PROCESS'], code: `${ME}#trendTemplate`, tests: [T('sf-minervini', 'GC-MIN-TT-1'), MLC('SF4-SEPA-SERIES-EQUIVALENCE')], data: [OHLCV + ' (>= 221 sessions)'], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL, note: 'printed thresholds used as bounds; open decision: original English wording (translation-only, MEDIUM)' }),
    row('SQ-RS-IBD', 'SETUP_QUALIFICATION', 'IBD RS rating at least 70', { psr: ['MIN-TT-08', 'MIN-TT-08P'], contract: ['MIN-SF-TT-8'], code: `${CO}#createRsPercentileProxy`, tests: [T('sf-minervini-components', 'GC-MIN-RS-PROXY-PIT'), MLC('ADV-MLC-FUNDAMENTALS-AND-RS')], data: ['IBD RS rating (proprietary, not available)'], pit: 'VU percentile PIT; IBD not available', mech: 'MECHANICAL', cls: CLASS.DATA_BLOCKED, ready: ROW_READINESS.BLOCKED, note: 'the VU percentile is a proxy, never a gate and never shown as the IBD rating' }),
    row('SQ-FUNDAMENTALS', 'SETUP_QUALIFICATION', 'EPS and sales growth, earnings quality', { psr: ['MIN-EPS-01', 'MIN-EPS-02', 'MIN-QUALITY-01', 'MIN-QUALITY-02', 'MIN-QUALITY-03'], contract: ['MIN-SF-FUNDAMENTALS'], code: `${CO}#fundamentalEvidence`, tests: [T('sf-minervini-components', 'GC-MIN-FUNDAMENTALS-PIT'), MLC('ADV-MLC-FUNDAMENTALS-AND-RS')], data: ['sec-pit r12 quarterly EPS and revenue (first-filed date)'], pit: 'PIT: filed strictly before the session', mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.EVIDENCE, note: 'no threshold (MIN-EPS-02); never a gate (MIN-PROCESS-15)' }),
    row('SQ-ESTIMATES', 'SETUP_QUALIFICATION', 'surprises, revisions, guidance', { psr: ['MIN-EPS-05', 'MIN-EPS-06', 'MIN-EPS-07', 'MIN-EPS-08', 'MIN-EPS-09', 'MIN-PROCESS-06', 'MIN-PROCESS-07', 'MIN-PROCESS-08'], contract: ['MIN-SF-PRIORITY'], data: ['analyst estimates, surprises, guidance history (paid, not in the snapshot)'], pit: 'not available', mech: 'QUALITATIVE', cls: CLASS.DATA_BLOCKED, ready: ROW_READINESS.BLOCKED }),
    row('SQ-PRIORITY', 'SETUP_QUALIFICATION', 'manual relative priority of the remaining names', { psr: ['MIN-PROCESS-04', 'MIN-PROCESS-05', 'MIN-PROCESS-09', 'MIN-PROCESS-10', 'MIN-PROCESS-11'], contract: ['MIN-SF-PRIORITY'], mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.MANUAL }),
    row('SQ-STAGE2-BASE', 'SETUP_QUALIFICATION', 'the base is judged in an existing Stage 2 uptrend', { psr: ['MIN-BASE-01'], contract: ['MIN-SF-VCP'], code: `${LC}#sepaSetupFromTrendTemplate`, tests: [MLC('GC-MLC-SEPA-LIFECYCLE')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-STAGE2-TREND-TEMPLATE'], ready: ROW_READINESS.MODEL }),
    row('SQ-VCP-CONTRACTIONS', 'SETUP_QUALIFICATION', 'volatility contraction from left to right (counts and halving typical, flat bases allowed)', { psr: ['MIN-VCP-01', 'MIN-VCP-02', 'MIN-VCP-03', 'MIN-VCP-04', 'MIN-BASE-04'], contract: ['MIN-SF-VCP'], code: `${CO}#vcpContractions`, tests: [T('sf-minervini-components', 'GC-MIN-VCP-CONTRACTIONS'), T('sf-minervini-components', 'ADV-MIN-VCP-EXPANDING')], data: [OHLCV], pit: PIT_BARS, mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ma: ['MA-MIN-SEPA-SETUP-PROXY'], ready: ROW_READINESS.EVIDENCE, note: 'validity is the reviewer\'s; the simulation uses a declared proxy' }),
    row('SQ-VCP-VOLUME', 'SETUP_QUALIFICATION', 'volume dry-up in the tight areas, last contraction below the 50-day mean, up vs down volume', { psr: ['MIN-VCP-05', 'MIN-VCP-06', 'MIN-VCP-10'], contract: ['MIN-SF-VCP'], code: `${CO}#vcpContractions`, tests: [T('sf-minervini-components', 'GC-MIN-VCP-CONTRACTIONS')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.MANUAL_REVIEW, ma: ['MA-MIN-SEPA-SETUP-PROXY'], ready: ROW_READINESS.EVIDENCE }),
    row('SQ-PIVOT', 'SETUP_QUALIFICATION', 'pivot of the base (confirmed swing high, not yet exceeded)', { psr: ['MIN-VCP-07'], contract: ['MIN-SF-PIVOT'], code: `${LC}#sepaSetupFromTrendTemplate`, tests: [MLC('ADV-MLC-PIVOT-BEFORE-CONTRACTIONS')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-SEPA-PIVOT'], ready: ROW_READINESS.MODEL }),
    row('SQ-BREAKOUT', 'SETUP_QUALIFICATION', 'breakout confirmation over the pivot', { psr: ['MIN-VCP-07', 'MIN-PRICE-01', 'MIN-VCP-09'], contract: ['MIN-SF-PIVOT'], code: `${CO}#pivotBreakout`, tests: [T('sf-minervini-components', 'GC-MIN-PIVOT-VOLUME'), MLC('ADV-MLC-BREAKOUT-NO-VOLUME')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-ENTRY-TIMING'], ready: ROW_READINESS.MODEL }),
    row('SQ-MARKET', 'SETUP_QUALIFICATION', 'market context (own setups as barometer, difficult markets)', { psr: ['MIN-LEAD-01', 'MIN-LEAD-02', 'MIN-RISK-07'], data: ['research-universe breadth (market-breadth.mjs, proxy)'], mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.MANUAL, missing: 'no mechanical market filter in #709; not a gate' }),
    row('SQ-CHEAT-PULLBACK', 'SETUP_QUALIFICATION', '3C / cheat entry and pullback entries (optional variants)', { psr: ['MIN-CHEAT-01', 'MIN-CHEAT-02', 'MIN-CHEAT-03', 'MIN-CHEAT-04', 'MIN-MM-PULL-01', 'MIN-MM-PULL-02'], mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.MANUAL, missing: 'optional variants (contract exclusions); the pause pattern needs judgment; not simulated' }),
    ...SHARED_EXECUTION('SEPA'),
  ]),
  POWER_PLAY: Object.freeze([
    row('PP-SQ-RUNUP', 'SETUP_QUALIFICATION', 'at least +100 % in less than eight weeks', { psr: ['MIN-PP-02'], contract: ['MIN-SF-PP-RUNUP'], code: `${ME}#powerPlayScreen`, tests: [T('sf-minervini', 'GC-MIN-PP-CANDIDATE'), T('sf-minervini', 'GC-MIN-PP-SLOW-RUN'), MLC('SF4-PP-SERIES-EQUIVALENCE')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL }),
    row('PP-SQ-START-VOLUME', 'SETUP_QUALIFICATION', 'the run-up begins with strong volume', { psr: ['MIN-PP-02'], contract: ['MIN-SF-PP-RUNUP'], code: `${CO}#powerPlayClassify`, tests: [T('sf-minervini-components', 'GC-MIN-PP-CLASSES')], data: [OHLCV + ' (50 sessions before the run-up)'], pit: PIT_BARS, mech: 'QUALITATIVE', cls: CLASS.MANUAL_REVIEW, ready: ROW_READINESS.EVIDENCE, note: 'ratio measured; "strong" is the reviewer\'s; without 50 sessions of history DATA_BLOCKED_SETUP' }),
    row('PP-SQ-CONSOLIDATION', 'SETUP_QUALIFICATION', 'consolidation usually 3-6 weeks, twelve days printed; no minimum', { psr: ['MIN-PP-03'], contract: ['MIN-SF-PP-DURATION'], code: `${ME}#powerPlayScreen`, tests: [T('sf-minervini', 'GC-MIN-PP-SHORT-CONSOLIDATION'), T('sf-minervini-components', 'ADV-MIN-PP-LONG-BASE')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL }),
    row('PP-SQ-CORRECTION', 'SETUP_QUALIFICATION', 'correction no more than 20-25 %', { psr: ['MIN-PP-04'], contract: ['MIN-SF-PP-CORRECTION'], code: `${ME}#powerPlayScreen`, tests: [T('sf-minervini', 'GC-MIN-PP-DEEP-CORRECTION'), T('sf-minervini', 'GC-MIN-PP-CORRECTION-RANGE-FLAG')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL, note: 'open decision: the point inside 20-25 % (MANUAL_REVIEW_SETUP)' }),
    row('PP-SQ-TIGHTNESS', 'SETUP_QUALIFICATION', 'very tight (at most 10 %) or VCP characteristics', { psr: ['MIN-PP-05'], contract: ['MIN-SF-PP-TIGHT'], code: `${ME}#powerPlayScreen`, tests: [T('sf-minervini', 'GC-MIN-PP-WIDE-REVIEW')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL, note: 'the OR branch "VCP characteristics" is manual' }),
    row('PP-SQ-NO-FUNDAMENTALS', 'SETUP_QUALIFICATION', 'a Power Play can be bought without visible strong earnings', { psr: ['MIN-PP-01'], contract: ['MIN-SF-PP-NOFUND'], code: `${ME}#powerPlayScreen`, tests: [T('sf-minervini', 'GC-MIN-PP-CANDIDATE')], mech: 'MECHANICAL', cls: CLASS.SOURCE_BOUNDED, ready: ROW_READINESS.MECHANICAL }),
    row('PP-SQ-PIVOT', 'SETUP_QUALIFICATION', 'pivot of the consolidation', { psr: ['MIN-VCP-07'], contract: ['MIN-SF-PP-ENTRY'], code: `${LC}#powerPlaySetupSeries`, tests: [MLC('GC-MLC-PP-LIFECYCLE')], data: [OHLCV], pit: PIT_BARS, mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-PP-PIVOT'], ready: ROW_READINESS.MODEL }),
    row('PP-SQ-CLASSES', 'SETUP_QUALIFICATION', 'four setup classes; a confirmed setup is not an executable trade', { psr: ['MIN-PP-02', 'MIN-PP-04', 'MIN-PP-05'], contract: ['MIN-SF-PP-ENTRY'], code: `${LC}#entryEligibility`, tests: [MLC('GC-MLC-PP-LIFECYCLE'), T('sf-minervini-components', 'GC-MIN-NOT-A-STRATEGY')], mech: 'MECHANICAL', cls: CLASS.MODEL_ASSUMPTION, ma: ['MA-MIN-PP-ELIGIBLE-CLASSES'], ready: ROW_READINESS.MODEL, note: 'separate trade eligibility; the 1,469 confirmed setups of sf3 are not upgraded' }),
    ...SHARED_EXECUTION('POWER_PLAY'),
  ]),
});

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

/**
 * Validates the matrix against the #709 extract and the contracts. Returns { ok, errors[] }; never throws. Async because
 * code references are checked by importing the module and finding the export.
 */
export async function validateLifecycleMatrix(matrix, extract, contracts) {
  const errors = [], R = new Map(extract.rules.map((r) => [r.rule_id, r])), MA = new Set(MODEL_ASSUMPTIONS.map((m) => m.id));
  const exportsOf = new Map();
  for (const [strategy, rows] of Object.entries(matrix)) {
    const contract = contracts[strategy];
    const ruleIds = new Set(contract.rules.map((r) => r.id));
    const seen = new Set();
    for (const r of rows) {
      if (seen.has(r.id)) errors.push(`DUPLICATE_ROW:${strategy}:${r.id}`); seen.add(r.id);
      if (!LIFECYCLE_PHASES.includes(r.phase)) errors.push(`PHASE:${r.id}`);
      if (!CLASS[r.class]) errors.push(`CLASS:${r.id}`);
      for (const p of r.psr709) if (!R.has(p)) errors.push(`UNKNOWN_PSR709:${r.id}:${p}`);
      for (const c of r.contractRules) if (!ruleIds.has(c)) errors.push(`UNKNOWN_CONTRACT_RULE:${r.id}:${c}`);
      for (const m of r.modelAssumptions) if (!MA.has(m)) errors.push(`UNDECLARED_MODEL_ASSUMPTION:${r.id}:${m}`);
      if (r.class === CLASS.MODEL_ASSUMPTION && !r.modelAssumptions.length) errors.push(`MODEL_ASSUMPTION_WITHOUT_ID:${r.id}`);
      if (!r.psr709.length && ![CLASS.MODEL_ASSUMPTION, CLASS.MANUAL_REVIEW].includes(r.class)) errors.push(`SOURCE_CLASS_WITHOUT_SOURCE:${r.id}`);
      if (r.class === CLASS.SOURCE_EXACT) for (const p of r.psr709) { const s = R.get(p); if (!s || !(s.modal_strength === 'HARD' && s.confidence === 'HIGH' && s.original_wording_checked === true && s.hard_coding_clearance === 'SCOPE_AND_EXCEPTIONS_REQUIRED')) errors.push(`EXACT_ON_NON_HARDENABLE_RULE:${r.id}:${p}`); }
      // no upgrade: a row may not be more "source" than its contract rules allow
      const cst = r.contractRules.map((c) => contract.rules.find((x) => x.id === c)?.status);
      if (r.class === CLASS.SOURCE_EXACT && cst.some((s) => s !== 'SOURCE_EXACT')) errors.push(`EXACT_ABOVE_CONTRACT:${r.id}`);
      if (r.class === CLASS.DATA_BLOCKED && r.readiness !== ROW_READINESS.BLOCKED) errors.push(`DATA_BLOCKED_NOT_BLOCKED:${r.id}`);
      if (r.class === CLASS.MANUAL_REVIEW && r.readiness === ROW_READINESS.MECHANICAL && !r.note) errors.push(`MANUAL_MARKED_MECHANICAL_WITHOUT_NOTE:${r.id}`);
      if (r.implemented) {
        const [file, fn] = r.implemented.code.split('#');
        const abs = path.join(SF, file);
        if (!fs.existsSync(abs)) errors.push(`CODE_FILE:${r.id}:${file}`);
        else {
          if (!exportsOf.has(abs)) exportsOf.set(abs, await import(abs));
          if (!(fn in exportsOf.get(abs))) errors.push(`CODE_EXPORT:${r.id}:${r.implemented.code}`);
        }
        if (!r.implemented.tests.length) errors.push(`IMPLEMENTED_WITHOUT_TEST:${r.id}`);
        for (const t of r.implemented.tests) if (!titleExists(t)) errors.push(`TEST_NOT_FOUND:${r.id}:${t}`);
      } else if (r.readiness === ROW_READINESS.MECHANICAL || r.readiness === ROW_READINESS.MODEL) errors.push(`MECHANICAL_WITHOUT_CODE:${r.id}`);
    }
    for (const ph of LIFECYCLE_PHASES) if (!rows.some((r) => r.phase === ph)) errors.push(`PHASE_WITHOUT_ROW:${strategy}:${ph}`);
  }
  return { ok: errors.length === 0, errors };
}
