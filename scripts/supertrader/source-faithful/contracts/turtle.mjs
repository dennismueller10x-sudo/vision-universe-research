/**
 * C01 Original Turtles System 1 / C02 System 2 (#709 W-TUR, The Original Turtle Trading Rules, printed pp. 10-30).
 *
 * Three layers are kept apart (mandate section 5):
 *  1. ORIGINAL   book rules for liquid US futures (long and short, contract months, rolls, correlation groups).
 *  2. MECHANICAL the rules the engine executes exactly as written (N, entries, filter, adds, unit stops, exits).
 *  3. EQUITY_ADAPTATION the declared translation to the frozen US equity research universe (long only, dollars per
 *     point = 1 per share, cash account). It is never called identical to the futures system.
 * Rule.scopes lists the layers a rule is essential for; deriveImplementationStatus is reported per scope.
 */
import { defineContract, EXCLUDE, SF_ROOT } from './define.mjs';
import { OUTPUT_KIND } from '../contract.mjs';

const CODE = `${SF_ROOT}/methods/turtle.mjs`;
const T = 'scripts/supertrader/tests/sf-turtle.test.mjs';
const ORIG = ['ORIGINAL'];
const BOTH = ['ORIGINAL', 'EQUITY_ADAPTATION'];

function common(system) {
  const s1 = system === 'S1';
  return [
    { id: 'TUR-SF-TR', kind: 'INDICATOR', psr709: ['TUR-TR'], status: 'SOURCE_EXACT', scopes: BOTH, rule: 'TR = max(H - L, H - previous close, previous close - L)', code: `${CODE}#trueRange`, tests: [`${T}: GC-TUR-N`] },
    { id: 'TUR-SF-N', kind: 'INDICATOR', psr709: ['TUR-N'], status: 'SOURCE_EXACT', scopes: BOTH, rule: 'N = (19 x previous N + TR) / 20, seeded with the 20-day simple mean of TR', code: `${CODE}#turtleN`, tests: [`${T}: GC-TUR-N`] },
    { id: 'TUR-SF-N-DAILY', gate: false, kind: 'INDICATOR', essential: false, psr709: ['TUR-WEEKLY'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: 'N and unit size are recomputed from daily bars', derivation: 'the Turtles received weekly N / unit sheets (CONTEXTUAL operational practice); the same formula is evaluated on every session with the value of the prior close, which uses no later information', code: `${CODE}#turtleN`, tests: [`${T}: GC-TUR-N`] },
    { id: 'TUR-SF-UNIT', kind: 'SIZING', psr709: ['TUR-UNIT', 'TUR-DOLLAR'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: 'unit = floor(0.01 x notional account / (N x dollars per point))', derivation: 'equities: dollars per point = 1 per share, so a unit is floor(0.01 x notional / N) whole shares; N is the value at the prior close (no same-day information)', code: `${CODE}#unitSize`, tests: [`${T}: GC-TUR-HO2002`, `${T}: GC-TUR-UNIT-EQUITY`] },
    { id: 'TUR-SF-NOTIONAL', kind: 'SIZING', psr709: ['TUR-NOTIONAL', 'TUR-DRAWDOWN'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: 'size from a notional account; every 10 % drawdown of the current notional cuts it by 20 %, until the yearly start is regained', derivation: 'Dennis set the yearly notional account subjectively; the adaptation uses actual equity at the first session of each year (as PR #779 / #705); cuts compound per the printed example (1.0 -> 0.8 -> 0.64)', code: `${CODE}#createNotionalAccount`, tests: [`${T}: GC-TUR-NOTIONAL`] },
    { id: 'TUR-SF-LIMIT4', kind: 'PORTFOLIO', psr709: ['TUR-LIMIT4'], status: 'SOURCE_EXACT', scopes: BOTH, rule: 'at most 4 units per market (per security)', code: `${CODE}#runTurtle`, tests: [`${T}: GC-TUR-GOLD`, `${T}: GC-TUR-LIMIT4`] },
    { id: 'TUR-SF-LIMIT12', kind: 'PORTFOLIO', psr709: ['TUR-LIMIT12'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: 'at most 12 units long (and 12 short)', derivation: 'long-only adaptation: only the 12-unit long limit can bind', code: `${CODE}#runTurtle`, tests: [`${T}: GC-TUR-LIMIT12`] },
    { id: 'TUR-SF-LIMIT-CORR', kind: 'PORTFOLIO', psr709: ['TUR-LIMIT6', 'TUR-LIMIT10'], status: 'DATA_BLOCKED', scopes: BOTH, rule: 'at most 6 units in closely and 10 in loosely correlated markets per direction', reason: 'the groups are futures market groups; for equities they need point-in-time industry membership or a declared correlation measure. The snapshot has neither, and choosing one would add an unsourced parameter. Not applied; declared as an open fidelity gap.' },
    { id: 'TUR-SF-ENTRY', kind: 'ENTRY', psr709: s1 ? ['TUR-S1ENT', 'TUR-INTRADAY', 'TUR-GAP'] : ['TUR-S2ENT', 'TUR-INTRADAY', 'TUR-GAP'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: `buy one unit when the price exceeds the prior ${s1 ? 20 : 55}-day high by one tick, intraday at the breakout; on an opening gap at the open`, derivation: 'daily bars: the buy stop fills at max(open, trigger) on the bar whose high reaches the trigger (the rule itself); one tick = 0.01 raw price converted to the split-adjusted basis', code: `${CODE}#entryTrigger`, tests: [`${T}: GC-TUR-ENTRY-${system}`, `${T}: GC-TUR-GAP-FILL`] },
    { id: 'TUR-SF-SHORT', kind: 'ENTRY', psr709: s1 ? ['TUR-S1ENT'] : ['TUR-S2ENT'], status: 'DATA_BLOCKED', scopes: ORIG, rule: 'short one unit one tick below the prior channel low', reason: 'short side needs historical borrow / locate availability and fees, which are not in the snapshot (#709 data requirement short_interest MISSING). The equity adaptation is long only; short breakouts still feed the System 1 filter.' },
    ...(s1 ? [
      { id: 'TUR-SF-S1-FILTER', kind: 'FILTER', psr709: ['TUR-S1SKIP', 'TUR-S1LOSER', 'TUR-S1DIR'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: 'skip a 20-day breakout if the last breakout (taken or not, long or short) would have been a winner; loser = price moved 2N against it before a profitable 10-day exit', derivation: 'skip only after a profitable last breakout (TUR-S1SKIP); a 10-day exit at a loss without a prior 2N adverse move is neither a loser (TUR-S1LOSER) nor profitable, so the next signal is taken (the #705 engine skipped it); a still open (unresolved) hypothetical breakout counts as not losing and skips (source silent; fewer entries); daily-bar path: the level nearer to the open is reached first; the filter is warmed on the history before the window', code: `${CODE}#createBreakoutTracker`, tests: [`${T}: GC-TUR-S1-SKIP-WINNER`, `${T}: GC-TUR-S1-TAKE-AFTER-LOSER`, `${T}: GC-TUR-S1-TAKE-AFTER-UNPROFITABLE-EXIT`, `${T}: GC-TUR-S1-SHORT-COUNTS`] },
      { id: 'TUR-SF-FAILSAFE', kind: 'ENTRY', psr709: ['TUR-FAILSAFE'], status: 'SOURCE_EXACT', scopes: BOTH, rule: 'if a 20-day breakout was skipped, enter at the 55-day breakout', code: `${CODE}#entryTrigger`, tests: [`${T}: GC-TUR-FAILSAFE`] },
      { id: 'TUR-SF-FAILSAFE-EXIT', kind: 'EXIT', psr709: ['TUR-FAILSAFE'], status: 'SOURCE_AMBIGUOUS', scopes: BOTH, rule: 'exit of a failsafe position', reason: '#709: the published failsafe text does not state its exit. Implemented as the System 1 10-day exit and labelled as that interpretation in every trade record (path FAILSAFE_55).', code: `${CODE}#runTurtle`, tests: [`${T}: GC-TUR-FAILSAFE`] },
    ] : [
      { id: 'TUR-SF-S2-NOSKIP', kind: 'FILTER', psr709: ['TUR-S2NOSKIP'], status: 'SOURCE_EXACT', scopes: BOTH, rule: 'System 2 takes every 55-day breakout (no filter)', code: `${CODE}#entryTrigger`, tests: [`${T}: GC-TUR-ENTRY-S2`] },
    ]),
    { id: 'TUR-SF-ADD', kind: 'PYRAMIDING', psr709: ['TUR-ADD'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: 'add one unit every 1/2 N above the previous ACTUAL fill, up to the 4-unit limit', derivation: 'N for add spacing and stops is N of the initial entry (the printed examples keep N constant); the next level is 1/2 N above the last actual fill even if that unit was stopped out since; after a unit stop-out the position takes no further adds (a re-add would be the optional Whipsaw re-entry, not implemented); the first add of a bar fills at max(open, level), later adds of the same bar at their level', code: `${CODE}#runTurtle`, tests: [`${T}: GC-TUR-GOLD`, `${T}: GC-TUR-ADD-GAP-FILL`, `${T}: GC-TUR-NO-READD-AFTER-UNIT-STOP`] },
    { id: 'TUR-SF-ADDFAST', gate: false, kind: 'PYRAMIDING', essential: false, psr709: ['TUR-ADDFAST'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: 'several units may be added on the same day', derivation: 'consequence of TUR-ADD on daily bars; no extra rule', code: `${CODE}#runTurtle`, tests: [`${T}: GC-TUR-GOLD`] },
    { id: 'TUR-SF-STOP', kind: 'STOP', psr709: ['TUR-STOP'], status: 'SOURCE_EXACT', scopes: BOTH, rule: 'each unit starts with a stop 2N below its own fill', code: `${CODE}#unitStops`, tests: [`${T}: GC-TUR-CRUDE-NORMAL`] },
    { id: 'TUR-SF-STOPADD', kind: 'STOP', psr709: ['TUR-STOPADD'], status: 'SOURCE_EXACT', scopes: BOTH, rule: 'every add raises the stops of all earlier units by 1/2 N; each unit keeps its own stop and is stopped out on its own (closes #712 finding V41-F1)', code: `${CODE}#unitStops`, tests: [`${T}: GC-TUR-CRUDE-NORMAL`, `${T}: GC-TUR-CRUDE-GAP`, `${T}: GC-TUR-UNIT-STOP-EXIT`] },
    { id: 'TUR-SF-STOPGAP', gate: false, kind: 'STOP', essential: false, psr709: ['TUR-STOPGAP'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: 'after a gapped add the units carry different stops', derivation: 'not a separate rule: the consequence of TUR-STOPADD that the worked example TUR-CRUDE prints (27.70, 27.70, 27.70, 28.40); reproduced by a golden case', code: `${CODE}#unitStops`, tests: [`${T}: GC-TUR-CRUDE-GAP`] },
    { id: 'TUR-SF-EXIT', kind: 'EXIT', psr709: [s1 ? 'TUR-S1EX' : 'TUR-S2EX'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: `exit all units when the price trades one tick below the prior ${s1 ? 10 : 20}-day low`, derivation: 'the opposite channel breakout uses the same one-tick convention as the entry (0.01 raw, split-adjusted); fill min(open, level) on daily bars (review SF-R1-06)', code: `${CODE}#runTurtle`, tests: [`${T}: GC-TUR-EXIT-${system}`] },
    { id: 'TUR-SF-RANK', kind: 'PORTFOLIO', gate: false, psr709: ['TUR-RANK', 'TUR-RANKVAR'], status: 'SOURCE_DERIVED', scopes: BOTH, rule: 'simultaneous signals: buy the strongest first', derivation: 'TUR-RANKVAR (OPTIONAL) allows several normalisations; the one the source names, (close - close 3 months ago) / N with 3 months = 63 sessions at the prior close, is used; ties by security id. Without group data all simultaneous signals form one group.', code: `${CODE}#runTurtle`, tests: [`${T}: GC-TUR-RANK`] },
    { id: 'TUR-SF-CONSISTENT', kind: 'FILTER', gate: false, psr709: ['TUR-SIGNAL-CONSISTENCY'], status: 'SOURCE_EXACT', scopes: BOTH, rule: 'take every valid signal of the system consistently; no regime, fundamental, proximity, expiry or cooldown filter', code: `${CODE}#runTurtle`, tests: [`${T}: GC-TUR-NO-REGIME`] },
    { id: 'TUR-SF-MARKETS', kind: 'FILTER', gate: true, psr709: ['TUR-MARKETS', 'TUR-CONSISTENT'], status: 'SOURCE_DERIVED', scopes: ['EQUITY_ADAPTATION'], rule: 'trade liquid markets only; markets excluded in advance stay excluded consistently', derivation: 'liquid US futures -> snapshot universe members that pass the pre-registered research universe protocol of #705 (raw close >= 5 and mean 20-session raw dollar volume >= 1,000,000 at the prior session; common/series.mjs RESEARCH_UNIVERSE). A measurement convention applied identically to every method, not a Turtle number', code: `${CODE}#runTurtle`, tests: [`${T}: GC-TUR-UNIVERSE`] },
    { id: 'TUR-SF-CASH', kind: 'PORTFOLIO', psr709: [], status: 'SOURCE_DERIVED', scopes: ['EQUITY_ADAPTATION'], rule: 'cash account, no leverage: a unit is bought only if its full cost fits in cash; otherwise REJECT_NO_CASH (counted)', derivation: 'futures margin has no equity analogue in a cash research account; declared adaptation (#709 VU-TUR: "Long-only-Equity-Adaptation mit Cashgrenze")', code: `${CODE}#runTurtle`, tests: [`${T}: GC-TUR-NO-CASH`] },
  ];
}

const exclusions = {
  'TUR-ALLOC': EXCLUDE.optionalVariant + ' (S1 / S2 capital split); the systems are run separately',
  'TUR-WHIP': EXCLUDE.optionalVariant + ' (Whipsaw stop)',
  'TUR-WHIPRE': EXCLUDE.optionalVariant + ' (Whipsaw re-entry)',
  'TUR-WHIPST': EXCLUDE.optionalVariant + ' (Whipsaw stops)',
  'TUR-CONTRACT': EXCLUDE.futuresOnly,
  'TUR-ROLL': EXCLUDE.futuresOnly,
  'TUR-NOORDER': EXCLUDE.executionJudgment + '; the protective price is always applied',
  'TUR-LIMITORDER': EXCLUDE.executionJudgment,
  'TUR-FAST': EXCLUDE.executionJudgment,
};

function turtle(system) {
  const s1 = system === 'S1';
  return defineContract({
    implemented: true,
    plannedIn: 'PR 2 Turtle',
    strategyId: s1 ? 'SF_TURTLE_S1' : 'SF_TURTLE_S2',
    candidateId: s1 ? 'C01' : 'C02',
    trader: 'Original Turtles (Richard Dennis / William Eckhardt rules)',
    method: s1 ? 'System 1 (20-day breakout with skip filter and 55-day failsafe, 10-day exit)' : 'System 2 (55-day breakout, 20-day exit, no filter)',
    sources: [{ sourceId: 'W-TUR', edition: 'The Original Turtle Trading Rules, 2003 participant publication (printed pp. 7-33)', role: 'authoritative English core' }, { sourceId: 'B02', edition: 'Curtis M. Faith, Way of the Turtle (2007), unofficial 2012 Indonesian translation', role: 'secondary; translation conflicts (60 vs 55 days) resolved in favour of W-TUR (#709)' }],
    scope: { primary: 'EQUITY_ADAPTATION', layers: { ORIGINAL: 'futures system as published; DATA_BLOCKED for replication (no futures chains, no borrow)', MECHANICAL: 'rules executed exactly as written', EQUITY_ADAPTATION: 'long-only US equities, cash account; never identical to the futures system' } },
    outputKind: OUTPUT_KIND.RESEARCH_SIGNAL,
    timing: { signal: 'intraday on the bar whose high reaches the trigger (stop order resting from the prior close)', earliestExecutable: 'same bar: fill = max(open, trigger); every level uses only bars up to the prior close', decisionData: 'prior-close N, prior-close channels, prior-close strength rank' },
    entryConditions: [s1 ? 'TUR-SF-ENTRY (20-day + 1 tick) unless TUR-SF-S1-FILTER skips it; then TUR-SF-FAILSAFE (55-day)' : 'TUR-SF-ENTRY (55-day + 1 tick), TUR-SF-S2-NOSKIP'],
    exitConditions: [`TUR-SF-EXIT (${s1 ? 10 : 20}-day low - 1 tick, all units)`, 'TUR-SF-STOPADD (per-unit stops)'],
    stops: ['TUR-SF-STOP 2N per unit from its own fill', 'TUR-SF-STOPADD +1/2 N for every earlier unit per add'],
    positionSizing: ['TUR-SF-UNIT', 'TUR-SF-NOTIONAL', 'TUR-SF-LIMIT4', 'TUR-SF-LIMIT12', 'TUR-SF-CASH'],
    requiredData: ['daily split-adjusted OHLC', 'raw close (tick conversion)', 'dividends (accounting)', 'listing terminals (accounting)'],
    manualReviewFlags: [],
    knownLimitations: [
      'equity adaptation, long only: net long beta, not the futures risk profile',
      'correlation limits (6 / 10 units) not applied: no point-in-time groups (TUR-SF-LIMIT-CORR, DATA_BLOCKED)',
      'cash account: with 1 % / N units only a few units fit in cash; REJECT_NO_CASH is counted',
      'daily bars: the order of intrabar events is a convention (exits before adds; a raised stop is re-checked pessimistically on an add bar)',
      ...(s1 ? ['failsafe exit not stated in the source (TUR-SF-FAILSAFE-EXIT, SOURCE_AMBIGUOUS)'] : []),
    ],
    exclusions,
    rules: common(system),
  });
}

export const TURTLE_S1 = turtle('S1');
export const TURTLE_S2 = turtle('S2');
