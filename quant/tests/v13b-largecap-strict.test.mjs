// V13b LARGECAP-STRICT: amendment 1.1.0 (STRICT_INTERVAL_BOUNDARY), registry research-largecap-price-anchors-1.1.0.cjs,
// loader option identityEvidenceProtocolV13LargecapStrict (LOADER_OPTIONS_V13B). 1.0.x artefacts and every existing option stay unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const R = require('../engines/research-weekly-loader.cjs');
const REG10 = require('../engines/research-largecap-price-anchors.cjs');
const REG11 = require('../engines/research-largecap-price-anchors-1.1.0.cjs');
const D10 = 'docs/quant-recovery/v13/largecap', D11 = 'docs/quant-recovery/v13b/largecap-strict';
const sha = b => createHash('sha256').update(b).digest('hex');
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const seriesBytes = id => readFileSync(join(root, 'quant/data/market/discover-series-long', id + '.json'), 'utf8');
const V12 = { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true, identityEvidenceProtocolV10: true, identityEvidenceProtocolV12: true };
const V13 = { ...V12, identityEvidenceProtocolV13Largecap: true };
const STRICT = { ...V13, identityEvidenceProtocolV13LargecapStrict: true };
const IDS = ['ref_AAPL', 'ref_ABT', 'ref_MS', 'ref_USB', 'ref_DD', 'ref_COR', 'ref_DOC'];
const outcome = fn => { try { return { ok: true, value: JSON.stringify(fn()) }; } catch (e) { return { ok: false, value: e.message }; } };
const clone = x => JSON.parse(JSON.stringify(x));
const BASE_COMMIT = '7e38ec8e16';

test('1.0.x artefacts are unchanged (sha256 pinned at V13 publication)', () => {
  const pinned = {
    [D10 + '/protocol-1.0.0.json']: '3710f99d5bb10ff95538fd8bdde73e8dc805888589d0a386d958a7465780ef28',
    [D10 + '/protocol-amendment-1.0.1.json']: '52a3ef0d18986bc246cdfdf2fbb4c9e30af4a682e5083f41c67b80d301e0e4aa',
    [D10 + '/cases-1.0.0.json']: 'f15feb58cc0f63570487c906876a1784c26bf93dd337b3eceebe0154a9b7f2cd',
    [D10 + '/cases-protocol-1.0.0.json']: 'aeaa39d621b578dd6495c6b6c91a2cef28028e7394c932626a0cf1d016cb1d66',
    [D10 + '/independent-check-1.0.0.json']: 'd227af37d977c5d28d8e0fdad369a5c07bb26d814155b1cf1d790d5532f2f4f2',
    'quant/engines/research-largecap-price-anchors.cjs': '1915b292d47c6e4b3e21145b38578e59b08b4611123e9f7ba8e216bc5c951738',
    'scripts/quant/v13/largecap/evaluate.cjs': '4d2a627c6f4960fec6a11d1badcd86c46bc53b37e52c227258338fe6ec434165'
  };
  for (const [p, h] of Object.entries(pinned)) assert.equal(sha(readFileSync(join(root, p))), h, p);
});

test('amendment 1.1.0 registered with sidecar sha256; cases-1.1.0 and registry chain to it and to cases-1.0.0', () => {
  const a = sha(readFileSync(join(root, D11, 'protocol-amendment-1.1.0.json')));
  assert.equal(readFileSync(join(root, D11, 'protocol-amendment-1.1.0.sha256'), 'utf8').split(/\s+/)[0], a);
  const c = read(D11 + '/cases-1.1.0.json');
  assert.equal(c.amendment110Sha256, a); assert.equal(c.protocolVersion, '1.1.0');
  assert.equal(c.basedOn.casesSha256, sha(readFileSync(join(root, D10, 'cases-1.0.0.json'))));
  assert.equal(REG11.amendment110Sha256, a); assert.equal(REG11.casesSha256, sha(readFileSync(join(root, D11, 'cases-1.1.0.json'))));
  assert.equal(REG11.protocolSha256, REG10.protocolSha256); assert.equal(REG11.amendmentSha256, REG10.amendmentSha256);
  assert.equal(REG11.productionApproved, false);
  assert.deepEqual(c.cases.map(x => x.securityId), IDS);
  const chk = read(D11 + '/independent-check-1.1.0.json');
  assert.equal(chk.verdict, 'PASS'); assert.equal(chk.cases110Sha256, REG11.casesSha256);
});

test('registry 1.1.0 is reproduced byte-identically from cases-1.1.0.json', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'v13b-strict-')), 'reg.cjs');
  execFileSync(process.execPath, [join(root, 'scripts/quant/v13b/largecap-strict/build-registry.cjs'), '--out', out]);
  assert.equal(readFileSync(out, 'utf8'), readFileSync(join(root, 'quant/engines/research-largecap-price-anchors-1.1.0.cjs'), 'utf8'));
});

