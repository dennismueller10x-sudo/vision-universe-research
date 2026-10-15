/**
 * V4.1 Source / Data / Measurement acceptance and method eligibility on repo-verified source evidence.
 *
 * Source basis: the Primary Source Reconstruction of Draft PR #709 (commit 8b766fa), read through the hash-verified
 * extract v4-1/PSR709-EVIDENCE-EXTRACT.json (psr709-extract.mjs). It replaces the owner-attested OSR-* findings that
 * #705 had to use because the reconstruction was not in the repository then. #705 artifacts stay unchanged as
 * historical evidence; this builder writes separate V4.1 files.
 *
 * Measurement basis: unchanged #705 result (SUPERTRADER-V4-CALIBRATION-SUMMARY.json: NOT_CERTIFIED) and the open
 * post-result findings V4-D1 (BLOCKER, undeclared reverse splits) and V4-D2 (MAJOR). No tolerance, quarantine rule or
 * calibration input is changed. No backtest is run.
 *
 * The rules below (SOURCE_RULE_V41, data-requirement mapping, eligibility order) are declared post hoc: #709 was read
 * before they were written. They classify; they do not tune anything.
 *
 * Usage: node build-acceptance-v4-1.mjs [--extract <file>] [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { METHODS as V4_METHODS, ELIGIBILITY_RULE as V4_ELIGIBILITY_RULE } from './build-acceptance-v4.mjs';
import { DEFAULT_EXTRACT, METHOD_CONTEXTS, PRIMARY_CONTEXT } from './psr709-extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V4 = path.resolve(HERE, '..');
export const OUT_DIR = path.join(V4, 'v4-1');

export const SOURCE_RULE_V41 = {
  evidence: '#709 candidate evidence_rule_ids (TOP-IMPLEMENTATION-CANDIDATES) of the method; all rules of the mapped method contexts are reported',
  SOURCE_BLOCKED: 'no #709 implementation candidate and #709 records a missing original source for the method (book partial / chapters missing)',
  SOURCE_PARTIAL: 'an evidence rule needs original or explicit web corroboration before hardening (REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION), has LOW confidence or UNKNOWN modal strength, or is HARD without checked original wording; or #709 states that a core component is not disclosed',
  SOURCE_ACCEPTED: 'every evidence rule is HARD, HIGH confidence, original wording checked and cleared for hard-coding with scope (SCOPE_AND_EXCEPTIONS_REQUIRED)',
  SOURCE_MANUAL_REQUIRED: 'otherwise: the rules are verifiable, but central components are preferences, contextual or optional (DO_NOT_HARDEN_PREFERENCE)',
  manualLayer: 'required when the verdict is not SOURCE_ACCEPTED or #709 marks the method context not_fully_reproducible',
};

/**
 * Per method: V4.1 scope, the #709 sentences that carry a manual or partial decision (verbatim substrings of the #709
 * candidate assessment, checked by the tests), extra data from the #709 assessment, components and engine findings.
 */
