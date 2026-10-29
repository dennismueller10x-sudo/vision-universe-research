// V12 LARGECAP: identity extension v12 (non-enumerable), loader option identityEvidenceProtocolV12, evidence files and protocol hashes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const R = require('../engines/research-weekly-loader.cjs');
const A = require('../engines/weekly-real-adapter.cjs');
const Identity = require('../engines/research-identity-evidence.cjs');
const D = 'docs/quant-recovery/v12/largecap';
const sha = b => createHash('sha256').update(b).digest('hex');
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const seriesBytes = id => readFileSync(join(root, 'quant/data/market/discover-series-long', id + '.json'), 'utf8');
const BASE3 = { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true };
const V10 = { ...BASE3, identityEvidenceProtocolV10: true };
const V12 = { ...V10, identityEvidenceProtocolV12: true };
const ext = Object.getOwnPropertyDescriptor(Identity, 'v12')?.value;
const outcome = fn => { try { return { ok: true, value: JSON.stringify(fn()) }; } catch (e) { return { ok: false, value: e.message }; } };

test('protocol registered with sidecar sha256; amendments chain to it', () => {
  const p = sha(readFileSync(join(root, D, 'protocol-1.0.0.json')));
  assert.equal(readFileSync(join(root, D, 'protocol-1.0.0.sha256'), 'utf8').split(/\s+/)[0], p);
  const P = read(D + '/protocol-1.0.0.json');
  assert.equal(P.inputs.caProtocol.sha256, sha(readFileSync(join(root, P.inputs.caProtocol.path))));
  assert.equal(P.inputs.identityProtocol.sha256, sha(readFileSync(join(root, P.inputs.identityProtocol.path))));
  for (const v of ['1.0.1']) {
    const f = join(root, D, `protocol-amendment-${v}.json`);
    if (!existsSync(f)) continue;
    assert.equal(readFileSync(join(root, D, `protocol-amendment-${v}.sha256`), 'utf8').split(/\s+/)[0], sha(readFileSync(f)));
    assert.equal(JSON.parse(readFileSync(f, 'utf8')).amends.sha256, p);
  }
});

test('v12 extension is non-enumerable: JSON of the registry (and existing registryHash) ignores it', () => {
  const d = Object.getOwnPropertyDescriptor(Identity, 'v12');
  assert.ok(d && !d.enumerable);
  assert.ok(!Object.keys(Identity).includes('v12'));
  assert.ok(!JSON.stringify(Identity).includes('research-identity-evidence-1.2.0'));
  assert.equal(R.validateIdentityEvidenceV12(Identity), ext);
  assert.equal(ext.protocolSha256, sha(readFileSync(join(root, ext.protocol))));
});

test('options: V12 requires V10; default loader unchanged; V9/V10 option list unchanged', () => {
  assert.deepEqual([...R.LOADER_OPTIONS_V12], ['identityEvidenceProtocolV12']);
  for (const bad of [{ identityEvidenceProtocolV12: true }, { identityEvidence: true, identityEvidenceProtocolV12: true }, { ...V10, identityEvidenceProtocolV12: 1 }])
    assert.throws(() => R.createResearchLoader(root, bad), /^Error: INVALID_LOADER_OPTIONS/);
  const def = R.createResearchLoader(root);
  assert.equal(def.identityEvidence, undefined);
  for (const id of ext.records.map(r => r.securityId).slice(0, 4)) assert.deepEqual(outcome(() => def(id)), outcome(() => A.createLoader(root)(id)));
});

test('v12 records apply only under identityEvidenceProtocolV12; without it outputs equal the V10 loader', () => {
  const L10 = R.createResearchLoader(root, V10), L12 = R.createResearchLoader(root, V12);
  assert.equal(L10.identityEvidence.protocolV12, undefined);
  assert.equal(L12.identityEvidence.protocolV12, true);
  for (const r of ext.records) {
    const a = L12(r.securityId);
    assert.equal(a.identityEvidenceBinding.schemaVersion, 'research-identity-evidence-1.2.0');
    assert.equal(a.identityEvidenceBinding.masterRowAction, r.masterRowAction);
    assert.equal(a.points[0][0], r.validFrom);
    assert.ok(a.points.length >= 55);
    assert.ok(a.warnings.includes('SERIES_RESTRICTED_TO_SOURCED_INTERVAL'));
    if (r.masterRowAction === 'RESTRICT_SINGLE_ROW') {
      assert.ok(a.warnings.includes('HISTORY_BEFORE_UNRESOLVED_CORPORATE_ACTION_EXCLUDED'));
      assert.ok(r.validFrom > r.caEvent.week);
      assert.match(outcome(() => L10(r.securityId)).value, /^CORPORATE_ACTION_UNRESOLVED/);
    }
  }
  // ids not in v12: identical output with and without the option
  for (const id of ['ref_MSFT', 'ref_MRNA', 'ref_CZR', 'ref_ACAD', 'ref_NVDA']) assert.deepEqual(outcome(() => L12(id)), outcome(() => L10(id)));
});

