/**
 * C11 Gil Morales / Chris Kacher Pocket Pivot, C12 Buyable Gap-Up (#709 W-MOKAPP, W-MOKA12, W-MOKASTOP, W-MOKAV24;
 * WEB_PRIMARY, HIGH, original wording checked). HARD: MOKAPP-003 (volume > highest down-day volume of the prior ten
 * days), MOKA12-004 (gap >= 0.75 x ATR40), MOKA24-VOL (150 % OF the average = 1.5x). Everything else (constructive
 * base, theme, 10DMA context, V-shape, wedging, extension, exits) is preference or context and goes to the reviewer.
 * A passed screen is a review candidate, never a buy decision.
 */
import { defineContract, EXCLUDE, SF_ROOT } from './define.mjs';
import { OUTPUT_KIND } from '../contract.mjs';

const CODE = `${SF_ROOT}/methods/morales-kacher.mjs`;
const T = 'scripts/supertrader/tests/sf-morales-kacher.test.mjs';
const SOURCES = [
  { sourceId: 'W-MOKAPP', edition: 'Morales / Kacher, Pocket Pivot rules (web primary)', role: 'authoritative' },
  { sourceId: 'W-MOKA12', edition: 'Morales / Kacher 2012 presentation (web primary PDF)', role: 'authoritative (BGU, exits)' },
  { sourceId: 'W-MOKASTOP', edition: 'Morales / Kacher on selling / stops (web primary)', role: 'exits' },
  { sourceId: 'W-MOKAV24', edition: 'Gil Morales 2024 BGU volume note incl. MCD (web primary)', role: 'current volume definition and megacap exception' },
];
const exitRules = () => [
  { id: 'MOKA-SF-EXIT-MA', kind: 'EXIT', psr709: ['MOKA12-008', 'MOKASTOP-001'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'sell guide: 10DMA if the stock respected it for >= 7 weeks, otherwise 50DMA (preference)' },
  { id: 'MOKA-SF-EXIT-VIOLATION', kind: 'EXIT', variants: ['NEXT_DAY (2012 slide)', 'LATER_DAYS (FAQ)'], psr709: ['MOKA12-009', 'MOKASTOP-002'], status: 'SOURCE_AMBIGUOUS', rule: 'MA violation = close below the MA, then a later undercut of that day\'s low', reason: 'MOKA-C2: the 2012 slide says the next day, the FAQ says later days; both readings kept, reported as evidence, no automatic exit', code: `${CODE}#maViolationEvidence`, tests: [`${T}: GC-MOKA-MA-VIOLATION-BOTH-READINGS`] },
  { id: 'MOKA-SF-EXIT-GUIDE-EVIDENCE', kind: 'EXIT', essential: false, gate: false, psr709: ['MOKA12-008', 'MOKASTOP-001'], status: 'SOURCE_DERIVED', rule: 'report which sell guide (10DMA after >= 7 weeks of respect, else 50DMA) the printed preference points to', derivation: 'evidence only, never an exit: 7 weeks = 35 sessions (5 per week); "respected" = no confirmed 10DMA violation, evaluated under both MOKA-C2 readings (next day / later days) because the violation itself is SOURCE_AMBIGUOUS; replaces the former NOT_IMPLEMENTED placeholder MOKA-SF-PP-EXIT-PPX (sf-morales-kacher-1.1.0)', code: `${CODE}#sellGuideEvidence`, tests: ['scripts/supertrader/tests/sf-moka-completion.test.mjs: GC-MOKA-SELL-GUIDE-RESPECTED', 'scripts/supertrader/tests/sf-moka-completion.test.mjs: GC-MOKA-SELL-GUIDE-READINGS-DIFFER'] },
  { id: 'MOKA-SF-EXIT-CONTEXT', kind: 'EXIT', essential: false, psr709: ['MOKASTOP-003', 'MOKASTOP-004', 'MOKASTOP-005'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'weak market, partial vs full exit (Gil vs Chris), lagging names in a strong market are reviewer decisions' },
];

export const POCKET_PIVOT = defineContract({
  implemented: true,
  sourceContractVersion: '1.1.0',
  plannedIn: 'PR 5 Pocket Pivot / BGU',
  strategyId: 'SF_MOKA_POCKET_PIVOT',
  candidateId: 'C11',
  trader: 'Gil Morales / Chris Kacher',
  method: 'Pocket Pivot volume signature (machine) with manual chart / fundamental context and exits',
  sources: SOURCES,
  scope: { primary: 'MECHANICAL_SCREEN_WITH_MANUAL_LAYER', layers: { MECHANICAL: 'down-volume comparison (MOKAPP-003), MA distance evidence', MANUAL: 'constructive base, theme, extension, exits' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'daily close of the candidate day (its full volume is known only then)', earliestExecutable: 'reviewer decision after the close; intraday projected volume is not available', decisionData: 'daily bars up to the close' },
  entryConditions: ['MOKA-SF-PP-VOLUME + MOKA-SF-PP-UPDAY (machine), MOKA-SF-PP-CONTEXT (manual)'],
  exitConditions: ['MOKA-SF-EXIT-MA, MOKA-SF-EXIT-VIOLATION (manual / ambiguous)'],
  stops: ['MOKA-SF-PP-STOP (manual)'],
  positionSizing: ['MOKA-SF-PP-SIZE (manual)'],
  requiredData: ['daily split-adjusted close and volume (same adjustment basis in the window)'],
  manualReviewFlags: [
    { id: 'MOKA-MR-BASE', psr709: ['MOKAPP-001', 'MOKAPP-006', 'MOKAPP-008', 'MOKAPP-009'], question: 'constructive base; no multi-month downtrend, no V-shape after a hard break, no wedging', blocksAutomation: true },
    { id: 'MOKA-MR-THEME', psr709: ['MOKAPP-002'], question: 'strong fundamentals or a convincing theme', blocksAutomation: true },
    { id: 'MOKA-MR-EXT', psr709: ['MOKAPP-004', 'MOKAPP-007', 'MOKAPP-010'], question: 'position relative to the 10DMA / critical MA; not extended', blocksAutomation: true },
  ],
  knownLimitations: ['the full method (context and exits) cannot be measured on history; only the volume signature is mechanical'],
  exclusions: { 'MOKA12-001': 'reviewer context (early base vs continuation pivot)', 'MOKA12-002': EXCLUDE.documentationOnly, 'MOKAPP-005': EXCLUDE.optionalVariant + ' (gap / classic breakout as additional confirmation)', 'MOKA12-010': 'proprietary Market Direction Model, not reproducible', 'MOKA12-011': 'proprietary Market Direction Model, not reproducible', 'MOKASTOP-006': 'BGU exit (C12)', 'MOKA12-003': 'BGU (C12)', 'MOKA12-004': 'BGU (C12)', 'MOKA12-005': 'BGU (C12)', 'MOKA12-006': 'BGU (C12)', 'MOKA12-007': 'BGU (C12)', 'MOKA24-VOL': 'BGU (C12)', 'MOKA24-MEGA': 'BGU (C12)' },
  rules: [
    { id: 'MOKA-SF-PP-VOLUME', kind: 'SETUP', gate: true, psr709: ['MOKAPP-003'], status: 'SOURCE_EXACT', rule: 'volume of the candidate day is greater than the highest down-day volume of the ten prior sessions (strictly greater)', code: `${CODE}#pocketPivotAt`, tests: [`${T}: GC-PP-SIGNATURE`, `${T}: GC-PP-EQUAL-NOT-GREATER`, `${T}: GC-PP-WINDOW-10`] },
    { id: 'MOKA-SF-PP-DOWNDAY', kind: 'SETUP', essential: false, psr709: ['MOKAPP-003'], status: 'SOURCE_DERIVED', rule: 'a down day closes below the previous close; a window without a down day yields NO_DOWN_DAY_IN_WINDOW (no comparison, no candidate)', derivation: 'the source compares against down-day volume and does not define "down day"; close-to-close is the conventional reading', code: `${CODE}#pocketPivotAt`, tests: [`${T}: GC-PP-NO-DOWN-DAY`] },
    { id: 'MOKA-SF-PP-UPDAY', kind: 'SETUP', essential: false, psr709: ['MOKAPP-003'], status: 'SOURCE_DERIVED', rule: 'the candidate day itself closes above the previous close', derivation: 'a pocket pivot is a buy point on an up day; a down day with large volume is not a pocket pivot', code: `${CODE}#pocketPivotAt`, tests: [`${T}: GC-PP-DOWN-DAY-REJECT`] },
    { id: 'MOKA-SF-PP-CONTEXT', kind: 'SETUP', psr709: ['MOKAPP-001', 'MOKAPP-002', 'MOKAPP-004', 'MOKAPP-006', 'MOKAPP-007', 'MOKAPP-008', 'MOKAPP-009', 'MOKAPP-010'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'base, theme, 10DMA / critical MA position, no V-shape, no wedging, not extended; the machine reports the distances to the 10 / 50 / 200-day MAs as evidence', code: `${CODE}#pocketPivotScreen`, tests: [`${T}: GC-PP-EXTENSION-IS-EVIDENCE`] },
    { id: 'MOKA-SF-PP-STOP', kind: 'STOP', psr709: ['MOKAPP-004'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'stop / sell guide decided by the reviewer (no numeric stop in the Pocket Pivot rules)' },
    { id: 'MOKA-SF-PP-SIZE', kind: 'SIZING', psr709: ['MOKAPP-002'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'sizing not specified in #709; reviewer decision' },
    ...exitRules(),
  ],
});

export const BUYABLE_GAP_UP = defineContract({
  implemented: true,
  sourceContractVersion: '1.1.0',
  plannedIn: 'PR 5 Pocket Pivot / BGU',
  strategyId: 'SF_MOKA_BUYABLE_GAP_UP',
  candidateId: 'C12',
  trader: 'Gil Morales / Chris Kacher',
  method: 'Buyable Gap-Up: gap >= 0.75 x ATR40 with standard volume 1.5x (megacap exception), gap-day low as sell guide',
  sources: SOURCES,
  scope: { primary: 'MECHANICAL_SCREEN_WITH_MANUAL_LAYER', layers: { MECHANICAL: 'gap vs ATR40, volume ratio, sell guide', MANUAL: 'leadership / theme, prior trend, megacap exception, exits', SOURCE_AMBIGUOUS: 'volume averaging window' } },
  outputKind: OUTPUT_KIND.MANUAL_REVIEW_CANDIDATE,
  timing: { signal: 'daily close of the gap day (full-day volume)', earliestExecutable: 'reviewer decision after the close; intraday projected volume is not available', decisionData: 'ATR40 and the volume mean from sessions before the gap day; the gap from the gap-day open' },
  entryConditions: ['MOKA-SF-BGU-GAP + MOKA-SF-BGU-VOLUME (machine), MOKA-SF-BGU-CONTEXT (manual)'],
  exitConditions: ['MOKA-SF-BGU-SELLGUIDE (gap-day low), MOKA-SF-EXIT-MA (manual)'],
  stops: ['MOKA-SF-BGU-SELLGUIDE: gap-day low as risk reference (at least half sold below it, preference)'],
  positionSizing: ['MOKA-SF-BGU-SIZE (manual)'],
  requiredData: ['daily split-adjusted OHLCV', 'market capitalisation PIT for the megacap judgment (partial)'],
  dataPartial: ['MOKA24-MEGA: point-in-time market capitalisation for the megacap exception is not in the snapshot; the reviewer judges it', 'intraday projected volume (daily variant only)'],
  manualReviewFlags: [
    { id: 'MOKA-MR-LEAD', psr709: ['MOKA12-003', 'MOKA12-006'], question: 'strong leadership or theme; uptrend or constructive consolidation before the gap', blocksAutomation: true },
    { id: 'MOKA-MR-MEGA', psr709: ['MOKA24-MEGA'], question: 'volume below 1.5x: does the megacap exception apply (MCD accepted at +47.09 %)?', blocksAutomation: true },
    { id: 'MOKA-MR-VOLWINDOW', psr709: ['MOKA24-VOL'], question: 'the averaging window of "average volume" is not recorded in #709; the 50-session ratio is shown with the 1.5x reading', blocksAutomation: true },
  ],
  knownLimitations: ['averaging window of the volume standard not recorded in #709 (SOURCE_AMBIGUOUS)', 'daily variant only: evaluated with full-day volume after the close'],
  exclusions: { 'MOKAPP-001': 'Pocket Pivot (C11)', 'MOKAPP-002': 'Pocket Pivot (C11)', 'MOKAPP-003': 'Pocket Pivot (C11)', 'MOKAPP-004': 'Pocket Pivot (C11)', 'MOKAPP-005': 'Pocket Pivot (C11)', 'MOKAPP-006': 'Pocket Pivot (C11)', 'MOKAPP-007': 'Pocket Pivot (C11)', 'MOKAPP-008': 'Pocket Pivot (C11)', 'MOKAPP-009': 'Pocket Pivot (C11)', 'MOKAPP-010': 'Pocket Pivot (C11)', 'MOKA12-001': 'Pocket Pivot (C11)', 'MOKA12-002': EXCLUDE.documentationOnly, 'MOKA12-010': 'proprietary Market Direction Model, not reproducible', 'MOKA12-011': 'proprietary Market Direction Model, not reproducible', 'MOKA12-005': '2012 wording UNKNOWN / LOW, superseded for the standard by MOKA24-VOL (MOKA-C1)' },
  rules: [
    { id: 'MOKA-SF-BGU-GAP', kind: 'SETUP', gate: true, psr709: ['MOKA12-004'], status: 'SOURCE_EXACT', rule: 'gap size >= 0.75 x ATR(40)', code: `${CODE}#gapUpAt`, tests: [`${T}: GC-BGU-CANDIDATE`, `${T}: GC-BGU-GAP-BELOW`] },
    { id: 'MOKA-SF-BGU-GAP-MEASURE', kind: 'INDICATOR', essential: false, psr709: ['MOKA12-004'], status: 'SOURCE_DERIVED', rule: 'gap = gap-day open - previous close; ATR(40) = simple mean of the true range over the 40 sessions before the gap day', derivation: 'the source does not define the gap measure or the ATR averaging; open minus previous close and a simple 40-session mean without same-day information are used; the full gap (low - previous high) is reported as evidence', code: `${CODE}#gapUpAt`, tests: [`${T}: GC-BGU-ATR40-NO-SAME-DAY`] },
    { id: 'MOKA-SF-BGU-VOLUME', kind: 'FILTER', psr709: ['MOKA24-VOL'], status: 'SOURCE_EXACT', rule: 'standard volume = 150 % OF the average, i.e. ratio >= 1.5', code: `${CODE}#gapUpAt`, tests: [`${T}: GC-BGU-VOLUME-1-5-EXACT`] },
    { id: 'MOKA-SF-BGU-VOLWINDOW', kind: 'FILTER', psr709: ['MOKA24-VOL'], status: 'SOURCE_AMBIGUOUS', rule: 'averaging window of the volume standard', reason: '#709 does not record the window; the ratio over the 50 sessions before the gap day is reported (convention of the authors\' daily charts, unverified in #709) and the reviewer confirms', code: `${CODE}#gapUpAt`, tests: [`${T}: GC-BGU-VOLUME-1-5-EXACT`] },
    { id: 'MOKA-SF-BGU-MEGA', kind: 'FILTER', psr709: ['MOKA24-MEGA'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'below the standard the record is not rejected: VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW', code: `${CODE}#gapUpAt`, tests: [`${T}: GC-BGU-MCD-EXCEPTION`] },
    { id: 'MOKA-SF-BGU-CONTEXT', kind: 'SETUP', psr709: ['MOKA12-003', 'MOKA12-006'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'leadership / theme and uptrend or constructive consolidation before the gap' },
    { id: 'MOKA-SF-BGU-SELLGUIDE', kind: 'STOP', psr709: ['MOKA12-007', 'MOKASTOP-006'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'gap-day low as the risk reference; below it generally sell at least half (preference); the machine reports the level', code: `${CODE}#buyableGapUpScreen`, tests: [`${T}: GC-BGU-SELL-GUIDE`] },
    { id: 'MOKA-SF-BGU-SIZE', kind: 'SIZING', psr709: ['MOKA12-003'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'sizing not specified in #709; reviewer decision' },
    ...exitRules(),
  ],
});