test('cases-1.1.0 is reproduced from the private facts (skipped without private data)', t => {
  const facts = join(root, '..', '..', 'v13-private', 'largecap', 'facts-1.0.0.jsonl');
  const alt = process.env.V13_LARGECAP_FACTS || facts;
  if (!existsSync(alt)) return t.skip('private facts not available');
  const out = join(mkdtempSync(join(tmpdir(), 'v13b-strict-')), 'cases.json');
  execFileSync(process.execPath, [join(root, 'scripts/quant/v13b/largecap-strict/evaluate-1.1.0.cjs'), '--facts', alt, '--out', out]);
  assert.equal(readFileSync(out, 'utf8'), readFileSync(join(root, D11, 'cases-1.1.0.json'), 'utf8'));
});

test('options: strict needs V13; earlier option lists unchanged', () => {
  assert.deepEqual([...R.LOADER_OPTIONS], ['identityEvidence', 'identityEvidenceAllowCoverPageOnly', 'corporateActionEvidence', 'identityEvidenceProtocolV10', 'listingLifecycleEvidence']);
  assert.deepEqual([...R.LOADER_OPTIONS_V12], ['identityEvidenceProtocolV12']);
  assert.deepEqual([...R.LOADER_OPTIONS_V13], ['identityEvidenceProtocolV13Largecap']);
  assert.deepEqual([...R.LOADER_OPTIONS_V13B], ['identityEvidenceProtocolV13LargecapStrict']);
  for (const bad of [{ identityEvidenceProtocolV13LargecapStrict: true }, { ...V12, identityEvidenceProtocolV13LargecapStrict: true }, { ...V13, identityEvidenceProtocolV13LargecapStrict: 1 }])
    assert.throws(() => R.createResearchLoader(root, bad), /^Error: INVALID_LOADER_OPTIONS/);
});

