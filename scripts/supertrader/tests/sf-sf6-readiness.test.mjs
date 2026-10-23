// Supertrader 6.0 – Kriterien der Readiness-Matrix, festgeschrieben vor dem ersten Supertrader-6.0-Snapshot-Ergebnis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sf6ReadinessCriteriaSha256, DIMENSIONS, COMPLETION_STATES, CERTIFICATION_CRITERIA, CC5 } from '../source-faithful/completion/sf6-readiness-criteria.mjs';

const PINNED_CRITERIA = '469ea7d127899a5245eb3be2ade27b7c241a9f74b9d7f6a9b0efd799a3935d82';

test('SF6-READINESS-CRITERIA-PINNED: 15 Dimensionen, Zustaende und harte Kriterien vor den Ergebnissen festgeschrieben', () => {
  assert.equal(sf6ReadinessCriteriaSha256(), PINNED_CRITERIA);
  assert.equal(DIMENSIONS.length, 15);
  assert.deepEqual(COMPLETION_STATES.at(-1), 'CERTIFICATION_CANDIDATE');
  assert.equal(CERTIFICATION_CRITERIA.length, 8);
  assert.equal(CC5.maxDirectlyExposedShare, 0.01);
});

test('SF6-READINESS-MATRIX: 13 Kandidaten, 15 Dimensionen, nichts Unbelegtes besteht, Live nie freigegeben', async () => {
  const { buildSf6Readiness } = await import('../source-faithful/completion/build-sf6-readiness.mjs');
  const empty = buildSf6Readiness({ facts: { integrity: null, validation: null, holdout: null } });
  assert.equal(empty.candidates.length, 13);
  for (const r of empty.candidates) {
    assert.ok(COMPLETION_STATES.includes(r.primaryState), r.candidateId);
    assert.equal(Object.keys(r.dimensions).length, 15);
    assert.equal(r.liveReadiness, 'LIVE_NOT_APPROVED');
    assert.notEqual(r.primaryState, 'CERTIFICATION_CANDIDATE', 'ohne Laufevidenz kein Kandidat');
    if (r.lifecycleKey) assert.equal(r.dimensions.CORPORATE_ACTION_INTEGRITY.grade, 'NOT_EVIDENCED');
  }
  // CC-8: a previously opened holdout never passes, whatever else holds
  const opened = buildSf6Readiness({ facts: { integrity: null, validation: null, holdout: { runId: 'x', references: { TURTLE_S1: { costLevels: { REF: { trades: 1 } } } } } } });
  assert.equal(opened.candidates[0].certificationCriteria['CC-8-OOS'], false);
  assert.equal(opened.candidates[0].dimensions.OUT_OF_SAMPLE_EVIDENCE.grade, 'PASS_WITH_DECLARED_LIMITS');
  // the committed artifact is the build of the committed facts
  const fs = await import('node:fs');
  const committed = JSON.parse(fs.readFileSync(new URL('../source-faithful/artifacts/STRATEGY-SF6-READINESS.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(buildSf6Readiness())));
});
