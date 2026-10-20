// Source-faithful strategies, PR 1: #709 evidence pin, common contract, 13-candidate registry, artifacts, workflow
// snapshot passthrough. No market data; artifacts are rebuilt into a temporary directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExtract, buildExtract, DEFAULT_EXTRACT, PSR709, METHOD_CONTEXTS } from '../source-faithful/evidence/psr709-extract.mjs';
import { validateContract, deriveImplementationStatus, reproducibilityReceipt, contractFingerprint, FOUNDATION, RULE_STATUS } from '../source-faithful/contract.mjs';
import { CONTRACTS, buildRegistry, NON_CANDIDATES } from '../source-faithful/registry.mjs';
import { buildAll, ARTIFACT_DIR } from '../source-faithful/build-artifacts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const X = loadExtract();

test('SF-PIN: #709 extract is pinned to 8b766fa with 20 verified files and the manifest counts', () => {
  assert.equal(X.pin.commit, '8b766fa4947cb2b564ede7cd850c6a995f57aada');
  assert.equal(X.pin.filesVerified, 20);
  assert.equal(X.pin.mismatches, 0);
  assert.equal(X.pin.manifestCounts.rules_and_context_findings, 785);
  assert.equal(X.pin.manifestCounts.behavioral_cases, 287);
  assert.equal(X.pin.manifestCounts.conflicts, 52);
  assert.equal(X.pin.manifestCounts.implementation_candidates, 13);
  assert.equal(X.finalReview.openHighFindings, 0);
  assert.equal(X.finalReview.openCriticalFindings, 0);
  assert.equal(X.candidates.length, 13);
  const ids = new Set(X.rules.map((r) => r.rule_id));
  for (const c of X.candidates) for (const r of c.evidence_rule_ids) assert.ok(ids.has(r), r);
});

test('SF-PIN-REBUILD: the extract regenerates byte-identically from the #709 files (PSR709_DIR)', { skip: !process.env.PSR709_DIR && 'set PSR709_DIR to a checkout of #709 @ 8b766fa' }, () => {
  const rebuilt = JSON.stringify(buildExtract(process.env.PSR709_DIR), null, 1) + '\n';
  assert.equal(rebuilt, fs.readFileSync(DEFAULT_EXTRACT, 'utf8'));
});

test('SF-CANDIDATES: the registry holds exactly the 13 #709 candidates; CAN SLIM is documented, not counted', () => {
  assert.equal(CONTRACTS.length, 13);
  assert.deepEqual(CONTRACTS.map((c) => c.candidateId).sort(), X.candidates.map((c) => c.candidate_id).sort());
  for (const c of CONTRACTS) assert.equal(METHOD_CONTEXTS[c.strategyId].candidate, c.candidateId);
  assert.ok(NON_CANDIDATES.some((n) => n.id === 'ONEIL_CAN_SLIM' && n.status === 'NOT_A_709_CANDIDATE'));
  const reg = buildRegistry(X);
  assert.ok(reg.entries.every((e) => e.tradable === false && e.liveActivation === false));
});

test('SF-CONTRACTS: every contract validates; its classification also validates in the implemented view', () => {
  for (const c of CONTRACTS) {
    const v = validateContract(c, X);
    assert.ok(v.ok, `${c.strategyId}: ${v.errors.join(' ')}`);
    const full = { ...c, implemented: true, rules: c.rules.map((r) => ({ ...r, status: r.targetStatus ?? r.status, code: r.code ?? r.plannedCode ?? undefined, tests: r.tests ?? r.plannedTests })) };
    const vf = validateContract(full, X);
    assert.ok(vf.ok, `${c.strategyId} (implemented view): ${vf.errors.join(' ')}`);
  }
});