test('default loader and every existing option set are byte-identical to the loader before V13b', t => {
  let src;
  try { src = execFileSync('git', ['-C', root, 'show', BASE_COMMIT + ':quant/engines/research-weekly-loader.cjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return t.skip('base commit not available'); }
  const m = new Module(join(root, 'quant/engines/__v13b_base_loader.cjs'));
  m.filename = join(root, 'quant/engines/__v13b_base_loader.cjs'); m.paths = Module._nodeModulePaths(join(root, 'quant/engines'));
  m._compile(src, m.filename);
  const B = m.exports;
  const sets = [undefined, { identityEvidence: true }, { corporateActionEvidence: true }, { identityEvidence: true, identityEvidenceProtocolV10: true, corporateActionEvidence: true }, V12, V13];
  const ids = [...IDS, 'ref_MSFT', 'ref_JNJ', 'ref_NVDA'];
  for (const opts of sets) {
    // code identity on the same master: the base-commit loader reads the product master, so the current loader is compared on LIVE
    const now = R.createResearchLoader(root, opts && { ...opts }, { masterGeneration: 'LIVE' }), before = B.createResearchLoader(root, opts && { ...opts });
    assert.deepEqual(JSON.stringify(now.identityEvidence ?? null), JSON.stringify(before.identityEvidence ?? null));
    for (const id of ids) assert.deepEqual(outcome(() => now(id)), outcome(() => before(id)), JSON.stringify(opts) + ' ' + id);
  }
});

test('strict records load the 1.1.0 interval, a sub-interval of 1.0.1; MS 2008-10-17 is outside and no longer band-confirmed', () => {
  const l11 = R.createResearchLoader(root, STRICT), l10 = R.createResearchLoader(root, V13);
  assert.equal(l11.identityEvidence.protocolV13LargecapStrict, true);
  assert.equal(l11.identityEvidence.v13RegistryHash, l10.identityEvidence.v13RegistryHash);
  assert.deepEqual([...l11.identityEvidence.v13StrictLockedSecurityIds], []);
  const cases = read(D11 + '/cases-1.1.0.json');
  for (const rec of REG11.records) {
    const c = cases.cases.find(x => x.securityId === rec.securityId), old = REG10.records.find(x => x.securityId === rec.securityId);
    assert.equal(rec.validFrom, c.interval.validFrom); assert.equal(rec.validTo, c.interval.validTo);
    assert.ok(rec.validFrom >= old.validFrom && rec.validTo <= old.validTo);
    const r = l11(rec.securityId), all = JSON.parse(seriesBytes(rec.securityId)).points;
    assert.deepEqual(r.points, all.filter(p => p[0] >= rec.validFrom && p[0] <= rec.validTo));
    assert.equal(r.identityEvidenceBinding.schemaVersion, 'research-largecap-price-anchors-1.1.0');
    assert.equal(r.identityEvidenceBinding.protocolVersion, '1.1.0');
    assert.equal(r.identityEvidenceBinding.registryHash, l11.identityEvidence.v13StrictRegistryHash);
  }
  const ms = l11('ref_MS');
  assert.equal(ms.points[0][0], '2008-11-07');
  assert.equal(ms.points.some(p => p[0] === '2008-10-17'), false);
  assert.deepEqual(ms.corporateActionQuality.items, []);
  assert.equal(ms.returnBasis, 'PRICE_RETURN');
  assert.ok(!ms.warnings.includes('BAND_CONFIRMED_MOVE_DISTRIBUTION_NOT_EXCLUDED'));
  // the 1.0.1 option still loads its own interval
  assert.equal(l10('ref_MS').points[0][0], '2008-09-05');
  // unrelated listings identical with and without the strict option
  for (const id of ['ref_MSFT', 'ref_JNJ']) assert.deepEqual(outcome(() => l11(id)), outcome(() => l10(id)));
});

test('strict MS boundary is placed by the failing repurchase rows of the 10-K for fiscal 2008 (printed dates)', () => {
  const c = read(D11 + '/cases-1.1.0.json').cases.find(x => x.securityId === 'ref_MS');
  assert.deepEqual(c.strict.clipStart.map(p => [p.type, p.start, p.end, p.pass]), [['B', '2008-09-01', '2008-09-30', false], ['B', '2008-10-01', '2008-10-31', false]]);
  assert.ok(c.strict.clipStart.every(p => p.accession === '0001193125-09-013429' && /\(October 1, 2008—October 31, 2008\)|\(September 1, 2008—September 30, 2008\)/.test(p.quote)));
  assert.equal(c.strict.start, '2008-11-01');
  assert.deepEqual([c.strict.startEvidence.type, c.strict.startEvidence.start, c.strict.startEvidence.pass], ['B', '2008-11-01', true]);
  assert.deepEqual(c.bandConfirmedMovesExcluded, ['2008-10-17']);
});

test('fail closed: registry 1.1.0 must be a sub-interval of 1.0.1; a 1.0.1 id without 1.1.0 record is locked', () => {
  const ok = clone(REG11);
  assert.equal(R.validateLargecapV13Strict(ok, REG10).records.length, REG11.records.length);
  const mut = [
    r => { r.records[0].validFrom = '1990-01-05'; r.records[0].historyGuard.checkedFrom = '1990-01-05'; },
    r => { r.records[0].protocolVersion = '1.0.1'; },
    r => { r.schemaVersion = 'research-largecap-price-anchors-1.0.0'; },
    r => { r.amendmentSha256 = '0'.repeat(64); },
    r => { r.ruleId = 'X'; },
    r => { r.records[0].strictBoundary.v101ValidFrom = '2000-01-07'; },
    r => { r.productionApproved = true; }
  ];
  for (const m of mut) { const r = clone(REG11); m(r); assert.throws(() => R.validateLargecapV13Strict(r, REG10), /INVALID_RESEARCH_LARGECAP_V13/); }
  // 1.0.1 validator rejects the 1.1.0 registry and vice versa
  assert.throws(() => R.validateLargecapV13(clone(REG11)), /INVALID_RESEARCH_LARGECAP_V13:SCHEMA/);
  // remove one strict record: that listing fails closed under the strict option
  const saved = REG11.records.slice();
  try {
    REG11.records.splice(REG11.records.findIndex(r => r.securityId === 'ref_DOC'), 1);
    const l = R.createResearchLoader(root, STRICT);
    assert.deepEqual([...l.identityEvidence.v13StrictLockedSecurityIds], ['ref_DOC']);
    assert.throws(() => l('ref_DOC'), /^Error: LARGECAP_STRICT_LOCKED/);
  } finally { REG11.records.splice(0, REG11.records.length, ...saved); }
  // a changed close inside the strict interval
  const rec = REG11.records.find(r => r.securityId === 'ref_COR'), doc = JSON.parse(seriesBytes('ref_COR'));
  const i = doc.points.findIndex(p => p[0] > rec.validFrom); doc.points[i][1] *= 1.001;
  assert.throws(() => R.createResearchLoader(root, STRICT)('ref_COR', JSON.stringify(doc)), /IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH/);
  // a close changed between the 1.0.1 and the 1.1.0 start no longer matters under strict, but still breaks 1.0.1
  const doc2 = JSON.parse(seriesBytes('ref_COR')), j = doc2.points.findIndex(p => p[0] === '2016-07-08'); doc2.points[j][1] *= 1.001;
  assert.equal(R.createResearchLoader(root, STRICT)('ref_COR', JSON.stringify(doc2)).points[0][0], rec.validFrom);
  assert.throws(() => R.createResearchLoader(root, V13)('ref_COR', JSON.stringify(doc2)), /IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH/);
});
