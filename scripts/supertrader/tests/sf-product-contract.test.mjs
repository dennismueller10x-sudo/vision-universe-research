// Supertrader 7.0 – Produktvertrag fuer spaetere Kandidatenanzeigen (reiner Datenvertrag, keine Laufintegration).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  STAGE, STAGE_ORDER, VALIDATED_ISSUABLE, REQUIRED_DISCLAIMERS, PRICE_TRUTH, CANDIDATE_CONTRACT_VERSION,
  validateCandidateRecord, deriveStageCeiling, stageCeilings, blockReasonsFor, recordIdFor, ruleClasses,
  checkStageTransition, loadSf6Readiness, candidateContractSha256,
} from '../source-faithful/product/candidate-contract.mjs';
import { CONTRACTS } from '../source-faithful/registry.mjs';
import { contractFingerprint } from '../source-faithful/contract.mjs';
import { sf8RegistryViolations, SF8_DOMAIN_ID, SF8_DOMAIN_PINNED, SF8_ACTIVATION_STATE } from '../source-faithful/product/registry-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const Identity = createRequire(import.meta.url)(path.join(ROOT, 'core/identity.js'));
const READINESS = loadSf6Readiness();
const FIXTURE = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/sf-product-candidates.json'), 'utf8'));
const byStage = (s, i = 0) => structuredClone(FIXTURE.records.filter((r) => r.stage === s)[i]);
const MODELED = () => byStage(STAGE.MODELED_TRADE_PLAN);
const CONFIRMED = () => byStage(STAGE.CONFIRMED_RESEARCH_SETUP);
const CHART = () => byStage(STAGE.CHART_CANDIDATE);
const v = (r, readiness = READINESS) => validateCandidateRecord(r, { readiness });
/** re-derive the derived fields after a deliberate change, so a test isolates exactly one rule */
const rederive = (r) => { r.recordId = recordIdFor(r); r.blockReasons = blockReasonsFor(r, READINESS); return r; };
const has = (res, prefix) => res.errors.some((e) => e.startsWith(prefix));

// changing a stage, a block reason, a status, a disclaimer or the price truth is a contract change (own PR)
const PINNED_CONTRACT_SHA256 = 'ea3e59ae8919dcb75bfa28ce6f618b2d2273a53182d44ae82e7a172ba0f6a9b3';

test('SF-PRODUCT-CONTRACT-PINNED: Vertragsdefinition 1.0.0 festgeschrieben, VALIDATED nicht ausgebbar', () => {
  assert.equal(CANDIDATE_CONTRACT_VERSION, '1.0.0');
  assert.equal(candidateContractSha256(), PINNED_CONTRACT_SHA256);
  assert.equal(VALIDATED_ISSUABLE, false);
  assert.deepEqual(STAGE_ORDER, ['CHART_CANDIDATE', 'CONFIRMED_RESEARCH_SETUP', 'MODELED_TRADE_PLAN', 'VALIDATED_TRADE_SIGNAL']);
  assert.equal(REQUIRED_DISCLAIMERS.VALIDATED_TRADE_SIGNAL, undefined, 'contract 1.0.0 defines no record shape for VALIDATED');
});

test('SF-PRODUCT-CEILING-13: hoechste erlaubte Stufe je Strategie aus Vertrag und SF6-Readiness, nie VALIDATED', () => {
  const got = Object.fromEntries(stageCeilings(READINESS).map((c) => [c.strategyId, c.maxStage]));
  assert.deepEqual(got, {
    SF_TURTLE_S1: 'MODELED_TRADE_PLAN', SF_TURTLE_S2: 'MODELED_TRADE_PLAN', SF_DARVAS_BOX: 'MODELED_TRADE_PLAN',
    SF_WEINSTEIN_INVESTOR: 'CHART_CANDIDATE', SF_WEINSTEIN_TRADER: 'CHART_CANDIDATE',
    SF_MINERVINI_SEPA_VCP: 'CHART_CANDIDATE', SF_MINERVINI_POWER_PLAY: 'MODELED_TRADE_PLAN', SF_KK_BREAKOUT: 'MODELED_TRADE_PLAN',
    SF_KK_EPISODIC_PIVOT: 'CHART_CANDIDATE', SF_KK_PARABOLIC_SHORT: 'CHART_CANDIDATE',
    SF_MOKA_POCKET_PIVOT: 'CONFIRMED_RESEARCH_SETUP', SF_MOKA_BUYABLE_GAP_UP: 'MODELED_TRADE_PLAN', SF_RASCHKE_HOLY_GRAIL: 'CONFIRMED_RESEARCH_SETUP',
  });
  assert.equal(Object.keys(got).length, 13);
  for (const c of stageCeilings(READINESS)) {
    const codes = c.blockers.filter((b) => b.blocks === STAGE.VALIDATED_TRADE_SIGNAL).map((b) => b.code);
    for (const k of ['CONTRACT_LOCK', 'NOT_CERTIFICATION_CANDIDATE', 'OWNER_APPROVAL_MISSING', 'PAPER_VALIDATION_NOT_EVALUATED', 'LIVE_NOT_APPROVED']) assert.ok(codes.includes(k), `${c.strategyId}: ${k}`);
  }
  // the readiness artifact itself: no certification candidate, every strategy LIVE_NOT_APPROVED / DIAGNOSTIC_NOT_CERTIFIED
  assert.deepEqual(READINESS.summary.certificationCandidates, []);
  for (const c of READINESS.candidates) { assert.equal(c.liveReadiness, 'LIVE_NOT_APPROVED'); assert.equal(c.certification, 'DIAGNOSTIC_NOT_CERTIFIED'); }
});

