/**
 * Supertrader 2.0 completion status (mandate section 18) as separate dimensions, so that for example a mechanically
 * complete engine is at the same time LIVE_NOT_APPROVED. Every value is derived from the contract, the registry entry,
 * the completion gaps and - for research engines - the acceptance gate (section 6). Nothing is set by hand.
 *
 *  engine:  RESEARCH_ENGINE_COMPLETE                      research-signal method, acceptance gate PASS, no data exception
 *           RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION  gate PASS, but an essential in-scope rule is DATA_BLOCKED; its
 *                                                         mechanics exist and are tested, no run can enforce it yet
 *           MECHANICAL_SCREEN_COMPLETE  screen method: every machine-decidable rule implemented and tested, no
 *                                       IMPLEMENTATION_GAP left; the rest is manual, data- or source-blocked by the source
 *           MECHANICAL_COMPONENTS_ONLY  screen method without an implementation gap whose essential entry needs missing
 *                                       data or is not disclosed by the source: only components (evidence, checks) run
 *           INCOMPLETE                  an IMPLEMENTATION_GAP remains (or the gate fails)
 *  flags:   PARTIAL_DATA_BLOCKED, PARTIAL_SOURCE_BLOCKED, MANUAL_REVIEW_REQUIRED, BACKTEST_DIAGNOSTIC_READY,
 *           COMPONENT_STUDY_ONLY, LIVE_NOT_APPROVED (always)
 */
import { OUTPUT_KIND } from '../contract.mjs';
import { GAP_CLASS, titleIds } from './gaps.mjs';

export const STATUS_SCHEMA = 'supertrader-sf-completion-status-1.1.0';
export const ENGINE_STATE = Object.freeze({ RESEARCH_ENGINE_COMPLETE: 'RESEARCH_ENGINE_COMPLETE', RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION: 'RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION', MECHANICAL_SCREEN_COMPLETE: 'MECHANICAL_SCREEN_COMPLETE', MECHANICAL_COMPONENTS_ONLY: 'MECHANICAL_COMPONENTS_ONLY', INCOMPLETE: 'INCOMPLETE' });

/** Per research method: the tests the gate requires (review SF2-R3-05: no Turtle names for other methods). */
export const GATE_TESTS = Object.freeze({
  SF_TURTLE_S1: Object.freeze({ accounting: ['SF-TUR-ACCOUNTING'], temporal: ['SF-TUR-TEMPORAL', 'SF-TUR-WARMUP-CAUSAL'] }),
  SF_TURTLE_S2: Object.freeze({ accounting: ['SF-TUR-ACCOUNTING'], temporal: ['SF-TUR-TEMPORAL', 'SF-TUR-WARMUP-CAUSAL'] }),
});
const RULE_DIMS = ['D02_SIGNAL', 'D03_ENTRY', 'D04_EXIT', 'D05_STOP', 'D06_SIZING', 'D07_PORTFOLIO_RISK'];
const allGaps = (g) => g.dimensions.flatMap((d) => d.gaps.map((x) => ({ ...x, dimension: d.id })));
const inRuleDims = (g) => g.essential && g.scope === 'DECLARED' && RULE_DIMS.includes(g.dimension);

/**
 * Acceptance gate of a research engine (mandate section 6). Inputs are artifacts, never results: golden results of
 * the test run, review summary, and the public receipts of snapshot runs. A run counts for AG-3 only if its code
 * fingerprint equals the current one (codeSha256 of run-research.mjs over the engine, runner and accounting files;
 * review SF2-R3-03), so neither a version string nor an older run can satisfy it.
 */
