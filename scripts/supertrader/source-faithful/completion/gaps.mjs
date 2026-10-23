/**
 * Supertrader 2.0 completion gaps: for every one of the 13 candidates, 15 completion dimensions, each with its gaps and
 * one of six gap classes. Everything rule-related is DERIVED from the contracts (rule kind + rule status), so a gap
 * cannot be declared closed by hand; the few non-rule facts (test categories, measurement findings) are listed here
 * with their evidence and checked against the test files at build time.
 *
 * Gap classes (mandate section 3):
 *  IMPLEMENTATION_GAP  a sourced rule exists, code (or its test) is missing
 *  DATA_GAP            the rule needs data the frozen snapshot / repository does not contain
 *  SOURCE_GAP          #709 records no unambiguous rule (both readings kept, or not disclosed)
 *  MANUAL_DECISION     the source leaves the decision to the trader (qualitative judgment)
 *  MEASUREMENT_GAP     a reliable historical measurement is not possible (no mechanical exit, certification finding)
 *  PRODUCT_GAP         technical product integration is missing (live path, owner approval)
 *
 * Pure: reads no market data. `testIndex` (test file -> set of test names) is passed in by the builder.
 */
import { FOUNDATION, OUTPUT_KIND } from '../contract.mjs';

export const GAPS_SCHEMA = 'supertrader-sf-completion-gaps-1.0.0';
export const GAP_CLASS = Object.freeze({ IMPLEMENTATION_GAP: 'IMPLEMENTATION_GAP', DATA_GAP: 'DATA_GAP', SOURCE_GAP: 'SOURCE_GAP', MANUAL_DECISION: 'MANUAL_DECISION', MEASUREMENT_GAP: 'MEASUREMENT_GAP', PRODUCT_GAP: 'PRODUCT_GAP' });
export const DIMENSIONS = Object.freeze([
  { id: 'D01_SOURCE_RULE_COVERAGE', title: 'Source Rule Coverage' },
  { id: 'D02_SIGNAL', title: 'Signal Completeness', kinds: ['SETUP', 'FILTER', 'INDICATOR'] },
  { id: 'D03_ENTRY', title: 'Entry Completeness', kinds: ['ENTRY'] },
  { id: 'D04_EXIT', title: 'Exit Completeness', kinds: ['EXIT'] },
  { id: 'D05_STOP', title: 'Stop Completeness', kinds: ['STOP'] },
  { id: 'D06_SIZING', title: 'Position Sizing', kinds: ['SIZING'] },
  { id: 'D07_PORTFOLIO_RISK', title: 'Portfolio Risk Limits', kinds: ['PORTFOLIO', 'PYRAMIDING'] },
  { id: 'D08_EXECUTION', title: 'Execution Completeness' },
  { id: 'D09_DATA', title: 'Required Data Coverage' },
  { id: 'D10_CORPORATE_ACTIONS', title: 'Corporate-Action Handling' },
  { id: 'D11_PIT', title: 'PIT Integrity' },
  { id: 'D12_MANUAL', title: 'Manual Decision Dependencies' },
  { id: 'D13_BACKTEST', title: 'Backtest Readiness' },
  { id: 'D14_LIVE', title: 'Live Readiness' },
  { id: 'D15_TESTS', title: 'Missing Tests' },
]);

const CLASS_OF_STATUS = { DATA_BLOCKED: GAP_CLASS.DATA_GAP, MANUAL_REVIEW_REQUIRED: GAP_CLASS.MANUAL_DECISION, SOURCE_AMBIGUOUS: GAP_CLASS.SOURCE_GAP, NOT_IMPLEMENTED: GAP_CLASS.IMPLEMENTATION_GAP };
// A rule that rests on an explicitly labelled SECONDARY source (owner decision, e.g. D-RAS97) is implemented as a research
// reading but the primary source stays silent: it remains a SOURCE_GAP whose primary mechanics are not implemented, so no
// engine state or measurement class rises because of a secondary source.
const gapClassOf = (r) => (r.sourceBasis === 'SECONDARY_SOURCE' ? GAP_CLASS.SOURCE_GAP : CLASS_OF_STATUS[r.status]);
const ESSENTIAL_KINDS = new Set(['ENTRY', 'EXIT', 'STOP', 'SIZING', 'SETUP', 'FILTER', 'PYRAMIDING', 'PORTFOLIO']);
const isEssential = (r) => ESSENTIAL_KINDS.has(r.kind) && r.essential !== false;
/** The declared research scope of a contract: Turtle reports the equity adaptation, everything else its single scope. */
export const declaredScope = (c) => (c.rules.some((r) => r.scopes) ? 'EQUITY_ADAPTATION' : null);
const inScope = (r, scope) => !scope || !r.scopes || r.scopes.includes(scope);