test('SF-PRODUCT-VALIDATED-UNREACHABLE: VALIDATED_TRADE_SIGNAL wird fuer alle 13 abgelehnt, auch mit allen Voraussetzungen', () => {
  for (const c of CONTRACTS) {
    const r = MODELED(); r.strategyId = c.strategyId; r.candidateId = c.candidateId; r.stage = STAGE.VALIDATED_TRADE_SIGNAL;
    r.provenance.sourceContractVersion = c.sourceContractVersion; r.provenance.contractFingerprint = contractFingerprint(c);
    r.status = { liveReadiness: 'LIVE_APPROVED', certification: 'CERTIFIED', tradability: 'TRADABLE' };
    const res = v(r);
    assert.equal(res.ok, false); assert.ok(res.errors.includes('STAGE_NOT_ISSUABLE:VALIDATED_TRADE_SIGNAL'), c.strategyId);
  }
  // a hypothetical readiness in which every strategy is a certification candidate, the paper protocol is evaluated and
  // the owner approved: contract 1.0.0 still issues nothing above MODELED_TRADE_PLAN (CONTRACT_LOCK)
  const dream = structuredClone(READINESS);
  dream.paperProtocol = { ...dream.paperProtocol, status: 'EVALUATED' };
  for (const c of dream.candidates) { c.primaryState = 'CERTIFICATION_CANDIDATE'; c.liveReadiness = 'LIVE_APPROVED'; c.executablePhases = 9; c.measurementClass = 'FULL_DIAGNOSTIC_STRATEGY_BACKTEST'; for (const k of Object.keys(c.certificationCriteria)) c.certificationCriteria[k] = true; }
  for (const c of CONTRACTS) {
    const ceil = deriveStageCeiling(c.strategyId, dream, { ownerApproval: { strategyId: c.strategyId, decision: 'APPROVED' } });
    assert.notEqual(ceil.maxStage, STAGE.VALIDATED_TRADE_SIGNAL, c.strategyId);
    assert.ok(ceil.blockers.some((b) => b.code === 'CONTRACT_LOCK'), c.strategyId);
  }
  // no transition reaches it either
  const to = MODELED(); to.stage = STAGE.VALIDATED_TRADE_SIGNAL; to.recordId = recordIdFor(to);
  assert.ok(checkStageTransition(MODELED(), to, { readiness: READINESS }).errors.includes('STAGE_NOT_ISSUABLE:VALIDATED_TRADE_SIGNAL'));
});

test('SF-PRODUCT-FIXTURES-VALID: die synthetischen Beispiele je Stufe erfuellen den Vertrag', () => {
  assert.match(FIXTURE.note, /SYNTHETISCH/);
  assert.deepEqual(FIXTURE.records.map((r) => r.stage), ['CHART_CANDIDATE', 'CHART_CANDIDATE', 'CONFIRMED_RESEARCH_SETUP', 'MODELED_TRADE_PLAN']);
  for (const r of FIXTURE.records) assert.deepEqual(v(r), { ok: true, errors: [] }, r.strategyId);
  assert.equal(validateCandidateRecord(MODELED(), { readiness: null }).errors[0], 'READINESS_REQUIRED');
  assert.deepEqual(validateCandidateRecord(MODELED()), { ok: true, errors: [] }, 'default: the committed readiness artifact');
});