export function acceptanceGate(contract, entry, gaps, { golden, reviews, referenceRuns = [], codeSha256, modelAssumptions = [], scenarioIds = [] }) {
  const gs = allGaps(gaps), mine = golden.cases.filter((c) => c.strategyIds.includes(contract.strategyId));
  const T = GATE_TESTS[contract.strategyId];
  if (!T) throw new Error(`NO_GATE_TESTS:${contract.strategyId}`);
  const allTests = golden.allTests ?? [];
  const passed = (name) => allTests.some((t) => titleIds(t.name).includes(name) && t.result === 'PASS');
  const ruleExceptions = gs.filter((g) => inRuleDims(g) && (g.class === GAP_CLASS.DATA_GAP || g.class === GAP_CLASS.SOURCE_GAP));
  const unresolved = ruleExceptions.filter((g) => (g.class === GAP_CLASS.DATA_GAP ? !g.mechanicsImplemented : !g.allReadingsImplemented));
  const current = referenceRuns.filter((r) => r.codeSha256 && r.codeSha256 === codeSha256);
  const checks = [
    { id: 'AG-1-RULES', title: 'every rule of the declared equity scope implemented; a data-blocked rule only with implemented and tested mechanics (declared data exception), an ambiguous rule only with every reading implemented', pass: !gs.some((g) => inRuleDims(g) && [GAP_CLASS.IMPLEMENTATION_GAP, GAP_CLASS.MANUAL_DECISION].includes(g.class)) && unresolved.length === 0, detail: ruleExceptions.map((g) => `${g.ruleId} (${g.class}${g.class === GAP_CLASS.DATA_GAP ? `, mechanics ${g.mechanicsImplemented ? 'implemented, data missing' : 'missing'}` : `, readings ${g.allReadingsImplemented ? 'all implemented' : 'incomplete'}`})`) },
    { id: 'AG-2-GOLDEN-AND-RULE-TESTS', title: 'all golden and rule tests of the method pass (#709 worked examples and synthetic rule cases)', pass: mine.length > 0 && mine.every((c) => c.result === 'PASS'), detail: `${mine.filter((c) => c.result === 'PASS').length}/${mine.length}` },
    { id: 'AG-3-RECONCILED', title: 'execution and accounting reconciled: synthetic ledger replay and every scenario of a snapshot run of the CURRENT code fingerprint', pass: T.accounting.every(passed) && current.length > 0 && current.every((r) => r.allScenariosReconciled && r.endingPositionCheck === 'PASS'), detail: referenceRuns.map((r) => `${r.method} run ${r.runId} (${r.codeVersion}, code ${String(r.codeSha256 ?? 'n/a').slice(0, 12)}${r.codeSha256 === codeSha256 ? ', current' : ', other code: regression reference only'}): reconciliation ${r.allScenariosReconciled ? 'PASS' : 'FAIL'}`) },
    { id: 'AG-4-NO-LOOKAHEAD', title: 'no look-ahead (temporal and warm-up tests)', pass: T.temporal.every(passed) },
    { id: 'AG-5-NO-UNSOURCED-PRICE', title: 'no unsourced price assumption: fills follow the source entry / gap rules; every model assumption (unknown intrabar order, source-silent reading) is declared with a reference reading, and each boundable one runs its alternative as a scenario', pass: contract.rules.filter((r) => r.status === 'SOURCE_DERIVED').every((r) => r.derivation) && (contract.modelAssumptions || []).length > 0 && (contract.modelAssumptions || []).every((id) => { const m = modelAssumptions.find((x) => x.id === id); return m && m.reference && (!m.alternative || scenarioIds.includes(m.alternative.scenario)); }), detail: (contract.modelAssumptions || []).map((id) => { const m = modelAssumptions.find((x) => x.id === id); return `${id}: reference ${m?.reference?.option ?? '?'}; alternative ${m?.alternative ? `${m.alternative.option} (scenario ${m.alternative.scenario})` : 'none (fixed convention, declared)'}`; }) },
    { id: 'AG-6-NO-IMPLEMENTATION-GAP', title: 'no known implementation gap', pass: !gs.some((g) => g.class === GAP_CLASS.IMPLEMENTATION_GAP), detail: gs.filter((g) => g.class === GAP_CLASS.IMPLEMENTATION_GAP).map((g) => `${g.dimension}: ${g.detail}`) },
    { id: 'AG-7-REVIEWS', title: 'independent reviews: no open HIGH / CRITICAL finding', pass: reviews.openHighOrCritical === 0, detail: `open HIGH/CRITICAL ${reviews.openHighOrCritical}` },
  ];
  const dataExceptions = ruleExceptions.filter((g) => g.class === GAP_CLASS.DATA_GAP).map((g) => g.ruleId);
  return { strategyId: contract.strategyId, scope: 'EQUITY_ADAPTATION', pass: checks.every((c) => c.pass), dataExceptions: [...new Set(dataExceptions)], checks, notLiveApproval: 'a complete research engine is not a strategy approved for live trading' };
}