/** One gap record of a non-implemented rule. */
function ruleGap(r, scope) {
  return {
    class: gapClassOf(r), ruleId: r.id, psr709: r.psr709, kind: r.kind, essential: isEssential(r),
    scope: inScope(r, scope) ? 'DECLARED' : 'ORIGINAL_ONLY',
    mechanicsImplemented: r.sourceBasis === 'SECONDARY_SOURCE' ? false : Boolean(r.code) || r.mechanics === 'IMPLEMENTED',
    ...(r.sourceBasis === 'SECONDARY_SOURCE' ? { secondarySource: r.secondarySource, ownerDecision: r.ownerDecision } : {}),
    // a SOURCE_GAP counts as resolved for the engine only when every reading is implemented (review SF2-R1-03)
    allReadingsImplemented: r.status === 'SOURCE_AMBIGUOUS' && Boolean(r.code) && Array.isArray(r.variants) && r.variants.length >= 2,
    detail: r.sourceBasis === 'SECONDARY_SOURCE' ? `primary source silent; research reading from the secondary source ${r.secondarySource} (${r.ownerDecision}): ${r.rule}` : r.reason ?? r.rule,
  };
}

/**
 * Required test categories (mandate section 16). Each names the test(s) that cover it per method; 'N/A' with a reason
 * where the method has no such component. The builder checks that every named test exists in its file.
 */