test('SF-VALIDATOR: SOURCE_EXACT only on hardenable #709 rules; preferences never hardened as gates', () => {
  const base = { ...CONTRACTS[0], implemented: true };
  const mk = (rule) => validateContract({ ...base, rules: [...base.rules.map((r) => ({ ...r, status: r.targetStatus ?? r.status, code: 'x', tests: ['t'] })), rule] }, X);
  // MIN-TT-01 is HARD but MEDIUM, unchecked wording, REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION
  assert.ok(mk({ id: 'X1', kind: 'FILTER', psr709: ['MIN-TT-01'], status: 'SOURCE_EXACT', rule: 'x', code: 'x', tests: ['t'] }).errors.some((e) => e.startsWith('EXACT_ON_NON_HARDENABLE_RULE')));
  // KK-005 is a PREFERENCE (DO_NOT_HARDEN_PREFERENCE)
  assert.ok(mk({ id: 'X2', kind: 'FILTER', gate: true, psr709: ['KK-005'], status: 'SOURCE_DERIVED', derivation: 'd', rule: 'x', code: 'x', tests: ['t'] }).errors.some((e) => e.startsWith('PREFERENCE_HARDENED_AS_GATE')));
  // a free-text gate exemption is not accepted (only GATE_EXEMPTIONS entries for the matching candidate and rule)
  assert.ok(mk({ id: 'X2b', kind: 'FILTER', gate: true, gateExemption: 'because I say so', psr709: ['KK-005'], status: 'SOURCE_DERIVED', derivation: 'd', rule: 'x', code: 'x', tests: ['t'] }).errors.some((e) => e.startsWith('PREFERENCE_HARDENED_AS_GATE')));
  assert.ok(mk({ id: 'X2c', kind: 'FILTER', gate: true, gateExemption: 'SETUP_DEFINITION_C13', psr709: ['RAS04-001'], status: 'SOURCE_DERIVED', derivation: 'd', rule: 'x', code: 'x', tests: ['t'] }).errors.some((e) => e.startsWith('PREFERENCE_HARDENED_AS_GATE'))); // wrong candidate (C01)
  assert.ok(mk({ id: 'X3', kind: 'FILTER', psr709: ['TUR-N'], status: 'SOURCE_DERIVED', rule: 'x', code: 'x', tests: ['t'] }).errors.some((e) => e.startsWith('DERIVED_WITHOUT_DERIVATION')));
  assert.ok(mk({ id: 'X4', kind: 'FILTER', psr709: ['TUR-N'], status: 'NOT_IMPLEMENTED', rule: 'x' }).errors.some((e) => e.startsWith('STATUS_WITHOUT_REASON')));
  assert.ok(mk({ id: 'X5', kind: 'FILTER', psr709: ['NOPE-1'], status: 'MANUAL_REVIEW_REQUIRED', rule: 'x' }).errors.some((e) => e.startsWith('UNKNOWN_PSR709_RULE')));
  assert.ok(mk({ id: 'X6', kind: 'FILTER', psr709: ['TUR-N'], status: 'SOURCE_EXACT', rule: 'x' }).errors.some((e) => e.startsWith('IMPLEMENTED_WITHOUT_TEST')));
});

test('SF-STATUS: method status is derived from rule statuses with a fixed precedence', () => {
  const r = (kind, status, extra = {}) => ({ id: `${kind}-${status}-${Math.random()}`, kind, status, psr709: [], rule: 'x', ...extra });
  assert.equal(deriveImplementationStatus({ rules: [r('ENTRY', 'NOT_IMPLEMENTED')] }), 'NOT_IMPLEMENTED');
  assert.equal(deriveImplementationStatus({ rules: [r('ENTRY', 'SOURCE_EXACT'), r('EXIT', 'SOURCE_EXACT')] }), 'IMPLEMENTED_SOURCE_EXACT');
  assert.equal(deriveImplementationStatus({ rules: [r('ENTRY', 'SOURCE_EXACT'), r('EXIT', 'SOURCE_DERIVED')] }), 'IMPLEMENTED_SOURCE_DERIVED');
  assert.equal(deriveImplementationStatus({ rules: [r('ENTRY', 'SOURCE_EXACT'), r('SIZING', 'MANUAL_REVIEW_REQUIRED')] }), 'PARTIAL_MANUAL_REVIEW');
  assert.equal(deriveImplementationStatus({ rules: [r('ENTRY', 'SOURCE_EXACT'), r('FILTER', 'DATA_BLOCKED'), r('SIZING', 'MANUAL_REVIEW_REQUIRED')] }), 'PARTIAL_DATA_BLOCKED');
  assert.equal(deriveImplementationStatus({ rules: [r('ENTRY', 'SOURCE_EXACT'), r('EXIT', 'NOT_IMPLEMENTED')] }), 'PARTIAL_MANUAL_REVIEW');
  assert.equal(deriveImplementationStatus({ ambiguityBlocksMethod: true, rules: [r('ENTRY', 'SOURCE_EXACT'), r('EXIT', 'SOURCE_AMBIGUOUS')] }), 'SOURCE_UNRESOLVED');
  // non-essential rules do not lower the status
  assert.equal(deriveImplementationStatus({ rules: [r('ENTRY', 'SOURCE_EXACT'), r('EXIT', 'DATA_BLOCKED', { essential: false })] }), 'IMPLEMENTED_SOURCE_EXACT');
  // scope filter (Turtle original vs equity adaptation)
  const layered = { rules: [r('ENTRY', 'SOURCE_DERIVED', { scopes: ['ORIGINAL', 'EQUITY_ADAPTATION'] }), r('ENTRY', 'DATA_BLOCKED', { scopes: ['ORIGINAL'] })] };
  assert.equal(deriveImplementationStatus(layered), 'PARTIAL_DATA_BLOCKED');
  assert.equal(deriveImplementationStatus(layered, { scope: 'EQUITY_ADAPTATION' }), 'IMPLEMENTED_SOURCE_DERIVED');
  assert.equal(RULE_STATUS.SOURCE_AMBIGUOUS, 'SOURCE_AMBIGUOUS');
});

