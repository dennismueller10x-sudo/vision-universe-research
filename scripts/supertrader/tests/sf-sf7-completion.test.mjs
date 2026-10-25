// Supertrader 7.0 completion matrix (completion/sf7-completion-matrix.mjs): 13 strategies, twelve answers each, machine
// fields equal the readiness artifact, no status upgrade, nothing live.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSf7Completion, sf7CompletionMarkdown, ANSWERS, SF7_EVIDENCE } from '../source-faithful/completion/sf7-completion-matrix.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('SF7-COMPLETION-MATRIX: artifact and document = fresh build; 13 strategies, every answer present, machine fields equal STRATEGY-SF6-READINESS, nothing live', () => {
  const a = buildSf7Completion();
  assert.deepEqual(JSON.parse(read('../source-faithful/artifacts/STRATEGY-SF7-COMPLETION.json')), JSON.parse(JSON.stringify(a)), 'stale: run completion/sf7-completion-matrix.mjs');
  assert.equal(read('../../../docs/SUPERTRADER_7_COMPLETION_MATRIX.md'), sf7CompletionMarkdown(a));
  const r6 = JSON.parse(read('../source-faithful/artifacts/STRATEGY-SF6-READINESS.json'));
  assert.equal(a.candidates.length, 13);
  for (const c of a.candidates) {
    const s = r6.candidates.find((x) => x.candidateId === c.candidateId);
    assert.equal(c.primaryState, s.primaryState); assert.equal(c.measurementClass, s.measurementClass);
    assert.deepEqual([...c.certificationMet, ...c.certificationMissing].sort(), Object.keys(s.certificationCriteria).sort());
    for (const k of c.certificationMet) assert.equal(s.certificationCriteria[k], true, `${c.candidateId}:${k}`);
    assert.equal(c.liveReadiness, 'LIVE_NOT_APPROVED'); assert.equal(c.certification, 'DIAGNOSTIC_NOT_CERTIFIED');
    for (const k of ['changed7', 'technical', 'original', 'assumptions', 'simulation', 'backtest', 'reliable', 'blocked', 'execution', 'manual', 'next']) assert.ok(ANSWERS[c.candidateId][k], `${c.candidateId}:${k}`);
    for (const e of c.evidence) assert.ok(SF7_EVIDENCE[e], `${c.candidateId}:${e}`);
  }
  assert.ok(r6.summary.certificationCandidates.length === 0);
  // E7-1: sub-criteria are reported, CC-5 itself is never upgraded by them
  for (const c of a.candidates) if (c.cc5Subcriteria) { assert.equal(c.certificationMissing.includes('CC-5-CORPORATE-ACTIONS'), true, c.candidateId); assert.equal(c.cc5Subcriteria['CC5-e-DETECTION-COMPLETE'], false); }
  const sepa = a.candidates.find((c) => c.candidateId === 'C06').cc5Subcriteria, wi = a.candidates.find((c) => c.candidateId === 'C04').cc5Subcriteria;
  assert.equal(sepa['CC5-a-K5-RESOLVED'], true); assert.equal(sepa['CC5-b-K3-RESOLVED'], true);
  assert.equal(wi['CC5-a-K5-RESOLVED'], true); assert.equal(wi['CC5-b-K3-RESOLVED'], false);
});
