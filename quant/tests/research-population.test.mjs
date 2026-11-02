import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const Pop = require('../../scripts/quant/research/research-population.cjs');
const L = require('../engines/research-weekly-loader.cjs');
const Adapter = require('../engines/weekly-real-adapter.cjs');
const throws = (code, fn) => assert.throws(fn, e => e.code === code, code);

// ---------- synthetic frame (same shape as scripts/quant/v10/studies/common.cjs#buildFrame) ----------
function weeks(from, n) { const out = []; let t = Date.parse(from + 'T00:00:00Z'); for (let i = 0; i < n; i++) { out.push(new Date(t).toISOString().slice(0, 10)); t += 7 * 86400000; } return out; }
const CAL = weeks('2018-01-05', 160); // 2018-01-05 .. 2021-01-22
function doc(id, from, to, extra = {}) { const pts = CAL.filter(d => d >= from && d <= to).map((d, i) => [d, 10 + i]); return { securityId: id, listingId: 'tiingo:NYSE:' + id, listingStart: from, points: pts, corporateActionQuality: { status: 'CLEAN', items: [] }, warnings: ['EX_POST_ADJUSTED_HISTORY_NOT_AS_PUBLISHED_PIT'], ...extra }; }
function syntheticFrame() {
  const docs = new Map([
    ['ref_AAA', doc('ref_AAA', '2018-01-05', '2021-01-22')],
    ['ref_BBB', doc('ref_BBB', '2019-03-01', '2021-01-22', { corporateActionQuality: { status: 'RESOLVED', items: [] } })],
    ['ref_CCC', doc('ref_CCC', '2018-01-05', '2019-06-28', { listingLifecycle: { status: 'DELISTED_SOURCE_VERIFIED', lastTradeDate: '2019-06-27', lastObservedDate: '2019-06-28', terminal: { kind: 'CASH_MERGER', cashPerShare: 5 } } })],
    ['ref_DDD', doc('ref_DDD', '2018-01-05', '2020-02-28', { listingLifecycle: { status: 'FROZEN_TAIL_UNSOURCED_CENSORED', lastTradeDate: null, lastObservedDate: '2020-02-28', terminal: { kind: 'UNKNOWN' } } })],
  ]);
  const loader = Object.assign(() => null, { masterHash: 'm'.repeat(64), corporateActionEvidence: { registryHash: 'c'.repeat(64), protocolSha256: 'p'.repeat(64), securityIds: ['ref_BBB'] } });
  return { loader, files: [], reasons: { QUALIFIED: 4, INSUFFICIENT_HISTORY: 2 }, qualified: [...docs.keys()], docs, calendar: CAL, excluded: { NON_MODAL_WEEK_LABEL: [], EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET: [] }, frame: [...docs.keys()] };
}
const fakeDeps = (over = {}) => ({ buildFrame: () => ({ fr: syntheticFrame(), sourceManifestHash: 's'.repeat(64), f0ManifestHash: null, delistedInfo: null }), registers: () => ({ pitMarketCap: { state: 'STUB' }, indexPopulation: { state: 'STUB' } }), ...over });

test('profiles: loader options come from the loader lists and every preset is accepted by createResearchLoader', () => {
  const names = Pop.loaderOptionNames();
  assert.deepEqual(names, [...L.LOADER_OPTIONS, ...L.LOADER_OPTIONS_V12, ...L.LOADER_OPTIONS_V13, ...L.LOADER_OPTIONS_V13B]);
  for (const name of Object.keys(Pop.PROFILES)) {
    const { spec, specHash } = Pop.profileSpec(name);
    assert.match(specHash, /^[0-9a-f]{64}$/);
    assert.ok(Object.keys(spec.loaderOptions).every(k => names.includes(k)));
    if (Object.keys(spec.loaderOptions).length) assert.equal(typeof L.createResearchLoader(ROOT, { ...spec.loaderOptions }), 'function', name);
  }
  assert.deepEqual(Pop.profileSpec('PRODUCT_DEFAULT').spec.loaderOptions, {});
  throws('POPULATION_PROFILE_UNKNOWN', () => Pop.profileSpec('V99'));
  throws('POPULATION_PROFILE_UNKNOWN', () => Pop.profileSpec('toString'));
  assert.notEqual(Pop.profileSpec('V13_DELISTED_F1').specHash, Pop.profileSpec('V10_LIFECYCLE').specHash);
});

test('PRODUCT_DEFAULT loader is the adapter loader: identical outputs, no research registries attached', () => {
  const pop = Pop.createLoader('PRODUCT_DEFAULT'), base = Adapter.createLoader(ROOT);
  for (const id of ['ref_MSFT', 'ref_JPM', 'ref_KO']) assert.deepEqual(pop(id), base(id));
  assert.equal(pop.masterHash, base.masterHash);
  for (const k of ['identityEvidence', 'corporateActionEvidence', 'listingLifecycleEvidence']) assert.equal(k in pop, false);
  assert.throws(() => pop('ref_AAPL'), /CORPORATE_ACTION_UNRESOLVED/); // same fail-closed reasons as the adapter
});