const T = (f, n) => ({ file: `scripts/supertrader/tests/${f}.test.mjs`, name: n });
const SHARED = { SNAPSHOT: [T('sf-runner', 'SF-RUN-GATES'), T('sf-foundation', 'SF-WORKFLOW')], INDEPENDENCE: [T('sf-foundation', 'SF-INDEPENDENCE')], LEGACY: [T('sf-foundation', 'SF-INDEPENDENCE'), T('sf-completion', 'SF2-LEGACY-ISOLATION')], MISSING_ALL: [T('sf-completion', 'SF2-MISSING-DATA-ALL-SCREENS')] };
const NA_SCREEN = { ACCOUNTING: 'N/A: manual-review screen, no positions are simulated', RISK_SIZING: 'N/A: sizing is a reviewer decision (MANUAL_DECISION)', SNAPSHOT: 'N/A: no historical run of the method (MEASUREMENT_GAP)', SYNTHETIC_BAR_GUARD: 'N/A: no fills are simulated' };
export const TEST_CATEGORIES = Object.freeze(['GOLDEN', 'ENTRY_EXIT', 'STOP', 'RISK_SIZING', 'GAP', 'MISSING_DATA', 'PIT', 'SYNTHETIC_BAR_GUARD', 'ACCOUNTING', 'SNAPSHOT', 'INDEPENDENCE', 'LEGACY_ISOLATION']);
const turtleTests = (sys) => ({
  GOLDEN: [T('sf-turtle', 'GC-TUR-GOLD'), T('sf-turtle', 'GC-TUR-CRUDE-GAP'), T('sf-turtle', 'GC-TUR-HO2002')],
  ENTRY_EXIT: [T('sf-turtle', `GC-TUR-ENTRY-${sys}`), T('sf-turtle', `GC-TUR-EXIT-${sys}`), T('sf-turtle-completion', 'GC-TUR-ENTRY-BAR-CHANNEL-EXIT')],
  STOP: [T('sf-turtle', 'GC-TUR-CRUDE-NORMAL'), T('sf-turtle', 'GC-TUR-UNIT-STOP-EXIT'), T('sf-turtle-completion', 'GC-TUR-ENTRY-BAR-STOP-BEFORE-CHANNEL')],
  RISK_SIZING: [T('sf-turtle', 'GC-TUR-UNIT-EQUITY'), T('sf-turtle', 'GC-TUR-NOTIONAL'), T('sf-turtle', 'GC-TUR-LIMIT12'), T('sf-turtle-completion', 'GC-TUR-LIMIT6'), T('sf-turtle-completion', 'GC-TUR-LIMIT10')],
  GAP: [T('sf-turtle', 'GC-TUR-GAP-FILL'), T('sf-turtle', 'GC-TUR-ADD-GAP-FILL')],
  MISSING_DATA: [T('sf-turtle', 'SF-TUR-MISSING-BAR'), T('sf-turtle', 'SF-TUR-TERMINAL')],
  PIT: [T('sf-turtle', 'SF-TUR-TEMPORAL'), T('sf-turtle', 'SF-TUR-WARMUP-CAUSAL')],
  SYNTHETIC_BAR_GUARD: [T('sf-turtle-completion', 'SF2-TUR-SYNTHETIC-BAR-GUARD')],
  ACCOUNTING: [T('sf-turtle', 'SF-TUR-ACCOUNTING'), T('sf-runner', 'SF-RUN-RESULT')],
  SNAPSHOT: SHARED.SNAPSHOT, INDEPENDENCE: SHARED.INDEPENDENCE, LEGACY_ISOLATION: SHARED.LEGACY,
});
const screen = (o) => ({ ...NA_SCREEN, INDEPENDENCE: SHARED.INDEPENDENCE, LEGACY_ISOLATION: SHARED.LEGACY, ...o, MISSING_DATA: [...(o.MISSING_DATA || []), ...SHARED.MISSING_ALL] });
export const TEST_MATRIX = Object.freeze({
  SF_TURTLE_S1: { ...turtleTests('S1'), GOLDEN: [...turtleTests('S1').GOLDEN, T('sf-turtle', 'GC-TUR-S1-SKIP-WINNER'), T('sf-turtle', 'GC-TUR-FAILSAFE')] },
  SF_TURTLE_S2: turtleTests('S2'),
  SF_DARVAS_BOX: { GOLDEN: [T('sf-darvas', 'GC-DAR-TOP-CONFIRM'), T('sf-darvas', 'GC-DAR-BOTTOM-CONFIRM'), T('sf-darvas-completion', 'GC-DAR-MULTI-BOX-STOP')], ENTRY_EXIT: [T('sf-darvas', 'GC-DAR-BREAKOUT-NO-WAIT'), T('sf-darvas', 'GC-DAR-STOP-PATH')], STOP: [T('sf-darvas', 'GC-DAR-STOP-NEVER-LOWER'), T('sf-darvas', 'GC-DAR-ENTRY-BAR-STOP')], RISK_SIZING: NA_SCREEN.RISK_SIZING, GAP: [T('sf-darvas', 'GC-DAR-GAP-OPEN-FILL'), T('sf-darvas-completion', 'GC-DAR-MULTI-BOX-GAP-EXIT')], MISSING_DATA: [T('sf-darvas-completion', 'GC-DAR-MISSING-BAR'), ...SHARED.MISSING_ALL], PIT: [T('sf-darvas', 'SF-DAR-TEMPORAL')], SYNTHETIC_BAR_GUARD: [T('sf-darvas-completion', 'SF2-DAR-SYNTHETIC-BAR-GUARD')], ACCOUNTING: [T('sf-runner', 'SF-RUN-COMPONENT'), T('sf-runner', 'SF-RUN-COMPONENT-DELISTING')], SNAPSHOT: SHARED.SNAPSHOT, INDEPENDENCE: SHARED.INDEPENDENCE, LEGACY_ISOLATION: SHARED.LEGACY },
  SF_WEINSTEIN_INVESTOR: screen({ GOLDEN: [T('sf-weinstein', 'GC-WEIN-INVESTOR-CANDIDATE'), T('sf-weinstein', 'GC-WEIN-WEEKLY')], ENTRY_EXIT: [T('sf-weinstein', 'GC-WEIN-BREAKOUT-CROSSES-MA'), T('sf-weinstein', 'GC-WEIN-NO-NONTECH-EXIT')], STOP: [T('sf-weinstein', 'GC-WEIN-INVESTOR-CANDIDATE')], GAP: [T('sf-weinstein', 'GC-WEIN-BREAKOUT-CROSSES-MA')], PIT: [T('sf-weinstein', 'SF-WEIN-TEMPORAL')] }),
  SF_WEINSTEIN_TRADER: screen({ GOLDEN: [T('sf-weinstein', 'GC-WEIN-TRADER-CANDIDATE')], ENTRY_EXIT: [T('sf-weinstein', 'GC-WEIN-TRADER-MA-FLAT'), T('sf-weinstein', 'GC-WEIN-NO-NONTECH-EXIT')], STOP: [T('sf-weinstein', 'GC-WEIN-TRADER-CANDIDATE')], GAP: [T('sf-weinstein', 'GC-WEIN-BREAKOUT-CROSSES-MA')], PIT: [T('sf-weinstein', 'SF-WEIN-TEMPORAL')] }),
  SF_MINERVINI_SEPA_VCP: screen({ GOLDEN: [T('sf-minervini', 'GC-MIN-TT-1'), T('sf-minervini', 'GC-MIN-SEPA-CANDIDATE')], ENTRY_EXIT: [T('sf-minervini', 'GC-MIN-SEPA-CANDIDATE')], STOP: [T('sf-minervini', 'GC-MIN-STOP-10PCT-FLAG')], GAP: 'N/A: no gap rule in the SEPA contract', PIT: [T('sf-minervini', 'SF-MIN-TEMPORAL')] }),
  SF_MINERVINI_POWER_PLAY: screen({ GOLDEN: [T('sf-minervini', 'GC-MIN-PP-CANDIDATE'), T('sf-minervini', 'SF-MIN-PP-NEWER-PEAK')], ENTRY_EXIT: [T('sf-minervini', 'GC-MIN-PP-CANDIDATE')], STOP: [T('sf-minervini', 'GC-MIN-STOP-10PCT-FLAG')], GAP: 'N/A: no gap rule in the Power Play contract', PIT: [T('sf-minervini', 'SF-MIN-TEMPORAL')] }),
  SF_KK_BREAKOUT: screen({ GOLDEN: [T('sf-kullamagi', 'GC-KK-ADR20'), T('sf-kullamagi', 'GC-KK-STOP-ACCEPT')], ENTRY_EXIT: [T('sf-kullamagi', 'GC-KK-SETUP-EVIDENCE')], STOP: [T('sf-kullamagi', 'GC-KK-STOP-REJECT-WIDE'), T('sf-kullamagi', 'GC-KK-STOP-MARKET-GAP')], GAP: [T('sf-kullamagi', 'GC-KK-STOP-MARKET-GAP')], PIT: [T('sf-kullamagi', 'SF-KK-TEMPORAL')], RISK_SIZING: [T('sf-kullamagi', 'GC-KK-CAP-30')] }),
  SF_KK_EPISODIC_PIVOT: screen({ GOLDEN: [T('sf-kullamagi', 'GC-KK-EP-GAP-EVIDENCE')], ENTRY_EXIT: 'N/A: entry DATA_BLOCKED (intraday opening range)', STOP: [T('sf-kullamagi', 'GC-KK-EP-STOP-ACCEPT')], GAP: [T('sf-kullamagi', 'GC-KK-EP-GAP-EVIDENCE')], PIT: [T('sf-kullamagi', 'SF-KK-TEMPORAL')], RISK_SIZING: [T('sf-kullamagi', 'GC-KK-CAP-30')] }),
  SF_KK_PARABOLIC_SHORT: screen({ GOLDEN: [T('sf-kullamagi', 'GC-KK-PS-EVIDENCE')], ENTRY_EXIT: 'N/A: entry DATA_BLOCKED (intraday, VWAP)', STOP: 'N/A: stop DATA_BLOCKED (VWAP)', GAP: 'N/A: entry DATA_BLOCKED', PIT: [T('sf-kullamagi', 'SF-KK-TEMPORAL')] }),
  SF_MOKA_POCKET_PIVOT: screen({ GOLDEN: [T('sf-morales-kacher', 'GC-PP-SIGNATURE'), T('sf-morales-kacher', 'GC-PP-WINDOW-10')], ENTRY_EXIT: [T('sf-morales-kacher', 'GC-MOKA-MA-VIOLATION-BOTH-READINGS'), T('sf-moka-completion', 'GC-MOKA-SELL-GUIDE-RESPECTED'), T('sf-moka-completion', 'GC-MOKA-SELL-GUIDE-READINGS-DIFFER')], STOP: 'N/A: no numeric stop in the Pocket Pivot rules (MANUAL_DECISION)', GAP: 'N/A: gap is the BGU method (C12)', PIT: [T('sf-morales-kacher', 'SF-MOKA-TEMPORAL'), T('sf-moka-completion', 'SF2-MOKA-SELL-GUIDE-CAUSAL')] }),
  SF_MOKA_BUYABLE_GAP_UP: screen({ GOLDEN: [T('sf-morales-kacher', 'GC-BGU-CANDIDATE'), T('sf-morales-kacher', 'GC-BGU-MCD-EXCEPTION')], ENTRY_EXIT: [T('sf-morales-kacher', 'GC-BGU-SELL-GUIDE'), T('sf-moka-completion', 'GC-MOKA-SELL-GUIDE-READINGS-DIFFER')], STOP: [T('sf-morales-kacher', 'GC-BGU-SELL-GUIDE')], GAP: [T('sf-morales-kacher', 'GC-BGU-GAP-BELOW'), T('sf-morales-kacher', 'GC-BGU-ATR40-NO-SAME-DAY')], MISSING_DATA: [T('sf-morales-kacher', 'SF-MOKA-BGU-MISSING-DATA')], PIT: [T('sf-morales-kacher', 'SF-MOKA-TEMPORAL')] }),
  SF_RASCHKE_HOLY_GRAIL: screen({ GOLDEN: [T('sf-holy-grail', 'GC-RAS-ADX-WILDER'), T('sf-holy-grail', 'GC-RAS-OSC-310')], ENTRY_EXIT: [T('sf-holy-grail', 'GC-RAS-FIRST-PULLBACK')], STOP: 'N/A: stop not disclosed (SOURCE_GAP)', GAP: 'N/A: no gap rule disclosed', PIT: [T('sf-holy-grail', 'SF-RAS-TEMPORAL')] }),
});