test('fail closed: history guard, changed master rows, corrupted record', () => {
  const L12 = R.createResearchLoader(root, V12);
  const r = ext.records.find(x => x.masterRowAction === 'RESTRICT_SINGLE_ROW') || ext.records[0];
  const doc = JSON.parse(seriesBytes(r.securityId));
  const i = doc.points.findIndex(p => p[0] >= r.validFrom) + 3;
  doc.points[i] = [doc.points[i][0], doc.points[i][1] * 1.001];
  assert.throws(() => L12(r.securityId, JSON.stringify(doc)), /^Error: IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH$/);
  const bad = JSON.parse(JSON.stringify(ext));
  const mut = [x => { x.records[0].protocolSha256 = '0'.repeat(64); }, x => { x.records[0].priceEvidence = []; }, x => { x.records[0].validTo = '2030-01-01'; },
    x => { x.records[0].masterRowAction = 'REPLACE'; }, x => { x.schemaVersion = 'x'; }];
  for (const m of mut) {
    const e = JSON.parse(JSON.stringify(ext)); m(e);
    const reg = { ...Identity }; Object.defineProperty(reg, 'v12', { enumerable: false, value: e });
    assert.throws(() => R.validateIdentityEvidenceV12(reg), /^Error: INVALID_RESEARCH_IDENTITY_EVIDENCE_V12/);
  }
  const enumerable = { ...Identity, v12: bad };
  assert.throws(() => R.validateIdentityEvidenceV12(enumerable), /SCHEMA/);
  // master rows changed: run against a temporary root whose master has an extra row for the id
  const tmp = mkdtempSync(join(tmpdir(), 'v12lc-'));
  const master = read('quant/data/market/security-master/us-security-master.json');
  const row = master.rows.find(x => x.baseline_security_id === r.securityId);
  master.rows.push({ ...row, canonical_id: row.canonical_id + '-dup', active_status: 'INACTIVE' });
  mkdirSync(join(tmp, 'quant/data/market/security-master'), { recursive: true });
  writeFileSync(join(tmp, 'quant/data/market/security-master/us-security-master.json'), JSON.stringify(master));
  symlinkSync(join(root, 'quant/data/market/discover-series-long'), join(tmp, 'quant/data/market/discover-series-long'));
  assert.throws(() => R.createResearchLoader(tmp, V12)(r.securityId), /^Error: IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED$/);
});

test('evidence files: every v12 record is backed by a qualified case; counts consistent', () => {
  const rc = read(D + '/restrict-cases-1.0.1.json'), ic = read(D + '/identity-cases-1.0.1.json');
  const q = [...rc.cases, ...ic.cases].filter(c => c.decision === 'QUALIFIED_SEC_SAME_DAY_PRICE_AND_COVER').map(c => c.securityId).sort();
  assert.deepEqual(ext.records.map(r => r.securityId).sort(), q);
  for (const c of [...rc.cases, ...ic.cases]) assert.equal(c.decision === 'QUALIFIED_SEC_SAME_DAY_PRICE_AND_COVER', c.reasons.length === 0);
  const ca = read(D + '/ca-verdicts-1.0.0.json');
  assert.equal(ca.registeredEvents, 0);
  for (const r of ext.records) for (const p of r.priceEvidence) assert.ok(p.quote.length <= 300);
});

test('V10 builder build-registers.cjs preserves the non-enumerable v12 extension (byte-identical rebuild, LARGECAP m9)', async () => {
  const { execFileSync } = await import('node:child_process');
  const tmp = mkdtempSync(join(tmpdir(), 'v12-largecap-br-'));
  const ie = join(tmp, 'identity.cjs'), ll = join(tmp, 'lifecycle.cjs');
  execFileSync(process.execPath, [join(root, 'scripts/quant/v10/population/build-registers.cjs'), '--identity-out', ie, '--lifecycle-out', ll], { stdio: 'pipe' });
  const committed = readFileSync(join(root, 'quant/engines/research-identity-evidence.cjs'));
  assert.equal(sha(readFileSync(ie)), sha(committed), 'rebuild of the identity register is byte-identical incl. v12');
  const rebuilt = require(ie);
  const d = Object.getOwnPropertyDescriptor(rebuilt, 'v12');
  assert.ok(d && !d.enumerable);
  assert.deepEqual(d.value, ext);
  assert.equal(JSON.stringify(rebuilt), JSON.stringify(Identity));
  assert.equal(sha(readFileSync(ll)), sha(readFileSync(join(root, 'quant/engines/research-listing-lifecycle.cjs'))));
});
