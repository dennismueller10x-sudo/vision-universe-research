#!/usr/bin/env node
/**
 * Builds the machine-readable source-faithful artifacts from the contracts and the pinned #709 extract.
 * Deterministic (no clock, no market data). Tests rebuild into --out and compare with the committed files.
 *
 *   node scripts/supertrader/source-faithful/build-artifacts.mjs [--out <dir>]
 *
 * Writes:
 *   STRATEGY-SOURCE-CONTRACTS.json        Source -> Book Edition -> Rule ID -> Candidate -> Executable Rule -> Test -> Status
 *   STRATEGY-IMPLEMENTATION-STATUS.json   one derived status per candidate (and per scope where layered)
 *   STRATEGY-REGISTRY-VALIDATION.json     contract validation, 13-candidate identity, coverage completeness
 *   STRATEGY-SNAPSHOT-PROVENANCE.json     snapshot / accounting binding every historical run must use
 *   STRATEGY-COVERAGE-MATRIX.json         every #709 rule of every candidate context with its status or exclusion
 *   STRATEGY-GOLDEN-CASE-RESULTS.json     golden case catalogue per method (results are filled from the test run)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExtract, METHOD_CONTEXTS, PSR709, ACCEPTANCE_PR712 } from './evidence/psr709-extract.mjs';
import { CONTRACTS, buildRegistry } from './registry.mjs';
import { sourceCoverage, FOUNDATION } from './contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ARTIFACT_DIR = path.join(HERE, 'artifacts');
const ROOT = path.resolve(HERE, '..', '..', '..');

export function sourceContractsArtifact(extract) {
  const S = new Map(extract.sources.map((s) => [s.source_id, s]));
  const R = new Map(extract.rules.map((r) => [r.rule_id, r]));
  return {
    schema: 'supertrader-sf-source-contracts-1.0.0',
    sourceEvidence: { pullRequest: PSR709.pullRequest, commit: PSR709.commit, manifestSha256: extract.pin.manifestSha256, filesVerified: extract.pin.filesVerified },
    acceptanceReference: ACCEPTANCE_PR712,
    chain: 'Source -> Book Edition -> Rule ID -> Strategy Candidate -> Executable Rule -> Test Case -> Implementation Status',
    contracts: CONTRACTS.map((c) => ({
      strategyId: c.strategyId, candidateId: c.candidateId, sourceContractVersion: c.sourceContractVersion, implemented: c.implemented, plannedIn: c.implemented ? null : c.plannedIn,
      trader: c.trader, method: c.method, scope: c.scope, outputKind: c.outputKind, timing: c.timing,
      entryConditions: c.entryConditions, exitConditions: c.exitConditions, stops: c.stops, positionSizing: c.positionSizing,
      securityIdentity: c.securityIdentity, corporateActionPolicy: c.corporateActionPolicy, requiredData: c.requiredData, missingDataBehavior: c.missingDataBehavior,
      manualReviewFlags: c.manualReviewFlags, accountingContract: c.accountingContract, snapshot: c.snapshot, reproducibilityReceipt: c.reproducibilityReceipt, knownLimitations: c.knownLimitations,
      chain: c.rules.flatMap((r) => (r.psr709.length ? r.psr709 : [null]).map((pid) => {
        const pr = pid ? R.get(pid) : null, src = pr ? S.get(pr.source_id) : null;
        return {
          source: pr ? pr.source_id : null,
          bookEdition: src ? [src.author, src.title, src.edition, src.document_language].filter(Boolean).join(' | ') : null,
          page: pr ? pr.page_location : null,
          ruleId: pid, modal: pr?.modal_strength ?? null, confidence: pr?.confidence ?? null, originalWordingChecked: pr?.original_wording_checked ?? null, clearance: pr?.hard_coding_clearance ?? null,
          candidate: c.candidateId, executableRule: r.id, kind: r.kind, status: r.status, targetStatus: r.targetStatus ?? null,
          code: r.code ?? r.plannedCode ?? null, tests: r.tests ?? r.plannedTests ?? [], derivation: r.derivation ?? null, reason: r.reason ?? null,
        };
      })),
    })),
  };
}

export function coverageMatrixArtifact(extract) {
  return {
    schema: 'supertrader-sf-coverage-matrix-1.0.0',
    rule: 'every #709 rule of every candidate context is listed with the status of the executable rule that implements it, or with a written exclusion; UNMAPPED without exclusion is a validation error',
    methods: CONTRACTS.map((c) => { const cov = sourceCoverage(c, extract, METHOD_CONTEXTS[c.strategyId].contexts); return { strategyId: c.strategyId, candidateId: c.candidateId, contexts: METHOD_CONTEXTS[c.strategyId].contexts, summary: Object.fromEntries(Object.entries(cov).filter(([k]) => k !== 'rows')), rows: cov.rows }; }),
  };
}

export function statusArtifact(registry) {
  return {
    schema: 'supertrader-sf-implementation-status-1.0.0',
    statuses: ['IMPLEMENTED_SOURCE_EXACT', 'IMPLEMENTED_SOURCE_DERIVED', 'PARTIAL_MANUAL_REVIEW', 'PARTIAL_DATA_BLOCKED', 'SOURCE_UNRESOLVED', 'NOT_IMPLEMENTED'],
    derivedFrom: 'contract.mjs#deriveImplementationStatus over the rule statuses; never set by hand',
    candidates: registry.entries.map((e) => ({ candidateId: e.candidateId, strategyId: e.strategyId, trader: e.trader, implementationStatus: e.implementationStatus, statusByScope: e.statusByScope, plannedIn: e.plannedIn, outputKind: e.outputKind, tradable: e.tradable, liveActivation: e.liveActivation, fullyAutomatable: e.fullyAutomatable, dataReadiness: e.dataReadiness, executionReadiness: e.executionReadiness, backtestReadiness: e.backtestReadiness })),
    nonCandidates: registry.nonCandidates,
  };
}

export function registryValidationArtifact(registry, extract) {
  const checks = [
    { id: 'RV-13-CANDIDATES', pass: registry.entries.length === 13 && new Set(registry.entries.map((e) => e.candidateId)).size === 13, detail: registry.entries.map((e) => e.candidateId).join(',') },
    { id: 'RV-MATCHES-709', pass: JSON.stringify(registry.entries.map((e) => e.candidateId).sort()) === JSON.stringify(extract.candidates.map((c) => c.candidate_id).sort()) },
    { id: 'RV-CONTRACTS-VALID', pass: registry.entries.every((e) => e.contractValidation.ok), detail: registry.entries.filter((e) => !e.contractValidation.ok).map((e) => `${e.strategyId}: ${e.contractValidation.errors.join(' ')}`) },
    { id: 'RV-NO-UNMAPPED-RULE', pass: registry.entries.every((e) => e.sourceCoverage.unmapped === 0), detail: registry.entries.filter((e) => e.sourceCoverage.unmapped).map((e) => e.strategyId) },
    { id: 'RV-NOTHING-TRADABLE', pass: registry.entries.every((e) => e.tradable === false && e.liveActivation === false) },
    { id: 'RV-NO-INCOMPLETE-AS-COMPLETE', pass: registry.entries.every((e) => !e.fullyAutomatable || e.implementationStatus.startsWith('IMPLEMENTED_')) },
    { id: 'RV-SNAPSHOT-BOUND', pass: CONTRACTS.every((c) => c.snapshot.id === FOUNDATION.snapshotId && c.snapshot.liveInputsForbidden === true) },
    { id: 'RV-ACCOUNTING-RESEARCH-V1', pass: CONTRACTS.every((c) => c.accountingContract.mode === 'RESEARCH_V1') },
    { id: 'RV-CAN-SLIM-NOT-COUNTED', pass: registry.nonCandidates.some((n) => n.id === 'ONEIL_CAN_SLIM') && !registry.entries.some((e) => /CAN_SLIM/.test(e.strategyId)) },
    { id: 'RV-709-HASHES', pass: extract.pin.filesVerified === 20 && extract.pin.mismatches === 0 },
  ];
  return { schema: 'supertrader-sf-registry-validation-1.0.0', pass: checks.every((c) => c.pass), checks };
}

export function snapshotProvenanceArtifact() {
  const pointer = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/snapshot/SNAPSHOT-POINTER.json'), 'utf8'));
  return {
    schema: 'supertrader-sf-snapshot-provenance-1.0.0',
    binding: { snapshotId: FOUNDATION.snapshotId, accounting: FOUNDATION.accounting, certification: FOUNDATION.certification },
    pointerAgrees: pointer.snapshotId === FOUNDATION.snapshotId,
    snapshot: { snapshotId: pointer.snapshotId, asOfDate: pointer.asOfDate, captureRunId: pointer.captureRunId, restores: pointer.restores.map((r) => ({ runId: r.runId, datasetSha256: r.datasetSha256, replaySha256: r.replaySha256, independentOfCapture: r.independentOfCapture })) },
    consumers: [
      { path: 'scripts/supertrader/validation/analyze-methods.mjs', flags: '--snapshot <id> --accounting research-v1', workflow: '.github/workflows/supertrader-validation.yml (input snapshot / marker [supertrader-validation-snapshot:<id>])' },
    ],
    failClosed: ['a snapshot id that is not sts1-<32 hex> stops the workflow', 'a mode whose runner cannot read a snapshot stops the workflow (SNAPSHOT_NOT_SUPPORTED_FOR_MODE)', 'opening the snapshot requires an independent RESTORE receipt and verifies every object hash and the dataset fingerprint (analyze-methods.mjs)'],
    survivorship: 'PIT listing table from the frozen ticker list incl. 7,299 inactive listings; delisted segments settled by the research-v1 terminal policy',
    knownDataFindings: [{ id: 'V4-D1', severity: 'BLOCKER (for certification)', status: 'OPEN', summary: 'undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); every diagnostic result inherits it; fix belongs to a Quant PR, not to this work' }],
  };
}

export function goldenCatalogueArtifact(extract) {
  const tests = CONTRACTS.flatMap((c) => c.rules.flatMap((r) => (r.tests ?? r.plannedTests ?? []).map((t) => ({ strategyId: c.strategyId, rule: r.id, psr709: r.psr709, test: t }))));
  const byTest = new Map();
  for (const t of tests) { const k = t.test; if (!byTest.has(k)) byTest.set(k, { test: k, strategyIds: new Set(), rules: new Set(), psr709: new Set() }); const e = byTest.get(k); e.strategyIds.add(t.strategyId); e.rules.add(t.rule); for (const p of t.psr709) e.psr709.add(p); }
  const catalogue = Object.fromEntries(CONTRACTS.map((c) => { const ctx = METHOD_CONTEXTS[c.strategyId].contexts; const caseIds = new Set(extract.reproducibility.filter((r) => ctx.includes(r.method)).flatMap((r) => r.source_context_case_ids ?? [])); return [c.strategyId, extract.cases.filter((x) => caseIds.has(x.case_id)).map((x) => ({ caseId: x.case_id, action: x.action, category: x.personal_trade_category, source: `${x.source_id} ${x.page_location}` }))]; }));
  return {
    schema: 'supertrader-sf-golden-cases-1.0.0',
    rule: 'golden cases are behaviour tests, never a performance sample; #709 cases are not broker-verified and carry printed, unadjusted prices',
    goldenTests: [...byTest.values()].map((e) => ({ test: e.test, strategyIds: [...e.strategyIds], rules: [...e.rules], psr709: [...e.psr709], result: 'SEE_TEST_RUN' })).sort((a, b) => a.test.localeCompare(b.test)),
    psr709CaseCatalogue: catalogue,
  };
}

export function buildAll(outDir = ARTIFACT_DIR) {
  const extract = loadExtract();
  const registry = buildRegistry(extract);
  const files = {
    'STRATEGY-SOURCE-CONTRACTS.json': sourceContractsArtifact(extract),
    'STRATEGY-IMPLEMENTATION-STATUS.json': statusArtifact(registry),
    'STRATEGY-REGISTRY-VALIDATION.json': registryValidationArtifact(registry, extract),
    'STRATEGY-SNAPSHOT-PROVENANCE.json': snapshotProvenanceArtifact(),
    'STRATEGY-COVERAGE-MATRIX.json': coverageMatrixArtifact(extract),
    'STRATEGY-GOLDEN-CASE-RESULTS.json': goldenCatalogueArtifact(extract),
    'STRATEGY-REGISTRY.json': registry,
  };
  fs.mkdirSync(outDir, { recursive: true });
  for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(outDir, f), JSON.stringify(v, null, 1) + '\n');
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf('--out');
  const out = i >= 0 ? path.resolve(a[i + 1]) : ARTIFACT_DIR;
  const files = buildAll(out);
  const v = files['STRATEGY-REGISTRY-VALIDATION.json'];
  process.stdout.write(`written ${Object.keys(files).length} artifacts to ${path.relative(process.cwd(), out) || '.'}; registry validation ${v.pass ? 'PASS' : 'FAIL'}\n`);
  if (!v.pass) process.exitCode = 1;
}
