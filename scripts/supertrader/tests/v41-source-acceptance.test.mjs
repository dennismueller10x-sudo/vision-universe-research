// V4.1 source acceptance on #709 evidence: pinning, determinism, upgrade discipline and unchanged #705 measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildExtract, PSR709, METHOD_CONTEXTS } from '../research/v4/acceptance/psr709-extract.mjs';
import { buildAcceptanceV41, METHODS_V41, DATA_CATEGORIES_V41, previousEligibility } from '../research/v4/acceptance/build-acceptance-v4-1.mjs';
import { EXECUTABLE_GOLDENS_V41, GOLDEN_DEFINITIONS_V41, traceabilityV41, goldenCasesV41, manualReviewContractV41 } from '../research/v4/methods/build-method-artifacts-v4-1.mjs';
import { ORACLE_TOLERANCES_V4 } from '../research/v4/oracle/compare-v4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const V4 = path.join(ROOT, 'scripts/supertrader/research/v4'), OUT = path.join(V4, 'v4-1');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const extract = J(path.join(OUT, 'PSR709-EVIDENCE-EXTRACT.json'));
const calibration = J(path.join(V4, 'SUPERTRADER-V4-CALIBRATION-SUMMARY.json'));
const built = buildAcceptanceV41({ extract, calibration, executableGoldens: EXECUTABLE_GOLDENS_V41 });
const prev = previousEligibility();
for (const row of built.matrix.matrix) row.previous705 = prev.get(row.id) ?? null;

test('extract is pinned to #709 @ 8b766fa with all 20 manifest hashes verified and the manifest counts', () => {
  assert.equal(extract.pin.commit, PSR709.commit);
  assert.equal(extract.pin.pullRequest, 709);
  assert.equal(extract.pin.filesVerified, 20);
  assert.equal(extract.pin.mismatches, 0);
  assert.ok(extract.pin.files.every((f) => f.verified && /^[0-9a-f]{64}$/.test(f.sha256)));
  const c = extract.pin.manifestCounts;
  assert.deepEqual([c.rules_and_context_findings, c.behavioral_cases, c.conflicts, c.pdf_pages, c.implementation_candidates], [785, 287, 52, 4232, 13]);
  assert.equal(extract.finalReview.status, 'PASS_WITH_EXPLICIT_SOURCE_GAPS');
  assert.equal(extract.finalReview.openHighFindings, 0);
});

test('extract regenerates byte-identically from the #709 files when PSR709_DIR is given', { skip: !process.env.PSR709_DIR }, () => {
  assert.deepEqual(buildExtract(process.env.PSR709_DIR), extract);
});

test('committed V4.1 artifacts equal a fresh build (no hand edits)', () => {
  assert.deepEqual(J(path.join(OUT, 'SUPERTRADER-V4-1-SOURCE-ACCEPTANCE.json')), JSON.parse(JSON.stringify(built.source)));
  assert.deepEqual(J(path.join(OUT, 'SUPERTRADER-V4-1-DATA-ACCEPTANCE.json')), JSON.parse(JSON.stringify(built.data)));
  assert.deepEqual(J(path.join(OUT, 'SUPERTRADER-V4-1-MEASUREMENT-ACCEPTANCE.json')), JSON.parse(JSON.stringify(built.measurement)));
  assert.deepEqual(J(path.join(OUT, 'SUPERTRADER-V4-1-METHOD-ELIGIBILITY.json')), JSON.parse(JSON.stringify(built.eligibility)));
  assert.deepEqual(J(path.join(OUT, 'SUPERTRADER-V4-1-FINAL-MATRIX.json')), JSON.parse(JSON.stringify(built.matrix)));
  assert.deepEqual(J(path.join(OUT, 'SUPERTRADER-V4-1-SOURCE-CODE-TRACEABILITY.json')), JSON.parse(JSON.stringify(traceabilityV41(extract))));
  assert.deepEqual(J(path.join(OUT, 'SUPERTRADER-V4-1-GOLDEN-CASES.json')), JSON.parse(JSON.stringify(goldenCasesV41(extract))));
  assert.deepEqual(J(path.join(OUT, 'MANUAL-REVIEW-V4-1-CONTRACT.json')), JSON.parse(JSON.stringify(manualReviewContractV41(built.eligibility))));
});

test('every #709 sentence quoted by a method is a verbatim part of its #709 candidate assessment', () => {
  for (const m of METHODS_V41) for (const q of Object.values(m.psrQuotes ?? {})) {
    const cand = extract.candidates.find((c) => c.candidate_id === METHOD_CONTEXTS[m.id].candidate);
    assert.ok(cand.assessment.includes(q), `${m.id}: "${q}"`);
  }
});

test('13 #709 candidates map one-to-one; CAN SLIM has none and is SOURCE_BLOCKED on #709 GAP-B04', () => {
  const ids = Object.values(METHOD_CONTEXTS).map((m) => m.candidate).filter(Boolean).sort();
  assert.deepEqual(ids, extract.candidates.map((c) => c.candidate_id).sort());
  assert.equal(built.source.methods.find((m) => m.id === 'ONEIL_CAN_SLIM').verdict, 'SOURCE_BLOCKED');
});

test('no owner-attested OSR-* finding is used as source evidence in V4.1', () => {
  assert.ok(!JSON.stringify(built.source.methods).includes('OSR-'));
});

