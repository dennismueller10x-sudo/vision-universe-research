/**
 * C03 Nicolas Darvas, later Q&A box construction and stop method (#709 B06, How I Made $2,000,000 in the Stock Market,
 * Q&A printed pp. 182-198). The box state machine and its stops are HARD, HIGH, original wording checked (DAR-Q1..Q9).
 * Selection (techno-fundamental), volume judgment, market context, re-entry and sizing stay with a reviewer
 * (#709 C03: "techno-fundamental selection and sizing remain discretionary"). Not a rolling-high breakout.
 */
import { defineContract, EXCLUDE, SF_ROOT } from './define.mjs';
import { OUTPUT_KIND } from '../contract.mjs';

const CODE = `${SF_ROOT}/methods/darvas.mjs`;
const T = 'scripts/supertrader/tests/sf-darvas.test.mjs';

export const DARVAS = defineContract({
  implemented: true,
  componentBacktest: true,
  plannedIn: 'PR 3 Darvas',
  strategyId: 'SF_DARVAS_BOX',
  candidateId: 'C03',
  trader: 'Nicolas Darvas',
  method: 'Later Q&A box construction, buy-stop entry and box stop method (machine component) with manual techno-fundamental layer',
  sources: [{ sourceId: 'B06', edition: 'How I Made $2,000,000 in the Stock Market, Kensington / Lyle Stuart reprint (copyright 1960 / 1971 / 1994), English', role: 'authoritative; Q&A pp. 182-198 for the box rules, chapters for development context' }],
  scope: { primary: 'MECHANICAL_BOX_COMPONENT', layers: { MECHANICAL: 'box state machine, buy stop, initial and raised stops (DAR-Q1..Q9)', MANUAL: 'techno-fundamental selection, volume judgment, market context, sizing, re-entry' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'buy stop resting a fraction above a COMPLETED box top (both boundaries confirmed by the close of the confirming session)', earliestExecutable: 'the first session after the box is complete whose high reaches the trigger; fill = max(open, trigger)', decisionData: 'box boundaries known at the prior close' },
  entryConditions: ['DAR-SF-ENTRY on a box from DAR-SF-TOP + DAR-SF-BOTTOM; DAR-SF-ATH gate'],
  exitConditions: ['stop only (DAR-SF-STOP-INIT, DAR-SF-STOP-RAISE); no profit target (DAR-B7)'],
  stops: ['DAR-SF-STOP-INIT a fraction below the broken top', 'DAR-SF-STOP-RAISE a fraction below the bottom of each new completed higher box, never lowered'],
  positionSizing: ['DAR-SF-SIZING (manual)'],
  dataPartial: ['DAR-Q9: the snapshot series start at the 2015-01-01 warm-up, not at the listing date; the all-time high is only checked within the available history and flagged ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED'],
  requiredData: ['daily split-adjusted OHLC and volume (DAR-Q15)', 'price history from the listing date for the all-time high (DAR-Q9; snapshot history may start later -> flagged)'],
  manualReviewFlags: [
    { id: 'DAR-MR-SELECTION', psr709: ['DAR-Q12', 'DAR-Q14', 'DAR-B9', 'DAR-B10', 'DAR-B11'], question: 'techno-fundamental selection: industry growth expectation, strongest stock of the industry, expected earning power', blocksAutomation: true },
    { id: 'DAR-MR-VOLUME', psr709: ['DAR-Q10', 'DAR-B3'], question: 'volume relative to the stock\'s own history (no general minimum)', blocksAutomation: true },
    { id: 'DAR-MR-MARKET', psr709: ['DAR-Q13', 'DAR-B14'], question: 'market trend and relevant industry representatives', blocksAutomation: true },
    { id: 'DAR-MR-SIZING', psr709: ['DAR-B15', 'DAR-B18', 'DAR-B8'], question: 'position size, pilot buys and adds are the reviewer\'s decision; personal exceptions (DAR-C1, DAR-C3, DAR-C6) are not generalized', blocksAutomation: true },
    { id: 'DAR-MR-FRACTION', psr709: ['DAR-Q4', 'DAR-Q5'], question: '"a fraction": the machine uses one raw cent; the reviewer may set another fraction per trade (DAR-C-THIO)', blocksAutomation: false },
  ],
  knownLimitations: [
    'the full Darvas method (selection, volume, market, sizing) cannot be measured on history: manual decisions are logged forward only',
    'all-time high is evaluated within the snapshot history; when that history does not reach the listing date the flag is ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED',
    'start of the bottom search is UNRESOLVED in #709 (VU-DAR); both readings are supported, default AFTER_TOP_DAY (declared)',
    'component study population: the pre-registered research universe of #705 (raw close >= 5, 20-session dollar volume >= 1M at the prior session), a measurement convention, not a Darvas rule (DAR-Q10: no general minimum)',
  ],
  exclusions: {
    'DAR-Q16': 'no automatic long-exit-to-short reversal (Darvas does not recommend it as a method)',
    'DAR-Q17': 'no rolling 252-day doubling filter (the Q&A refers to a calendar-year data convention); the earlier VU filter is not carried over',
    'DAR-B1': EXCLUDE.documentationOnly + ' (development chapter box notion; precise rules are the later Q&A)',
    'DAR-B2': EXCLUDE.documentationOnly,
    'DAR-B4': 'covered by DAR-SF-ENTRY (buy on entry into the higher box)',
    'DAR-B5': 'covered by DAR-SF-ENTRY (resting buy-stop order)',
    'DAR-B7': 'covered: no profit target, exits only by stop',
    'DAR-B12': EXCLUDE.documentationOnly + ' (historic commission structure)',
    'DAR-B13': EXCLUDE.documentationOnly,
    'DAR-B16': EXCLUDE.documentationOnly,
    'DAR-B17': EXCLUDE.documentationOnly,
  },
  rules: [
    { id: 'DAR-SF-TOP', kind: 'SETUP', psr709: ['DAR-Q1'], status: 'SOURCE_EXACT', rule: 'box top = a new high that is neither touched nor exceeded on the three following sessions; a touch (equal high) or a higher high restarts the count', code: `${CODE}#createDarvasBoxMachine`, tests: [`${T}: GC-DAR-TOP-CONFIRM`, `${T}: GC-DAR-TOP-TOUCH-RESET`, `${T}: GC-DAR-TOP-HIGHER-RESET`] },
    { id: 'DAR-SF-BOTTOM', kind: 'SETUP', psr709: ['DAR-Q2'], status: 'SOURCE_EXACT', rule: 'box bottom only after the top is established; reverse three-day procedure on the lows; a re-touch of the bottom restarts the count', code: `${CODE}#createDarvasBoxMachine`, tests: [`${T}: GC-DAR-BOTTOM-CONFIRM`, `${T}: GC-DAR-BOTTOM-TOUCH-RESET`] },
    { id: 'DAR-SF-BOTTOM-START', kind: 'SETUP', essential: false, psr709: ['DAR-Q2'], status: 'SOURCE_AMBIGUOUS', rule: 'start of the bottom search', reason: '#709 VU-DAR records the start (after the top day vs after top confirmation) as UNRESOLVED; both are implemented and the record names the variant. Default AFTER_TOP_DAY: lows already traded after the top day are not discarded, so the bottom (and a stop raised under it) never lies inside the traded range (review SF-R1-04); AFTER_TOP_CONFIRMED is the variant', code: `${CODE}#createDarvasBoxMachine`, tests: [`${T}: GC-DAR-BOTTOM-START-VARIANTS`] },
    { id: 'DAR-SF-TOP-EXCEEDED', kind: 'SETUP', psr709: ['DAR-Q1', 'DAR-Q2'], status: 'SOURCE_DERIVED', rule: 'a high above the confirmed top before the bottom is confirmed: no complete box yet, the top search restarts at that high', derivation: 'the bottom is only established under a fixed top (DAR-Q2); a higher high means the top was not final (DAR-Q1)', code: `${CODE}#createDarvasBoxMachine`, tests: [`${T}: GC-DAR-TOP-EXCEEDED-BEFORE-BOTTOM`] },
    { id: 'DAR-SF-BOX-FAIL', kind: 'SETUP', psr709: ['DAR-Q11'], status: 'SOURCE_DERIVED', gate: false, rule: 'a low below the completed box bottom before a breakout dissolves the box; the top search restarts', derivation: 'DAR-Q11 (CONTEXTUAL) describes selling on the stop after a lower box break; for a box without position the box simply no longer exists. State transition, not a selection filter.', code: `${CODE}#createDarvasBoxMachine`, tests: [`${T}: GC-DAR-BOX-FAIL`] },
    { id: 'DAR-SF-NO-WAIT', kind: 'ENTRY', psr709: ['DAR-Q3'], status: 'SOURCE_EXACT', rule: 'the three days confirm boundaries only; there is no waiting period after the breakout', code: `${CODE}#createDarvasBoxMachine`, tests: [`${T}: GC-DAR-BREAKOUT-NO-WAIT`] },
    { id: 'DAR-SF-ENTRY', kind: 'ENTRY', psr709: ['DAR-Q4'], status: 'SOURCE_DERIVED', rule: 'buy-stop order prepared a fraction above the completed box top, executed on the breakthrough', derivation: '"a fraction" is not quantified: VU convention = one raw cent converted to the split-adjusted basis (the smallest price increment); fill = max(open, trigger) on daily bars; the reviewer may set a different fraction (DAR-C-THIO)', code: `${CODE}#createDarvasBoxMachine`, tests: [`${T}: GC-DAR-BREAKOUT-NO-WAIT`, `${T}: GC-DAR-GAP-OPEN-FILL`] },
    { id: 'DAR-SF-PROTECT', kind: 'STOP', psr709: ['DAR-B6'], status: 'SOURCE_EXACT', rule: 'every buy is protected by a stop-loss order placed at the same time', code: `${CODE}#darvasPosition`, tests: [`${T}: GC-DAR-STOP-PATH`] },
    { id: 'DAR-SF-STOP-INIT', kind: 'STOP', psr709: ['DAR-Q5', 'DAR-Q7'], status: 'SOURCE_DERIVED', rule: 'initial stop a fraction below the broken box top, never inside the box', derivation: 'same one-cent fraction as DAR-SF-ENTRY; on the entry bar a low at or below the stop exits (pessimistic daily-bar order)', code: `${CODE}#darvasPosition`, tests: [`${T}: GC-DAR-STOP-PATH`, `${T}: GC-DAR-ENTRY-BAR-STOP`] },
    { id: 'DAR-SF-STOP-RAISE', kind: 'STOP', psr709: ['DAR-Q6', 'DAR-Q8'], status: 'SOURCE_DERIVED', rule: 'when a new higher box has both boundaries, raise the stop to a fraction below its bottom; never lower it; the new bottom need not equal the old top', derivation: 'one-cent fraction; the raised stop is effective from the session after the box is complete (no same-day information)', code: `${CODE}#darvasPosition`, tests: [`${T}: GC-DAR-STOP-PATH`, `${T}: GC-DAR-STOP-NEVER-LOWER`] },
    { id: 'DAR-SF-ATH', kind: 'FILTER', psr709: ['DAR-Q9'], status: 'SOURCE_DERIVED', gate: true, rule: 'the breakout must be to an all-time high', derivation: 'evaluated against every earlier bar of the available (split-adjusted) history; if that history does not reach the listing date the record is ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED and goes to review', code: `${CODE}#darvasScreen`, tests: [`${T}: GC-DAR-ATH-GATE`, `${T}: GC-DAR-ATH-UNVERIFIED`] },
    { id: 'DAR-SF-SPLITS', gate: false, kind: 'INDICATOR', essential: false, psr709: ['DAR-Q15'], status: 'SOURCE_DERIVED', rule: 'use split-adjusted price history; the number of splits is no buy signal', derivation: 'the snapshot convention (adjustSeries, ADR-002) supplies split-adjusted bars; raw prices only for the one-cent fraction', code: `${CODE}#fractionFor`, tests: [`${T}: GC-DAR-FRACTION`] },
    { id: 'DAR-SF-RESEARCH-POPULATION', kind: 'FILTER', essential: false, gate: true, psr709: [], status: 'SOURCE_DERIVED', rule: 'component study population: research universe protocol of #705 (identical for every method)', derivation: 'measurement convention for the diagnostic component study only; Darvas sets no general volume or liquidity minimum (DAR-Q10); the review screen itself applies no such filter (review SF-R1-05)', code: 'scripts/supertrader/source-faithful/runner/run-research.mjs#componentStudy', tests: ['scripts/supertrader/tests/sf-runner.test.mjs: SF-RUN-COMPONENT'] },
    { id: 'DAR-SF-SELECTION', kind: 'SETUP', psr709: ['DAR-Q12', 'DAR-Q14', 'DAR-B9', 'DAR-B10', 'DAR-B11'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'techno-fundamental selection (industry growth, strongest stock of the industry, earning power)' },
    { id: 'DAR-SF-VOLUME', kind: 'FILTER', psr709: ['DAR-Q10', 'DAR-B3'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'volume relative to the stock\'s own history; the machine reports breakout-day volume against its own prior sessions as evidence' },
    { id: 'DAR-SF-MARKET', kind: 'FILTER', psr709: ['DAR-Q13', 'DAR-B14'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'market trend and industry representatives' },
    { id: 'DAR-SF-SIZING', kind: 'SIZING', psr709: ['DAR-B15', 'DAR-B18'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'position size and pilot buys' },
    { id: 'DAR-SF-PYRAMID', kind: 'PYRAMIDING', essential: false, psr709: ['DAR-B8'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'further buys while the confirmed up-trend continues (no absolute "every add above every earlier fill", DAR-C3)' },
    { id: 'DAR-SF-REENTRY', kind: 'ENTRY', essential: false, psr709: ['DAR-Q11'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'after a stop-out new all-time highs can allow a re-entry; the machine reports later boxes, the reviewer decides' },
  ],
});
