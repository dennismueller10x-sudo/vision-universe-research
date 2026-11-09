// V13 LARGECAP: source price-band/identity intervals (research-largecap-price-anchors.cjs), loader option identityEvidenceProtocolV13Largecap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const R = require('../engines/research-weekly-loader.cjs');
const A = require('../engines/weekly-real-adapter.cjs');
const REG = require('../engines/research-largecap-price-anchors.cjs');
const E = require('../../scripts/quant/v13/largecap/evaluate.cjs');
const D = 'docs/quant-recovery/v13/largecap';
const sha = b => createHash('sha256').update(b).digest('hex');
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const seriesBytes = id => readFileSync(join(root, 'quant/data/market/discover-series-long', id + '.json'), 'utf8');
const V12 = { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true, identityEvidenceProtocolV10: true, identityEvidenceProtocolV12: true };
const V13 = { ...V12, identityEvidenceProtocolV13Largecap: true };
const IDS = ['ref_AAPL', 'ref_ABT', 'ref_MS', 'ref_USB', 'ref_DD', 'ref_COR', 'ref_DOC'];
const outcome = fn => { try { return { ok: true, value: JSON.stringify(fn()) }; } catch (e) { return { ok: false, value: e.message }; } };
const clone = x => JSON.parse(JSON.stringify(x));

test('protocol 1.0.0 and amendment 1.0.1 registered with sidecar sha256; cases and registry chain to them', () => {
  const p = sha(readFileSync(join(root, D, 'protocol-1.0.0.json'))), a = sha(readFileSync(join(root, D, 'protocol-amendment-1.0.1.json')));
  assert.equal(readFileSync(join(root, D, 'protocol-1.0.0.sha256'), 'utf8').split(/\s+/)[0], p);
  assert.equal(readFileSync(join(root, D, 'protocol-amendment-1.0.1.sha256'), 'utf8').split(/\s+/)[0], a);
  assert.ok(read(D + '/protocol-amendment-1.0.1.json').amends.includes(p));
  const cases = read(D + '/cases-1.0.0.json'), strict = read(D + '/cases-protocol-1.0.0.json');
  assert.equal(cases.protocolSha256, p); assert.equal(cases.amendmentSha256, a); assert.equal(cases.protocolVersion, '1.0.1');
  assert.equal(strict.protocolVersion, '1.0.0'); assert.equal(strict.amendmentSha256, null); assert.equal(strict.resultStatus, 'REGISTERED_PROTOCOL');
  assert.equal(REG.protocolSha256, p); assert.equal(REG.amendmentSha256, a);
  assert.equal(REG.casesSha256, sha(readFileSync(join(root, D, 'cases-1.0.0.json'))));
  assert.equal(REG.productionApproved, false);
  assert.deepEqual(cases.cases.map(c => c.securityId), IDS);
});

test('registry is reproduced byte-identically from cases-1.0.0.json', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'v13-largecap-')), 'reg.cjs');
  execFileSync(process.execPath, [join(root, 'scripts/quant/v13/largecap/build-registry.cjs'), '--out', out]);
  assert.equal(readFileSync(out, 'utf8'), readFileSync(join(root, 'quant/engines/research-largecap-price-anchors.cjs'), 'utf8'));
});

test('options: V13 needs V12; option lists V9/V10 and V12 unchanged', () => {
  assert.deepEqual([...R.LOADER_OPTIONS], ['identityEvidence', 'identityEvidenceAllowCoverPageOnly', 'corporateActionEvidence', 'identityEvidenceProtocolV10', 'listingLifecycleEvidence']);
  assert.deepEqual([...R.LOADER_OPTIONS_V12], ['identityEvidenceProtocolV12']);
  assert.deepEqual([...R.LOADER_OPTIONS_V13], ['identityEvidenceProtocolV13Largecap']);
  const { identityEvidenceProtocolV12, ...noV12 } = V13;
  for (const bad of [{ identityEvidenceProtocolV13Largecap: true }, noV12, { ...V12, identityEvidenceProtocolV13Largecap: 1 }])
    assert.throws(() => R.createResearchLoader(root, bad), /^Error: INVALID_LOADER_OPTIONS/);
});

test('default loader and every existing option set are unchanged for the seven listings', () => {
  const base = A.createLoader(root), def = R.createResearchLoader(root), l12 = R.createResearchLoader(root, V12);
  assert.equal(def.identityEvidence, undefined);
  assert.equal(l12.identityEvidence.protocolV13Largecap, undefined);
  for (const id of IDS) {
    assert.deepEqual(outcome(() => def(id)), outcome(() => base(id)));
    assert.equal(outcome(() => l12(id)).ok, false); // still locked without the V13 option
  }
  // an unrelated listing is identical with and without the V13 option
  const l13 = R.createResearchLoader(root, V13);
  for (const id of ['ref_MSFT', 'ref_JNJ']) assert.deepEqual(outcome(() => l13(id)), outcome(() => l12(id)));
});

