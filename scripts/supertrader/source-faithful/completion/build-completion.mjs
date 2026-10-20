#!/usr/bin/env node
/**
 * Builds the Supertrader 2.0 completion artifacts (deterministic, no clock, no market data). Run after
 * build-artifacts.mjs and record-golden-results.mjs; tests rebuild into --out and compare with the committed files.
 *
 *   node scripts/supertrader/source-faithful/completion/build-completion.mjs [--out <dir>]
 *
 * Writes (scripts/supertrader/source-faithful/artifacts/):
 *   STRATEGY-COMPLETION-GAPS.json          13 candidates x 15 dimensions, gap class per gap (completion/gaps.mjs)
 *   STRATEGY-COMPLETION-STATUS.json        engine state + flags per candidate, Turtle acceptance gates (completion/status.mjs)
 *   STRATEGY-SOURCE-FIDELITY-RESULTS.json  rule fidelity per candidate and the golden cases that prove it
 *   STRATEGY-EXECUTION-RESULTS.json        execution conventions, reference snapshot runs (public receipts only)
 *   STRATEGY-RISK-VALIDATION.json          stop / sizing / portfolio rules, their status and their tests
 *   STRATEGY-DATA-DEPENDENCIES.json        data each method needs, what the repository has, procurement contract
 *   STRATEGY-BACKTEST-READINESS.json       the eight measurement questions of mandate section 14 per candidate
 *   STRATEGY-LIVE-READINESS.json           LIVE_NOT_APPROVED for every candidate with its prerequisites
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExtract } from '../evidence/psr709-extract.mjs';
import { CONTRACTS, buildRegistry } from '../registry.mjs';
import { FOUNDATION } from '../contract.mjs';
import { reviewSummary } from '../reviews.mjs';
import { completionGaps, gapCounts, GAPS_SCHEMA, GAP_CLASS, DIMENSIONS, MEASUREMENT_FINDINGS, TEST_CATEGORIES } from './gaps.mjs';
import { completionStatus, acceptanceGate, STATUS_SCHEMA } from './status.mjs';
import { DATA_CATALOGUE, METHOD_DATA, REFERENCE_RUNS } from './facts.mjs';
import { codeSha256, SCENARIO_SET } from '../runner/run-research.mjs';
import { MODEL_ASSUMPTIONS } from '../methods/turtle.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const ARTIFACT_DIR = path.resolve(HERE, '..', 'artifacts');
const TEST_DIR = path.join(ROOT, 'scripts/supertrader/tests');

/** test file (repo path) -> Set of top-level test names, read from the sf-*.test.mjs sources. */
export function testIndex() {
  const idx = {};
  for (const f of fs.readdirSync(TEST_DIR).filter((x) => /^sf-.*\.test\.mjs$/.test(x)).sort()) {
    const src = fs.readFileSync(path.join(TEST_DIR, f), 'utf8');
    // a test declared with { skip } or { todo } does not count as existing (review SF2-R4-07)
    idx[`scripts/supertrader/tests/${f}`] = new Set([...src.matchAll(/^test\('((?:[^'\\]|\\.)*)'(,\s*\{[^}]*\b(skip|todo)\b)?/gm)].filter((m) => !m[2]).map((m) => m[1].replace(/\\'/g, "'")));
  }
  return idx;
}

const RISK_KINDS = ['STOP', 'SIZING', 'PORTFOLIO', 'PYRAMIDING'];
const pick = (r) => ({ ruleId: r.id, kind: r.kind, psr709: r.psr709, status: r.status, essential: r.essential !== false, gate: r.gate ?? null, rule: r.rule, derivation: r.derivation ?? null, reason: r.reason ?? null, code: r.code ?? null, tests: r.tests ?? [] });

