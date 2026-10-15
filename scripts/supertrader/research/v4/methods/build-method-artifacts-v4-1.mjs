/**
 * V4.1 method artifacts on #709 rule ids (single source of truth = the rule tables of the components):
 *  - v4-1/SUPERTRADER-V4-1-SOURCE-CODE-TRACEABILITY.json  #709 rule id -> code -> test -> scope, plus uncovered rules with reasons
 *  - v4-1/SUPERTRADER-V4-1-GOLDEN-CASES.json             executable goldens per method and the #709 behavioral case catalogue
 *  - v4-1/MANUAL-REVIEW-V4-1-CONTRACT.json               manual review record for MANUAL_LAYER_REQUIRED methods (#709 ids)
 * The #705 artifacts (SUPERTRADER-V4-SOURCE-CODE-TRACEABILITY.json etc.) are not modified.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TURTLE_RULES_V4 } from './turtle-source-v4.mjs';
import { TURTLE_GOLDEN } from './build-method-artifacts-v4.mjs';
import { TURTLE_UNIT_STOP_RULES_V41 } from './turtle-unit-stops-v4-1.mjs';
import { DARVAS_RULES_V41, DARVAS_OPEN_QUESTIONS } from './darvas-box-v4-1.mjs';
import { POCKET_PIVOT_RULES_V41, POCKET_PIVOT_OPEN_QUESTIONS } from './pocket-pivot-v4-1.mjs';
import { BGU_RULES_V41, BGU_OPEN_QUESTIONS } from './buyable-gap-up-v4-1.mjs';
import { METHOD_CONTEXTS, DEFAULT_EXTRACT } from '../acceptance/psr709-extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'v4-1');
const T = 'scripts/supertrader/tests/';

/** Frozen V4 Turtle rule -> #709 rule ids (R15 ids stay in TURTLE_RULES_V4.sourceIds). */
export const TURTLE_T4_TO_PSR709 = {
  'T4-N': { psr709: ['TUR-TR', 'TUR-N'], status: 'MATCHES' },
  'T4-S1-ENTRY': { psr709: ['TUR-S1ENT', 'TUR-INTRADAY', 'TUR-GAP'], status: 'MATCHES' },
  'T4-S1-FILTER': { psr709: ['TUR-S1SKIP', 'TUR-S1LOSER', 'TUR-S1DIR'], status: 'MATCHES', note: 'an unresolved hypothetical breakout counts as not losing (#709 VU-TUR lists this as a VU formalization, not a false rule)' },
  'T4-FAILSAFE': { psr709: ['TUR-FAILSAFE'], status: 'MATCHES' },
  'T4-S2-ENTRY': { psr709: ['TUR-S2ENT', 'TUR-S2NOSKIP', 'TUR-INTRADAY', 'TUR-GAP'], status: 'MATCHES' },
  'T4-UNIT': { psr709: ['TUR-UNIT', 'TUR-DOLLAR', 'TUR-WEEKLY'], status: 'TRANSLATION', note: 'fractional shares instead of floor (V41-F2); N updated daily instead of weekly sheets (TUR-WEEKLY CONTEXTUAL)' },
  'T4-NOTIONAL': { psr709: ['TUR-NOTIONAL', 'TUR-DRAWDOWN'], status: 'MATCHES' },
  'T4-ADD': { psr709: ['TUR-ADD', 'TUR-ADDFAST'], status: 'MATCHES' },
  'T4-STOP': { psr709: ['TUR-STOP', 'TUR-STOPADD', 'TUR-STOPGAP'], status: 'DEVIATION_V41_F1', note: 'frozen engine: all units 2N below the newest fill; #709: earlier units +1/2 N per add, different unit stops after gaps' },
  'T4-EXIT-S1': { psr709: ['TUR-S1EX'], status: 'MATCHES' },
  'T4-EXIT-S2': { psr709: ['TUR-S2EX'], status: 'MATCHES' },
  'T4-LIMIT': { psr709: ['TUR-LIMIT4', 'TUR-LIMIT12'], status: 'PARTIAL', note: 'TUR-LIMIT6 / TUR-LIMIT10 need correlation groups (industry PIT DATA_PARTIAL)' },
  'T4-RANK': { psr709: ['TUR-RANK', 'TUR-RANKVAR'], status: 'DECLARED_CHOICE', note: 'TUR-RANKVAR (OPTIONAL): no single mandatory formula; (C - C63) / N is one allowed normalisation' },
  'T4-CONSISTENCY': { psr709: ['TUR-SIGNAL-CONSISTENCY', 'TUR-CONSISTENT'], status: 'MATCHES' },
  'T4-NO-REGIME': { psr709: [], status: 'ABSENCE', note: '#709 records no regime or fundamental filter in the Turtle contexts' },
  'T4-LONG-ONLY': { psr709: ['TUR-S1DIR'], status: 'TRANSLATION', note: 'long-only equities; short breakouts still drive the S1 filter' },
  'T4-NO-LEVERAGE': { psr709: [], status: 'TRANSLATION' },
  'T4-UNIVERSE': { psr709: ['TUR-MARKETS', 'TUR-CONSISTENT'], status: 'TRANSLATION', note: 'liquid US futures -> frozen liquid US equity universe, applied consistently' },
  'T4-TICK': { psr709: ['TUR-S1ENT', 'TUR-S2ENT'], status: 'MATCHES' },
  'T4-INTRABAR': { psr709: [], status: 'CONVENTION' },
  'T4-COSTS': { psr709: [], status: 'CONVENTION', note: '#709 TUR-LIMITORDER (PREFERENCE) and TUR-FAST (CONTEXTUAL) are execution judgment, not modelled' },
  'T4-TERMINALS': { psr709: [], status: 'MEASUREMENT' },
  'T4-LEDGER': { psr709: [], status: 'MEASUREMENT' },
};
/** #709 Turtle rules that no code implements, with the reason. */
export const TURTLE_UNCOVERED = {
  'TUR-LIMIT6': 'correlated-group limit needs point-in-time industry / correlation groups (DATA_PARTIAL)',
  'TUR-LIMIT10': 'loosely-correlated limit, same data gap',
  'TUR-ALLOC': 'OPTIONAL capital split between S1 and S2; the systems are run separately',
  'TUR-NOORDER': 'CONTEXTUAL: protective price mandatory, broker stop order optional; the model always applies the protective price',
  'TUR-LIMITORDER': 'PREFERENCE execution practice; costs are a convention',
  'TUR-FAST': 'CONTEXTUAL execution judgment in fast markets',
  'TUR-CONTRACT': 'futures contract month selection (ORIGINAL_FUTURES_REPLICATION, DATA_BLOCKED)',
  'TUR-ROLL': 'futures roll (ORIGINAL_FUTURES_REPLICATION, DATA_BLOCKED)',
  'TUR-WHIP': 'OPTIONAL Whipsaw variant, not the default system',
  'TUR-WHIPRE': 'Whipsaw variant re-entry, not implemented',
  'TUR-WHIPST': 'Whipsaw variant stops, not implemented',
};

