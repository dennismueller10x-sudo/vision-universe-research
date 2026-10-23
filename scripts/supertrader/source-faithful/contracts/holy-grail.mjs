/**
 * C13 Linda Raschke Holy Grail, disclosed setup component (#709 W-RAS04, 2004 interview, own quotes, HIGH, checked).
 * HARD: ADX(14) > 30 on the same timeframe before the pullback (RAS04-002); 3/10 SMA oscillator with SMA16 signal line
 * (RAS04-004). The setup itself is the first pullback to the 20 EMA after a strong impulse (RAS04-001). Exact stop and
 * order sequence are not disclosed (#709 C13). RAS04-006 allows several timeframes; the daily timeframe is the one the
 * snapshot holds. Component study, not a personal replica.
 * Owner decision D-RAS97 (2026-10-23): entry order and initial stop rest on the explicitly labelled SECONDARY source
 * W-RAS97 (SOURCE_DERIVED with sourceBasis SECONDARY_SOURCE, never SOURCE_EXACT); the lifecycle is not source-conform.
 */
import { defineContract, SF_ROOT, sf5Evidence } from './define.mjs';
import { OUTPUT_KIND } from '../contract.mjs';

const CODE = `${SF_ROOT}/methods/holy-grail.mjs`;
const T = 'scripts/supertrader/tests/sf-holy-grail.test.mjs';