export const METHODS_V41 = [
  { id: 'TURTLE_S1_SOURCE', scope: 'VU_EQUITY_ADAPTATION (long-only, daily bars)', originalScope: 'ORIGINAL_FUTURES_REPLICATION', originalData: ['futures'], side: 'LONG',
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'TERMINALS_AND_MISSING_BARS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], component: 'methods/turtle-source-v4.mjs (frozen V4) + methods/turtle-unit-stops-v4-1.mjs (reference)', engineFindings: ['V41-F1'] },
  { id: 'TURTLE_S2_SOURCE', scope: 'VU_EQUITY_ADAPTATION (long-only, daily bars)', originalScope: 'ORIGINAL_FUTURES_REPLICATION', originalData: ['futures'], side: 'LONG',
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'TERMINALS_AND_MISSING_BARS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], component: 'methods/turtle-source-v4.mjs (frozen V4) + methods/turtle-unit-stops-v4-1.mjs (reference)', engineFindings: ['V41-F1'] },
  { id: 'DARVAS_LATER_QA', scope: 'BOX_STATE_MACHINE screen (long side) + MANUAL selection and sizing', side: 'LONG', extraMachineData: [{ category: 'priceFullHistory', psr709: 'DAR-Q9' }],
    psrQuotes: { manual: 'techno-fundamental selection and sizing remain discretionary' },
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], component: 'methods/darvas-box-v4-1.mjs' },
  { id: 'WEINSTEIN_STAGE2_INVESTOR', scope: 'WEEKLY_STAGE_ANALYSIS_INVESTOR_PATH', side: 'LONG', psrQuotes: { manual: 'support interpretation' },
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'WEEKLY_AGGREGATION', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'] },
  { id: 'WEINSTEIN_STAGE2_TRADER', scope: 'WEEKLY_STAGE_ANALYSIS_TRADER_PATH', side: 'LONG',
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'WEEKLY_AGGREGATION', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'] },
  { id: 'MINERVINI_SEPA_VCP', scope: 'MACHINE_SCREEN -> RANKING -> MANUAL REVIEW -> FINAL CANDIDATE', side: 'LONG', psrQuotes: { manual: 'explicit manual decision layer' },
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'CROSS_SECTIONAL_RANKING', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'] },
  { id: 'MINERVINI_POWER_PLAY', scope: 'SEPARATE_EXCEPTION_FAMILY', side: 'LONG',
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'] },
  { id: 'KULLAMAGI_COMMON_BREAKOUT', scope: 'DAILY_ALTERNATIVE (KK-011) with low-of-day stop and distance rejection (KK-012)', originalScope: 'ORH_INTRADAY_REPLICA', originalData: ['intradayHistory'], side: 'LONG',
    psrQuotes: { scope: 'Written daily alternative feasible; ORH requires intraday.' },
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'CROSS_SECTIONAL_RANKING', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'] },
  { id: 'KULLAMAGI_EPISODIC_PIVOT', scope: 'SEPARATE_ENGINE', side: 'LONG', extraMachineData: [{ category: 'catalystsNews', psr709: 'C09 assessment: Timestamped catalysts' }],
    psrQuotes: { data: 'Timestamped catalysts' }, measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'INTRADAY_EXECUTION'] },
  { id: 'KULLAMAGI_PARABOLIC_SHORT', scope: 'SEPARATE_ENGINE (short side)', side: 'SHORT', extraMachineData: [{ category: 'borrow', psr709: 'C10 assessment: borrow/locate history' }],
    psrQuotes: { data: 'borrow/locate history' }, measurement: ['INTRADAY_EXECUTION', 'SHORT_BORROW_LEDGER'] },
  { id: 'MORALES_KACHER_POCKET_PIVOT', scope: 'VOLUME_SIGNATURE detector + MANUAL chart/fundamental context', side: 'LONG',
    psrQuotes: { manual: 'constructive chart context and exits retain discretion' },
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], component: 'methods/pocket-pivot-v4-1.mjs' },
  { id: 'MORALES_KACHER_BUYABLE_GAP_UP', scope: 'GAP/ATR40 detector (daily, at close) + MANUAL volume exception and context', side: 'LONG',
    psrQuotes: { manual: 'keep documented megacap exception' },
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS'], component: 'methods/buyable-gap-up-v4-1.mjs' },
  { id: 'RASCHKE_HOLY_GRAIL', scope: 'DISCLOSED_SETUP_COMPONENT', side: 'LONG_AND_SHORT',
    psrQuotes: { disclosureGap: 'exact stop/order sequence not fully disclosed' },
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'STOP_TRIGGER_FILLS_ON_DAILY_BARS', 'INTRADAY_EXECUTION'] },
  { id: 'ONEIL_CAN_SLIM', scope: 'OUT_OF_MAIN_SCOPE (no #709 candidate)', side: 'LONG', sourceGap: 'GAP-B04',
    machineDataOverride: ['price', 'volume', 'fundamentals', 'estimates', 'institutional', 'industry'],
    measurement: ['TR_ARITHMETIC_AND_CORPORATE_ACTIONS', 'CROSS_SECTIONAL_RANKING'] },
];

/** Data categories. `now` reflects the open V4-D1 blocker; `afterReverseSplitFix` is the status once V4-D1 is closed. */
export const DATA_CATEGORIES_V41 = {
  price: { now: 'DATA_PARTIAL', afterReverseSplitFix: 'DATA_ACCEPTED', basis: 'canonical daily OHLC; V4-D1 (BLOCKER, open): undeclared reverse splits / mis-adjusted split months in the canonical core; #709 availability PARTIAL' },
  volume: { now: 'DATA_PARTIAL', afterReverseSplitFix: 'DATA_ACCEPTED', basis: 'canonical daily volume; split adjustment shares the V4-D1 defect; #709 availability PARTIAL' },
  priceFullHistory: { now: 'DATA_PARTIAL', afterReverseSplitFix: 'DATA_PARTIAL', basis: 'an all-time high needs listing-to-date history; canonical histories start at the history store\'s first session and are not certified back to the listing for every security' },
  intradayHistory: { now: 'DATA_BLOCKED', afterReverseSplitFix: 'DATA_BLOCKED', basis: 'no historical intraday panel (IEX bars only live per trigger day); #709 availability MISSING' },
  fundamentals: { now: 'DATA_PARTIAL', afterReverseSplitFix: 'DATA_PARTIAL', basis: 'SEC first-filing EPS/revenue/shares, partial certification; #709 PARTIAL' },
  estimates: { now: 'DATA_BLOCKED', afterReverseSplitFix: 'DATA_BLOCKED', basis: 'no analyst estimate history; #709 MISSING' },
  surprises: { now: 'DATA_BLOCKED', afterReverseSplitFix: 'DATA_BLOCKED', basis: 'no consensus history; #709 MISSING' },
  guidance: { now: 'DATA_BLOCKED', afterReverseSplitFix: 'DATA_BLOCKED', basis: 'no guidance history; #709 MISSING' },
  industry: { now: 'DATA_PARTIAL', afterReverseSplitFix: 'DATA_PARTIAL', basis: 'current classification only, not point-in-time; #709 PARTIAL' },
  institutional: { now: 'DATA_BLOCKED', afterReverseSplitFix: 'DATA_BLOCKED', basis: 'no 13F/sponsorship panel; #709 MISSING' },
  marketBreadth: { now: 'DATA_PARTIAL', afterReverseSplitFix: 'DATA_PARTIAL', basis: 'derivable from the canonical universe, not certified; #709 PARTIAL' },
  marketRegime: { now: 'DATA_PARTIAL', afterReverseSplitFix: 'DATA_PARTIAL', basis: 'index series available, regime definitions are method-specific; #709 PARTIAL' },
  float: { now: 'DATA_PARTIAL', afterReverseSplitFix: 'DATA_PARTIAL', basis: 'SEC shares outstanding (not free float), not certified PIT; #709 PARTIAL' },
  shortInterest: { now: 'DATA_BLOCKED', afterReverseSplitFix: 'DATA_BLOCKED', basis: 'none; #709 MISSING' },
  borrow: { now: 'DATA_BLOCKED', afterReverseSplitFix: 'DATA_BLOCKED', basis: 'no locate / borrow fee history' },
  futures: { now: 'DATA_BLOCKED', afterReverseSplitFix: 'DATA_BLOCKED', basis: 'no futures chains, contract values, rolls' },
  catalystsNews: { now: 'DATA_BLOCKED', afterReverseSplitFix: 'DATA_BLOCKED', basis: 'no point-in-time news / catalyst feed' },
};
/** #709 DATA-REQUIREMENTS field -> V4.1 category. */
export const PSR_FIELD_TO_CATEGORY = { price: 'price', volume: 'volume', intraday: 'intradayHistory', fundamentals: 'fundamentals', estimates: 'estimates', surprises: 'surprises', guidance: 'guidance', industry: 'industry', institutional: 'institutional', market_breadth: 'marketBreadth', market_regime: 'marketRegime', float: 'float', shares: 'float', short_interest: 'shortInterest' };
/** #709 requirement wording -> layer in the V4.1 scope. */
export function requirementLayer(requirement, { side, manualLayer }) {
  if (requirement === 'NOT_EXPLICITLY_REQUIRED') return 'NONE';
  if (requirement === 'REQUIRED' || requirement === 'REQUIRED_OR_CONTEXTUAL') return 'MACHINE';
  if (requirement === 'REQUIRED_FOR_REALISTIC_EQUITY_SHORT_EXECUTION') return side === 'SHORT' ? 'MACHINE' : 'OUT_OF_SCOPE_SHORT_SIDE';
  if (requirement === 'OPTIONAL_FOR_EXPLICIT_DAILY_VARIANT; REQUIRED_FOR_ORH_REPLICA') return 'ORIGINAL_SCOPE_ONLY';
  if (/CONTEXTUAL|REQUIRED_FOR_GROUP_SELECTION|REQUIRED_FOR_FULL_MARKET_CONTEXT/.test(requirement)) return manualLayer ? 'MANUAL' : 'CONTEXT_NOT_USED';
  throw new Error(`UNMAPPED_PSR709_REQUIREMENT:${requirement}`);
}

export const MEASUREMENT_COMPONENTS_V41 = {
  TR_ARITHMETIC_AND_CORPORATE_ACTIONS: { externalSlice: 'EW_MARKET' },
  TERMINALS_AND_MISSING_BARS: { externalSlice: 'EW_MARKET' },
  CROSS_SECTIONAL_RANKING: { externalSlice: ['MOM_12_2_EW_DECILES', 'VAR_60D_EW_QUINTILES'] },
  STOP_TRIGGER_FILLS_ON_DAILY_BARS: { externalSlice: null, internal: 'method golden cases (fill = max(trigger, open) on the trigger bar)' },
  WEEKLY_AGGREGATION: { externalSlice: null, internal: null, note: 'not built; #705 listed it with the text "not built in V4", V4.1 counts that as no measurement path' },
  INTRADAY_EXECUTION: { externalSlice: null, internal: null },
  SHORT_BORROW_LEDGER: { externalSlice: null, internal: null },
};

/** Pre-registered in #705 (rule 21); reproduced unchanged except that RESEARCH_ONLY reasons now cite #709. */
export const ELIGIBILITY_RULE_V41 = { ...V4_ELIGIBILITY_RULE, RESEARCH_ONLY: 'source partial or blocked per SOURCE_RULE_V41 (#709 evidence), or measurement blocked, or an open engine source deviation' };

export const ENGINE_FINDINGS_V41 = [
  { id: 'V41-F1', severity: 'MAJOR', status: 'OPEN', blocks: 'any Turtle performance run', methods: ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'],
    title: 'Frozen V4 Turtle engine moves all unit stops to 2N below the newest fill; #709 TUR-STOPADD/TUR-STOPGAP raise earlier units by 1/2 N per add, so after a gapped add the units carry different stops',
    evidence: '#709 TUR-CRUDE worked example (W-TUR printed pp. 22-23): fills 28.30/28.90/29.50/30.80, N 1.20 -> stops 27.70, 27.70, 27.70, 28.40; frozen V4 reading -> 28.40 for all four units (scripts/supertrader/tests/v41-turtle-source-examples.test.mjs)',
    notFixedHere: 'turtle-source-v4.mjs is part of freeze V4-beae51ae1b07768b and a strategy change needs its own PR with a before/after comparison; methods/turtle-unit-stops-v4-1.mjs is the source-traced reference the next engine version must reproduce',
    sameBehaviourWhen: 'every add fills exactly at its 1/2 N level (no gap)' },
  { id: 'V41-F2', severity: 'MINOR', status: 'DECLARED', methods: ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE'],
    title: 'Equity translation keeps fractional shares; #709 TUR-UNIT floors to whole contracts', evidence: 'TUR-HO2002: floor(0.01 x 1,000,000 / (0.0141 x 42,000)) = 16 contracts', notFixedHere: 'declared TRANSLATION (T4-UNIT), not a deviation for equities' },
];

const sourceGapById = (x, id) => x.sourceGaps.find((g) => g.gap_id === id);

export function sourceDecision(m, x) {
  const ctx = METHOD_CONTEXTS[m.id], ruleById = new Map(x.rules.map((r) => [r.rule_id, r]));
  const rules = x.rules.filter((r) => ctx.contexts.includes(r.method));
  const stats = (rs, k) => rs.reduce((a, r) => ((a[r[k]] = (a[r[k]] || 0) + 1), a), {});
  const allRules = { total: rules.length, byModal: stats(rules, 'modal_strength'), byClearance: stats(rules, 'hard_coding_clearance'), byConfidence: stats(rules, 'confidence'), originalWordingChecked: rules.filter((r) => r.original_wording_checked).length };
  const repro = x.reproducibility.find((r) => r.method === PRIMARY_CONTEXT[m.id]);
  const cand = ctx.candidate ? x.candidates.find((c) => c.candidate_id === ctx.candidate) : null;
  if (!cand) {
    const gap = m.sourceGap ? sourceGapById(x, m.sourceGap) : null;
    if (!gap) throw new Error(`NO_CANDIDATE_AND_NO_SOURCE_GAP:${m.id}`);
    return { verdict: 'SOURCE_BLOCKED', candidate: null, evidence: [], blockers: [`${gap.gap_id}: ${gap.book_status} - missing ${[].concat(gap.missing_sections ?? gap.missing).join('; ')}`, `#709 reproducibility ${repro?.reproducibility} for ${PRIMARY_CONTEXT[m.id]}`], manualLayer: true, allRules, reproducibility: repro };
  }
  const evidence = cand.evidence_rule_ids.map((id) => ruleById.get(id));
  const blockers = evidence.filter((r) => r.hard_coding_clearance === 'REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION' || r.confidence === 'LOW' || r.modal_strength === 'UNKNOWN' || (r.modal_strength === 'HARD' && !r.original_wording_checked))
    .map((r) => `${r.rule_id}: ${r.modal_strength}/${r.confidence}/${r.original_wording_checked ? 'checked' : 'unchecked'}/${r.hard_coding_clearance}`);
  if (m.psrQuotes?.disclosureGap) blockers.push(`${cand.candidate_id} assessment: "${m.psrQuotes.disclosureGap}"`);
  const hardenable = (r) => r.modal_strength === 'HARD' && r.confidence === 'HIGH' && r.original_wording_checked && r.hard_coding_clearance === 'SCOPE_AND_EXCEPTIONS_REQUIRED';
  const verdict = blockers.length ? 'SOURCE_PARTIAL' : evidence.every(hardenable) ? 'SOURCE_ACCEPTED' : 'SOURCE_MANUAL_REQUIRED';
  const manualLayer = verdict !== 'SOURCE_ACCEPTED' || repro?.not_fully_reproducible === true;
  return {
    verdict, candidate: cand.candidate_id, candidateMethod: cand.method, assessment: cand.assessment, blockers, manualLayer,
    manualLayerBasis: manualLayer ? [verdict !== 'SOURCE_ACCEPTED' ? `verdict ${verdict}` : null, repro?.not_fully_reproducible ? `#709 ${repro.method} not_fully_reproducible` : null, m.psrQuotes?.manual ? `${cand.candidate_id}: "${m.psrQuotes.manual}"` : null].filter(Boolean) : [],
    evidence: evidence.map((r) => ({ ruleId: r.rule_id, modal: r.modal_strength, confidence: r.confidence, originalWordingChecked: r.original_wording_checked, clearance: r.hard_coding_clearance, source: `${r.source_id} ${r.page_location}`, hardenable: hardenable(r) })),
    hardenableRuleIds: rules.filter(hardenable).map((r) => r.rule_id),
    allRules, reproducibility: repro && { method: repro.method, reproducibility: repro.reproducibility, disclosedComponent: repro.disclosed_component_reproducibility, notFullyReproducible: repro.not_fully_reproducible, originalEnglishCheckedForAllRules: repro.original_english_checked_for_all_rules, vuFeasibility: repro.vu_feasibility },
  };
}

export function dataDecision(m, x, src, phase = 'now') {
  const req = x.dataRequirements.find((d) => d.method === PRIMARY_CONTEXT[m.id]);
  const rows = [];
  if (m.machineDataOverride) for (const c of m.machineDataOverride) rows.push({ category: c, layer: 'MACHINE', psr709: 'method core (no #709 candidate)' });
  else for (const r of req.requirements) {
    const layer = requirementLayer(r.requirement, { side: m.side, manualLayer: src.manualLayer });
    if (layer !== 'NONE') rows.push({ category: PSR_FIELD_TO_CATEGORY[r.field], layer, psr709: `${r.field}: ${r.requirement} (${r.availability})` });
  }
  for (const e of m.extraMachineData ?? []) rows.push({ category: e.category, layer: 'MACHINE', psr709: e.psr709 });
  for (const c of m.originalData ?? []) rows.push({ category: c, layer: 'ORIGINAL_SCOPE_ONLY', psr709: m.originalScope });
  const seen = new Map();
  for (const r of rows) { const k = `${r.category}|${r.layer}`; if (!seen.has(k)) seen.set(k, { ...r, status: DATA_CATEGORIES_V41[r.category][phase] }); }
  const out = [...seen.values()], machine = out.filter((r) => r.layer === 'MACHINE');
  const verdict = machine.some((r) => r.status === 'DATA_BLOCKED') ? 'DATA_BLOCKED' : machine.some((r) => r.status === 'DATA_PARTIAL') ? 'DATA_PARTIAL' : 'DATA_ACCEPTED';
  const orig = out.filter((r) => r.layer === 'ORIGINAL_SCOPE_ONLY');
  return { verdict, categories: out, originalScope: orig.length ? { scope: m.originalScope, status: orig.some((r) => r.status === 'DATA_BLOCKED') ? 'DATA_BLOCKED' : 'DATA_PARTIAL', missing: orig.map((r) => r.category) } : null };
}

export function measurementDecision(m, cert) {
  const ext = new Set(cert.externallyValidatedSlices ?? []);
  const rows = m.measurement.map((c) => {
    const d = MEASUREMENT_COMPONENTS_V41[c], slices = [d.externalSlice].flat().filter(Boolean);
    if (slices.some((s) => ext.has(s))) return { component: c, status: 'EXTERNALLY_VALIDATED' };
    if (d.internal) return { component: c, status: 'INTERNAL_ONLY', basis: d.internal };
    return { component: c, status: slices.length ? 'EXTERNAL_SLICE_NOT_VALIDATED' : 'NO_MEASUREMENT_PATH' };
  });
  const baseOk = ext.has('EW_MARKET') && cert.level !== 'NOT_CERTIFIED';
  const verdict = !baseOk || rows.some((r) => r.status === 'NO_MEASUREMENT_PATH') ? 'MEASUREMENT_BLOCKED'
    : rows.every((r) => r.status === 'EXTERNALLY_VALIDATED') ? 'MEASUREMENT_ACCEPTED' : 'MEASUREMENT_PARTIAL';
  return { verdict, certificationLevel: cert.level, components: rows, noPath: rows.filter((r) => r.status === 'NO_MEASUREMENT_PATH').map((r) => r.component) };
}

export function eligibilityDecision(m, src, data, meas) {
  if (src.verdict === 'SOURCE_PARTIAL' || src.verdict === 'SOURCE_BLOCKED') return { status: 'RESEARCH_ONLY', reasons: [`${src.verdict} (#709)`, ...src.blockers] };
  if (data.verdict === 'DATA_BLOCKED') return { status: 'DATA_BLOCKED', reasons: data.categories.filter((r) => r.layer === 'MACHINE' && r.status === 'DATA_BLOCKED').map((r) => r.category), manualLayer: src.manualLayer };
  if (src.manualLayer) return { status: 'MANUAL_LAYER_REQUIRED', machineScreenAllowed: true, buyDeclarationAllowed: false, reasons: src.manualLayerBasis };
  const engine = (m.engineFindings ?? []).filter((id) => ENGINE_FINDINGS_V41.find((f) => f.id === id)?.status === 'OPEN');
  if (meas.verdict === 'MEASUREMENT_BLOCKED' || engine.length) return { status: 'RESEARCH_ONLY', reasons: [...(meas.verdict === 'MEASUREMENT_BLOCKED' ? [`MEASUREMENT_BLOCKED (${meas.certificationLevel})`] : []), ...engine] };
  return { status: 'IMPLEMENT_NOW', claimReady: false, claimReadyRequires: ELIGIBILITY_RULE_V41.claimReady };
}

/** Golden-case availability: executable synthetic goldens of V4.1 components plus the #709 case catalogue per method. */
export function goldenAvailability(m, x, executable) {
  const ids = new Set(x.reproducibility.filter((r) => METHOD_CONTEXTS[m.id].contexts.includes(r.method)).flatMap((r) => r.source_context_case_ids));
  const cases = x.cases.filter((c) => ids.has(c.case_id));
  const byCategory = cases.reduce((a, c) => ((a[c.personal_trade_category] = (a[c.personal_trade_category] || 0) + 1), a), {});
  const exe = executable[m.id] ?? [];
  return { status: exe.length ? 'EXECUTABLE' : cases.length ? 'CATALOGUE_ONLY' : 'NONE', executableCaseIds: exe, psr709CaseCount: cases.length, psr709ByCategory: byCategory, psr709CaseIds: cases.map((c) => c.case_id) };
}

/** Projection for the separate list "measurable immediately after the reverse-split fix" (rule 9 of the task). */
export const AFTER_FIX_ASSUMPTION = {
  certification: { level: 'PARTIALLY_CERTIFIED', externallyValidatedSlices: ['EW_MARKET'] },
  conditions: ['V4-D1 closed by a Quant PR in the canonical core (quant/engines, protected path)', 'new capture and a re-run of the calibration with the unchanged pre-registered V4.1 tolerances', 'that run certifies at least the EW_MARKET slice (V4-D2 MAJOR may still prevent it)'],
  note: 'hypothetical input; it is not a measurement and does not change any verdict of the current matrix',
};

export function buildAcceptanceV41({ extract, calibration, executableGoldens = {} }) {
  const cert = calibration.certification;
  const rows = METHODS_V41.map((m) => {
    const src = sourceDecision(m, extract), data = dataDecision(m, extract, src), meas = measurementDecision(m, cert), elig = eligibilityDecision(m, src, data, meas);
    const dataFix = dataDecision(m, extract, src, 'afterReverseSplitFix'), measFix = measurementDecision(m, AFTER_FIX_ASSUMPTION.certification), eligFix = eligibilityDecision(m, src, dataFix, measFix);
    const prev = V4_METHODS.find((v) => v.id === m.id);
    return { m, src, data, meas, elig, dataFix, measFix, eligFix, prev, golden: goldenAvailability(m, extract, executableGoldens) };
  });
  const meta = { generation: 'V4.1', postHoc: true, createdFor: 'research/supertrader-source-acceptance-v4-1', sourceEvidence: { pullRequest: extract.pin.pullRequest, commit: extract.pin.commit, manifestSha256: extract.pin.manifestSha256, filesVerified: extract.pin.filesVerified, mismatches: extract.pin.mismatches, finalReview: extract.finalReview }, measurementEvidence: { pullRequest: 705, freezeId: calibration.freezeId, runId: calibration.runId, level: cert.level, openPostResultFindings: ['V4-D1 BLOCKER', 'V4-D2 MAJOR'] }, replaces: 'OSR-* owner-attested findings of #705 (SUPERTRADER-V4-SOURCE-ACCEPTANCE.json stays unchanged as historical evidence)' };
  const measurableNow = (r) => {
    if (r.eligFix.status === 'IMPLEMENT_NOW') return { class: 'FULL_METHOD', note: 'source accepted, no manual layer' };
    const engine = (r.m.engineFindings ?? []);
    if (r.eligFix.status === 'RESEARCH_ONLY' && r.src.verdict === 'SOURCE_ACCEPTED' && !r.src.manualLayer && r.dataFix.verdict === 'DATA_ACCEPTED' && r.measFix.verdict !== 'MEASUREMENT_BLOCKED' && engine.length)
      return { class: 'FULL_METHOD_AFTER_ENGINE_FINDINGS', requires: engine, note: 'code-only prerequisite, no data dependency' };
    if (r.eligFix.status === 'MANUAL_LAYER_REQUIRED' && r.m.component && r.measFix.verdict !== 'MEASUREMENT_BLOCKED')
      return { class: 'MACHINE_SCREEN_COMPONENT_ONLY', component: r.m.component, note: 'signal-level measurement of the machine screen; manual decisions are logged forward only and never back-filled, so the full method is not historically measurable' };
    const why = [];
    if (r.src.verdict === 'SOURCE_PARTIAL' || r.src.verdict === 'SOURCE_BLOCKED') why.push(r.src.verdict);
    if (r.dataFix.verdict === 'DATA_BLOCKED') why.push(`DATA_BLOCKED: ${r.dataFix.categories.filter((c) => c.layer === 'MACHINE' && c.status === 'DATA_BLOCKED').map((c) => c.category).join(', ')}`);
    if (r.measFix.noPath.length) why.push(`NO_MEASUREMENT_PATH: ${r.measFix.noPath.join(', ')}`);
    if (r.eligFix.status === 'MANUAL_LAYER_REQUIRED' && !r.m.component) why.push('MANUAL_LAYER_REQUIRED and no V4.1 machine-screen component built');
    return { class: 'NOT_IMMEDIATELY_MEASURABLE', reasons: why };
  };
  const matrix = rows.map((r) => ({
    id: r.m.id, candidate: r.src.candidate, scope: r.m.scope,
    source: r.src.verdict, data: r.data.verdict, measurement: r.meas.verdict, eligibility: r.elig.status,
    manualLayer: r.src.manualLayer, goldenCases: r.golden.status,
    previous705: null,
    afterReverseSplitFix: { data: r.dataFix.verdict, measurement: r.measFix.verdict, eligibility: r.eligFix.status, measurability: measurableNow(r) },
  }));
  return {
    source: { schema: 'supertrader-v4-1-source-acceptance-1.0.0', ...meta, rule: SOURCE_RULE_V41, methods: rows.map(({ m, src }) => ({ id: m.id, scope: m.scope, ...src })) },
    data: { schema: 'supertrader-v4-1-data-acceptance-1.0.0', ...meta, categories: DATA_CATEGORIES_V41, fieldMap: PSR_FIELD_TO_CATEGORY, methods: rows.map(({ m, data, dataFix }) => ({ id: m.id, verdict: data.verdict, afterReverseSplitFix: dataFix.verdict, categories: data.categories, originalScope: data.originalScope })) },
    measurement: { schema: 'supertrader-v4-1-measurement-acceptance-1.0.0', ...meta, unchangedFrom705: { tolerances: 'unchanged', quarantineRules: 'unchanged', calibrationInputs: 'unchanged' }, components: MEASUREMENT_COMPONENTS_V41, methods: rows.map(({ m, meas, measFix }) => ({ id: m.id, verdict: meas.verdict, components: meas.components, afterReverseSplitFix: measFix.verdict })), afterFixAssumption: AFTER_FIX_ASSUMPTION },
    eligibility: { schema: 'supertrader-v4-1-method-eligibility-1.0.0', ...meta, rule: ELIGIBILITY_RULE_V41, engineFindings: ENGINE_FINDINGS_V41, methods: rows.map(({ m, src, data, meas, elig, golden }) => ({ id: m.id, source: src.verdict, data: data.verdict, measurement: meas.verdict, eligibility: elig.status, ...elig, goldenCases: golden })) },
    matrix: { schema: 'supertrader-v4-1-final-matrix-1.0.0', ...meta, columns: ['source', 'data', 'measurement', 'eligibility'], matrix,
      measurableImmediatelyAfterReverseSplitFix: matrix.filter((r) => r.afterReverseSplitFix.measurability.class !== 'NOT_IMMEDIATELY_MEASURABLE').map((r) => ({ id: r.id, ...r.afterReverseSplitFix.measurability })),
      notMeasurableAfterFix: matrix.filter((r) => r.afterReverseSplitFix.measurability.class === 'NOT_IMMEDIATELY_MEASURABLE').map((r) => ({ id: r.id, reasons: r.afterReverseSplitFix.measurability.reasons })),
      afterFixAssumption: AFTER_FIX_ASSUMPTION, performanceRuns: 0, backtests: 0 },
  };
}

/** #705 eligibility (historical) for the before/after column. */
export function previousEligibility() {
  const f = path.join(V4, 'SUPERTRADER-V4-METHOD-ELIGIBILITY.json');
  return new Map(JSON.parse(fs.readFileSync(f, 'utf8')).methods.map((r) => [r.id, { source: r.source, eligibility: r.eligibility }]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const extract = JSON.parse(fs.readFileSync(get('--extract') ?? DEFAULT_EXTRACT, 'utf8'));
  const calibration = JSON.parse(fs.readFileSync(path.join(V4, 'SUPERTRADER-V4-CALIBRATION-SUMMARY.json'), 'utf8'));
  const { EXECUTABLE_GOLDENS_V41 } = await import('../methods/build-method-artifacts-v4-1.mjs');
  const out = get('--out') ? path.resolve(get('--out')) : OUT_DIR;
  const r = buildAcceptanceV41({ extract, calibration, executableGoldens: EXECUTABLE_GOLDENS_V41 });
  const prev = previousEligibility();
  for (const row of r.matrix.matrix) row.previous705 = prev.get(row.id) ?? null;
  fs.mkdirSync(out, { recursive: true });
  const write = (name, v) => fs.writeFileSync(path.join(out, name), JSON.stringify(v, null, 2) + '\n');
  write('SUPERTRADER-V4-1-SOURCE-ACCEPTANCE.json', r.source);
  write('SUPERTRADER-V4-1-DATA-ACCEPTANCE.json', r.data);
  write('SUPERTRADER-V4-1-MEASUREMENT-ACCEPTANCE.json', r.measurement);
  write('SUPERTRADER-V4-1-METHOD-ELIGIBILITY.json', r.eligibility);
  write('SUPERTRADER-V4-1-FINAL-MATRIX.json', r.matrix);
  for (const row of r.matrix.matrix) process.stdout.write(`${row.id.padEnd(30)} ${row.source.padEnd(23)} ${row.data.padEnd(13)} ${row.measurement.padEnd(20)} ${row.eligibility.padEnd(22)} 705:${row.previous705?.eligibility} | fix: ${row.afterReverseSplitFix.eligibility} ${row.afterReverseSplitFix.measurability.class}\n`);
}