/** Executable synthetic golden cases (id -> test name prefix) per method. */
export const EXECUTABLE_GOLDENS_V41 = {
  TURTLE_S1_SOURCE: [...TURTLE_GOLDEN.filter((g) => g.system === 'S1').map((g) => g.id), 'TS-HO2002', 'TS-GOLD', 'TS-CRUDE-NORMAL', 'TS-CRUDE-GAP', 'TS-V41-F1'],
  TURTLE_S2_SOURCE: [...TURTLE_GOLDEN.filter((g) => g.system === 'S2' || g.shared).map((g) => g.id), 'TS-HO2002', 'TS-GOLD', 'TS-CRUDE-NORMAL', 'TS-CRUDE-GAP', 'TS-V41-F1'],
  DARVAS_LATER_QA: ['DG-01', 'DG-02', 'DG-03', 'DG-04', 'DG-05', 'DG-06', 'DG-07', 'DG-08', 'DG-09', 'DG-10'],
  MORALES_KACHER_POCKET_PIVOT: ['PPG-01', 'PPG-02', 'PPG-03', 'PPG-04', 'PPG-05', 'PPG-06'],
  MORALES_KACHER_BUYABLE_GAP_UP: ['BGG-01', 'BGG-02', 'BGG-03', 'BGG-04', 'BGG-05'],
};

