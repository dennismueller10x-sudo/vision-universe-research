/**
 * C08 Kristjan Kullamaegi Common Breakout (daily alternative / ORH branch), C09 Episodic Pivot, C10 Parabolic Short
 * (#709 W-KK3 Three timeless setups, W-KKFAQ, W-KKEP, own replies; WEB_PRIMARY, HIGH, original wording checked).
 * HARD and machine-executable: KK-001 (overnight cap 30 %), KK-012 (breakout stop = low of day, distance <= ADR/ATR:
 * REJECT a wide stop, never replace it), KK-027 (stop market), KK-031 (ADR20 formula), KK-034 (EP stop = low of day,
 * distance at most 1.5 ADR/ATR). Setup quality, catalysts and exits are preferences or need intraday / news / borrow
 * data. The earlier VU ADR clamp that replaced the low-of-day stop (#709 false hard rule) is not repeated.
 */
import { defineContract, EXCLUDE, SF_ROOT, sf3Evidence, sf5Evidence } from './define.mjs';
import { OUTPUT_KIND } from '../contract.mjs';

const CODE = `${SF_ROOT}/methods/kullamagi.mjs`;
const T = 'scripts/supertrader/tests/sf-kullamagi.test.mjs';
const SOURCES = [
  { sourceId: 'W-KK3', edition: 'Kristjan Kullamaegi, "3 timeless setups that have made me tens of millions" (qullamaggie.com) incl. own replies', role: 'authoritative' },
  { sourceId: 'W-KKFAQ', edition: 'Kristjan Kullamaegi, FAQ (qullamaggie.com)', role: 'authoritative' },
  { sourceId: 'W-KKEP', edition: 'Kristjan Kullamaegi, Episodic Pivots article incl. own replies', role: 'authoritative' },
];
const shared = (breakout = false) => [
  { id: 'KK-SF-ADR', kind: 'INDICATOR', essential: false, psr709: ['KK-031'], status: 'SOURCE_EXACT', rule: 'ADR20 = mean over 20 sessions of (high / low - 1) x 100 (the 20 sessions before the bar, so a check on the entry day uses no same-day range)', code: `${CODE}#adr20`, tests: [`${T}: GC-KK-ADR20`] },
  { id: 'KK-SF-CAP', kind: 'SIZING', psr709: ['KK-001'], status: 'SOURCE_EXACT', rule: 'never more than 30 % of equity in one stock or ETF overnight', code: `${CODE}#overnightCap`, tests: [`${T}: GC-KK-CAP-30`] },
  { id: 'KK-SF-STOPMARKET', kind: 'STOP', psr709: ['KK-027'], status: 'SOURCE_EXACT', rule: 'stops are stop-market orders: a gap through the stop fills at the open, never skipped', code: `${CODE}#stopMarketFill`, tests: [`${T}: GC-KK-STOP-MARKET-GAP`] },
  { id: 'KK-SF-PRIORITY', kind: 'SETUP', essential: false, psr709: ['KK-048', 'KK-049'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'relative review priority: liquidity first, then prior move / MA and momentum together, then ADR, then volume and growth together; momentum matters most; no six-fold AND filter', researchEvidence: [sf3Evidence('context-evidence.mjs', 'withContextEvidence', [['sf-context-evidence-research', 'SF3-CTX-LEADERSHIP'], ['sf-context-evidence-research', 'SF3-CTX-APPEND']], 'rank inside the PIT SIC group (VU proxy for industry) and research-universe breadth')] },
  { id: 'KK-SF-SIZE', kind: 'SIZING', psr709: ['KK-002', 'KK-003', 'KK-004', 'KK-025', 'KK-026'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'position size and risk per trade are context ranges (era-dependent, KK-C4), the reviewer decides within the 30 % cap', ...(breakout ? { researchEvidence: [sf5Evidence('lifecycle-engine.mjs', 'plannedShares', [['sf-sf5-kk-moka-lifecycle', 'GC-SF5-KK-LIFECYCLE']], 'Supertrader 5.0 MODEL lifecycle (C08 only): 0.5 % risk to the low-of-day stop (MA-KK-RISK-FRACTION), alternatives 0.25 % / 1 %')] } : {}) },
];
const sharedExclusions = {
  'KK-028': 'rare discretionary stop exception; not an automatic override (KK-C3)',
  'KK-029': EXCLUDE.documentationOnly, 'KK-041': EXCLUDE.documentationOnly, 'KK-047': EXCLUDE.documentationOnly,
  'KK-042': EXCLUDE.documentationOnly, 'KK-043': EXCLUDE.documentationOnly, 'KK-044': 'drawdown target, no published kill switch', 'KK-045': EXCLUDE.documentationOnly,
  'KK-046': EXCLUDE.documentationOnly, 'KK-050': 'market context, reviewer', 'KK-051': 'market context, reviewer', 'KK-053': EXCLUDE.documentationOnly, 'KK-054': EXCLUDE.documentationOnly,
  'KK-055': EXCLUDE.executionJudgment, 'KK-052': EXCLUDE.optionalVariant + ' (buy the pullback to the breakout zone)', 'KK-056': EXCLUDE.documentationOnly, 'KK-030': 'borrow context (see C10)',
};

export const KK_BREAKOUT = defineContract({
  implemented: true,
  sourceContractVersion: '1.2.1',
  plannedIn: 'PR 7 Kullamaegi',
  strategyId: 'SF_KK_BREAKOUT',
  candidateId: 'C08',
  trader: 'Kristjan Kullamaegi',
  method: 'Common Breakout, written daily alternative (KK-011); opening-range-high branch DATA_BLOCKED',
  sources: SOURCES,
  scope: { primary: 'MECHANICAL_SCREEN_WITH_MANUAL_LAYER', layers: { MECHANICAL: 'momentum ranks, ADR, MA evidence, low-of-day stop acceptance (KK-012), cap', MANUAL: 'setup quality, breakout level, partial sale and trailing', DATA_BLOCKED: 'opening range high entry (intraday history)' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'daily close (screen); the daily breakout entry is the breakout-day close, at which the low of day is final', earliestExecutable: 'breakout-day close (market-on-close) after the reviewer accepts the level', decisionData: 'daily bars up to and including the breakout day; the stop check uses that day\'s final low' },
  entryConditions: ['KK-SF-BO-ENTRY (manual level, daily close variant)'],
  exitConditions: ['KK-SF-BO-PARTIAL, KK-SF-BO-TRAIL (preferences, manual)'],
  stops: ['KK-SF-BO-STOP low of day; reject if (entry - LoD) / entry > ADR20 %'],
  positionSizing: ['KK-SF-SIZE (manual within KK-SF-CAP)'],
  requiredData: ['daily split-adjusted OHLCV', 'cross-sectional 1 / 3 / 6-month returns of the universe (snapshot)', 'intraday bars for ORH (missing)'],
  manualReviewFlags: [
    { id: 'KK-MR-SETUP', psr709: ['KK-006', 'KK-007', 'KK-008', 'KK-009'], question: 'strong prior move, higher lows, orderly tightening, rising 10 / 20-day MA?', blocksAutomation: true },
    { id: 'KK-MR-LEVEL', psr709: ['KK-011'], question: 'which consolidation high is the breakout level?', blocksAutomation: true },
    { id: 'KK-MR-PRIORITY', psr709: ['KK-048', 'KK-049'], question: 'relative priority: liquidity first, then prior move / MA and momentum, then ADR, then volume and growth (no six-fold AND)', blocksAutomation: false },
  ],
  knownLimitations: ['the opening-range-high entry (his main entry) is DATA_BLOCKED; the daily close variant is the written alternative (KK-011), not the same execution', 'the final low of day is unknown during an intraday entry; the daily variant enters at the close so that the stop rule can be evaluated exactly'],
  exclusions: { ...sharedExclusions },
  rules: [
    ...shared(true),
    { id: 'KK-SF-BO-MOMENTUM', kind: 'SETUP', psr709: ['KK-005', 'KK-054'], status: 'SOURCE_DERIVED', gate: false, rule: 'screen the top 1-2 % by 1, 3 and 6-month performance', derivation: 'cross-sectional percentile of 21 / 63 / 126-session returns among the snapshot universe members trading that day; reported and used to RANK candidates, never to exclude (KK-005 PREFERENCE, KK-048 no AND filter)', code: `${CODE}#momentumRanks`, tests: [`${T}: GC-KK-MOMENTUM-RANK-NOT-GATE`] },
    { id: 'KK-SF-BO-SETUP', kind: 'SETUP', psr709: ['KK-006', 'KK-007', 'KK-008', 'KK-009'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'prior move 30-100 % in 1-3 months, higher lows, orderly tightening over 2 weeks - 2 months, rising 10 / 20-day MA; the machine reports these measures as evidence', code: `${CODE}#breakoutEvidence`, tests: [`${T}: GC-KK-SETUP-EVIDENCE`], researchEvidence: [sf5Evidence('kk-breakout-lifecycle.mjs', 'kkBreakoutSetupAt', [['sf-sf5-kk-moka-lifecycle', 'GC-SF5-KK-SETUP-PIT'], ['sf-sf5-kk-moka-lifecycle', 'GC-SF5-KK-LIFECYCLE']], 'Supertrader 5.0 MODEL lifecycle: declared setup proxy (MA-KK-SETUP-PROXY) substitutes KK-MR-SETUP')] },
    { id: 'KK-SF-BO-ENTRY', kind: 'ENTRY', psr709: ['KK-011'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'daily breakout entry allowed (anticipation is a harder variant); the level is the reviewer\'s', researchEvidence: [sf5Evidence('kk-breakout-lifecycle.mjs', 'KK_BREAKOUT_ADAPTER', [['sf-sf5-kk-moka-lifecycle', 'GC-SF5-KK-LIFECYCLE'], ['sf-sf5-kk-moka-lifecycle', 'GC-SF5-KK-NEXT-OPEN']], 'Supertrader 5.0 MODEL lifecycle: level = 10-session consolidation high; research reference entry at the next open after the breakout-day close (owner decision 2026-10-23, MA-KK-ENTRY-TIMING), the breakout-day close is the alternative ALT-ENTRY-BREAKOUT-DAY-CLOSE')] },
    { id: 'KK-SF-BO-ORH', kind: 'ENTRY', essential: false, psr709: ['KK-010'], status: 'DATA_BLOCKED', rule: 'opening range high entry (1 / 5 / 60 minutes)', reason: 'no frozen intraday history in the snapshot (r9b minute cache is live and locked in snapshot mode)' },
    { id: 'KK-SF-BO-STOP', kind: 'STOP', psr709: ['KK-012'], status: 'SOURCE_EXACT', gate: true, rule: 'initial stop = low of the entry day; the distance must be <= ADR (or ATR): a wider stop REJECTS the trade, it is never replaced by a tighter stop', code: `${CODE}#breakoutStopCheck`, tests: [`${T}: GC-KK-STOP-ACCEPT`, `${T}: GC-KK-STOP-REJECT-WIDE`, `${T}: GC-KK-STOP-NO-CLAMP`] },
    { id: 'KK-SF-BO-PARTIAL', kind: 'EXIT', psr709: ['KK-013'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'after 3-5 days sell 1/3-1/2, rest stop to break-even (preference)', researchEvidence: [sf5Evidence('kk-breakout-lifecycle.mjs', 'KK_BREAKOUT_ADAPTER', [['sf-sf5-kk-moka-lifecycle', 'GC-SF5-KK-LIFECYCLE']], 'Supertrader 5.0 MODEL lifecycle: day 3, 1/3, break-even (MA-KK-EXIT-POLICY), alternatives pre-registered')] },
    { id: 'KK-SF-BO-TRAIL', kind: 'EXIT', psr709: ['KK-014'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'trail the rest with the 10 / 20-day MA; beginners: first close below the 10-day MA (preference)', researchEvidence: [sf5Evidence('kk-breakout-lifecycle.mjs', 'KK_BREAKOUT_ADAPTER', [['sf-sf5-kk-moka-lifecycle', 'GC-SF5-KK-TRAIL-MA10']], 'Supertrader 5.0 MODEL lifecycle: first close below the 10-day MA exits at the next open (MA-KK-EXIT-POLICY)')] },
  ],
});

export const KK_EPISODIC_PIVOT = defineContract({
  implemented: true,
  sourceContractVersion: '1.1.0',
  plannedIn: 'PR 7 Kullamaegi',
  strategyId: 'SF_KK_EPISODIC_PIVOT',
  candidateId: 'C09',
  trader: 'Kristjan Kullamaegi',
  method: 'Episodic Pivot: 10 %+ gap on an unexpected significant catalyst with exceptional early volume; ORH entry, low-of-day stop',
  sources: SOURCES,
  scope: { primary: 'ISOLATED_MECHANICAL_COMPONENTS', layers: { MECHANICAL: 'gap measurement, prior-sideways evidence, low-of-day stop acceptance (KK-034), cap', DATA_BLOCKED: 'catalyst identity and timestamp, early intraday volume, ORH entry' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'catalyst timestamp and the first intraday minutes (not available)', earliestExecutable: 'not executable on the snapshot', decisionData: 'daily bars give the gap and the final low only after the close' },
  entryConditions: ['KK-SF-EP-ENTRY (DATA_BLOCKED)'],
  exitConditions: ['KK-SF-EP-EXIT (manual; MA choice inconsistent in the source, KK-C2)'],
  stops: ['KK-SF-EP-STOP low of day, distance at most 1.5 ADR'],
  positionSizing: ['KK-SF-SIZE (manual within KK-SF-CAP)'],
  requiredData: ['daily OHLCV', 'catalyst news with timestamps (missing)', 'estimates / guidance (missing)', 'intraday volume and opening range (missing)'],
  manualReviewFlags: [{ id: 'KK-MR-CATALYST', psr709: ['KK-015', 'KK-038', 'KK-039', 'KK-040'], question: 'is there an unexpected significant catalyst (earnings / guidance, regulation, FDA, contract, sector repricing)?', blocksAutomation: true }],
  knownLimitations: ['no catalyst or intraday data: no historical EP measurement is possible; only isolated components are implemented and tested', 'the 10 % gap of KK-015 is a STRONG_PREFERENCE description, used only as evidence'],
  exclusions: { ...sharedExclusions, 'KK-033': EXCLUDE.optionalVariant + ' (5-minute ORH add)', 'KK-036': 'reviewer context (repeated EPs fail more often)', 'KK-017': 'covered by KK-SF-EP-EXIT' },
  rules: [
    ...shared(),
    { id: 'KK-SF-EP-GAP', kind: 'SETUP', psr709: ['KK-015'], status: 'SOURCE_DERIVED', gate: false, rule: '10 %+ gap', derivation: 'gap = open / previous close - 1 on split-adjusted bars, reported with the 10 % reference as evidence; not an exclusion (KK-015 is a STRONG_PREFERENCE description)', code: `${CODE}#epGapEvidence`, tests: [`${T}: GC-KK-EP-GAP-EVIDENCE`] },
    { id: 'KK-SF-EP-SIDEWAYS', kind: 'SETUP', essential: false, psr709: ['KK-035'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'ideally 3-6 months sideways or longer without a big prior run; machine reports the prior range and prior move', code: `${CODE}#epGapEvidence`, tests: [`${T}: GC-KK-EP-GAP-EVIDENCE`] },
    { id: 'KK-SF-EP-CATALYST', kind: 'SETUP', psr709: ['KK-015', 'KK-038', 'KK-039', 'KK-040'], status: 'DATA_BLOCKED', rule: 'unexpected significant catalyst', reason: 'no timestamped catalyst / news / estimate / guidance history in the snapshot (#709 estimates, surprises, guidance MISSING)' },
    { id: 'KK-SF-EP-VOLUME', kind: 'FILTER', psr709: ['KK-016', 'KK-037'], status: 'DATA_BLOCKED', rule: 'exceptional opening volume, ideally the daily average within 15-20 minutes', reason: 'needs intraday volume; daily volume is reported as evidence only' },
    { id: 'KK-SF-EP-ENTRY', kind: 'ENTRY', psr709: ['KK-032'], status: 'DATA_BLOCKED', rule: 'mostly the first 1-minute opening range high', reason: 'no frozen intraday history' },
    { id: 'KK-SF-EP-STOP', kind: 'STOP', psr709: ['KK-034'], status: 'SOURCE_EXACT', gate: true, rule: 'stop = low of day; distance from entry at most 1.5 ADR (or ATR); a wider stop rejects the trade', code: `${CODE}#epStopCheck`, tests: [`${T}: GC-KK-EP-STOP-ACCEPT`, `${T}: GC-KK-EP-STOP-REJECT`] },
    { id: 'KK-SF-EP-EXIT', kind: 'EXIT', psr709: ['KK-017'], status: 'SOURCE_AMBIGUOUS', rule: 'trailing exit', reason: 'the article names 20 / 50-day MAs and later 10 / 20-day MAs (KK-C2): exit choice discretionary, no universal MA; the breakout partial sale is not carried over' },
  ],
});

export const KK_PARABOLIC_SHORT = defineContract({
  implemented: true,
  sourceContractVersion: '1.1.0',
  plannedIn: 'PR 7 Kullamaegi',
  strategyId: 'SF_KK_PARABOLIC_SHORT',
  candidateId: 'C10',
  trader: 'Kristjan Kullamaegi',
  method: 'Parabolic Short: accelerated up-move; ORL / first red 5-minute candle / failed VWAP retest entry; high of day or VWAP reclaim as risk; cover toward the 10 / 20-day MA',
  sources: SOURCES,
  scope: { primary: 'ISOLATED_MECHANICAL_COMPONENTS', layers: { MECHANICAL: 'acceleration evidence, MA target distance evidence', DATA_BLOCKED: 'intraday entries and VWAP, borrow / locates / fees' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'intraday (not available)', earliestExecutable: 'not executable on the snapshot', decisionData: 'daily bars give only the run-up evidence' },
  entryConditions: ['KK-SF-PS-ENTRY (DATA_BLOCKED)'],
  exitConditions: ['KK-SF-PS-TARGET (preference, manual)'],
  stops: ['KK-SF-PS-STOP (DATA_BLOCKED: VWAP; high of day only final after the close)'],
  positionSizing: ['KK-SF-SIZE (manual within KK-SF-CAP)'],
  requiredData: ['daily OHLCV', 'intraday bars and VWAP (missing)', 'borrow availability, locates and fees (missing)'],
  manualReviewFlags: [{ id: 'KK-MR-PARABOLIC', psr709: ['KK-018', 'KK-019'], question: 'several strongly accelerated up days? (sizes are illustrative, not minimums)', blocksAutomation: true }],
  knownLimitations: ['short side and intraday execution are DATA_BLOCKED; nothing in this method can be measured on history', 'illustrative move sizes (KK-019) are never thresholds'],
  exclusions: { ...sharedExclusions, 'KK-019': 'EXAMPLE_ONLY move sizes; reported context, never a threshold', 'KK-024': EXCLUDE.optionalVariant + ' (rare parabolic long)', 'KK-030': 'see KK-SF-PS-BORROW' },
  rules: [
    ...shared(),
    { id: 'KK-SF-PS-ACCEL', kind: 'SETUP', psr709: ['KK-018'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'several strongly accelerated up days; the machine reports the streak of up days, their returns and whether they accelerate (evidence, no threshold)', code: `${CODE}#parabolicEvidence`, tests: [`${T}: GC-KK-PS-EVIDENCE`] },
    { id: 'KK-SF-PS-ENTRY', kind: 'ENTRY', psr709: ['KK-020', 'KK-021'], status: 'DATA_BLOCKED', rule: 'opening range low, first red 5-minute candle, or a failed VWAP retest', reason: 'needs intraday bars and VWAP' },
    { id: 'KK-SF-PS-STOP', kind: 'STOP', psr709: ['KK-022'], status: 'DATA_BLOCKED', rule: 'high of day or VWAP reclaim', reason: 'VWAP needs intraday data; the high of day is only final after the close' },
    { id: 'KK-SF-PS-BORROW', kind: 'FILTER', psr709: ['KK-030'], status: 'DATA_BLOCKED', rule: 'shares must be borrowable; locates can be expensive', reason: 'no historical borrow / locate / fee data (#709 short_interest MISSING)' },
    { id: 'KK-SF-PS-TARGET', kind: 'EXIT', psr709: ['KK-023'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'take profits toward the 10 / 20-day MA, early partials; the machine reports the distances', code: `${CODE}#parabolicEvidence`, tests: [`${T}: GC-KK-PS-EVIDENCE`] },
  ],
});