export function buildCompletion(outDir = ARTIFACT_DIR) {
  const extract = loadExtract(), registry = buildRegistry(extract), idx = testIndex();
  const golden = JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, 'STRATEGY-GOLDEN-CASE-RESULTS.json'), 'utf8'));
  const reviews = reviewSummary(), CODE = codeSha256();
  const rows = CONTRACTS.map((c) => {
    const entry = registry.entries.find((e) => e.strategyId === c.strategyId);
    const gaps = completionGaps(c, entry, { testIndex: idx });
    const gate = c.outputKind === 'RESEARCH_SIGNAL' ? acceptanceGate(c, entry, gaps, { golden, reviews, referenceRuns: REFERENCE_RUNS.filter((r) => r.method === c.strategyId && r.kind === 'METHOD'), codeSha256: CODE, modelAssumptions: MODEL_ASSUMPTIONS, scenarioIds: SCENARIO_SET.map((s) => s.id) }) : null;
    return { c, entry, gaps, gate, status: completionStatus(c, entry, gaps, gate) };
  });
  const goldenOf = (id) => golden.cases.filter((x) => x.strategyIds.includes(id));
  const total = Object.fromEntries(Object.keys(GAP_CLASS).map((k) => [k, rows.reduce((a, r) => a + gapCounts(r.gaps)[k], 0)]));

  const files = {
    'STRATEGY-COMPLETION-GAPS.json': {
      schema: GAPS_SCHEMA, derivedFrom: 'completion/gaps.mjs over the 13 contracts, the registry and the sf test sources; never set by hand',
      gapClasses: GAP_CLASS, dimensions: DIMENSIONS.map((d) => ({ id: d.id, title: d.title, ruleKinds: d.kinds ?? null })),
      dimensionStatus: ['COMPLETE', 'COMPLETE_WITH_DECLARED_LIMITS', 'PARTIAL', 'NOT_APPLICABLE'],
      totals: total,
      openImplementationGaps: rows.flatMap((r) => r.gaps.dimensions.flatMap((d) => d.gaps.filter((g) => g.class === GAP_CLASS.IMPLEMENTATION_GAP).map((g) => ({ strategyId: r.c.strategyId, dimension: d.id, ...g })))),
      candidates: rows.map((r) => ({ ...r.gaps, counts: gapCounts(r.gaps) })),
    },
    'STRATEGY-COMPLETION-STATUS.json': {
      schema: STATUS_SCHEMA, derivedFrom: 'completion/status.mjs; RESEARCH_ENGINE_COMPLETE only with a passing acceptance gate (mandate section 6)',
      engineStates: ['RESEARCH_ENGINE_COMPLETE', 'RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION', 'MECHANICAL_SCREEN_COMPLETE', 'MECHANICAL_COMPONENTS_ONLY', 'INCOMPLETE'],
      currentCodeSha256: CODE,
      flags: ['PARTIAL_DATA_BLOCKED', 'PARTIAL_SOURCE_BLOCKED', 'MANUAL_REVIEW_REQUIRED', 'BACKTEST_DIAGNOSTIC_READY', 'COMPONENT_STUDY_ONLY', 'LIVE_NOT_APPROVED'],
      candidates: rows.map((r) => r.status),
      acceptanceGates: rows.filter((r) => r.gate).map((r) => r.gate),
      tradable: false, liveActivation: false,
    },
    'STRATEGY-SOURCE-FIDELITY-RESULTS.json': {
      schema: 'supertrader-sf-source-fidelity-results-1.0.0', rule: 'fidelity per rule status (contract.mjs); SOURCE_EXACT only on HARD / HIGH / original-checked #709 rules; every derivation written down',
      candidates: rows.map((r) => ({ strategyId: r.c.strategyId, candidateId: r.c.candidateId, sourceContractVersion: r.c.sourceContractVersion, contractFingerprint: r.entry.contractFingerprint, sourceCoverage: r.entry.sourceCoverage,
        derivations: r.c.rules.filter((x) => x.status === 'SOURCE_DERIVED').map((x) => ({ ruleId: x.id, psr709: x.psr709, gate: x.gate ?? null, derivation: x.derivation })),
        goldenCases: { total: goldenOf(r.c.strategyId).length, pass: goldenOf(r.c.strategyId).filter((x) => x.result === 'PASS').length },
        noInventedThreshold: r.c.rules.every((x) => !x.gate || x.status === 'SOURCE_EXACT' || x.status === 'SOURCE_DERIVED') })),
      goldenSummary: golden.summary,
    },
    'STRATEGY-EXECUTION-RESULTS.json': {
      schema: 'supertrader-sf-execution-results-1.0.0', certification: FOUNDATION.certification,
      rule: 'public facts only (receipt hashes, counts, pass flags); prices and returns stay sealed for the owner (results-public-key.pem)',
      binding: { snapshotId: FOUNDATION.snapshotId, accounting: FOUNDATION.accounting.cli },
      methods: rows.map((r) => ({ strategyId: r.c.strategyId, outputKind: r.c.outputKind, timing: r.c.timing, executionReadiness: r.entry.executionReadiness,
        conventions: r.c.knownLimitations.filter((l) => /intrabar|daily bars|close|fill|execution|liquidity/i.test(l)),
        modelAssumptions: (r.c.modelAssumptions || []).map((id) => MODEL_ASSUMPTIONS.find((m) => m.id === id)) })),
      referenceRuns: REFERENCE_RUNS,
    },
    'STRATEGY-RISK-VALIDATION.json': {
      schema: 'supertrader-sf-risk-validation-1.0.0', rule: 'every stop, sizing, pyramiding and portfolio rule with status and tests; manual risk decisions are never filled with a number',
      methods: rows.map((r) => ({ strategyId: r.c.strategyId, stops: r.c.stops, positionSizing: r.c.positionSizing, rules: r.c.rules.filter((x) => RISK_KINDS.includes(x.kind)).map(pick),
        riskTests: Object.fromEntries(['STOP', 'RISK_SIZING', 'GAP'].map((k) => [k, r.gaps.dimensions.find((d) => d.id === 'D15_TESTS').note[k]])) })),
    },
    'STRATEGY-DATA-DEPENDENCIES.json': {
      schema: 'supertrader-sf-data-dependencies-1.0.0', rule: 'priority: 1 repository, 2 licensed provider fields, 3 lawful public sources, 4 external data needing an owner decision; no paid provider is subscribed, no bulk API call is made',
      catalogue: DATA_CATALOGUE,
      methods: rows.map((r) => ({ strategyId: r.c.strategyId, requiredData: r.c.requiredData, blockedRules: r.c.rules.filter((x) => x.status === 'DATA_BLOCKED').map((x) => ({ ruleId: x.id, scopes: x.scopes ?? null, essential: x.essential !== false, mechanicsImplemented: Boolean(x.code) })), dataPartial: r.c.dataPartial ?? [], needs: METHOD_DATA[r.c.strategyId] ?? [] })),
      measurementFindings: MEASUREMENT_FINDINGS,
    },
    'STRATEGY-BACKTEST-READINESS.json': {
      schema: 'supertrader-sf-backtest-readiness-2.0.0', rule: 'a full diagnostic method measurement only when all eight answers are YES (mandate section 14); a runnable engine with a declared data exception may run only as DIAGNOSTIC_RUN_WITH_DECLARED_DATA_EXCEPTION (the unenforced rule is named in every result); otherwise component studies at most, never reported as a method return',
      questions: ['completeEntries', 'completeExits', 'positionSizeDefined', 'stopsComplete', 'requiredDataPresent', 'accountingValid', 'signalsCausal', 'dataSufficient'],
      methods: rows.map((r) => {
        const dim = (id) => r.gaps.dimensions.find((d) => d.id === id), ok = (id) => ['COMPLETE', 'COMPLETE_WITH_DECLARED_LIMITS'].includes(dim(id).status);
        const runnable = r.entry.backtestReadiness === 'DIAGNOSTIC_READY';
        // requiredDataPresent ignores implemented mechanics: a rule whose data are missing is not enforced in any run
        // (review SF2-R1-01 / SF2-R3-02); accountingValid needs the gate's reconciliation of the current code (SF2-R3-01);
        // a component study keeps no portfolio ledger, so its accounting answer is no (SF2-R3-04)
        const ag3 = r.gate?.checks.find((x) => x.id === 'AG-3-RECONCILED')?.pass === true;
        const a = { completeEntries: ok('D03_ENTRY'), completeExits: ok('D04_EXIT'), positionSizeDefined: ok('D06_SIZING'), stopsComplete: ok('D05_STOP'), requiredDataPresent: !dim('D09_DATA').gaps.some((g) => g.essential && g.scope === 'DECLARED'), accountingValid: runnable && ag3, signalsCausal: !dim('D11_PIT').gaps.some((g) => g.class === GAP_CLASS.IMPLEMENTATION_GAP), dataSufficient: !r.c.rules.some((x) => x.kind === 'ENTRY' && x.essential !== false && x.status === 'DATA_BLOCKED' && (!x.scopes || x.scopes.includes('EQUITY_ADAPTATION'))) };
        const full = Object.values(a).every(Boolean) && runnable && r.status.fullMethodMeasurable;
        const mechanicsComplete = runnable && ['completeEntries', 'completeExits', 'positionSizeDefined', 'stopsComplete', 'signalsCausal', 'dataSufficient'].every((k) => a[k]) && (r.gate?.dataExceptions ?? []).length > 0 && r.status.blockingDataRules.every((id) => r.gate.dataExceptions.includes(id));
        const allowed = full ? 'FULL_DIAGNOSTIC_METHOD_RUN' : mechanicsComplete || (runnable && !a.requiredDataPresent) ? 'DIAGNOSTIC_RUN_WITH_DECLARED_DATA_EXCEPTION' : runnable ? 'DIAGNOSTIC_RUN_PENDING_GATE' : r.entry.backtestReadiness === 'COMPONENT_SIGNAL_STUDY_ONLY' ? 'COMPONENT_SIGNAL_STUDY_ONLY' : 'NONE';
        return { strategyId: r.c.strategyId, answers: a, fullDiagnosticMeasurement: full, allowed, declaredLimits: runnable ? [...r.status.blockingDataRules.map((x) => `${x} (DATA, not enforced)`), ...r.status.blockingSourceRules.map((x) => `${x} (SOURCE, readings as scenarios)`)] : [], knownFindings: MEASUREMENT_FINDINGS.map((f) => f.id) };
      }),
    },
    'STRATEGY-LIVE-READINESS.json': {
      schema: 'supertrader-sf-live-readiness-1.0.0', rule: 'no candidate is live; no signal is published, no order is routed, no model portfolio changes',
      methods: rows.map((r) => ({ strategyId: r.c.strategyId, liveReadiness: 'LIVE_NOT_APPROVED', engine: r.status.engine,
        prerequisites: [
          'owner approval (merge of the Draft PRs, then an explicit live decision)',
          'certifiable measurement: V4-D1 fix (Quant PR) and a new snapshot generation',
          ...(r.status.manualDecisions.length ? [`forward-logged manual review layer for ${r.status.manualDecisions.join(', ')}`] : []),
          ...(r.status.blockingDataRules.length ? [`data for ${r.status.blockingDataRules.join(', ')}`] : []),
          'a live signal path that emits research-signal.mjs records (none exists)',
        ] })),
    },
  };
  fs.mkdirSync(outDir, { recursive: true });
  for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(outDir, f), JSON.stringify(v, null, 1) + '\n');
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf('--out');
  const files = buildCompletion(i >= 0 ? path.resolve(a[i + 1]) : ARTIFACT_DIR);
  const st = files['STRATEGY-COMPLETION-STATUS.json'], g = files['STRATEGY-COMPLETION-GAPS.json'];
  process.stdout.write(`completion: ${st.candidates.map((c) => `${c.candidateId} ${c.engine}`).join(', ')}; open implementation gaps ${g.openImplementationGaps.length}\n`);
  if (g.openImplementationGaps.length && process.argv.includes('--strict')) process.exitCode = 1;
}