test('SF-PRODUCT-REQUIRED-FIELDS: jedes fehlende Pflichtfeld, Disclaimer oder Statusfeld wird abgelehnt', () => {
  for (const make of [CHART, CONFIRMED, MODELED]) {
    for (const k of Object.keys(make())) { const r = make(); delete r[k]; assert.equal(v(r).ok, false, `${r.stage} without ${k}`); }
    for (const d of make().disclaimers) { const r = make(); r.disclaimers = r.disclaimers.filter((x) => x !== d); assert.ok(v(r).errors.includes('DISCLAIMERS'), `${r.stage} without ${d}`); }
    for (const [k, bad] of [['liveReadiness', 'LIVE_APPROVED'], ['certification', 'CERTIFIED'], ['tradability', 'TRADABLE']]) { const r = make(); r.status[k] = bad; assert.ok(v(r).errors.includes('STATUS_FIELDS'), k); }
    for (const k of ['engineId', 'engineVersion', 'codeSha256', 'sourceContractVersion', 'contractFingerprint', 'candidateContractVersion', 'readinessCriteriaVersion', 'dataSource']) { const r = make(); delete r.provenance[k]; assert.ok(has(v(r), 'MISSING:provenance.' + k), k); }
    const live = make(); live.liveActivation = true; assert.ok(v(live).errors.includes('LIVE_ACTIVATION_FORBIDDEN'));
    const ord = make(); ord.orderRouting = 'BROKER'; assert.ok(v(ord).errors.includes('ORDER_ROUTING_FORBIDDEN'));
    const buy = make(); buy.buyDeclarationAllowed = true; assert.ok(v(buy).errors.includes('BUY_DECLARATION_FORBIDDEN'));
    const extra = make(); extra.signal = 'BUY'; assert.ok(v(extra).errors.includes('UNKNOWN_FIELD:signal'));
  }
  const fp = MODELED(); fp.provenance.contractFingerprint = '0'.repeat(64); assert.ok(v(fp).errors.includes('PROVENANCE_CONTRACT_FINGERPRINT'));
  const cv = MODELED(); cv.provenance.sourceContractVersion = '9.9.9'; assert.ok(v(cv).errors.includes('PROVENANCE_SOURCE_CONTRACT_VERSION'));
  const acc = MODELED(); delete acc.provenance.accounting; assert.ok(v(acc).errors.includes('PROVENANCE_ACCOUNTING'));
  const snap = CHART(); snap.provenance.dataSource = { kind: 'FROZEN_SNAPSHOT', snapshotId: 'sts1-0000' }; assert.ok(v(snap).errors.includes('PROVENANCE_SNAPSHOT_ID'));
});

test('SF-PRODUCT-QUARANTINE: ein Datensatz mit Quarantaene-Sitzung kommt nicht ueber CHART_CANDIDATE hinaus', () => {
  const q = [{ date: '2026-06-01', flag: 'DQ-K5' }];
  for (const make of [CONFIRMED, MODELED]) {
    const r = make(); r.dataIntegrity.quarantinedSessions = q; rederive(r);
    const res = v(r);
    assert.equal(res.ok, false); assert.ok(has(res, 'STAGE_ABOVE_CEILING'), r.stage);
    assert.ok(r.blockReasons.some((b) => b.code === 'QUARANTINE_SESSION_IN_LOOKBACK'));
  }
  // the same strategy as a CHART_CANDIDATE with the quarantine is valid and discloses it
  const k3 = [{ date: '2026-06-01', flag: 'DQ-K3' }];
  const t = MODELED(); const c = CHART(); c.strategyId = t.strategyId; c.candidateId = t.candidateId; c.provenance = { ...t.provenance }; delete c.provenance.accounting;
  c.pattern = { patternId: 'TURTLE_S2_55D_CHANNEL', ruleIds: ['TUR-SF-ENTRY'] }; c.pit.barInterval = 'DAILY'; c.dataIntegrity.quarantinedSessions = k3; rederive(c);
  assert.deepEqual(v(c), { ok: true, errors: [] });
  // a DECLARED quarantine cannot be hidden: dropping its block reason fails. Whether a producer declares every flagged
  // session is checked by the later producer / DQ rule (flagDiscontinuities over the lookback), not by this contract
  const hidden = structuredClone(c); hidden.blockReasons = hidden.blockReasons.filter((b) => b.code !== 'QUARANTINE_SESSION_IN_LOOKBACK');
  assert.ok(v(hidden).errors.includes('BLOCK_REASONS_NOT_DERIVED'));
  const fut = CHART(); fut.dataIntegrity.quarantinedSessions = [{ date: '2026-12-01', flag: 'DQ-K5' }]; rederive(fut);
  assert.ok(v(fut).errors.includes('DATA_INTEGRITY_SESSION_AFTER_ASOF'));
  const pol = CHART(); pol.dataIntegrity.quarantinePolicy = 'none'; assert.ok(v(pol).errors.includes('DATA_INTEGRITY_POLICY'));
});