/** Known measurement findings that apply to every historical use of the snapshot (no new data-quality programme). */
export const MEASUREMENT_FINDINGS = Object.freeze([
  { id: 'V4-D1', class: GAP_CLASS.MEASUREMENT_GAP, detail: 'undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR' },
  { id: 'V4-D2', class: GAP_CLASS.MEASUREMENT_GAP, detail: 'share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results' },
]);

/** The ids a test title declares: the part before the first ':' split at ' / ' (exact match, review SF2-R4-07). */
export const titleIds = (title) => title.split(':')[0].split(' / ').map((x) => x.trim());
const testExists = (idx, t) => { const names = idx[t.file]; return Boolean(names) && [...names].some((n) => titleIds(n).includes(t.name)); };

/**
 * completionGaps(contract, registryEntry, { testIndex }) -> { strategyId, scope, dimensions: [{ id, title, status, gaps[] }] }
 * Dimension status: COMPLETE (no gap), COMPLETE_WITH_DECLARED_LIMITS (only non-blocking gaps: non-essential rules,
 * ORIGINAL-only scope, or a SOURCE_GAP whose readings are all implemented), PARTIAL, NOT_APPLICABLE. A DATA_GAP on an
 * essential in-scope rule keeps the dimension PARTIAL even when its mechanics exist: the data are still missing
 * (review SF2-R1-01 / SF2-R3-02).
 */