test('V13 records load exactly the closed interval; history outside excluded; MS 2008-10-17 band-confirmed (PRICE_RETURN_ONLY)', () => {
  const l13 = R.createResearchLoader(root, V13);
  assert.equal(l13.identityEvidence.protocolV13Largecap, true);
  const cases = read(D + '/cases-1.0.0.json');
  for (const rec of REG.records) {
    const c = cases.cases.find(x => x.securityId === rec.securityId);
    assert.equal(c.status, 'UNLOCKED');
    assert.equal(rec.validFrom, c.interval.validFrom); assert.equal(rec.validTo, c.interval.validTo);
    const r = l13(rec.securityId), all = JSON.parse(seriesBytes(rec.securityId)).points;
    assert.equal(r.points[0][0], rec.validFrom); assert.equal(r.points.at(-1)[0], rec.validTo);
    assert.deepEqual(r.points, all.filter(p => p[0] >= rec.validFrom && p[0] <= rec.validTo));
    assert.equal(r.points.length, rec.historyGuard.bars);
    assert.equal(r.identityEvidenceBinding.schemaVersion, 'research-largecap-price-anchors-1.0.0');
    assert.ok(r.warnings.includes('SERIES_TRUNCATED_AT_LAST_ANCHOR_NOT_A_DELISTING'));
    assert.equal(r.returnBasis, rec.bandConfirmedMoves.length ? 'PRICE_RETURN_ONLY' : 'PRICE_RETURN');
  }
  const ms = l13('ref_MS');
  assert.deepEqual(ms.corporateActionQuality.items.map(i => [i.time, i.status]), [['2008-10-17', 'RESOLVED_SOURCE_PRICE_BAND']]);
  assert.ok(ms.warnings.includes('BAND_CONFIRMED_MOVE_DISTRIBUTION_NOT_EXCLUDED'));
});

test('fail closed: a changed close inside the interval, a changed band-confirmed move, a changed master row set', () => {
  const l13 = R.createResearchLoader(root, V13);
  const rec = REG.records.find(r => r.securityId === 'ref_USB');
  const doc = JSON.parse(seriesBytes('ref_USB'));
  const i = doc.points.findIndex(p => p[0] > rec.validFrom);
  const inside = clone(doc); inside.points[i][1] *= 1.001;
  assert.throws(() => l13('ref_USB', JSON.stringify(inside)), /IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH/);
  // a close outside the interval does not touch the result
  const j = doc.points.findIndex(p => p[0] < rec.validFrom);
  const outside = clone(doc); outside.points[j][1] *= 1.001;
  assert.deepEqual(l13('ref_USB', JSON.stringify(outside)).points, l13('ref_USB').points);
  // a registry move that no longer matches the series: the unchanged validate() error is thrown
  const ms = REG.records.find(r => r.securityId === 'ref_MS');
  const m0 = ms.bandConfirmedMoves[0], saved = { ...m0 };
  try {
    m0.close = saved.close * 1.01; m0.weeklyRatio = saved.weeklyRatio * 1.01; // registry-consistent, but no longer the series
    assert.throws(() => R.createResearchLoader(root, V13)('ref_MS'), /^Error: CORPORATE_ACTION_UNRESOLVED:/);
    m0.close = saved.close * 1.01; m0.weeklyRatio = saved.weeklyRatio;          // registry-inconsistent
    assert.throws(() => R.createResearchLoader(root, V13), /INVALID_RESEARCH_LARGECAP_V13:MOVES/);
  } finally { Object.assign(m0, saved); }
  // registry validator
  const ok = clone(REG);
  assert.equal(R.validateLargecapV13(ok).records.length, REG.records.length);
  const mut = [
    r => { r.records[0].validTo = r.records[0].validFrom; },
    r => { r.records[0].historyGuard.checkedTo = '2099-01-01'; },
    r => { r.records[0].protocolVersion = '1.0.2'; },
    r => { r.records[0].masterRowSet = ['x', 'y']; },
    r => { r.records[1].securityId = r.records[0].securityId; },
    r => { r.records[0].sources = r.records[0].sources.filter(s => s.role !== 'IDENTITY_SYMBOL_EXCHANGE'); },
    r => { r.productionApproved = true; },
    r => { r.records[0].historyGuard.bars = 50; }
  ];
  for (const m of mut) { const r = clone(REG); m(r); assert.throws(() => R.validateLargecapV13(r), /INVALID_RESEARCH_LARGECAP_V13/); }
  // an id already bound by an earlier registry may not be rebound
  assert.throws(() => R.validateLargecapV13(clone(REG), new Set(['ref_USB'])), /SECURITY_ID/);
});

test('interval rules: quarter periods, split ratios, locked listings stay excluded', () => {
  assert.deepEqual(E.quarterPeriod(2000, 4, 9), { start: '2000-07-01', end: '2000-09-30' });
  assert.deepEqual(E.quarterPeriod(2001, 1, 9), { start: '2000-10-01', end: '2000-12-31' });
  assert.deepEqual(E.quarterPeriod(2008, 4, 11), { start: '2008-09-01', end: '2008-11-30' });
  assert.deepEqual(E.ratioOf(7.000007), [7, 1]); assert.deepEqual(E.ratioOf(0.333333), [1, 3]); assert.equal(E.ratioOf(1.068833), null);
  const cases = read(D + '/cases-1.0.0.json');
  for (const c of cases.cases) {
    if (c.status !== 'UNLOCKED') { assert.equal(REG.records.some(r => r.securityId === c.securityId), false); continue; }
    // the unlocked interval lies inside the identity bound and inside the anchored span of the chosen run
    assert.ok(c.interval.validFrom >= c.identity.bound.from && c.interval.validTo <= c.identity.bound.to);
    assert.ok(c.interval.validFrom >= c.interval.anchoredStart && c.interval.validTo <= c.interval.anchoredEnd);
    assert.ok(c.interval.bars >= 104);
    const chosen = c.runs.find(r => r.accepted && r.validFrom === c.interval.validFrom);
    assert.ok(chosen && chosen.failShare <= 0.05);
    // every band-confirmed move lies strictly inside the interval
    for (const m of c.bandConfirmedMoves) assert.ok(m.prevWeek >= c.interval.validFrom && m.week <= c.interval.validTo);
  }
});