test('SF-PRODUCT-IDENTITY-ADR-001: securityId nur aus core/identity.js, nie "ref_" + ticker von Hand', () => {
  const ok = CHART(); ok.security.ticker = 'BRK.B'; ok.security.securityId = Identity.securityIdForTicker('BRK.B'); rederive(ok);
  assert.equal(ok.security.securityId, 'ref_BRK_B'); assert.deepEqual(v(ok), { ok: true, errors: [] });
  for (const bad of ['ref_' + 'BRK.B', 'ref_brk_b', 'BRK_B', 'ref_BRK-B']) {
    const r = CHART(); r.security.ticker = 'BRK.B'; r.security.securityId = bad; rederive(r);
    assert.ok(v(r).errors.includes('IDENTITY_NOT_FROM_CORE_IDENTITY'), bad);
  }
  const t = CHART(); t.security.ticker = '???'; assert.ok(v(t).errors.includes('IDENTITY_TICKER_INVALID'));
  const sch = CHART(); sch.security.identityScheme = 'ticker'; assert.ok(v(sch).errors.includes('IDENTITY_SCHEME'));
  // no "ref_" concatenation in the contract module itself
  const src = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/source-faithful/product/candidate-contract.mjs'), 'utf8');
  assert.doesNotMatch(src, /['"`]ref_['"`]\s*\+|`ref_\$\{/);
});

test('SF-PRODUCT-PRICE-ADR-002: Preise nur aus der einen Preiswahrheit', () => {
  for (const [k, bad] of [['basis', 'RAW'], ['splitFactors', 'scripts/supertrader/own-split.mjs'], ['publishedClose', 'supertrader/data/close.json']]) {
    const r = CHART(); r.price[k] = bad; assert.ok(v(r).errors.includes('PRICE_TRUTH_NOT_ADR_002'), k);
  }
  assert.deepEqual(PRICE_TRUTH, { basis: 'SPLIT_ADJUSTED_DAILY', splitFactors: 'quant/engines/return-series.js#splitFactors', publishedClose: 'quant/engines/published-close.js' });
  const neg = CHART(); neg.price.close = -1; assert.ok(v(neg).errors.includes('PRICE_CLOSE'));
});

test('SF-PRODUCT-NO-STAGE-MIXING: Stufen sind nicht vermischbar, Aufwertung nur als neuer Datensatz der naechsten Stufe', () => {
  const c = CHART(); c.setup = CONFIRMED().setup; assert.ok(v(c).errors.includes('STAGE_MIXING:setup'));
  const c2 = CHART(); c2.plan = MODELED().plan; assert.ok(v(c2).errors.includes('STAGE_MIXING:plan'));
  const s = CONFIRMED(); s.plan = MODELED().plan; assert.ok(v(s).errors.includes('STAGE_MIXING:plan'));
  const m = MODELED(); delete m.plan; assert.ok(v(m).errors.includes('MISSING:plan'));
  const relabel = CONFIRMED(); relabel.stage = STAGE.CHART_CANDIDATE; assert.equal(v(relabel).ok, false);
  const wrongDisc = CHART(); wrongDisc.disclaimers = [...REQUIRED_DISCLAIMERS.MODELED_TRADE_PLAN]; assert.ok(v(wrongDisc).errors.includes('DISCLAIMERS'));
  const unknown = CHART(); unknown.stage = 'BUY'; assert.ok(v(unknown).errors.includes('STAGE_UNKNOWN'));
  // transitions: next stage only, same strategy / security / date, new record
  const t = MODELED();
  const chartT = CHART(); Object.assign(chartT, { strategyId: t.strategyId, candidateId: t.candidateId, security: { ...t.security }, provenance: { ...t.provenance }, pattern: { ...t.pattern } }); delete chartT.provenance.accounting; chartT.pit.barInterval = 'DAILY'; rederive(chartT);
  const confT = structuredClone(t); delete confT.plan; delete confT.provenance.accounting; confT.stage = STAGE.CONFIRMED_RESEARCH_SETUP; confT.disclaimers = [...REQUIRED_DISCLAIMERS.CONFIRMED_RESEARCH_SETUP]; rederive(confT);
  assert.deepEqual(checkStageTransition(chartT, confT, { readiness: READINESS }), { ok: true, errors: [] });
  assert.deepEqual(checkStageTransition(confT, t, { readiness: READINESS }), { ok: true, errors: [] });
  assert.ok(checkStageTransition(chartT, t, { readiness: READINESS }).errors.includes('TRANSITION_NOT_NEXT_STAGE'));
  assert.ok(checkStageTransition(t, confT, { readiness: READINESS }).errors.includes('TRANSITION_NOT_NEXT_STAGE'));
  const other = structuredClone(confT); other.security = { ...other.security, ticker: 'FIXZ', securityId: 'ref_FIXZ' }; rederive(other);
  assert.ok(checkStageTransition(chartT, other, { readiness: READINESS }).errors.includes('TRANSITION_IDENTITY_CHANGED'));
  const rid = MODELED(); rid.recordId = 'stc_x'; assert.ok(v(rid).errors.includes('RECORD_ID'));
});

test('SF-PRODUCT-STRATEGY-CEILING: gesperrte Strategien koennen ihre Obergrenze nicht ueberschreiten', () => {
  const asStrategy = (make, id) => { const r = make(); const c = CONTRACTS.find((x) => x.strategyId === id); const rc = ruleClasses(id);
    Object.assign(r, { strategyId: id, candidateId: c.candidateId }); r.provenance.sourceContractVersion = c.sourceContractVersion; r.provenance.contractFingerprint = contractFingerprint(c);
    r.pattern = { patternId: 'X', ruleIds: rc.mechanicalSetupRules.slice(0, 1) };
    if (r.setup) r.setup = { mechanicalRules: rc.mechanicalSetupRules.map((ruleId) => ({ ruleId, met: true })), openDiscretionaryRules: rc.discretionaryRules, ambiguousRules: rc.ambiguousRules.map((ruleId) => ({ ruleId, reading: 'R' })), dataBlockedRules: rc.dataBlockedRules, manualReviewStatus: rc.discretionaryRules.length ? 'REQUIRED_PENDING' : 'NOT_REQUIRED' };
    return rederive(r); };
  for (const id of ['SF_WEINSTEIN_INVESTOR', 'SF_WEINSTEIN_TRADER', 'SF_MINERVINI_SEPA_VCP', 'SF_KK_EPISODIC_PIVOT', 'SF_KK_PARABOLIC_SHORT']) {
    const res = v(asStrategy(CONFIRMED, id)); assert.ok(has(res, 'STAGE_ABOVE_CEILING'), id);
  }
  for (const id of ['SF_MOKA_POCKET_PIVOT', 'SF_RASCHKE_HOLY_GRAIL']) {
    assert.deepEqual(v(asStrategy(CONFIRMED, id)), { ok: true, errors: [] }, id);
    assert.ok(has(v(asStrategy(MODELED, id)), 'STAGE_ABOVE_CEILING'), id);
  }
  // an edited readiness cannot lift a ceiling: only the committed artifact counts (review SF7-PC-M1)
  const lifted = structuredClone(READINESS); const hg = lifted.candidates.find((x) => x.strategyId === 'SF_RASCHKE_HOLY_GRAIL');
  Object.assign(hg, { primaryState: 'RESEARCH_COMPLETE_WITH_EXCEPTIONS', executablePhases: 9, measurementClass: 'SCREEN_STATISTICS' });
  const up = asStrategy(MODELED, 'SF_RASCHKE_HOLY_GRAIL'); up.plan.exit.ruleIds = ['RAS-SF-EXIT']; up.plan.declaredDataExceptions = []; up.plan.modelAssumptions = [{ ruleId: 'RAS-SF-EXIT', assumption: 'A' }]; up.blockReasons = blockReasonsFor(up, lifted);
  assert.deepEqual(validateCandidateRecord(up, { readiness: lifted }).errors, ['READINESS_NOT_COMMITTED_ARTIFACT']);
  assert.ok(has(v(rederive(up)), 'STAGE_ABOVE_CEILING'));
  // a chart pattern may only name mechanical rules
  const p = CHART(); p.pattern.ruleIds = ['WEIN-SF-STAGE']; assert.ok(v(p).errors.includes('PATTERN_NON_MECHANICAL_RULE:WEIN-SF-STAGE'));
  const p2 = CHART(); p2.pattern.ruleIds = ['WEIN-SF-GROUP']; assert.ok(v(p2).errors.includes('PATTERN_NON_MECHANICAL_RULE:WEIN-SF-GROUP'));
});

test('SF-PRODUCT-DISCRETION-DISCLOSED: offene Ermessens-, mehrdeutige und datenblockierte Regeln vollstaendig ausgewiesen', () => {
  const s = CONFIRMED(); s.setup.openDiscretionaryRules = []; assert.ok(v(s).errors.includes('SETUP_OPEN_DISCRETIONARY_RULES_NOT_DISCLOSED'));
  const a = CONFIRMED(); a.setup.ambiguousRules = []; assert.ok(v(a).errors.includes('SETUP_AMBIGUOUS_RULES_NOT_DISCLOSED'));
  const n = CONFIRMED(); n.setup.mechanicalRules[0].met = false; assert.ok(v(n).errors.includes('SETUP_MECHANICAL_RULE_NOT_MET'));
  const i = CONFIRMED(); i.setup.mechanicalRules.pop(); assert.ok(v(i).errors.includes('SETUP_MECHANICAL_RULES_INCOMPLETE'));
  const r = CONFIRMED(); r.setup.manualReviewStatus = 'NOT_REQUIRED'; assert.ok(v(r).errors.includes('SETUP_MANUAL_REVIEW_STATUS'));
  const d = MODELED(); d.setup.dataBlockedRules = []; assert.ok(v(d).errors.includes('SETUP_DATA_BLOCKED_RULES_NOT_DISCLOSED'));
  const e = MODELED(); e.plan.declaredDataExceptions = []; assert.ok(v(e).errors.includes('PLAN_DATA_EXCEPTIONS_NOT_DECLARED'));
  // a modeled plan of a strategy with manual decisions names a model assumption for each of them
  const id = 'SF_DARVAS_BOX', c = CONTRACTS.find((x) => x.strategyId === id), rc = ruleClasses(id);
  const m = MODELED(); Object.assign(m, { strategyId: id, candidateId: c.candidateId }); m.provenance.sourceContractVersion = c.sourceContractVersion; m.provenance.contractFingerprint = contractFingerprint(c);
  m.pattern = { patternId: 'DARVAS_BOX', ruleIds: rc.mechanicalSetupRules.slice(0, 1) };
  m.setup = { mechanicalRules: rc.mechanicalSetupRules.map((ruleId) => ({ ruleId, met: true })), openDiscretionaryRules: rc.discretionaryRules, ambiguousRules: rc.ambiguousRules.map((ruleId) => ({ ruleId, reading: 'R' })), dataBlockedRules: rc.dataBlockedRules, manualReviewStatus: 'REQUIRED_PENDING' };
  m.plan = { ...m.plan, model: { lifecycleKey: 'DARVAS', variantId: 'REFERENCE' }, exit: { ruleIds: c.rules.filter((x) => x.kind === 'STOP').map((x) => x.id).slice(0, 1) }, declaredDataExceptions: [], modelAssumptions: [] };
  rederive(m);
  const res = v(m); assert.ok(rc.discretionaryRules.every((x) => res.errors.includes(`PLAN_OPEN_DISCRETIONARY_RULE_WITHOUT_ASSUMPTION:${x}`)));
  m.plan.modelAssumptions = rc.discretionaryRules.map((ruleId) => ({ ruleId, assumption: 'declared model assumption (VU-SF5)' }));
  assert.deepEqual(v(m), { ok: true, errors: [] });
});

test('SF-PRODUCT-NESTED-FIELDS: unbekannte Felder in Unterobjekten werden abgelehnt (keine verschachtelte Stufenvermischung)', () => {
  const c = CHART(); c.pattern.entry = { trigger: 1 }; c.pattern.stop = { initial: 0.5 }; c.provenance.accounting = 'RESEARCH_V1';
  const rc = v(c).errors; for (const e of ['UNKNOWN_FIELD:pattern.entry', 'UNKNOWN_FIELD:pattern.stop', 'STAGE_MIXING:provenance.accounting']) assert.ok(rc.includes(e), e);
  const m = MODELED(); m.pattern.signal = 'BUY'; m.plan.stop.target = 999; m.plan.sizing.shares = 1000; m.plan.model.liveApproved = true; m.blockReasons[0].approved = true; m.setup.mechanicalRules[0].override = true;
  const rm = v(m).errors;
  for (const e of ['UNKNOWN_FIELD:pattern.signal', 'UNKNOWN_FIELD:plan.stop.target', 'UNKNOWN_FIELD:plan.sizing.shares', 'UNKNOWN_FIELD:plan.model.liveApproved', 'UNKNOWN_FIELD:blockReasons[].approved', 'UNKNOWN_FIELD:setup.mechanicalRules[].override']) assert.ok(rm.includes(e), e);
  const q = CHART(); q.dataIntegrity.quarantinedSessions = [{ date: '2026-06-01', flag: 'DQ-K5', resolved: true }]; rederive(q);
  assert.ok(v(q).errors.includes('UNKNOWN_FIELD:dataIntegrity.quarantinedSessions[].resolved'));
  const lower = CHART(); lower.security.ticker = 'fixa'; assert.ok(v(lower).errors.includes('IDENTITY_TICKER_NOT_NORMALIZED'));
  const num = CHART(); num.security.ticker = 123; num.security.securityId = 'ref_123'; rederive(num); assert.ok(v(num).errors.includes('IDENTITY_TICKER_INVALID'));
});

test('SF-PRODUCT-PIT: nur Tagesbalken bis zum Stichtag; der Plan handelt fruehestens in der Folgesitzung', () => {
  const a = MODELED(); a.plan.entry.earliestSession = a.asOf; assert.ok(v(a).errors.includes('PLAN_ENTRY_NOT_AFTER_ASOF'));
  const b = CHART(); b.pit.usesIntraday = true; assert.ok(v(b).errors.includes('PIT_INTRADAY_NOT_ALLOWED'));
  const f = CHART(); f.pit.usesFundamentals = true; assert.ok(v(f).errors.includes('PIT_FUNDAMENTALS_NOT_ALLOWED'));
  const fb = CHART(); fb.pit.usesFutureBars = true; assert.ok(v(fb).errors.includes('PIT_FUTURE_BARS'));
  const l = CHART(); l.pit.lastBarDate = '2026-10-24'; assert.ok(v(l).errors.includes('PIT_LAST_BAR_NOT_ASOF'));
  const ds = CHART(); ds.provenance.dataSource.asOf = '2026-10-22'; assert.ok(v(ds).errors.includes('PROVENANCE_DATA_ASOF'));
  const st = MODELED(); st.plan.stop.initial = st.plan.entry.trigger + 1; assert.ok(v(st).errors.includes('PLAN_STOP_NOT_BELOW_ENTRY'));
  const h = MODELED(); h.plan.hypothetical = false; assert.ok(v(h).errors.includes('PLAN_NOT_HYPOTHETICAL'));
  const x = MODELED(); x.plan.exit.ruleIds = ['TUR-SF-ENTRY']; assert.ok(v(x).errors.includes('PLAN_EXIT_RULE:TUR-SF-ENTRY'));
});

test('SF-PRODUCT-BLOCK-REASONS-DERIVED: Sperrgruende exakt abgeleitet, keiner erfunden, keiner verschwiegen', () => {
  const drop = MODELED(); drop.blockReasons = drop.blockReasons.filter((b) => b.code !== 'CONTRACT_LOCK'); assert.ok(v(drop).errors.includes('BLOCK_REASONS_NOT_DERIVED'));
  const add = MODELED(); add.blockReasons.push({ code: 'QUARANTINE_SESSION_IN_LOOKBACK', ref: '2026-01-01', blocks: 'CONFIRMED_RESEARCH_SETUP' }); assert.ok(v(add).errors.includes('BLOCK_REASONS_NOT_DERIVED'));
  const fake = MODELED(); fake.blockReasons.push({ code: 'APPROVED', ref: null, blocks: 'VALIDATED_TRADE_SIGNAL' }); assert.ok(v(fake).errors.includes('BLOCK_REASONS_FORMAT'));
  const lowered = MODELED(); lowered.blockReasons = lowered.blockReasons.map((b) => ({ ...b, blocks: 'CHART_CANDIDATE' })); assert.ok(v(lowered).errors.includes('BLOCK_REASONS_FORMAT'));
});

test('SF-PRODUCT-NO-RUN-INTEGRATION: kein Workflow, kein Frontend, keine Domain-Registrierung, keine Schreib- oder Netzzugriffe', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/source-faithful/product/candidate-contract.mjs'), 'utf8');
  assert.doesNotMatch(src, /writeFileSync|appendFileSync|mkdirSync|createWriteStream|fetch\(|https?:\/\/|child_process/);
  const wf = path.join(ROOT, '.github/workflows');
  for (const f of fs.readdirSync(wf)) assert.doesNotMatch(fs.readFileSync(path.join(wf, f), 'utf8'), /candidate-contract|source-faithful\/product/, f);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'data' ? [] : walk(path.join(d, e.name))) : /\.(m?js|html)$/.test(e.name) ? [path.join(d, e.name)] : []);
  for (const f of walk(path.join(ROOT, 'supertrader'))) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /candidate-contract|source-faithful\/product/, f);
  // V2: die Registry darf den Produktpfad nur im einen, festgeschriebenen und abgeschalteten Eintrag nennen
  // (registry-guard.mjs); Gegenproben in SF8-REGISTRY-GUARD
  assert.deepEqual(sf8RegistryViolations(fs.readFileSync(path.join(ROOT, 'core/registry/domains.json'), 'utf8')), []);
});

