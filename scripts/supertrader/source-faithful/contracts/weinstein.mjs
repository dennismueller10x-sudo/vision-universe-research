/**
 * C04 Stan Weinstein Stage 2 Investor / C05 Stage 2 Trader continuation (#709 B09, Secrets for Profiting in Bull and
 * Bear Markets, 1988 reprint, English, original wording checked). Investor and Trader are separate methods with their
 * own entry, size and stop rules (#709: "Investor, Trader und Short sind unterschiedliche Pfade"). Shared machine
 * gates are only the HARD rules that need no judgment; stage classification, overhead resistance, support stops and
 * group / market context stay manual or are DATA_BLOCKED. No RS > 0 gate and no "every close below MA30" exit
 * (#709 false hard rules WEIN-RSZERO / WEIN-TRAIL4).
 */
import { defineContract, EXCLUDE, SF_ROOT } from './define.mjs';
import { OUTPUT_KIND } from '../contract.mjs';

const CODE = `${SF_ROOT}/methods/weinstein.mjs`;
const T = 'scripts/supertrader/tests/sf-weinstein.test.mjs';

const shared = () => [
  { id: 'WEIN-SF-WEEKLY', kind: 'INDICATOR', psr709: ['WEIN-S2'], status: 'SOURCE_DERIVED', essential: false, rule: '30-week moving average on weekly bars', derivation: 'weekly bar = ISO week of the daily snapshot bars (open of the first, high/low of the week, close of the last session, summed volume); a week is complete only after its last session; simple 30-week mean of weekly closes', code: `${CODE}#weeklyBars`, tests: [`${T}: GC-WEIN-WEEKLY`] },
  { id: 'WEIN-SF-MA-GATE', kind: 'FILTER', psr709: ['WEIN-MA'], status: 'SOURCE_DERIVED', gate: true, rule: 'no long buy below the 30-week MA or while it is falling', derivation: '"below or at a falling MA": reject when the weekly close <= MA30w or MA30w < its value one week earlier; one-week comparison is the smallest observable slope (no threshold added)', code: `${CODE}#maGate`, tests: [`${T}: GC-WEIN-MA-BELOW`, `${T}: GC-WEIN-MA-FALLING`, `${T}: GC-WEIN-MA-OK`] },
  { id: 'WEIN-SF-STAGE', kind: 'FILTER', psr709: ['WEIN-S1', 'WEIN-S2', 'WEIN-S3', 'WEIN-S4', 'WEIN-NO3', 'WEIN-NO4'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'stage classification (no Stage 3 buys, no Stage 4 buys or holds); the machine reports MA slope and price-to-MA as evidence, the stage is the reviewer\'s call' },
  { id: 'WEIN-SF-VOLUME', kind: 'FILTER', psr709: ['WEIN-VOL', 'WEIN-VOL1', 'WEIN-VOL2', 'WEIN-VOL3', 'WEIN-VOL4', 'WEIN-BASEVOL'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'clear volume confirmation of the breakout; the machine evaluates the three printed alternatives and reports which hold; no single magic multiplier is enforced (WEIN-VOL4)', code: `${CODE}#volumeAlternatives`, tests: [`${T}: GC-WEIN-VOL-A`, `${T}: GC-WEIN-VOL-C`, `${T}: GC-WEIN-VOL-NONE`] },
  { id: 'WEIN-SF-RS', kind: 'FILTER', psr709: ['WEIN-RS', 'WEIN-RSP', 'WEIN-RSZERO', 'WEIN-RSNO'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'relative strength vs a consistent market index: negative AND still poor RS = no buy; below zero but clearly improving may be bought; the machine reports the RS line, its 52-week-normalised level and its recent trend as evidence (no RS > 0 gate)', code: `${CODE}#relativeStrength`, tests: [`${T}: GC-WEIN-RS-BELOW-ZERO-IMPROVING`] },
  { id: 'WEIN-SF-GROUP', kind: 'FILTER', psr709: ['WEIN-GROUP', 'WEIN-GROUP2'], status: 'DATA_BLOCKED', rule: 'no long buy in a negative industry group; check the group stage first', reason: 'point-in-time industry group membership and group charts are not in the snapshot (#709 industry PARTIAL); no substitute is invented' },
  { id: 'WEIN-SF-MARKET', kind: 'FILTER', psr709: ['WEIN-MARKET'], status: 'DATA_BLOCKED', rule: 'begin normal long selection only in a positive overall market', reason: 'Weinstein judges the market with stage analysis plus breadth (Momentum Index, new highs / lows, foreign indices); NYSE advance / decline and new-high history is not in the snapshot. The SPY 30-week stage is reported as evidence only.', code: `${CODE}#marketEvidence`, tests: [`${T}: GC-WEIN-MARKET-EVIDENCE`] },
  { id: 'WEIN-SF-OVERHEAD', kind: 'FILTER', psr709: ['WEIN-OH', 'WEIN-OHAGE'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'avoid strong nearby overhead resistance; the machine reports the nearest higher weekly high in the available history and its age' },
  { id: 'WEIN-SF-ORDER', kind: 'ENTRY', psr709: ['WEIN-ORD'], status: 'SOURCE_DERIVED', rule: 'breakout buy is prepared as a buy-stop order', derivation: 'the candidate record carries the buy-stop level (resistance + one raw cent); WEIN-LIM stop-limit spacing is an execution example (EXAMPLE_ONLY), not modelled', code: `${CODE}#candidateRecord`, tests: [`${T}: GC-WEIN-INVESTOR-CANDIDATE`, `${T}: GC-WEIN-TRADER-CANDIDATE`] },
  { id: 'WEIN-SF-STOP-PLAN', kind: 'STOP', psr709: ['WEIN-STOP1'], status: 'SOURCE_DERIVED', rule: 'the stop is computed before the buy and placed right after it', derivation: 'every candidate record carries a proposed stop before any decision; the reviewer confirms or replaces it', code: `${CODE}#candidateRecord`, tests: [`${T}: GC-WEIN-INVESTOR-CANDIDATE`] },
  { id: 'WEIN-SF-NO-AVG-DOWN', kind: 'PYRAMIDING', psr709: ['WEIN-AVG'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'never average down into a negative situation; add only on confirmation' },
  { id: 'WEIN-SF-NONTECH', kind: 'EXIT', essential: false, psr709: ['WEIN-SELL4'], status: 'SOURCE_EXACT', rule: 'taxes, dividends or a low P/E never replace a technical exit (the method has no non-technical exit)', code: `${CODE}#candidateRecord`, tests: [`${T}: GC-WEIN-NO-NONTECH-EXIT`] },
];

const sharedExclusions = {
  'WEIN-LIM': EXCLUDE.executionJudgment + ' (stop-limit spacing)',
  'WEIN-LIMNUM': EXCLUDE.documentationOnly + ' (historic eighth / half point spacing)',
  'WEIN-GTC': EXCLUDE.executionJudgment + ' (good-till-cancelled order practice)',
  'WEIN-STOP3': 'reported as evidence (nearest round number below the proposed stop); reviewer decision',
  'WEIN-STOP4': 'reported as evidence (initial risk vs the 15 % guide, with the stated exceptions); not a gate',
  'WEIN-REENTRY': EXCLUDE.optionalVariant + ' (re-entry after a whipsaw)',
  'WEIN-DIVERS1': 'portfolio composition preference; reviewer decision',
  'WEIN-DIVERS3': 'portfolio composition preference; reviewer decision',
  'WEIN-DIVERS4': EXCLUDE.optionalVariant,
  'WEIN-EXPOSURE': 'market-indicator exposure context; reviewer decision',
  'WEIN-CTX-MI': 'market breadth indicator; NYSE advance / decline history not in the snapshot (DATA_BLOCKED, see WEIN-SF-MARKET)',
  'WEIN-CTX-MI-ZERO': 'see WEIN-CTX-MI',
  'WEIN-CTX-MI-LIMIT': 'see WEIN-CTX-MI',
  'WEIN-CTX-HL': 'new highs / new lows breadth not in the snapshot (DATA_BLOCKED, see WEIN-SF-MARKET)',
  'WEIN-CTX-WORLD': 'foreign index stages not in the snapshot (DATA_BLOCKED, see WEIN-SF-MARKET)',
  'WEIN-CTX-GM': EXCLUDE.documentationOnly,
  'WEIN-CTX-SEASON': EXCLUDE.documentationOnly,
};

export const WEINSTEIN_INVESTOR = defineContract({
  implemented: true,
  plannedIn: 'PR 4 Weinstein',
  strategyId: 'SF_WEINSTEIN_INVESTOR',
  candidateId: 'C04',
  trader: 'Stan Weinstein',
  method: 'Stage 2 Investor: early Stage 2 breakout above resistance, half position at the breakout, half on a constructive pullback',
  sources: [{ sourceId: 'B09', edition: 'Secrets for Profiting in Bull and Bear Markets, 1988 reprint, English', role: 'authoritative' }],
  scope: { primary: 'MECHANICAL_SCREEN_WITH_MANUAL_LAYER', layers: { MECHANICAL: 'weekly bars, MA30w gate, base / resistance level, volume alternatives, RS evidence', MANUAL: 'stage, overhead resistance, support stop, sizing, pullback add, trailing', DATA_BLOCKED: 'industry group stage, market breadth' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'the completed week whose high exceeds the base resistance (buy-stop prepared from the prior week)', earliestExecutable: 'a reviewer decision after the week closes; never back-filled into history', decisionData: 'weekly bars up to the signal week, SPY weekly for RS and market evidence' },
  entryConditions: ['WEIN-SF-INV-BREAKOUT', 'WEIN-SF-MA-GATE'],
  exitConditions: ['WEIN-SF-INV-TRAIL (manual)', 'WEIN-SF-NONTECH'],
  stops: ['WEIN-SF-INV-STOP (proposal below the base low, reviewer decides)'],
  positionSizing: ['WEIN-SF-INV-SIZE (manual: half at the breakout, half on the pullback; roughly equal dollar amounts)'],
  requiredData: ['daily split-adjusted OHLCV aggregated to weeks', 'SPY (market index for RS)', 'industry groups (missing)', 'NYSE breadth (missing)'],
  manualReviewFlags: [
    { id: 'WEIN-MR-STAGE', psr709: ['WEIN-S1', 'WEIN-S2', 'WEIN-NO3', 'WEIN-NO4'], question: 'is this an early Stage 2 breakout out of a Stage 1 base?', blocksAutomation: true },
    { id: 'WEIN-MR-VOLUME', psr709: ['WEIN-VOL', 'WEIN-VOL4'], question: 'is the volume confirmation clear (alternatives A / B / C reported)?', blocksAutomation: true },
    { id: 'WEIN-MR-RS', psr709: ['WEIN-RSNO', 'WEIN-RSZERO'], question: 'is RS negative and still poor (no buy), or below zero but clearly improving?', blocksAutomation: true },
    { id: 'WEIN-MR-OVERHEAD', psr709: ['WEIN-OH'], question: 'strong overhead resistance nearby?', blocksAutomation: true },
    { id: 'WEIN-MR-GROUP', psr709: ['WEIN-GROUP'], question: 'industry group stage (no data in the machine)', blocksAutomation: true },
    { id: 'WEIN-MR-STOP', psr709: ['WEIN-STOP2'], question: 'which correction low is significant for the initial stop?', blocksAutomation: true },
  ],
  knownLimitations: [
    'industry group and market breadth rules are DATA_BLOCKED; the method cannot be fully automated or measured on history',
    'base start = the week the 30-week MA stopped falling (observable turn); a VU reading of "MA30 flattens after a decline", declared',
  ],
  exclusions: { ...sharedExclusions, 'WEIN-TR-CONT': 'Trader method (C05)', 'WEIN-TR-CONT-SIZE': 'Trader method (C05)', 'WEIN-TR-MIX': 'Trader method (C05)', 'WEIN-TR-STOP': 'Trader method (C05)', 'WEIN-TR-TRAIL': 'Trader method (C05)', 'WEIN-TR-EARLY': 'Trader method (C05)', 'WEIN-TR-SELL3': 'Trader method (C05)' },
  rules: [
    ...shared(),
    { id: 'WEIN-SF-INV-BREAKOUT', kind: 'ENTRY', psr709: ['WEIN-BUY1', 'WEIN-BASE'], status: 'SOURCE_DERIVED', rule: 'early Stage 2 breakout: the week whose high exceeds the resistance of the base', derivation: 'resistance = highest weekly high from the week the MA30w last stopped falling (start of the base) to the prior week; no minimum base length (WEIN-BASE: no fixed ten weeks). The stage judgment itself stays manual (WEIN-SF-STAGE).', code: `${CODE}#investorScreen`, tests: [`${T}: GC-WEIN-INVESTOR-CANDIDATE`, `${T}: GC-WEIN-INVESTOR-NO-BASE`] },
    { id: 'WEIN-SF-INV-SIZE', kind: 'SIZING', psr709: ['WEIN-BUY2', 'WEIN-PB', 'WEIN-NOPB', 'WEIN-DIVERS2'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'half of the planned position at the breakout, the other half on a constructive pullback with contracting volume; do not only wait for pullbacks; roughly equal dollar amounts per position' },
    { id: 'WEIN-SF-INV-STOP', kind: 'STOP', psr709: ['WEIN-STOP2'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'investor stop below a significant correction low; the machine proposes the lowest weekly low of the base, the reviewer decides', code: `${CODE}#candidateRecord`, tests: [`${T}: GC-WEIN-INVESTOR-CANDIDATE`] },
    { id: 'WEIN-SF-INV-TRAIL', kind: 'EXIT', psr709: ['WEIN-TRAIL1', 'WEIN-TRAIL2', 'WEIN-TRAIL3', 'WEIN-TRAIL4', 'WEIN-SELL3'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'raise the stop after a significant correction and recovery; protect under the rising MA and the relevant low; a slight MA undercut with intact low is no forced sale; sell half in Stage 3' },
    { id: 'WEIN-SF-VOL5', kind: 'EXIT', essential: false, psr709: ['WEIN-VOL5'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'if the buy stop filled without volume confirmation, sell into the first small strength' },
  ],
});

export const WEINSTEIN_TRADER = defineContract({
  implemented: true,
  plannedIn: 'PR 4 Weinstein',
  strategyId: 'SF_WEINSTEIN_TRADER',
  candidateId: 'C05',
  trader: 'Stan Weinstein',
  method: 'Stage 2 Trader continuation: breakout over new resistance after a consolidation near a clearly rising 30-week MA, full position, tighter trader stop',
  sources: [{ sourceId: 'B09', edition: 'Secrets for Profiting in Bull and Bear Markets, 1988 reprint, English', role: 'authoritative' }],
  scope: { primary: 'MECHANICAL_SCREEN_WITH_MANUAL_LAYER', layers: { MECHANICAL: 'weekly bars, MA30w gate (rising), consolidation high, volume alternatives, RS evidence', MANUAL: 'stage, reaction-low stop, trailing, early exit', DATA_BLOCKED: 'industry group stage, market breadth' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'the completed week whose high exceeds the high of the consolidation', earliestExecutable: 'a reviewer decision after the week closes; never back-filled into history', decisionData: 'weekly bars up to the signal week' },
  entryConditions: ['WEIN-SF-TR-CONT', 'WEIN-SF-MA-GATE'],
  exitConditions: ['WEIN-SF-TR-TRAIL (manual)', 'WEIN-SF-NONTECH'],
  stops: ['WEIN-SF-TR-STOP (proposal below the consolidation low, reviewer decides)'],
  positionSizing: ['WEIN-SF-TR-SIZE (full planned position at the continuation breakout)'],
  requiredData: ['daily split-adjusted OHLCV aggregated to weeks', 'SPY', 'industry groups (missing)', 'NYSE breadth (missing)'],
  manualReviewFlags: [
    { id: 'WEIN-MR-STAGE', psr709: ['WEIN-S2', 'WEIN-S3', 'WEIN-NO3'], question: 'is the stock in Stage 2 (not a Stage 3 top)?', blocksAutomation: true },
    { id: 'WEIN-MR-VOLUME', psr709: ['WEIN-VOL', 'WEIN-VOL4'], question: 'is the volume confirmation clear?', blocksAutomation: true },
    { id: 'WEIN-MR-GROUP', psr709: ['WEIN-GROUP'], question: 'industry group stage (no data in the machine)', blocksAutomation: true },
    { id: 'WEIN-MR-STOP', psr709: ['WEIN-TR-STOP'], question: 'which reaction low is relevant (else about 4-6 % below the breakout and below a round number)?', blocksAutomation: true },
  ],
  knownLimitations: [
    'industry group and market breadth rules are DATA_BLOCKED',
    'consolidation = weeks since the most recent swing high that was not exceeded for at least one week; a VU reading of "consolidation", declared',
  ],
  exclusions: { ...sharedExclusions, 'WEIN-TR-MIX': 'portfolio mix rule of thumb without quota (PREFERENCE)', 'WEIN-BUY1': 'Investor method (C04)', 'WEIN-BUY2': 'Investor method (C04)', 'WEIN-PB': 'Investor method (C04)', 'WEIN-NOPB': 'Investor method (C04)', 'WEIN-BASE': 'Investor method (C04)', 'WEIN-STOP2': 'Investor stop (C04)', 'WEIN-TRAIL1': 'Investor trailing (C04)', 'WEIN-TRAIL2': 'Investor trailing (C04)', 'WEIN-TRAIL3': 'Investor trailing (C04)', 'WEIN-TRAIL4': 'Investor trailing (C04)', 'WEIN-SELL3': 'Investor Stage 3 sale (C04)', 'WEIN-DIVERS2': 'Investor sizing (C04)', 'WEIN-VOL5': 'shared exit rule; see C04' },
  rules: [
    ...shared(),
    { id: 'WEIN-SF-TR-CONT', kind: 'ENTRY', psr709: ['WEIN-TR-CONT'], status: 'SOURCE_DERIVED', rule: 'continuation buy: breakout over new resistance after a consolidation near a clearly rising 30-week MA', derivation: 'MA30w must have risen over the prior week (clearly rising = MA up this week; no slope threshold added); resistance = the most recent weekly swing high that was followed by at least one lower-high week; the week whose high exceeds it is the candidate', code: `${CODE}#traderScreen`, tests: [`${T}: GC-WEIN-TRADER-CANDIDATE`, `${T}: GC-WEIN-TRADER-MA-FLAT`] },
    { id: 'WEIN-SF-TR-SIZE', kind: 'SIZING', psr709: ['WEIN-TR-CONT-SIZE'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'buy the full planned position at the continuation breakout (amount is the reviewer\'s)' },
    { id: 'WEIN-SF-TR-STOP', kind: 'STOP', psr709: ['WEIN-TR-STOP'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'trader stop below the next relevant reaction low; the machine proposes the consolidation low, the reviewer decides', code: `${CODE}#candidateRecord`, tests: [`${T}: GC-WEIN-TRADER-CANDIDATE`] },
    { id: 'WEIN-SF-TR-TRAIL', kind: 'EXIT', psr709: ['WEIN-TR-TRAIL', 'WEIN-TR-EARLY', 'WEIN-TR-SELL3'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'ignore corrections under 7 %; after a significant correction and recovery raise the stop under the reaction low; do not wait for the MA break; exit earlier than investors at a Stage 3 top' },
  ],
});