test('SF-PLANNED: before its method PR a contract claims nothing (all rules NOT_IMPLEMENTED with a target)', () => {
  for (const c of CONTRACTS.filter((x) => !x.implemented)) {
    assert.equal(deriveImplementationStatus(c), 'NOT_IMPLEMENTED', c.strategyId);
    for (const r of c.rules) { assert.equal(r.status, 'NOT_IMPLEMENTED'); assert.ok(r.targetStatus); assert.match(r.reason, /^PLANNED/); }
  }
});

test('SF-RECEIPT: a reproducibility receipt requires the snapshot id format and research-v1 accounting', () => {
  const ok = reproducibilityReceipt({ snapshotId: FOUNDATION.snapshotId, accounting: 'RESEARCH_V1', contractFingerprint: contractFingerprint(CONTRACTS[0]), codeSha256: 'a'.repeat(64) });
  assert.equal(ok.certification, 'DIAGNOSTIC_NOT_CERTIFIED');
  assert.match(ok.receiptSha256, /^[0-9a-f]{64}$/);
  assert.throws(() => reproducibilityReceipt({ snapshotId: FOUNDATION.snapshotId, accounting: 'LEGACY', contractFingerprint: 'x', codeSha256: 'y' }), /RESEARCH_V1/);
  assert.throws(() => reproducibilityReceipt({ snapshotId: 'sts1-live', accounting: 'RESEARCH_V1', contractFingerprint: 'x', codeSha256: 'y' }), /SNAPSHOT_ID_FORMAT/);
});

