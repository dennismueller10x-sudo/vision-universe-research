/**
 * C13 Linda Raschke Holy Grail, disclosed setup component (#709 W-RAS04, 2004 interview, own quotes, HIGH, checked).
 * HARD: ADX(14) > 30 on the same timeframe before the pullback (RAS04-002); 3/10 SMA oscillator with SMA16 signal line
 * (RAS04-004). The setup itself is the first pullback to the 20 EMA after a strong impulse (RAS04-001). Exact stop and
 * order sequence are not disclosed (#709 C13). RAS04-006 allows several timeframes; the daily timeframe is the one the
 * snapshot holds. Component study, not a personal replica.
 */
import { defineContract, SF_ROOT } from './define.mjs';
import { OUTPUT_KIND } from '../contract.mjs';

const CODE = `${SF_ROOT}/methods/holy-grail.mjs`;
const T = 'scripts/supertrader/tests/sf-holy-grail.test.mjs';

export const HOLY_GRAIL = defineContract({
  implemented: true,
  plannedIn: 'PR 8 Holy Grail',
  strategyId: 'SF_RASCHKE_HOLY_GRAIL',
  candidateId: 'C13',
  trader: 'Linda Raschke',
  method: 'Holy Grail disclosed setup component: first pullback to the 20 EMA after ADX(14) > 30 on the same (daily) timeframe',
  sources: [{ sourceId: 'W-RAS04', edition: 'Linda Raschke 2004 interview (web primary PDF), own quotes', role: 'authoritative for the disclosed component' }],
  scope: { primary: 'MECHANICAL_SCREEN_WITH_MANUAL_LAYER', layers: { MECHANICAL: 'ADX(14) > 30, first 20-EMA pullback, 3/10 oscillator evidence (daily)', MANUAL: 'entry order, stop, exit (not disclosed)', DATA_BLOCKED: 'intraday timeframes (5-120 minutes)' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'daily close of the first bar whose low touches the 20 EMA after ADX(14) > 30', earliestExecutable: 'reviewer decision after the close (entry order not disclosed)', decisionData: 'daily bars up to the close; ADX at the bar before the pullback' },
  entryConditions: ['RAS-SF-ADX + RAS-SF-PULLBACK (machine), RAS-SF-ENTRY (not disclosed)'],
  exitConditions: ['RAS-SF-EXIT (new high as exit opportunity, preference)'],
  stops: ['RAS-SF-STOP (not disclosed)'],
  positionSizing: ['RAS-SF-SIZE (not disclosed)'],
  requiredData: ['daily split-adjusted OHLC', 'intraday bars for the intraday timeframes (missing)'],
  manualReviewFlags: [
    { id: 'RAS-MR-IMPULSE', psr709: ['RAS04-001'], question: 'strong impulse before the pullback?', blocksAutomation: true },
    { id: 'RAS-MR-EXECUTION', psr709: ['RAS04-001'], question: 'entry order, stop and exit are not disclosed', blocksAutomation: true },
  ],
  knownLimitations: ['exact stop and order sequence not disclosed (#709 C13); no historical method return can be computed', 'intraday timeframes DATA_BLOCKED; the daily component is the disclosed rule on one allowed timeframe (RAS04-006). #712 rated Holy Grail DATA_BLOCKED for the intraday case; the daily case is computable'],
  exclusions: {},
  rules: [
    { id: 'RAS-SF-ADX', kind: 'FILTER', gate: true, psr709: ['RAS04-002'], status: 'SOURCE_EXACT', rule: 'ADX(14) > 30 on the same timeframe before the pullback (Wilder ADX)', code: `${CODE}#adx`, tests: [`${T}: GC-RAS-ADX-WILDER`, `${T}: GC-RAS-ADX-BELOW-30`] },
    { id: 'RAS-SF-PULLBACK', kind: 'SETUP', gate: true, gateExemption: 'SETUP_DEFINITION: the first pullback to the 20 EMA is the definition of the Holy Grail setup, not a filter applied to another method', psr709: ['RAS04-001'], status: 'SOURCE_DERIVED', rule: 'first pullback to the 20 EMA after the ADX condition', derivation: 'daily: the first bar whose low touches or crosses the 20 EMA after ADX(14) > 30 was reached and while ADX stayed > 30 on the prior bar; "first" = no earlier touch since ADX crossed above 30; impulse strength is reviewer evidence', code: `${CODE}#holyGrailScreen`, tests: [`${T}: GC-RAS-FIRST-PULLBACK`, `${T}: GC-RAS-SECOND-PULLBACK-NOT-FIRST`] },
    { id: 'RAS-SF-OSC', kind: 'INDICATOR', essential: false, psr709: ['RAS04-004'], status: 'SOURCE_EXACT', rule: '3/10 oscillator = SMA3 - SMA10 of the close; signal line = SMA16 of the oscillator', code: `${CODE}#oscillator310`, tests: [`${T}: GC-RAS-OSC-310`] },
    { id: 'RAS-SF-OSC-HIGH', kind: 'SETUP', essential: false, psr709: ['RAS04-005'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'best setups with new oscillator momentum highs; reported as evidence' },
    { id: 'RAS-SF-TIMEFRAME', kind: 'SETUP', essential: false, psr709: ['RAS04-006'], status: 'SOURCE_DERIVED', rule: 'timeframes are separate; 5 / 15 / 30 / 60 / 120 minutes possible', derivation: 'only the daily timeframe exists in the snapshot; intraday timeframes DATA_BLOCKED', code: `${CODE}#holyGrailScreen`, tests: [`${T}: GC-RAS-FIRST-PULLBACK`] },
    { id: 'RAS-SF-ENTRY', kind: 'ENTRY', psr709: ['RAS04-001'], status: 'SOURCE_AMBIGUOUS', rule: 'entry order after the pullback', reason: 'order sequence not fully disclosed (#709 C13)' },
    { id: 'RAS-SF-STOP', kind: 'STOP', psr709: ['RAS04-001'], status: 'SOURCE_AMBIGUOUS', rule: 'initial stop', reason: 'stop not fully disclosed (#709 C13)' },
    { id: 'RAS-SF-EXIT', kind: 'EXIT', psr709: ['RAS04-003'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'a new high is an exit opportunity (preference)' },
    { id: 'RAS-SF-SIZE', kind: 'SIZING', psr709: [], status: 'SOURCE_AMBIGUOUS', rule: 'position size', reason: 'not disclosed for the Holy Grail setup' },
  ],
});