export function completionGaps(contract, entry, { testIndex = {} } = {}) {
  const scope = declaredScope(contract), dims = [];
  const ruleGapsOf = (kinds) => contract.rules.filter((r) => kinds.includes(r.kind) && gapClassOf(r)).map((r) => ruleGap(r, scope));
  const statusOf = (gaps) => {
    if (!gaps.length) return 'COMPLETE';
    const blocking = gaps.filter((g) => g.essential && g.scope === 'DECLARED' && !(g.class === GAP_CLASS.SOURCE_GAP && g.allReadingsImplemented));
    return blocking.length ? 'PARTIAL' : 'COMPLETE_WITH_DECLARED_LIMITS';
  };
  const push = (id, gaps, extra = {}) => { const d = DIMENSIONS.find((x) => x.id === id); dims.push({ id, title: d.title, status: extra.status ?? statusOf(gaps), gaps, ...(extra.note ? { note: extra.note } : {}) }); };
  const screenMethod = contract.outputKind !== OUTPUT_KIND.RESEARCH_SIGNAL;

  // D01: every #709 rule of the candidate contexts is mapped or excluded with a reason; NOT_IMPLEMENTED rules are gaps
  const notImpl = contract.rules.filter((r) => r.status === 'NOT_IMPLEMENTED').map((r) => ruleGap(r, scope));
  const unmapped = entry.sourceCoverage.unmapped ? [{ class: GAP_CLASS.IMPLEMENTATION_GAP, ruleId: null, essential: true, scope: 'DECLARED', detail: `${entry.sourceCoverage.unmapped} #709 rules unmapped without exclusion` }] : [];
  push('D01_SOURCE_RULE_COVERAGE', [...notImpl, ...unmapped], { note: `${entry.sourceCoverage.rulesInScope} #709 rules in scope; HARD ${entry.sourceCoverage.hardRulesImplemented}/${entry.sourceCoverage.hardRules} implemented; ${entry.sourceCoverage.excluded} excluded with a written reason` });
  for (const d of DIMENSIONS.filter((x) => x.kinds)) {
    const has = contract.rules.some((r) => d.kinds.includes(r.kind));
    if (!has) { push(d.id, [], { status: 'NOT_APPLICABLE', note: d.id === 'D03_ENTRY' ? `no separate entry rule: the entry is the screen signal (${contract.entryConditions.join('; ')})` : 'the source assigns no rule of this kind to the method' }); continue; }
    push(d.id, ruleGapsOf(d.kinds));
  }
  // D08 execution: research engines need executable fills; screens end at the reviewer
  const entryData = contract.rules.filter((r) => r.kind === 'ENTRY' && isEssential(r) && r.status === 'DATA_BLOCKED' && inScope(r, scope));
  const exec = [];
  if (entryData.length) exec.push({ class: GAP_CLASS.DATA_GAP, ruleId: entryData.map((r) => r.id).join(', '), essential: true, scope: 'DECLARED', detail: `the entry needs data the snapshot lacks: ${contract.timing.earliestExecutable}` });
  else if (screenMethod) exec.push({ class: GAP_CLASS.MANUAL_DECISION, ruleId: null, essential: true, scope: 'DECLARED', detail: `no mechanical order: ${contract.timing.earliestExecutable}` });
  push('D08_EXECUTION', exec, { note: `signal: ${contract.timing.signal}` });
  // D09 data: every DATA_BLOCKED rule (all scopes) and every declared partial data item
  const data = [...contract.rules.filter((r) => r.status === 'DATA_BLOCKED').map((r) => ruleGap(r, scope)), ...(contract.dataPartial || []).map((p) => ({ class: GAP_CLASS.DATA_GAP, ruleId: p.split(':')[0], essential: false, scope: 'DECLARED', detail: p }))];
  push('D09_DATA', data);
  // D10 corporate actions: the shared foundation (ADR-002 split factors, snapshot convention); V4-D1 is a measurement finding
  push('D10_CORPORATE_ACTIONS', [{ class: GAP_CLASS.MEASUREMENT_GAP, ruleId: 'V4-D1', essential: false, scope: 'DECLARED', detail: MEASUREMENT_FINDINGS[0].detail }], { note: `${FOUNDATION.priceTruth.splitFactors}; ${contract.corporateActionPolicy.rule}` });
  // D11 PIT: a temporal (no-look-ahead) test must exist; V4-D2 share classes
  const pitTests = TEST_MATRIX[contract.strategyId].PIT, pitOk = Array.isArray(pitTests) && pitTests.every((t) => testExists(testIndex, t));
  push('D11_PIT', [...(pitOk ? [] : [{ class: GAP_CLASS.IMPLEMENTATION_GAP, ruleId: null, essential: true, scope: 'DECLARED', detail: 'no temporal integrity test' }]), { class: GAP_CLASS.MEASUREMENT_GAP, ruleId: 'V4-D2', essential: false, scope: 'DECLARED', detail: MEASUREMENT_FINDINGS[1].detail }], { note: 'prior-session levels only; snapshot PIT listing table incl. inactive listings' });
  // D12 manual decisions
  push('D12_MANUAL', contract.manualReviewFlags.map((f) => ({ class: GAP_CLASS.MANUAL_DECISION, ruleId: f.id, psr709: f.psr709, essential: f.blocksAutomation, scope: 'DECLARED', detail: f.question })));
  // D13 backtest
  const bt = entry.backtestReadiness === 'DIAGNOSTIC_READY' ? [] : [{ class: GAP_CLASS.MEASUREMENT_GAP, ruleId: null, essential: true, scope: 'DECLARED', detail: entry.backtestReadiness === 'COMPONENT_SIGNAL_STUDY_ONLY' ? 'component signal study only: sizing / selection are manual, no method return can be measured' : 'no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented' }];
  push('D13_BACKTEST', bt);
  // D14 live: never approved in this work
  push('D14_LIVE', [{ class: GAP_CLASS.PRODUCT_GAP, ruleId: 'LIVE_NOT_APPROVED', essential: true, scope: 'DECLARED', detail: 'no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables)' }]);
  // D15 tests: every required category is covered by an existing test or declared N/A
  const tm = TEST_MATRIX[contract.strategyId], tgaps = [];
  for (const cat of TEST_CATEGORIES) {
    const v = tm[cat];
    if (typeof v === 'string') continue;
    if (!v || !v.length) { tgaps.push({ class: GAP_CLASS.IMPLEMENTATION_GAP, ruleId: cat, essential: true, scope: 'DECLARED', detail: `no test for category ${cat}` }); continue; }
    for (const t of v) if (!testExists(testIndex, t)) tgaps.push({ class: GAP_CLASS.IMPLEMENTATION_GAP, ruleId: cat, essential: true, scope: 'DECLARED', detail: `named test missing: ${t.file}: ${t.name}` });
  }
  const untested = contract.rules.filter((r) => (r.status === 'SOURCE_EXACT' || r.status === 'SOURCE_DERIVED') && !(r.tests && r.tests.length));
  for (const r of untested) tgaps.push({ class: GAP_CLASS.IMPLEMENTATION_GAP, ruleId: r.id, essential: true, scope: 'DECLARED', detail: 'implemented rule without test' });
  push('D15_TESTS', tgaps, { note: Object.fromEntries(TEST_CATEGORIES.map((c) => [c, typeof tm[c] === 'string' ? tm[c] : (tm[c] || []).map((t) => `${t.file.split('/').pop()}: ${t.name}`)])) });

  return { strategyId: contract.strategyId, candidateId: contract.candidateId, declaredScope: scope ?? 'SINGLE', dimensions: dims };
}

/** Counts by class over all dimensions (each rule gap counted once per dimension it appears in). */
export function gapCounts(result) {
  const out = Object.fromEntries(Object.keys(GAP_CLASS).map((k) => [k, 0]));
  for (const d of result.dimensions) for (const g of d.gaps) out[g.class]++;
  return out;
}
