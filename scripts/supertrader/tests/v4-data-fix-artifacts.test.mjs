// V4 data fix (V4-D1/D2): the committed public artifacts are consistent, bound to the sealed evidence and identity-free.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'scripts/supertrader/research/v4/data-fix');
const J = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const FILES = ['SUPERTRADER-V4-D1-D2-ROOT-CAUSES.json', 'SUPERTRADER-V4-PRICE-SANITY-CLASSIFICATION.json', 'SUPERTRADER-V4-CORPORATE-ACTION-POLICY.json',
  'SUPERTRADER-V4-DATA-QUALITY-REGRESSION.json', 'SUPERTRADER-V4-DATA-FIX-REVIEW.json', 'SUPERTRADER-V4-DATA-FIX-CALIBRATION-READINESS.json'];

test('all six required artifacts exist and report no performance and no calibration', () => {
  for (const f of FILES) { const x = J(f); assert.ok(x.schema, f); if ('performanceCalculated' in x) assert.equal(x.performanceCalculated, false, f); if ('calibrationRun' in x) assert.equal(x.calibrationRun, false, f); }
});

test('counts are bound to the sealed private evidence of the final audit run', () => {
  const r = J('SUPERTRADER-V4-D1-D2-ROOT-CAUSES.json'), sealed = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/data-quality/price-integrity/QUANT-PRICE-INTEGRITY-SEALED.json'), 'utf8'));
  assert.equal(r.privateEvidence.bound, true);
  assert.equal(r.privateEvidence.plaintextSha256, sealed.plaintextSha256);
  assert.equal(r.population.reproducedExactly, true, 'the BEFORE capture equals the V4 freeze content');
});

test('V4-D1: the 83 diagnostic security-months are fully classified', () => {
  const d1 = J('SUPERTRADER-V4-D1-D2-ROOT-CAUSES.json').V4_D1;
  assert.equal(d1.cases, 83);
  assert.equal(Object.values(d1.byCause).reduce((a, b) => a + b, 0), 83);
});

test('V4-D2: the 74 adjusted-level cases are fully classified; no blanket price cap', () => {
  const c = J('SUPERTRADER-V4-PRICE-SANITY-CLASSIFICATION.json');
  assert.equal(c.adjustedLevelGt1e6.securities, 74);
  assert.equal(Object.values(c.adjustedLevelGt1e6.byCause).reduce((a, b) => a + b, 0), 74);
  assert.equal(c.noPriceCap, true);
});

test('policy covers the required classes with an outcome and a reason code each', () => {
  const p = J('SUPERTRADER-V4-CORPORATE-ACTION-POLICY.json');
  const cls = new Set(p.policy.map((x) => x.cls));
  for (const k of ['CONFIRMED_SPLIT', 'CONFLICTING_SPLIT', 'SUSPECTED_UNDECLARED_SPLIT', 'UNRESOLVED_PRICE_DISCONTINUITY', 'LEGITIMATE_HIGH_NOMINAL_PRICE', 'STALE_OR_UNAVAILABLE']) assert.ok(cls.has(k), k);
  assert.ok(p.policy.every((x) => p.outcomes.includes(x.outcome) && /^[A-Z_]+$/.test(x.reason)));
  assert.equal(p.undeclaredSplit.silentCorrection, false);
  assert.equal(p.undeclaredSplit.neverFromReturnSizeAlone, true);
});

test('readiness is explicit and lists exact blockers and the exact dataset hash', () => {
  const r = J('SUPERTRADER-V4-DATA-FIX-CALIBRATION-READINESS.json');
  assert.ok(['READY_FOR_NEW_PREREGISTERED_CALIBRATION', 'NOT_READY'].includes(r.verdict));
  assert.equal(r.mayStartNewPreregisteredCalibration, r.verdict === 'READY_FOR_NEW_PREREGISTERED_CALIBRATION');
  if (r.verdict === 'NOT_READY') assert.ok(r.remainingBlockers.length > 0);
  assert.match(r.exactDataset.dataFingerprint, /^[a-f0-9]{64}$/);
});

test('public artifacts carry no security identities (no listing ids, no tiingo keys)', () => {
  for (const f of FILES) assert.ok(!/tiingo:[A-Z]+:|segmentId|listingId|"ticker"/.test(fs.readFileSync(path.join(DIR, f), 'utf8')), f);
});