test('upgrades above RESEARCH_ONLY happen only with #709 HARD/HIGH evidence: Darvas, Pocket Pivot, Buyable Gap-Up', () => {
  const up = built.matrix.matrix.filter((r) => r.previous705?.eligibility === 'RESEARCH_ONLY' && r.eligibility !== 'RESEARCH_ONLY').map((r) => r.id).sort();
  assert.deepEqual(up, ['DARVAS_LATER_QA', 'MORALES_KACHER_BUYABLE_GAP_UP', 'MORALES_KACHER_POCKET_PIVOT']);
  for (const id of up) {
    const s = built.source.methods.find((m) => m.id === id);
    assert.ok(s.evidence.some((e) => e.modal === 'HARD' && e.confidence === 'HIGH' && e.originalWordingChecked && e.hardenable), id);
    assert.equal(built.matrix.matrix.find((r) => r.id === id).eligibility, 'MANUAL_LAYER_REQUIRED');
  }
});

test('Power Play drops to RESEARCH_ONLY: its numeric rules need original corroboration before hardening', () => {
  const s = built.source.methods.find((m) => m.id === 'MINERVINI_POWER_PLAY');
  assert.equal(s.verdict, 'SOURCE_PARTIAL');
  assert.deepEqual(s.blockers.map((b) => b.split(':')[0]), ['MIN-PP-02', 'MIN-PP-04', 'MIN-PP-05']);
});

test('no IMPLEMENT_NOW and no performance run while the #705 measurement layer is NOT_CERTIFIED', () => {
  assert.equal(calibration.certification.level, 'NOT_CERTIFIED');
  assert.ok(built.matrix.matrix.every((r) => r.eligibility !== 'IMPLEMENT_NOW' && r.measurement === 'MEASUREMENT_BLOCKED'));
  assert.equal(built.matrix.performanceRuns, 0);
  assert.equal(built.matrix.backtests, 0);
});

test('Turtle stays RESEARCH_ONLY although SOURCE_ACCEPTED; after the data fix it also needs V41-F1', () => {
  for (const id of ['TURTLE_S1_SOURCE', 'TURTLE_S2_SOURCE']) {
    const r = built.matrix.matrix.find((x) => x.id === id);
    assert.equal(r.source, 'SOURCE_ACCEPTED');
    assert.equal(r.eligibility, 'RESEARCH_ONLY');
    assert.deepEqual(r.afterReverseSplitFix.measurability, { class: 'FULL_METHOD_AFTER_ENGINE_FINDINGS', requires: ['V41-F1'], note: 'code-only prerequisite, no data dependency' });
  }
});

test('measurable after the reverse-split fix: Turtle S1/S2 (full method) and the three machine-screen components', () => {
  assert.deepEqual(built.matrix.measurableImmediatelyAfterReverseSplitFix.map((r) => `${r.id}:${r.class}`), [
    'TURTLE_S1_SOURCE:FULL_METHOD_AFTER_ENGINE_FINDINGS', 'TURTLE_S2_SOURCE:FULL_METHOD_AFTER_ENGINE_FINDINGS', 'DARVAS_LATER_QA:MACHINE_SCREEN_COMPONENT_ONLY',
    'MORALES_KACHER_POCKET_PIVOT:MACHINE_SCREEN_COMPONENT_ONLY', 'MORALES_KACHER_BUYABLE_GAP_UP:MACHINE_SCREEN_COMPONENT_ONLY']);
  assert.equal(DATA_CATEGORIES_V41.price.now, 'DATA_PARTIAL', 'V4-D1 open');
});

test('calibration tolerances and the frozen V4 code are unchanged (no post-hoc quarantine or tolerance change)', () => {
  const freeze = J(path.join(V4, 'SUPERTRADER-V4-FREEZE.json'));
  assert.deepEqual(freeze.tolerances.external, JSON.parse(JSON.stringify(ORACLE_TOLERANCES_V4)));
  for (const [f, sha] of Object.entries({ ...freeze.code, ...freeze.testSuite })) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'), sha, f);
  }
});

test('traceability: every #709 id exists; every uncovered rule of an implemented context has a reason; T4-STOP is marked V41-F1', () => {
  const t = traceabilityV41(extract);
  assert.ok(t.uncoveredRules.every((u) => typeof u.reason === 'string' && u.reason.length > 0));
  assert.equal(t.turtle.find((r) => r.ruleId === 'T4-STOP').status, 'DEVIATION_V41_F1');
  assert.ok(t.components.every((c) => c.psr709Other.length === 0 || c.psr709Other.every((id) => /^(DAR|MOKA)-C/.test(id))), 'only conflict ids may sit outside the rule matrix');
});

test('every executable golden id has a definition and a test with that id', () => {
  const titles = ['v41-components-golden.test.mjs', 'v41-turtle-source-examples.test.mjs', 'v4-turtle-golden.test.mjs'].map((f) => fs.readFileSync(path.join(ROOT, 'scripts/supertrader/tests', f), 'utf8')).join('\n');
  const defs = new Set([...GOLDEN_DEFINITIONS_V41.map((g) => g.id), ...J(path.join(OUT, 'SUPERTRADER-V4-1-GOLDEN-CASES.json')).definitions.map((g) => g.id)]);
  for (const id of new Set(Object.values(EXECUTABLE_GOLDENS_V41).flat())) {
    assert.ok(defs.has(id), id);
    if (!id.startsWith('TG-')) assert.ok(titles.includes(`'${id} `), `test for ${id}`);
  }
});
