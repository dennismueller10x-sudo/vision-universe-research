/**
 * Writes the V4 method artifacts from the engine rule tables (single source of truth):
 *  - methods/TURTLE-SOURCE-V4-SPEC.json          formal spec of the IMPLEMENT_NOW Turtle systems
 *  - SUPERTRADER-V4-SOURCE-CODE-TRACEABILITY.json rule id -> source provenance -> code -> test -> scope
 *  - SUPERTRADER-V4-GOLDEN-CASES.json             golden cases per method (Turtle executable; others blocked/manual)
 *  - methods/MANUAL-REVIEW-V4-CONTRACT.json       first-class manual review record for MANUAL_LAYER_REQUIRED methods
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TURTLE_RULES_V4, TURTLE_PARAMS, TURTLE_SOURCE_VERSION } from './turtle-source-v4.mjs';
import { METHODS } from '../acceptance/build-acceptance-v4.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), V4 = path.resolve(HERE, '..');
const CANON = 'scripts/supertrader/fidelity/canonical/turtle.json';

export const TURTLE_GOLDEN = [
  { id: 'TG-01', kind: 'CONFIRMED_BUY', system: 'S1', case: 'first S1 breakout with no prior breakout', expected: 'BUY at prior 20-day high + tick (open below trigger)', why: 'T4-S1-ENTRY; filter has no previous breakout', test: 'GOLDEN confirmed buy (first S1 breakout, no prior breakout)' },
  { id: 'TG-02', kind: 'CONFIRMED_BUY', system: 'S1', case: 'S1 breakout after a losing breakout (2N against first)', expected: 'BUY', why: 'T4-S1-FILTER: previous breakout was a loser', test: 'GOLDEN confirmed buy after a losing breakout' },
  { id: 'TG-03', kind: 'CONFIRMED_REJECT', system: 'S1', case: 'S1 breakout after a profitable 10-day exit', expected: 'SKIP (counted)', why: 'T4-S1-FILTER', test: 'GOLDEN reject: S1 breakout after a winning breakout is skipped' },
  { id: 'TG-04', kind: 'CONFIRMED_EXCEPTION', system: 'S1', case: 'skipped S1 breakout that is also a 55-day breakout', expected: 'BUY as FAILSAFE_55', why: 'T4-FAILSAFE', test: 'GOLDEN exception: skipped S1 breakout that is also a 55-day breakout' },
  { id: 'TG-05', shared: true, kind: 'CONFIRMED_EXCEPTION', system: 'S1', case: 'gap open above the trigger', expected: 'fill at the open', why: 'T4-S1-ENTRY (TUR-F-BO-01)', test: 'GOLDEN exception (gap)' },
  { id: 'TG-06', kind: 'EDUCATIONAL_PATTERN', system: 'S1', case: 'winning hypothetical SHORT breakout followed by a long breakout', expected: 'long breakout skipped although VU trades long only', why: 'T4-S1-FILTER + T4-LONG-ONLY (TUR-E-SHORT-01)', test: 'GOLDEN educational: a short 20-day breakout counts in the S1 filter' },
  { id: 'TG-07', shared: true, kind: 'AMBIGUOUS_CASE', system: 'S1', case: 'entry bar whose low is below the 2N stop', expected: 'stopped on the entry bar (pessimistic declared convention)', why: 'T4-INTRABAR (daily bars cannot order intrabar events)', test: 'GOLDEN ambiguous (resolved by the declared convention)' },
  { id: 'TG-08', shared: true, kind: 'CONFIRMED_BUY', system: 'S1', case: 'trend after entry in 1/2 N steps', expected: '3 adds -> 4 units; stops raised', why: 'T4-ADD, T4-STOP', test: 'GOLDEN pyramid' },
  { id: 'TG-09', kind: 'CONFIRMED_BUY', system: 'S2', case: '55-day breakout after a winning S2 trade', expected: 'BUY (no filter)', why: 'T4-S2-ENTRY', test: 'GOLDEN S2: no filter' },
  { id: 'TG-10', shared: true, kind: 'CONFIRMED_REJECT', system: 'S1', case: 'unit cost above available cash', expected: 'REJECT_NO_CASH, no leverage', why: 'T4-NO-LEVERAGE', test: 'no cash -> REJECT_NO_CASH' },
];

export function turtleSpec() {
  return {
    schema: 'supertrader-v4-method-spec-1.0.0', version: TURTLE_SOURCE_VERSION, methods: ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'], eligibility: 'IMPLEMENT_NOW (conditional on the V4 calibration gate)',
    scope: { implemented: 'VU_EQUITY_ADAPTATION (long-only source translation)', notImplemented: 'ORIGINAL_FUTURES_REPLICATION (DATA_BLOCKED: futures chains, contract values, rolls, correlation groups, shorting)' },
    sourceIds: [...new Set(TURTLE_RULES_V4.flatMap((r) => r.sourceIds))].sort(), sourceContract: CANON,
    exactRules: TURTLE_RULES_V4.filter((r) => r.kind === 'SOURCE').map(({ ruleId, sourceIds, rule, interpretation }) => ({ ruleId, sourceIds, rule, ...(interpretation ? { interpretation } : {}) })),
    modalStrength: 'MANDATORY for every SOURCE rule (the source calls the system complete and mechanical; TUR-F-FUND-01, TUR-F-CONS-01)',
    parameters: TURTLE_PARAMS,
    requiredData: ['daily OHLC (split-adjusted) with raw close/volume', 'dividends', 'terminals (V4 policy)'],
    entry: { S1: '20-day high + tick, filter, failsafe 55', S2: '55-day high + tick, no filter', fill: 'max(open, trigger) on the trigger bar' },
    exit: { S1: 'prior 10-day low - tick', S2: 'prior 20-day low - tick', fill: 'min(open, level)' },
    stop: '2N below the newest unit fill (market fill before costs); all units', positionSizing: 'unit = 1 % of notional / N; adds every 1/2 N to 4 units',
    portfolioRules: { perMarket: 4, perDirection: 12, correlatedGroups: 'NOT_APPLIED (DATA_PARTIAL industry PIT)', cash: 'no leverage; REJECT_NO_CASH', ranking: '(close - close 63 sessions ago)/N, ties by id' },
    regime: 'none (TUR-F-REGIME-01)', manualLayer: 'none (fully mechanical)',
    exceptions: ['failsafe 55 after a skipped S1 breakout', 'gap fills at the open', 'fast-market multiple adds per day'],
    groundTruthCases: TURTLE_GOLDEN.map((g) => g.id),
    nonRules: ['no market regime filter', 'no fundamental filter', 'no VU lifecycle (proximity, expiry, cooldown)', 'no ADR or channel-width filter', 'no weight cap', 'no 10 % per-position cap'],
    forbiddenVuAdditions: ['alphabetical signal priority', 'next-open entry instead of the intraday breakout', 'closing-price breakout confirmation', 'single unit without adds', 'market light'],
    declaredDeviations: TURTLE_RULES_V4.filter((r) => r.deviation || r.translation || r.kind !== 'SOURCE').map(({ ruleId, kind, deviation, translation, rule }) => ({ ruleId, kind, note: deviation ?? translation ?? rule })),
  };
}

export function traceability() {
  return {
    schema: 'supertrader-v4-source-code-traceability-1.0.0', note: 'Only IMPLEMENT_NOW methods have implemented rules. Every number in TURTLE_PARAMS maps to a rule below; there are no source-less magic numbers outside rules marked TRANSLATION or CONVENTION.',
    rules: TURTLE_RULES_V4.map((r) => ({ ruleId: r.ruleId, method: r.scope, sourceProvenance: r.sourceIds.map((id) => `${CANON}#${id}`), sourceConfidence: r.confidence, kind: r.kind,
      codeFunction: `scripts/supertrader/research/v4/methods/turtle-source-v4.mjs#${r.code}`, tests: r.tests.map((t) => `scripts/supertrader/tests/v4-turtle-golden.test.mjs: ${t}`), exceptionScope: r.interpretation ?? r.deviation ?? r.translation ?? null })),
    parameterMap: { 'S1.entry=20': 'T4-S1-ENTRY', 'S1.exit=10': 'T4-EXIT-S1', 'S1.failsafe=55': 'T4-FAILSAFE', 'S2.entry=55': 'T4-S2-ENTRY', 'S2.exit=20': 'T4-EXIT-S2', 'filterBreakout=20/filterExit=10': 'T4-S1-FILTER', 'nPeriod=20': 'T4-N', 'unitRiskFraction=0.01': 'T4-UNIT', 'stopN=2': 'T4-STOP', 'addStepN=0.5': 'T4-ADD', 'maxUnitsPerMarket=4/maxUnitsDirection=12': 'T4-LIMIT', 'rankLookback=63': 'T4-RANK (translation of 3 months)', 'notionalLossStep=0.10/notionalCutStep=0.20': 'T4-NOTIONAL', 'rawTick=0.01': 'T4-TICK' },
    measurementInfrastructure: 'scripts/supertrader/research/v4/measurement/* (A1-A14 closure, see SUPERTRADER-V4-ADVERSARIAL-FINDINGS.json)',
  };
}

export function goldenCases() {
  const methods = {};
  for (const m of METHODS) {
    if (m.id.startsWith('TURTLE_')) methods[m.id] = { status: 'EXECUTABLE', file: 'scripts/supertrader/tests/v4-turtle-golden.test.mjs', cases: TURTLE_GOLDEN.filter((g) => (m.id === 'TURTLE_S1_SOURCE' ? g.system === 'S1' : g.system === 'S2' || g.shared)) };
    else methods[m.id] = { status: 'BLOCKED_BEHAVIORAL_CASE_ARTIFACT_ABSENT', reason: 'the 287 behavioral cases of the primary source reconstruction are not in the repository; golden cases for this method must be derived from them (inclusion, exclusion, exception, setup classification), not invented',
      requiredCaseKinds: ['CONFIRMED_BUY', 'CONFIRMED_REJECT', 'CONFIRMED_EXCEPTION', 'EDUCATIONAL_PATTERN', 'AMBIGUOUS_CASE'], useAsPerformanceSample: false };
  }
  return { schema: 'supertrader-v4-golden-cases-1.0.0', rule: 'golden cases are behaviour tests, never a performance sample', methods };
}

export function manualReviewContract() {
  return {
    schema: 'supertrader-v4-manual-review-contract-1.0.0', appliesTo: METHODS.filter((m) => m.manual || m.source === 'SOURCE_MANUAL_REQUIRED').map((m) => m.id),
    pipeline: ['MACHINE_SCREEN', 'RANKING', 'MANUAL_OR_AI_REVIEW', 'FINAL_CANDIDATE'],
    candidateRecord: { status: 'MANUAL_REVIEW_REQUIRED', fields: ['methodId', 'securityId (private)', 'asOf', 'machineScreenEvidence[] (rule id, value, source id)', 'rankingEvidence', 'openQuestions[] (what the source leaves to judgment)', 'dataNotAvailableToMachine[]', 'reviewer', 'decision (ACCEPT_AS_CANDIDATE | REJECT | DEFER)', 'decisionReasons[] (source ids)', 'reviewedAt'] },
    hardRules: ['a machine screen may create MANUAL_REVIEW_REQUIRED records, never BUY', 'a decision without source-id reasons is invalid', 'AI review output is a proposal and keeps status MANUAL_REVIEW_REQUIRED until a human decision', 'manual decisions are logged forward only; they are never back-filled into a historical backtest'],
    perMethodJudgment: {
      MINERVINI_SEPA_VCP: ['relative priority among Trend-Template passers (OSR-MIN-01)', 'fundamental thesis and its price confirmation (OSR-MIN-06)', 'turnaround family vs growth family (OSR-MIN-02)', 'VCP shape as typical form, not hard limits (OSR-MIN-04)'],
      MINERVINI_POWER_PLAY: ['exception characteristics (OSR-MIN-03)', 'pivot selection'],
      WEINSTEIN_STAGE2_INVESTOR: ['stage identification on the weekly chart', 'resistance and support levels for stops (OSR-WEI-01/02)', 'group strength'],
      WEINSTEIN_STAGE2_TRADER: ['trader-path entry and tighter support stop (separate from investor path)'],
      KULLAMAGI_COMMON_BREAKOUT: ['orderly base quality (higher lows, tightening)', 'opening-range-high entry and low-of-day stop on intraday data (OSR-KK-01: no ADR clamp substitute)'],
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const w = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
  w(path.join(HERE, 'TURTLE-SOURCE-V4-SPEC.json'), turtleSpec());
  w(path.join(V4, 'SUPERTRADER-V4-SOURCE-CODE-TRACEABILITY.json'), traceability());
  w(path.join(V4, 'SUPERTRADER-V4-GOLDEN-CASES.json'), goldenCases());
  w(path.join(HERE, 'MANUAL-REVIEW-V4-CONTRACT.json'), manualReviewContract());
  process.stdout.write('written method artifacts\n');
}
