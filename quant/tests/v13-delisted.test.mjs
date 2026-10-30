import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const D = require('../engines/research-delisted-series.cjs');
const L = require('../engines/research-weekly-loader.cjs');

function fixture({ controlsPass = true, tamper = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v13dl-'));
  const dir = path.join(root, 'series');
  fs.mkdirSync(dir);
  fs.mkdirSync(path.join(root, path.dirname(D.REGISTER)), { recursive: true });
  const points = [];
  let t = Date.UTC(2010, 0, 8);
  for (let k = 0; k < 60; k++, t += 7 * 864e5) points.push([new Date(t).toISOString().slice(0, 10), k === 3 ? 4 : 10 + k * 0.125 + (k === 5 ? 0.00001 : 0)]);
  const h = D.pointsHash(points);
  const series = { chainId: 'abc', ticker: 'OLDX', cik: '123', status: 'QUALIFIED', exchange: 'NYSE', points, totalReturn: points, lastTradeDate: points.at(-1)[0], lastRawClose: 17.4,
    terminal: { class: 'MERGER', scenarios: [0, -0.1, 0.1], secEventDate: '2011-03-01', reason: 'MERGER_ACQUISITION_COMPLETED' }, pointsSha256: h };
  if (tamper === 'points') series.points = points.map(([d, v], k) => [d, k === 10 ? v * 1.01 : v]);
  if (tamper === 'status') series.status = 'PRICE_ONLY_CENSORED_END';
  fs.writeFileSync(path.join(dir, 'abc.json'), JSON.stringify(series));
  const reg = { schemaVersion: D.SCHEMA, evidenceKind: 'SOURCE_EVIDENCE', certificationStatus: 'NOT_CERTIFIED', productionApproved: false, controls: { pass: controlsPass },
    columns: ['chainId', 'cik', 'startYearBucket', 'endYearBucket', 'status', 'endSourced', 'terminalClass', 'weeks', 'gapCut', 'pointsSha256'],
    rows: [['abc', '123', '2010-2014', '2010-2014', 'QUALIFIED', true, 'MERGER', 60, false, h], ['def', null, '2000-2004', '2000-2004', 'EXCLUDED_NO_CIK_LINK', null, null, null, false, null]] };
  fs.writeFileSync(path.join(root, D.REGISTER), JSON.stringify(reg));
  return { root, dir };
}

test('python-compatible float serialisation (register hashes are written by qualify.py)', () => {
  assert.equal(D.pyFloat(5), '5.0');
  assert.equal(D.pyFloat(12.5), '12.5');
  assert.equal(D.pyFloat(0.00005), '5e-05');
  assert.equal(D.pyFloat(0.000015), '1.5e-05');
  assert.equal(D.pyFloat(0.0001), '0.0001');
});

test('loads only register-bound QUALIFIED series by default', () => {
  const { root, dir } = fixture();
  const r = D.loadDelisted(root, { dir });
  assert.deepEqual(r.counts, { requested: 1, loaded: 1, missingFile: 0 });
  const doc = r.docs.get('dl_abc');
  assert.equal(doc.mic, 'XNYS');
  assert.equal(doc.listingLifecycle.status, 'DELISTED_SOURCED_END');
  assert.equal(doc.listingLifecycle.terminal.kind, 'MERGER');
  assert.ok(doc.warnings.includes('TERMINAL_CONSIDERATION_NOT_VERIFIED_SCENARIOS_ONLY'));
});

test('fails closed on tampered points, status mismatch, failed controls and bad options', () => {
  assert.throws(() => D.loadDelisted(fixture({ tamper: 'points' }).root, { dir: fixture({ tamper: 'points' }).dir }), /DELISTED_POINTS_HASH_MISMATCH/);
  const s = fixture({ tamper: 'status' });
  assert.throws(() => D.loadDelisted(s.root, { dir: s.dir }), /DELISTED_REGISTER_MISMATCH/);
  const c = fixture({ controlsPass: false });
  assert.throws(() => D.loadDelisted(c.root, { dir: c.dir }), /DELISTED_CONTROLS_FAILED/);
  const ok = fixture();
  assert.throws(() => D.loadDelisted(ok.root, {}), /DELISTED_DIR_REQUIRED/);
  assert.throws(() => D.loadDelisted(ok.root, { dir: ok.dir, include: 'EVERYTHING' }), /DELISTED_INCLUDE_INVALID/);
});

test('research loader options are unchanged (no delisted option; default stays the adapter loader)', () => {
  assert.deepEqual([...L.LOADER_OPTIONS], ['identityEvidence', 'identityEvidenceAllowCoverPageOnly', 'corporateActionEvidence', 'identityEvidenceProtocolV10', 'listingLifecycleEvidence']);
  assert.deepEqual([...L.LOADER_OPTIONS_V12], ['identityEvidenceProtocolV12']);
  assert.throws(() => L.createResearchLoader(ROOT, { delistedSeries: true }), /INVALID_LOADER_OPTIONS/);
});

test('public register (when present) carries no prices and no provider dates', () => {
  const file = path.join(ROOT, D.REGISTER);
  if (!fs.existsSync(file)) return;
  const reg = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(reg.productionApproved, false);
  assert.deepEqual(reg.columns, ['chainId', 'cik', 'startYearBucket', 'endYearBucket', 'status', 'endSourced', 'terminalClass', 'weeks', 'gapCut', 'pointsSha256']);
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(reg.rows)), 'no exact dates in rows');
});