test('delisted profiles never fall back silently: missing, wrong or incomplete private data fail explicitly', () => {
  let called = 0; const deps = fakeDeps({ buildDelistedFrame: () => { called++; return null; } });
  throws('PRIVATE_DATA_UNAVAILABLE', () => Pop.buildPopulation({ profile: 'V13_DELISTED_F1' }, deps));
  throws('PRIVATE_DATA_UNAVAILABLE', () => Pop.buildPopulation({ profile: 'V13_DELISTED_F1', privateDirs: { delistedSeries: path.join(os.tmpdir(), 'no-such-dir-' + process.pid) } }, deps));
  throws('PRIVATE_DIR_INSIDE_REPOSITORY', () => Pop.buildPopulation({ profile: 'V13_DELISTED_F1', privateDirs: { delistedSeries: path.join(ROOT, 'docs') } }, deps));
  assert.equal(called, 0);
  assert.deepEqual(Pop.availability('V13_DELISTED_F1C').privateInputs.map(x => x.state), ['NOT_GIVEN']);
  assert.equal(Pop.availability('V10_LIFECYCLE').status, 'AVAILABLE');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pop-private-'));
  try {
    const incomplete = fakeDeps({ buildDelistedFrame: () => ({ fr: syntheticFrame(), sourceManifestHash: 'x'.repeat(64), f0ManifestHash: 'y'.repeat(64), delistedInfo: { include: 'QUALIFIED', registerHash: 'r'.repeat(64), counts: { requested: 1675, loaded: 1600, missingFile: 75 } } }) });
    throws('PRIVATE_DATA_INCOMPLETE', () => Pop.buildPopulation({ profile: 'V13_DELISTED_F1', privateDirs: { delistedSeries: dir } }, incomplete));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('coverage report on a synthetic frame: per-year counts, ended/censored, CA-bound, TR availability, window, hashes', () => {
  const p = Pop.buildPopulation({ profile: 'V10_LIFECYCLE', window: ['2019-01-01', '2020-12-31'] }, fakeDeps());
  assert.equal(p.listings.size, 4); assert.equal(Object.keys(p).includes('listings'), false);
  const y = Object.fromEntries(p.coverage.perYear.map(r => [r.year, r]));
  assert.deepEqual([y[2019].active, y[2019].entering, y[2019].ending, y[2020].active, y[2020].ending, y[2020].censoredEnding], [4, 1, 1, 3, 1, 1]);
  assert.deepEqual(p.coverage.lifecycleStatus, { NO_LIFECYCLE_RECORD: 2, DELISTED_SOURCE_VERIFIED: 1, FROZEN_TAIL_UNSOURCED_CENSORED: 1 });
  assert.deepEqual(p.coverage.terminalKind, { CASH_MERGER: 1, UNKNOWN: 1 });
  assert.equal(p.coverage.endedBeforeCalendarEnd, 2); assert.equal(p.coverage.censoredEnds, 1);
  assert.equal(p.coverage.corporateActionEvidenceBound, 1); assert.deepEqual(p.coverage.corporateActionQuality, { CLEAN: 3, RESOLVED: 1 });
  assert.equal(p.coverage.totalReturnAvailable, 0); assert.ok(p.dataQuality.warnings.includes('PRICE_RETURN_ONLY_NO_TOTAL_RETURN_SERIES'));
  assert.ok(p.dataQuality.warnings.includes('DELISTED_SERIES_NOT_INCLUDED'));
  assert.equal(p.dataQuality.docWarningCounts.EX_POST_ADJUSTED_HISTORY_NOT_AS_PUBLISHED_PIT, 4);
  assert.equal(p.calendar.length, CAL.length); assert.ok(p.calendarInWindow.every(d => d >= '2019-01-01' && d <= '2020-12-31'));
  assert.equal(p.inputHashes.masterHash, 'm'.repeat(64)); assert.equal(p.inputHashes.registers.corporateActionEvidence.registryHash, 'c'.repeat(64));
  assert.equal(p.reference.state, 'DATA_DRIFT_SINCE_REFERENCE_RUN'); // synthetic data differs from the V10 reference run
  const again = Pop.buildPopulation({ profile: 'V10_LIFECYCLE', window: ['2019-01-01', '2020-12-31'] }, fakeDeps());
  assert.equal(again.populationHash, p.populationHash);
  const narrow = Pop.buildPopulation({ profile: 'V10_LIFECYCLE', window: ['2020-06-01', '2020-12-31'] }, fakeDeps());
  assert.deepEqual([...narrow.listings.keys()].sort(), ['ref_AAA', 'ref_BBB']); assert.notEqual(narrow.populationHash, p.populationHash);
  assert.deepEqual(JSON.parse(JSON.stringify(Pop.summarize(p))), Pop.summarize(p));
  assert.ok(Pop.buildPopulation({ profile: 'PRODUCT_DEFAULT' }, fakeDeps()).dataQuality.warnings.includes('SURVIVOR_COHORT_ONLY_NO_LIFECYCLE_EVIDENCE'));
  throws('POPULATION_WINDOW_INVALID', () => Pop.buildPopulation({ profile: 'V10_LIFECYCLE', window: ['2020-12-31', '2019-01-01'] }, fakeDeps()));
  throws('POPULATION_REQUEST_UNKNOWN_KEY', () => Pop.buildPopulation({ profile: 'V10_LIFECYCLE', loaderOptions: {} }, fakeDeps()));
});

test('delisted path uses the V13 frame merge unchanged (lib.mergeFrame): delisted share, TR availability, terminal classes', () => {
  const W = require('../../scripts/quant/v13/studies/lib.cjs');
  const dl = new Map([
    ['dl_X1', { ...doc('dl_X1', '2018-01-05', '2019-09-27'), mic: 'XNYS', totalReturnPoints: [['2018-01-05', 1]], listingLifecycle: { schemaVersion: 'v13-delisted-register-1.0.0', status: 'DELISTED_SOURCED_END', lastTradeDate: '2019-09-26', lastObservedDate: '2019-09-27', terminal: { kind: 'MERGER' } } }],
    ['dl_X2', { ...doc('dl_X2', '2018-01-05', '2019-09-27'), points: [['2018-01-06', 5]], mic: 'XNYS', listingLifecycle: { status: 'DELISTED_SOURCED_END', terminal: { kind: 'DISTRESS' } } }], // non-modal label -> excluded by the frame rule
  ]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pop-private-'));
  try {
    const deps = fakeDeps({ buildDelistedFrame: () => { const fr = W.mergeFrame(syntheticFrame(), dl); return { fr, sourceManifestHash: 'f'.repeat(64), f0ManifestHash: 'e'.repeat(64), delistedInfo: { include: 'QUALIFIED', registerHash: 'r'.repeat(64), counts: { requested: 2, loaded: 2, missingFile: 0 }, added: fr.delisted.added.length } }; } });
    const p = Pop.buildPopulation({ profile: 'V13_DELISTED_F1', privateDirs: { delistedSeries: dir } }, deps);
    assert.equal(p.frameSize, 5); assert.equal(p.coverage.delistedListings, 1); assert.equal(p.coverage.delistedShare, 1 / 5);
    assert.equal(p.coverage.totalReturnAvailable, 1); assert.ok(p.dataQuality.warnings.includes('TOTAL_RETURN_PARTIAL_1_OF_5'));
    assert.equal(p.coverage.frameExclusions.NON_MODAL_WEEK_LABEL, 1); assert.equal(p.coverage.terminalKind.MERGER, 1);
    assert.equal(p.inputHashes.registers.delistedRegister.registerHash, 'r'.repeat(64)); assert.equal(p.inputHashes.f0ManifestHash, 'e'.repeat(64));
    assert.equal(p.coverage.perYear.find(r => r.year === 2019).delistedActive, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Full real-data check (~80 s, two frame builds of ~6,200 series): opt-in, reported separately (skipped is not passed).
test('real data: facade equals the V10 frame code and reports drift against the V10 lifecycle manifest', { skip: process.env.RESEARCH_POPULATION_FULL ? false : 'set RESEARCH_POPULATION_FULL=1 (about 80 s)' }, () => {
  const K = require('../../scripts/quant/v10/studies/common.cjs');
  const V = require('../engines/research-validation.cjs'), C = require('../engines/research-contract.cjs');
  for (const profile of ['PRODUCT_DEFAULT', 'V10_LIFECYCLE']) {
    const p = Pop.buildPopulation({ profile }), fr = K.buildFrame({ ...Pop.PROFILES[profile].loaderOptions });
    assert.deepEqual(p.frameIds, fr.frame); assert.deepEqual(p.calendar, fr.calendar);
    assert.equal(p.inputHashes.sourceManifestHash, V.hash(K.sourceManifest(fr)));
    assert.equal(p.inputHashes.calendarHash, Pop.REFERENCES.V10_LIFECYCLE.calendarHash, 'calendar equals the V10 reference run');
    if (profile === 'V10_LIFECYCLE') {
      const m = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v10/studies/source-manifest-ca-id-lifecycle-1.0.0.json.gz'))));
      assert.equal(m.calendarHash, Pop.REFERENCES.V10_LIFECYCLE.calendarHash);
      const inRef = new Set(m.frame), rows = new Map(m.qualified.map(r => [r[0], r]));
      // the frame rule is unchanged: every listing in both runs with unchanged points keeps its frame decision
      for (const id of p.frameIds) if (rows.has(id) && rows.get(id)[5] === C.hash(p.listings.get(id).points)) assert.ok(inRef.has(id), id);
      console.log('V10_LIFECYCLE drift', JSON.stringify(p.reference), 'removed', m.frame.filter(id => !p.frameIds.includes(id)));
    }
  }
});