export const HOLY_GRAIL = defineContract({
  implemented: true,
  sourceContractVersion: '1.2.0',
  plannedIn: 'PR 8 Holy Grail',
  strategyId: 'SF_RASCHKE_HOLY_GRAIL',
  candidateId: 'C13',
  trader: 'Linda Raschke',
  method: 'Holy Grail disclosed setup component: first pullback to the 20 EMA after ADX(14) > 30 on the same (daily) timeframe',
  sources: [{ sourceId: 'W-RAS04', edition: 'Linda Raschke 2004 interview (web primary PDF), own quotes', role: 'authoritative for the disclosed component' }, { sourceId: 'W-RAS97', edition: 'AIQ Opening Bell Vol. 6 Issue 8 (August 1997), sidebar "Holy Grail Pattern", hosted on lindaraschke.net (sha256 693ce571...)', role: 'SECONDARY SOURCE for entry order and initial stop only (owner decision D-RAS97, 2026-10-23); most likely an editorial summary, not the author\'s wording' }],
  scope: { primary: 'MECHANICAL_SCREEN_WITH_MANUAL_LAYER', layers: { MECHANICAL: 'ADX(14) > 30, first 20-EMA pullback, 3/10 oscillator evidence (daily)', MANUAL: 'entry order, stop, exit (not disclosed)', DATA_BLOCKED: 'intraday timeframes (5-120 minutes)' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'daily close of the first bar whose low touches the 20 EMA after ADX(14) > 30', earliestExecutable: 'reviewer decision after the close (entry order not disclosed)', decisionData: 'daily bars up to the close; ADX at the bar before the pullback' },
  entryConditions: ['RAS-SF-ADX + RAS-SF-PULLBACK (machine), RAS-SF-ENTRY (secondary source W-RAS97)'],
  exitConditions: ['RAS-SF-EXIT (new high as exit opportunity, preference)'],
  stops: ['RAS-SF-STOP (secondary source W-RAS97: newly formed swing low)'],
  positionSizing: ['RAS-SF-SIZE (not disclosed)'],
  requiredData: ['daily split-adjusted OHLC', 'intraday bars for the intraday timeframes (missing)'],
  manualReviewFlags: [
    { id: 'RAS-MR-IMPULSE', psr709: ['RAS04-001'], question: 'strong impulse before the pullback?', blocksAutomation: true },
    { id: 'RAS-MR-EXECUTION', psr709: ['RAS04-001'], question: 'entry order, stop and exit are not disclosed', blocksAutomation: true },
  ],
  knownLimitations: ['the primary source W-RAS04 discloses neither entry order nor stop (#709 C13); both rest on the secondary source W-RAS97 (D-RAS97), trailing and size stay undisclosed, so no historical method return can be computed', 'intraday timeframes DATA_BLOCKED; the daily component is the disclosed rule on one allowed timeframe (RAS04-006). #712 rated Holy Grail DATA_BLOCKED for the intraday case; the daily case is computable'],
  exclusions: {},
  rules: [
    { id: 'RAS-SF-ADX', kind: 'FILTER', gate: true, psr709: ['RAS04-002'], status: 'SOURCE_EXACT', rule: 'ADX(14) > 30 on the same timeframe before the pullback (Wilder ADX)', code: `${CODE}#adx`, tests: [`${T}: GC-RAS-ADX-WILDER`, `${T}: GC-RAS-ADX-BELOW-30`] },
    { id: 'RAS-SF-PULLBACK', kind: 'SETUP', gate: true, gateExemption: 'SETUP_DEFINITION_C13', psr709: ['RAS04-001'], status: 'SOURCE_DERIVED', rule: 'pullback to the 20 EMA after the ADX condition (the C13 core "20EMA/ADX14>30")', derivation: 'daily: gate = a bar whose low touches or crosses the 20 EMA while ADX(14) > 30 and +DI > -DI on the prior bar. Whether it is the FIRST pullback since ADX rose above 30 and whether the impulse was strong are reported as evidence and review flags, not as rejections (review SF-R2-02)', code: `${CODE}#holyGrailScreen`, tests: [`${T}: GC-RAS-FIRST-PULLBACK`, `${T}: GC-RAS-SECOND-PULLBACK-NOT-FIRST`] },
    { id: 'RAS-SF-OSC', kind: 'INDICATOR', essential: false, psr709: ['RAS04-004'], status: 'SOURCE_EXACT', rule: '3/10 oscillator = SMA3 - SMA10 of the close; signal line = SMA16 of the oscillator', code: `${CODE}#oscillator310`, tests: [`${T}: GC-RAS-OSC-310`] },
    { id: 'RAS-SF-OSC-HIGH', kind: 'SETUP', essential: false, psr709: ['RAS04-005'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'best setups with new oscillator momentum highs; reported as evidence' },
    { id: 'RAS-SF-TIMEFRAME', gate: false, kind: 'SETUP', essential: false, psr709: ['RAS04-006'], status: 'SOURCE_DERIVED', rule: 'timeframes are separate; 5 / 15 / 30 / 60 / 120 minutes possible', derivation: 'only the daily timeframe exists in the snapshot; intraday timeframes DATA_BLOCKED', code: `${CODE}#holyGrailScreen`, tests: [`${T}: GC-RAS-FIRST-PULLBACK`] },
    { id: 'RAS-SF-ENTRY', kind: 'ENTRY', gate: false, psr709: ['RAS04-001'], status: 'SOURCE_DERIVED', sourceBasis: 'SECONDARY_SOURCE', secondarySource: 'W-RAS97', ownerDecision: 'D-RAS97 2026-10-23', rule: 'entry order after the pullback: buy stop above the high of the previous bar', derivation: 'SECONDARY SOURCE, not the author\'s own wording: W-RAS97 (AIQ Opening Bell, August 1997, sidebar "Holy Grail Pattern", hosted on lindaraschke.net) states the buy stop above the high of the previous bar; accepted as an explicitly labelled secondary source by owner decision D-RAS97 (2026-10-23). Which bar is "previous" stays a model assumption (MA-RAS-PREVIOUS-BAR); never SOURCE_EXACT; the lifecycle is not thereby source-conform (no trailing mechanics, size not disclosed)', code: `${SF_ROOT}/research/holy-grail-lifecycle.mjs#HOLY_GRAIL_RESEARCH_ADAPTER`, tests: ['scripts/supertrader/tests/sf-sf5-kk-moka-lifecycle.test.mjs: GC-SF5-HG-RESEARCH-VARIANT', 'scripts/supertrader/tests/sf-sf5-owner-decisions.test.mjs: SF5-OD-RAS97-SECONDARY-SOURCE'], researchEvidence: [sf5Evidence('holy-grail-lifecycle.mjs', 'HOLY_GRAIL_RESEARCH_ADAPTER', [['sf-sf5-kk-moka-lifecycle', 'GC-SF5-HG-RESEARCH-VARIANT']], 'Supertrader 5.0 research variant W-RAS97: buy stop above the previous bar; secondary source accepted (D-RAS97, 2026-10-23)')] },
    { id: 'RAS-SF-STOP', kind: 'STOP', gate: false, psr709: ['RAS04-001'], status: 'SOURCE_DERIVED', sourceBasis: 'SECONDARY_SOURCE', secondarySource: 'W-RAS97', ownerDecision: 'D-RAS97 2026-10-23', rule: 'initial stop: protective sell stop at the newly formed swing low', derivation: 'SECONDARY SOURCE, not the author\'s own wording: W-RAS97 states the protective sell stop at the newly formed swing low once filled; accepted as an explicitly labelled secondary source by owner decision D-RAS97 (2026-10-23). The swing definition stays a model assumption (MA-RAS-SWING-LOW); never SOURCE_EXACT', code: `${SF_ROOT}/research/holy-grail-lifecycle.mjs#holyGrailSetupSeries`, tests: ['scripts/supertrader/tests/sf-sf5-kk-moka-lifecycle.test.mjs: GC-SF5-HG-RESEARCH-VARIANT', 'scripts/supertrader/tests/sf-sf5-owner-decisions.test.mjs: SF5-OD-RAS97-SECONDARY-SOURCE'], researchEvidence: [sf5Evidence('holy-grail-lifecycle.mjs', 'holyGrailSetupSeries', [['sf-sf5-kk-moka-lifecycle', 'GC-SF5-HG-RESEARCH-VARIANT']], 'Supertrader 5.0 research variant W-RAS97: protective stop at the newly formed swing low; secondary source accepted (D-RAS97, 2026-10-23)')] },
    { id: 'RAS-SF-EXIT', kind: 'EXIT', psr709: ['RAS04-003'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'a new high is an exit opportunity (preference)' },
    { id: 'RAS-SF-SIZE', kind: 'SIZING', psr709: [], status: 'SOURCE_AMBIGUOUS', rule: 'position size', reason: 'not disclosed for the Holy Grail setup' },
  ],
});