test('SF-ARTIFACTS: committed artifacts equal a fresh build; registry validation passes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-artifacts-'));
  try {
    const files = buildAll(tmp);
    for (const f of Object.keys(files)) assert.equal(fs.readFileSync(path.join(tmp, f), 'utf8'), fs.readFileSync(path.join(ARTIFACT_DIR, f), 'utf8'), `${f} is stale: run build-artifacts.mjs`);
    assert.equal(files['STRATEGY-REGISTRY-VALIDATION.json'].pass, true);
    assert.equal(files['STRATEGY-SNAPSHOT-PROVENANCE.json'].pointerAgrees, true);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('SF-WORKFLOW: supertrader-validation.yml passes --snapshot / --accounting to every analyze-methods run and fails closed', () => {
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/supertrader-validation.yml'), 'utf8');
  assert.match(y, /- name: Snapshot- und Abrechnungsvertrag \(fail closed\)/);
  assert.match(y, /\^sts1-\[0-9a-f\]\{32\}\$/);
  assert.match(y, /SNAPSHOT_OR_ACCOUNTING_NOT_SUPPORTED_FOR_MODE/);
  const runs = y.split('\n').filter((l) => /run: node scripts\/supertrader\/validation\/analyze-methods\.mjs/.test(l));
  assert.ok(runs.length >= 3);
  for (const l of runs) assert.match(l, /\$SNAP_ARGS$/, l);
  // every step that runs analyze-methods receives SNAP_ARGS through env
  for (const block of y.split('      - name: ').filter((b) => /run: node scripts\/supertrader\/validation\/analyze-methods\.mjs/.test(b))) assert.match(block, /SNAP_ARGS: \$\{\{ steps\.snap\.outputs\.args \}\}/);
  // ADR-005: inputs only via env, never in shell text
  for (const l of y.split('\n')) if (/\$\{\{ inputs\.(snapshot|accounting) \}\}/.test(l)) assert.match(l, /^\s+IN_(SNAPSHOT|ACCOUNTING): /, l);
  // the analyze-methods CLI accepts exactly these flags
  const am = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/analyze-methods.mjs'), 'utf8');
  assert.match(am, /arg\('--snapshot', null\)/);
  assert.match(am, /\['legacy', 'research-v1'\]/);
});

test('SF-PSR709-CONST: the pin constant matches the #709 draft branch and commit', () => {
  assert.equal(PSR709.pullRequest, 709);
  assert.equal(PSR709.branch, 'research/supertrader-primary-source-reconstruction');
});

test('SF-TRACE: every test a contract cites for an implemented rule exists by name in the cited test file', () => {
  for (const c of CONTRACTS.filter((x) => x.implemented)) {
    for (const r of c.rules) for (const t of r.tests ?? []) {
      const [file, name] = t.split(': ');
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(src.includes(`test('${name}`) || src.includes(`/ ${name}`) || src.includes(`${name} /`), `${c.strategyId} ${r.id}: missing test ${t}`);
    }
  }
});

test('SF-DOCS: generated coverage / traceability / readiness docs equal a fresh build', async () => {
  const { buildDocs, DOCS_DIR } = await import('../source-faithful/build-docs.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-docs-'));
  try { for (const f of Object.keys(buildDocs(tmp))) assert.equal(fs.readFileSync(path.join(tmp, f), 'utf8'), fs.readFileSync(path.join(DOCS_DIR, f), 'utf8'), `${f} is stale: run build-docs.mjs`); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// skipped while record-golden-results.mjs runs the suite: the record cannot certify the file it is about to replace
test('SF-GOLDEN-RECORD: the recorded golden results cover every catalogued golden test, all PASS', { skip: process.env.SF_RECORDING === '1' }, () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, 'STRATEGY-GOLDEN-CASE-CATALOGUE.json'), 'utf8'));
  const rec = JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, 'STRATEGY-GOLDEN-CASE-RESULTS.json'), 'utf8'));
  assert.deepEqual(rec.cases.map((c) => c.test).sort(), cat.goldenTests.map((g) => g.test).sort(), 'golden record is stale: run record-golden-results.mjs');
  assert.ok(rec.cases.every((c) => c.result === 'PASS'));
  assert.equal(rec.summary.testsFailed, 0);
});

test('SF-INDEPENDENCE: method modules do not import each other; legacy Supertrader code does not import the source-faithful tree', () => {
  const dir = path.join(ROOT, 'scripts/supertrader/source-faithful/methods');
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    assert.ok(imports.every((i) => !i.startsWith('./')), `${f} imports another method: ${imports}`);
    assert.ok(imports.every((i) => /^\.\.\/common\/|^\.\.\/\.\.\/validation\/(accounting-contract|portfolio)\.mjs$|^\.\.\/\.\.\/engine\/indicators\.mjs$/.test(i)), `${f}: ${imports}`);
  }
  const legacy = ['engine', 'validation', 'snapshot', 'fidelity', 'house'].flatMap((d) => fs.readdirSync(path.join(ROOT, 'scripts/supertrader', d)).filter((f) => f.endsWith('.mjs')).map((f) => path.join(ROOT, 'scripts/supertrader', d, f)));
  for (const f of [...legacy, path.join(ROOT, 'scripts/supertrader/build.mjs')]) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /source-faithful/, f);
});

test('SF-REVIEWS: no open HIGH or CRITICAL review finding; every FIXED finding names its test', async () => {
  const { REVIEWS, reviewSummary } = await import('../source-faithful/reviews.mjs');
  assert.equal(reviewSummary().openHighOrCritical, 0);
  for (const f of REVIEWS.flatMap((r) => r.findings)) if (f.status === 'FIXED' && f.severity !== 'LOW') assert.ok(f.test, f.id);
});
