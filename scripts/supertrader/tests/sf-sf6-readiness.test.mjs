// Supertrader 6.0 – Kriterien der Readiness-Matrix, festgeschrieben vor dem ersten Supertrader-6.0-Snapshot-Ergebnis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sf6ReadinessCriteriaSha256, DIMENSIONS, COMPLETION_STATES, CERTIFICATION_CRITERIA, CC5 } from '../source-faithful/completion/sf6-readiness-criteria.mjs';

const PINNED_CRITERIA = 'ebba5c2a67c8b0ac24c80fb243dbc5a65d3d1ea5dbebbb011c0b94f7e720e446';

test('SF6-READINESS-CRITERIA-PINNED: 15 Dimensionen, Zustaende und harte Kriterien vor den Ergebnissen festgeschrieben', () => {
  assert.equal(sf6ReadinessCriteriaSha256(), PINNED_CRITERIA);
  assert.equal(DIMENSIONS.length, 15);
  assert.deepEqual(COMPLETION_STATES.at(-1), 'CERTIFICATION_CANDIDATE');
  assert.equal(CERTIFICATION_CRITERIA.length, 8);
  assert.equal(CC5.maxDirectlyExposedShare, 0.01);
});
