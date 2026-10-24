// Supertrader 6.0 – Kriterien der Readiness-Matrix, festgeschrieben vor dem ersten Supertrader-6.0-Snapshot-Ergebnis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sf6ReadinessCriteriaSha256, DIMENSIONS, COMPLETION_STATES, CERTIFICATION_CRITERIA, CC5, SF6_OWNER_DECISIONS } from '../source-faithful/completion/sf6-readiness-criteria.mjs';
import { SF6_PAPER_PROTOCOL, sf6PaperProtocolSha256 } from '../source-faithful/completion/sf6-paper-protocol-2027.mjs';

// 1.0.0 469ea7d1… -> 1.1.0 (source review, before results) -> 1.2.0 (owner decisions E1-E6, only stricter)
const PINNED_CRITERIA = '4fb413783c04d0c45058e81683a9c606a5a72a23b57c7df2c9a834633fee8342';
const PINNED_PAPER_PROTOCOL = 'c90c30bcf0186549aeb672ffc124b3b24d7b321288f0e78798a3a0cfc3bd5e8f';

test('SF6-READINESS-CRITERIA-PINNED: 15 Dimensionen, Zustaende und harte Kriterien vor den Ergebnissen festgeschrieben', () => {
  assert.equal(sf6ReadinessCriteriaSha256(), PINNED_CRITERIA);
  assert.equal(DIMENSIONS.length, 15);
  assert.deepEqual(COMPLETION_STATES.at(-1), 'CERTIFICATION_CANDIDATE');
  assert.equal(CERTIFICATION_CRITERIA.length, 8);
  assert.equal(CC5.satisfiesCriterion, false, 'E1: the quarantine never satisfies CC-5');
  assert.deepEqual(SF6_OWNER_DECISIONS.map((x) => x.id), ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']);
});

test('SF6-PAPER-PROTOCOL-2027: prospektiv, festgeschrieben vor dem Fenster, nicht aktiviert (E2)', async () => {
  assert.equal(sf6PaperProtocolSha256(), PINNED_PAPER_PROTOCOL);
  assert.equal(SF6_PAPER_PROTOCOL.window.start, '2027-01-01');
  assert.ok(SF6_PAPER_PROTOCOL.fixedOn < SF6_PAPER_PROTOCOL.window.start);
  assert.equal(SF6_PAPER_PROTOCOL.status, 'PREPARED_NOT_ACTIVE');
  for (const k of ['scheduler', 'orders', 'broker', 'productSurface']) assert.equal(SF6_PAPER_PROTOCOL.activation[k], 'NONE', k);
  // no workflow references the protocol (no scheduler, no recording job in Supertrader 6.0)
  const fs = await import('node:fs');
  const wf = new URL('../../../.github/workflows/', import.meta.url);
  for (const f of fs.readdirSync(wf)) assert.ok(!fs.readFileSync(new URL(f, wf), 'utf8').includes('SF6-PAPER'), f);
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
  // E1: the recorded containment (even with zero exposure) never passes CC-5 and caps the dimension at PARTIAL
  const built = buildSf6Readiness();
  for (const r of built.candidates) {
    assert.equal(r.certificationCriteria['CC-5-CORPORATE-ACTIONS'], false, r.candidateId);
    assert.ok(['PARTIAL', 'NOT_EVIDENCED'].includes(r.dimensions.CORPORATE_ACTION_INTEGRITY.grade), r.candidateId);
    assert.equal(r.certificationCriteria['CC-8-OOS'], false, r.candidateId);
  }
  // E2: CC-8 only from SF6-PAPER-2027 evidence under the pinned protocol fingerprint
  const paper = (sha) => buildSf6Readiness({ facts: { integrity: null, validation: null, holdout: null, paper: { protocolSha256: sha, references: { TURTLE_S1: { cc8Evidenced: true } } } } }).candidates[0].certificationCriteria['CC-8-OOS'];
  assert.equal(paper(sf6PaperProtocolSha256()), true);
  assert.equal(paper('0'.repeat(64)), false, 'evidence under another protocol version does not count');
  // check 2: reproducibility rests on hash identity, never on equal trade counts
  for (const r of built.candidates.filter((x) => x.lifecycleKey)) assert.match(r.dimensions.BACKTEST_REPRODUCIBILITY.evidence, /ledger hash EQUAL, trade hash (EQUAL|NOT_PUBLISHED_BY_REFERENCE)/, r.candidateId);
  // the committed artifact is the build of the committed facts
  const fs = await import('node:fs');
  const committed = JSON.parse(fs.readFileSync(new URL('../source-faithful/artifacts/STRATEGY-SF6-READINESS.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(buildSf6Readiness())));
});