export function completionStatus(contract, entry, gaps, gate = null) {
  const gs = allGaps(gaps), has = (cls, pred = () => true) => gs.some((g) => g.class === cls && pred(g));
  let engine = ENGINE_STATE.INCOMPLETE;
  if (contract.outputKind === OUTPUT_KIND.RESEARCH_SIGNAL) {
    if (gate?.pass) engine = gate.dataExceptions.length ? ENGINE_STATE.RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION : ENGINE_STATE.RESEARCH_ENGINE_COMPLETE;
  } else if (!has(GAP_CLASS.IMPLEMENTATION_GAP)) {
    const entryBlocked = gs.some((g) => g.dimension === 'D03_ENTRY' && g.essential && g.scope === 'DECLARED' && (g.class === GAP_CLASS.DATA_GAP || (g.class === GAP_CLASS.SOURCE_GAP && !g.mechanicsImplemented)));
    engine = entryBlocked ? ENGINE_STATE.MECHANICAL_COMPONENTS_ONLY : ENGINE_STATE.MECHANICAL_SCREEN_COMPLETE;
  }
  const flags = [];
  if (has(GAP_CLASS.DATA_GAP)) flags.push('PARTIAL_DATA_BLOCKED');
  if (has(GAP_CLASS.SOURCE_GAP)) flags.push('PARTIAL_SOURCE_BLOCKED');
  if (has(GAP_CLASS.MANUAL_DECISION, (g) => g.essential)) flags.push('MANUAL_REVIEW_REQUIRED');
  if (entry.backtestReadiness === 'DIAGNOSTIC_READY') flags.push('BACKTEST_DIAGNOSTIC_READY');
  if (entry.backtestReadiness === 'COMPONENT_SIGNAL_STUDY_ONLY') flags.push('COMPONENT_STUDY_ONLY');
  flags.push('LIVE_NOT_APPROVED');
  const essentialBlocking = (cls) => [...new Set(gs.filter((g) => g.class === cls && g.essential && g.scope === 'DECLARED').map((g) => g.ruleId).filter(Boolean))];
  return {
    strategyId: contract.strategyId, candidateId: contract.candidateId, sourceContractVersion: contract.sourceContractVersion,
    engine, flags,
    implementationStatus: entry.implementationStatus, statusByScope: entry.statusByScope,
    backtestReadiness: entry.backtestReadiness, liveReadiness: 'LIVE_NOT_APPROVED',
    // a full method measurement needs the complete engine WITHOUT a data exception (mandate section 14)
    fullMethodMeasurable: engine === ENGINE_STATE.RESEARCH_ENGINE_COMPLETE && entry.backtestReadiness === 'DIAGNOSTIC_READY',
    modelAssumptions: contract.modelAssumptions || [],
    blockingDataRules: essentialBlocking(GAP_CLASS.DATA_GAP), blockingSourceRules: essentialBlocking(GAP_CLASS.SOURCE_GAP), manualDecisions: essentialBlocking(GAP_CLASS.MANUAL_DECISION),
    acceptanceGate: gate ? { pass: gate.pass, dataExceptions: gate.dataExceptions, failed: gate.checks.filter((c) => !c.pass).map((c) => c.id) } : null,
  };
}