export const GOLDEN_DEFINITIONS_V41 = [
  { id: 'TS-HO2002', methods: ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'], kind: 'SOURCE_WORKED_EXAMPLE', psr709Case: 'TUR-HO2002', psr709Rules: ['TUR-UNIT', 'TUR-DOLLAR'], expected: 'N 0.0141, notional 1,000,000, 42,000 $/point -> 16 contracts', file: `${T}v41-turtle-source-examples.test.mjs` },
  { id: 'TS-GOLD', methods: ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'], kind: 'SOURCE_WORKED_EXAMPLE', psr709Case: 'TUR-GOLD', psr709Rules: ['TUR-ADD'], expected: 'first fill 310, N 2.50 -> adds at 311.25, 312.50, 313.75 (also reproduced by the frozen engine)', file: `${T}v41-turtle-source-examples.test.mjs` },
  { id: 'TS-CRUDE-NORMAL', methods: ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'], kind: 'SOURCE_WORKED_EXAMPLE', psr709Case: 'TUR-CRUDE', psr709Rules: ['TUR-STOP', 'TUR-STOPADD'], expected: 'fills 28.30/28.90/29.50/30.10, N 1.20 -> all four stops 27.70', file: `${T}v41-turtle-source-examples.test.mjs` },
  { id: 'TS-CRUDE-GAP', methods: ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'], kind: 'SOURCE_WORKED_EXAMPLE', psr709Case: 'TUR-CRUDE', psr709Rules: ['TUR-STOPADD', 'TUR-STOPGAP'], expected: 'fourth fill gapped to 30.80 -> stops 27.70, 27.70, 27.70, 28.40', file: `${T}v41-turtle-source-examples.test.mjs` },
  { id: 'TS-V41-F1', methods: ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'], kind: 'KNOWN_DEVIATION', psr709Case: 'TUR-CRUDE', psr709Rules: ['TUR-STOPGAP'], expected: 'frozen V4 engine after a gapped add: one stop for all units at 2N below the gapped fill (documents V41-F1; must flip when the engine is fixed)', file: `${T}v41-turtle-source-examples.test.mjs` },
  { id: 'DG-01', methods: ['DARVAS_LATER_QA'], kind: 'CONFIRMED_PATTERN', psr709Rules: ['DAR-Q1'], expected: 'top confirmed on the third session that neither touches nor exceeds the new high', file: `${T}v41-components-golden.test.mjs` },
  { id: 'DG-02', methods: ['DARVAS_LATER_QA'], kind: 'CONFIRMED_REJECT', psr709Rules: ['DAR-Q1'], expected: 'a touch of the candidate top restarts the count', file: `${T}v41-components-golden.test.mjs` },
  { id: 'DG-03', methods: ['DARVAS_LATER_QA'], kind: 'CONFIRMED_PATTERN', psr709Rules: ['DAR-Q2'], expected: 'bottom only after the top, reverse three-day confirmation', file: `${T}v41-components-golden.test.mjs` },
  { id: 'DG-04', methods: ['DARVAS_LATER_QA'], kind: 'CONFIRMED_REJECT', psr709Rules: ['DAR-Q2'], psr709Gap: 'VU-DAR missing rule', expected: 'a re-touch of the bottom restarts the count', file: `${T}v41-components-golden.test.mjs` },
  { id: 'DG-05', methods: ['DARVAS_LATER_QA'], kind: 'CONFIRMED_BUY_CANDIDATE', psr709Rules: ['DAR-Q4', 'DAR-Q3'], psr709Case: 'DAR-ARLAN', expected: 'breakout on the day the high crosses top + fraction; fill = max(open, trigger); no three-day wait after the breakout; MANUAL_REVIEW_REQUIRED, never BUY', file: `${T}v41-components-golden.test.mjs` },
  { id: 'DG-06', methods: ['DARVAS_LATER_QA'], kind: 'CONFIRMED_EXCEPTION', psr709Rules: ['DAR-Q4'], expected: 'gap open above the trigger fills at the open', file: `${T}v41-components-golden.test.mjs` },
  { id: 'DG-07', methods: ['DARVAS_LATER_QA'], kind: 'CONFIRMED_REJECT', psr709Rules: ['DAR-Q11'], expected: 'a low below the completed bottom before a breakout dissolves the box', file: `${T}v41-components-golden.test.mjs` },
  { id: 'DG-08', methods: ['DARVAS_LATER_QA'], kind: 'CONFIRMED_PATTERN', psr709Rules: ['DAR-Q5', 'DAR-Q6', 'DAR-Q7', 'DAR-Q8'], expected: 'initial stop a fraction below the broken top; raised below the next box bottom; never lowered', file: `${T}v41-components-golden.test.mjs` },
  { id: 'DG-09', methods: ['DARVAS_LATER_QA'], kind: 'AMBIGUOUS_CASE', psr709Rules: ['DAR-Q9'], expected: 'all-time high only within the available history -> ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED for review', file: `${T}v41-components-golden.test.mjs` },
  { id: 'DG-10', methods: ['DARVAS_LATER_QA'], kind: 'AMBIGUOUS_CASE', psr709Rules: ['DAR-Q2'], psr709Gap: 'VU-DAR UNRESOLVED start of the bottom search', expected: 'both bottom-search starts are supported and can give different bottoms', file: `${T}v41-components-golden.test.mjs` },
  { id: 'PPG-01', methods: ['MORALES_KACHER_POCKET_PIVOT'], kind: 'CONFIRMED_BUY_CANDIDATE', psr709Rules: ['MOKAPP-003'], expected: 'up-day volume above the largest down-day volume of the prior ten sessions -> MANUAL_REVIEW_REQUIRED', file: `${T}v41-components-golden.test.mjs` },
  { id: 'PPG-02', methods: ['MORALES_KACHER_POCKET_PIVOT'], kind: 'CONFIRMED_REJECT', psr709Rules: ['MOKAPP-003'], expected: 'equal volume is not greater', file: `${T}v41-components-golden.test.mjs` },
  { id: 'PPG-03', methods: ['MORALES_KACHER_POCKET_PIVOT'], kind: 'CONFIRMED_REJECT', psr709Rules: ['MOKAPP-003'], expected: 'a down day with large volume is not a pocket pivot', file: `${T}v41-components-golden.test.mjs` },
  { id: 'PPG-04', methods: ['MORALES_KACHER_POCKET_PIVOT'], kind: 'AMBIGUOUS_CASE', psr709Rules: ['MOKAPP-003'], expected: 'no down day in the window -> NO_DOWN_DAY_IN_WINDOW, no candidate', file: `${T}v41-components-golden.test.mjs` },
  { id: 'PPG-05', methods: ['MORALES_KACHER_POCKET_PIVOT'], kind: 'CONFIRMED_PATTERN', psr709Rules: ['MOKAPP-003'], expected: 'a down day 11 sessions back does not count', file: `${T}v41-components-golden.test.mjs` },
  { id: 'PPG-06', methods: ['MORALES_KACHER_POCKET_PIVOT'], kind: 'EDUCATIONAL_PATTERN', psr709Rules: ['MOKAPP-004', 'MOKAPP-010'], expected: 'extension from the 10DMA is evidence and an open question, never a rejection', file: `${T}v41-components-golden.test.mjs` },
  { id: 'BGG-01', methods: ['MORALES_KACHER_BUYABLE_GAP_UP'], kind: 'CONFIRMED_BUY_CANDIDATE', psr709Rules: ['MOKA12-004', 'MOKA24-VOL'], expected: 'gap >= 0.75 x ATR40 and volume >= 1.5x -> GAP_AND_STANDARD_VOLUME, MANUAL_REVIEW_REQUIRED', file: `${T}v41-components-golden.test.mjs` },
  { id: 'BGG-02', methods: ['MORALES_KACHER_BUYABLE_GAP_UP'], kind: 'CONFIRMED_REJECT', psr709Rules: ['MOKA12-004'], expected: 'gap just below 0.75 x ATR40 -> no record', file: `${T}v41-components-golden.test.mjs` },
  { id: 'BGG-03', methods: ['MORALES_KACHER_BUYABLE_GAP_UP'], kind: 'CONFIRMED_EXCEPTION', psr709Rules: ['MOKA24-MEGA'], psr709Case: 'MOKA24-MCD', expected: 'volume +47.09 % (1.4709x) -> VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW, not rejected', file: `${T}v41-components-golden.test.mjs` },
  { id: 'BGG-04', methods: ['MORALES_KACHER_BUYABLE_GAP_UP'], kind: 'CONFIRMED_PATTERN', psr709Rules: ['MOKA24-VOL', 'MOKA12-005'], expected: '150 % of the average = 1.5x exactly meets the standard (2024 wording; the 2012 wording is not used)', file: `${T}v41-components-golden.test.mjs` },
  { id: 'BGG-05', methods: ['MORALES_KACHER_BUYABLE_GAP_UP'], kind: 'CONFIRMED_PATTERN', psr709Rules: ['MOKA12-007'], expected: 'gap-day low reported as sell guide', file: `${T}v41-components-golden.test.mjs` },
];

const COMPONENTS = [
  { methods: ['DARVAS_LATER_QA'], file: 'methods/darvas-box-v4-1.mjs', rules: DARVAS_RULES_V41 },
  { methods: ['MORALES_KACHER_POCKET_PIVOT'], file: 'methods/pocket-pivot-v4-1.mjs', rules: POCKET_PIVOT_RULES_V41 },
  { methods: ['MORALES_KACHER_BUYABLE_GAP_UP'], file: 'methods/buyable-gap-up-v4-1.mjs', rules: BGU_RULES_V41 },
  { methods: ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'], file: 'methods/turtle-unit-stops-v4-1.mjs', rules: TURTLE_UNIT_STOP_RULES_V41 },
];
const testsFor = (ids) => GOLDEN_DEFINITIONS_V41.filter((g) => g.psr709Rules.some((r) => ids.includes(r))).map((g) => `${g.file}: ${g.id}`);

export function traceabilityV41(extract) {
  const R = new Map(extract.rules.map((r) => [r.rule_id, r]));
  const prov = (id) => { const r = R.get(id); if (!r) throw new Error(`UNKNOWN_PSR709_RULE:${id}`); return { ruleId: id, modal: r.modal_strength, confidence: r.confidence, originalWordingChecked: r.original_wording_checked, clearance: r.hard_coding_clearance, source: `${r.source_id} ${r.page_location}` }; };
  const turtle = TURTLE_RULES_V4.map((r) => {
    const m = TURTLE_T4_TO_PSR709[r.ruleId]; if (!m) throw new Error(`UNMAPPED_T4:${r.ruleId}`);
    return { ruleId: r.ruleId, methods: ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'], scope: r.scope, kind: r.kind, status: m.status, note: m.note ?? null, psr709: m.psr709.map(prov), r15: r.sourceIds,
      code: `scripts/supertrader/research/v4/methods/turtle-source-v4.mjs#${r.code}`, tests: [...r.tests.map((t) => `${T}v4-turtle-golden.test.mjs: ${t}`), ...testsFor(m.psr709)] };
  });
  const components = COMPONENTS.flatMap((c) => c.rules.map((r) => ({ ruleId: r.ruleId, methods: c.methods, kind: r.kind, rule: r.rule, psr709: r.psr709.filter((id) => R.has(id)).map(prov), psr709Other: r.psr709.filter((id) => !R.has(id)),
    code: r.code ? (r.code.includes('.mjs#') ? `scripts/supertrader/research/v4/methods/${r.code}` : `scripts/supertrader/research/v4/${c.file}#${r.code}`) : null, tests: testsFor(r.psr709) })));
  // coverage: every hardenable #709 rule in the context of an implemented component is implemented or explained
  const covered = new Set([...turtle.flatMap((t) => t.psr709.map((p) => p.ruleId)), ...components.filter((c) => c.kind !== 'NOT_IMPLEMENTED').flatMap((c) => c.psr709.map((p) => p.ruleId))]);
  const contexts = (ids) => new Set(ids.flatMap((id) => METHOD_CONTEXTS[id].contexts));
  const implemented = contexts(['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE', 'DARVAS_LATER_QA', 'MORALES_KACHER_POCKET_PIVOT', 'MORALES_KACHER_BUYABLE_GAP_UP']);
  const uncovered = extract.rules.filter((r) => implemented.has(r.method) && !covered.has(r.rule_id)).map((r) => ({ ruleId: r.rule_id, method: r.method, modal: r.modal_strength, clearance: r.hard_coding_clearance,
    reason: TURTLE_UNCOVERED[r.rule_id] ?? (r.hard_coding_clearance === 'DO_NOT_HARDEN_PREFERENCE' ? 'DO_NOT_HARDEN_PREFERENCE: reviewer judgment (open question in the manual review record)' : null) }));
  return {
    schema: 'supertrader-v4-1-source-code-traceability-1.0.0', sourceEvidence: { pullRequest: 709, commit: extract.pin.commit, manifestSha256: extract.pin.manifestSha256 },
    note: 'Turtle: frozen V4 engine rules re-traced to #709 ids (R15 ids kept). Darvas / Pocket Pivot / BGU: V4.1 machine-screen components, which emit MANUAL_REVIEW_REQUIRED and never BUY. Numbers outside SOURCE rules are INTERPRETATION or CONVENTION and are listed.',
    turtle, components, uncoveredRules: uncovered,
    nonComponentMethods: 'Weinstein, Minervini SEPA / Power Play, Kullamaegi (Breakout, EP, Parabolic Short), Holy Grail and CAN SLIM have no V4.1 code: they are MANUAL_LAYER_REQUIRED without a built screen, DATA_BLOCKED or RESEARCH_ONLY (see SUPERTRADER-V4-1-METHOD-ELIGIBILITY.json)',
  };
}

export function goldenCasesV41(extract) {
  const methods = {};
  for (const id of Object.keys(METHOD_CONTEXTS)) {
    const ctx = METHOD_CONTEXTS[id].contexts, caseIds = new Set(extract.reproducibility.filter((r) => ctx.includes(r.method)).flatMap((r) => r.source_context_case_ids));
    const catalogue = extract.cases.filter((c) => caseIds.has(c.case_id)).map((c) => ({ caseId: c.case_id, setup: c.setup_family ?? null, action: c.action, category: c.personal_trade_category, source: `${c.source_id} ${c.page_location}`, confidence: c.confidence }));
    const exe = EXECUTABLE_GOLDENS_V41[id] ?? [];
    methods[id] = { status: exe.length ? 'EXECUTABLE' : catalogue.length ? 'CATALOGUE_ONLY' : 'NONE', executable: exe, psr709Catalogue: catalogue, useAsPerformanceSample: false };
  }
  return { schema: 'supertrader-v4-1-golden-cases-1.0.0', rule: 'golden cases are behaviour tests, never a performance sample; #709 chart and personal cases are not broker-verified and carry unadjusted printed prices', definitions: [...TURTLE_GOLDEN.map((g) => ({ ...g, methods: g.system === 'S2' ? ['TURTLE_S2_SOURCE'] : g.shared ? ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'] : ['TURTLE_S1_SOURCE'], file: `${T}v4-turtle-golden.test.mjs` })), ...GOLDEN_DEFINITIONS_V41], methods };
}

export function manualReviewContractV41(eligibility) {
  const manual = eligibility.methods.filter((m) => m.eligibility === 'MANUAL_LAYER_REQUIRED' || (m.eligibility === 'DATA_BLOCKED' && m.manualLayer));
  return {
    schema: 'supertrader-v4-1-manual-review-contract-1.0.0', appliesTo: manual.map((m) => m.id),
    pipeline: ['MACHINE_SCREEN', 'RANKING', 'MANUAL_OR_AI_REVIEW', 'FINAL_CANDIDATE'],
    candidateRecord: { status: 'MANUAL_REVIEW_REQUIRED', fields: ['methodId', 'securityId (private)', 'asOf', 'buyDeclarationAllowed=false', 'machineScreenEvidence[] (V4.1 rule id, #709 rule id, value)', 'openQuestions[] (#709 rule ids left to judgment)', 'dataNotAvailableToMachine[]', 'reviewer', 'decision (ACCEPT_AS_CANDIDATE | REJECT | DEFER)', 'decisionReasons[] (#709 rule or case ids)', 'reviewedAt'] },
    hardRules: ['a machine screen may create MANUAL_REVIEW_REQUIRED records, never BUY', 'a decision without #709 rule or case ids as reasons is invalid', 'AI review output is a proposal and keeps status MANUAL_REVIEW_REQUIRED until a human decision', 'manual decisions are logged forward only; they are never back-filled into a historical backtest', 'DO_NOT_HARDEN_PREFERENCE rules are never turned into machine gates'],
    openQuestionsByComponent: { DARVAS_LATER_QA: DARVAS_OPEN_QUESTIONS, MORALES_KACHER_POCKET_PIVOT: POCKET_PIVOT_OPEN_QUESTIONS, MORALES_KACHER_BUYABLE_GAP_UP: BGU_OPEN_QUESTIONS },
    judgmentWithoutComponent: {
      WEINSTEIN_STAGE2_INVESTOR: ['stage on the weekly chart and breakout over resistance (WEIN-BUY1)', 'half at breakout, half on a constructive pullback (WEIN-BUY2)', 'stop below a significant correction low, no fixed percentage (WEIN-STOP2)', 'slight MA undercut with rising MA and intact low is not a forced sale (WEIN-TRAIL4)'],
      WEINSTEIN_STAGE2_TRADER: ['continuation buy near a rising 30-week MA (WEIN-TR-CONT)', 'full position on continuation breakouts (WEIN-TR-CONT-SIZE)', 'stop below the next relevant reaction low (WEIN-TR-STOP)'],
      MINERVINI_SEPA_VCP: ['manual relative priority of the remaining names (MIN-PROCESS-04)', 'simple separate screens, not many AND criteria (MIN-PROCESS-15)', 'contraction count and halving are typical, not limits (MIN-VCP-02, MIN-VCP-03)'],
      KULLAMAGI_COMMON_BREAKOUT: ['setup quality (KK-005..009 preferences)', 'daily breakout allowed (KK-011); low-of-day stop with distance <= ADR: reject a wide LoD, never replace it (KK-012)', 'partial sale after 3-5 days and trailing 10/20DMA are preferences (KK-013, KK-014)'],
      KULLAMAGI_EPISODIC_PIVOT: ['catalyst type and surprise (KK-015, KK-038, KK-040)'],
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const extract = JSON.parse(fs.readFileSync(DEFAULT_EXTRACT, 'utf8'));
  const eligibility = JSON.parse(fs.readFileSync(path.join(OUT, 'SUPERTRADER-V4-1-METHOD-ELIGIBILITY.json'), 'utf8'));
  const w = (f, v) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(v, null, 2) + '\n');
  w('SUPERTRADER-V4-1-SOURCE-CODE-TRACEABILITY.json', traceabilityV41(extract));
  w('SUPERTRADER-V4-1-GOLDEN-CASES.json', goldenCasesV41(extract));
  w('MANUAL-REVIEW-V4-1-CONTRACT.json', manualReviewContractV41(eligibility));
  process.stdout.write('written V4.1 method artifacts\n');
}