test('SF8-REGISTRY-GUARD: genau ein Eintrag, Felder festgeschrieben, Aktivierung nur per eigenem PR (Gegenproben)', () => {
  const entry = { ...SF8_DOMAIN_PINNED, label: 'x', activation: { state: SF8_ACTIVATION_STATE } };
  const other = { id: 'supertrader', artifact: '/supertrader/data/signals.json', producer: 'scripts/supertrader/build.mjs' };
  const txt = (domains, extra = {}) => JSON.stringify({ ...extra, domains });
  assert.deepEqual(sf8RegistryViolations(txt([other])), [], 'ohne Eintrag zulässig');
  assert.deepEqual(sf8RegistryViolations(txt([other, entry])), [], 'der eine Eintrag ist zulässig');
  assert.ok(sf8RegistryViolations(txt([other, entry, entry])).includes('SF8_DOMAIN_DUPLICATE'));
  for (const k of Object.keys(SF8_DOMAIN_PINNED).filter((k) => k !== 'id')) {
    assert.ok(sf8RegistryViolations(txt([{ ...entry, [k]: k === 'critical' ? true : 'anders' }])).includes(`SF8_DOMAIN_FIELD:${k}`), k);
  }
  assert.ok(sf8RegistryViolations(txt([{ ...entry, activation: { state: 'ACTIVE' } }])).includes('SF8_DOMAIN_ACTIVATION_NOT_PREPARED_DISABLED'));
  assert.ok(sf8RegistryViolations(txt([{ ...entry, activation: undefined }])).includes('SF8_DOMAIN_ACTIVATION_NOT_PREPARED_DISABLED'));
  assert.ok(sf8RegistryViolations(txt([{ ...other, consumers: ['scripts/supertrader/source-faithful/product/x.mjs'] }, entry])).includes('SF8_PRODUCT_REF_OUTSIDE_OWN_DOMAIN'));
  assert.ok(sf8RegistryViolations(txt([{ ...other, artifact: '/supertrader/data/sf-candidates/index.json' }])).includes('SF8_PRODUCT_REF_OUTSIDE_OWN_DOMAIN'));
  assert.ok(sf8RegistryViolations(txt([entry], { note: 'candidate-contract' })).includes('SF8_PRODUCT_REF_OUTSIDE_OWN_DOMAIN'), 'auch der Kopf');
  assert.deepEqual(sf8RegistryViolations('{kaputt'), ['REGISTRY_NOT_JSON']);
  // Review MEDIUM 6: keine Hintertür über freie Felder, Altmodule oder Schreibweise
  assert.ok(sf8RegistryViolations(txt([{ ...entry, consumers: ['scripts/supertrader/source-faithful/completion/status.mjs'] }])).includes('SF8_DOMAIN_REF_IN:consumers'));
  assert.ok(sf8RegistryViolations(txt([{ ...entry, activation: { state: SF8_ACTIVATION_STATE, decision: 'siehe source-faithful/product/x.mjs' } }])).includes('SF8_DOMAIN_REF_IN:activation'));
  assert.ok(sf8RegistryViolations(txt([{ ...entry, extra: 1 }])).includes('SF8_DOMAIN_UNKNOWN_FIELD:extra'));
  for (const ref of ['scripts/supertrader/signals/research-signal.mjs', 'completion/gaps.mjs', 'Source-Faithful/product', 'SF-CANDIDATES']) {
    assert.ok(sf8RegistryViolations(txt([{ ...other, consumers: [ref] }, entry])).includes('SF8_PRODUCT_REF_OUTSIDE_OWN_DOMAIN'), ref);
  }
  assert.equal(SF8_DOMAIN_ID, 'supertrader-sf8-candidates');
});
