import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { hostname } from 'node:os';
import { spawnSync } from 'node:child_process';
import { stageCanonicalPublication, attachCanonicalProjections, applyCanonicalPublication, rollbackCanonicalPublication, isProductizationProjectionPath, REQUIRED_PUBLICATION_QA, CANONICAL_PUBLICATION_PATHS as paths } from '../../scripts/market/tiingo2-publication.mjs';
const Company = createRequire(import.meta.url)('../../quant/engines/company-master.js');
const today = '2026-10-02';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function candidate(ticker = 'ZNEW') {
  return { ticker, securityId: `ref_${ticker}`, instrument_type: 'EQUITY_COMMON', active: true, companyName: 'New Software Corporation',
    listing: { ticker, name: 'New Software Corporation', assetType: 'Stock', exchange: 'NASDAQ', currency: 'USD', startDate: '2026-09-01', endDate: '2026-10-01' },
    evidence: { identity: { resolved: true }, price: { historyValid: true, latestValid: true, latestDate: '2026-10-01', corporateActionValid: true } } };
}
function fixture(fn, { historicalDebt = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vu-tiingo2-publication-'));
  const output = join(root, '.market-cache/stage');
  const write = (path, doc) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(doc, null, 1) + '\n'); };
  const keep = { ticker: 'KEEP', securityId: 'ref_KEEP', exchange: 'NASDAQ', active: true, assetType: 'Stock', name: 'Existing Software Inc' };
  write(paths.raw, { actualSize: 1, securities: [keep], byExchange: { NASDAQ: 1 }, bySector: { UNKNOWN: 1 } });
  write(paths.eligibility, { version: 'us-security-master-1.2.0', counts: { universeMembers: 1, ELIGIBLE: historicalDebt ? 0 : 1, SEPARATE_CLASS: 0, EXCLUDED: historicalDebt ? 1 : 0, REVIEW: 0, productUniverse: historicalDebt ? 0 : 1 }, decisions: [{ ...keep, product_eligibility: historicalDebt ? 'EXCLUDED' : 'ELIGIBLE', instrument_type: historicalDebt ? 'DEBT' : 'EQUITY_COMMON', product_eligibility_reason: historicalDebt ? 'CONFIRMED_NON_EQUITY:DEBT' : null }], nonDestructive: {} });
  write(paths.names, { version: 'company-names-1.0.0', master: {}, counts: {}, rows: [{ ...keep, inProductUniverse: true, companyName: keep.name, status: 'RESOLVED', nameSource: 'TIINGO_METADATA' }] });
  const instrument = Company.toInstrument(keep, { today }); instrument.instrumentId = Company.mintInstrumentId(keep, 0);
  const shardPath = paths.instruments + '/' + Company.shardKey('KEEP') + '.json';
  write(shardPath, { shard: Company.shardKey('KEEP'), count: 1, instruments: [instrument] });
  const baselinePaths = [paths.raw, paths.eligibility, paths.names, shardPath];
  const baselineHashes = Object.fromEntries(baselinePaths.map((path) => [path, sha(readFileSync(join(root, path)))]));
  const stage = (rows = [candidate()], stageOutput = output) => stageCanonicalPublication({ root, output: stageOutput, candidates: rows, preview: { ADDED: rows.map((row) => ({ ticker: row.ticker, securityId: row.securityId })), REMOVED: [] }, baselineHashes, runId: 'test-run', today });
  const attach = (staged) => {
    const newShard = Company.shardKey(staged.additions[0].ticker);
    const symEntries = staged.additions.map((row) => ({ s: row.ticker, i: row.instrumentId }));
    const oldSearch = existsSync(join(root, 'quant/data/universe/search/manifest.json')) ? JSON.parse(readFileSync(join(root, 'quant/data/universe/search/manifest.json'))) : { sym: [], name: [] };
    const oldNames = existsSync(join(root, 'quant/data/universe/search/name/00.json')) ? JSON.parse(readFileSync(join(root, 'quant/data/universe/search/name/00.json'))).entries : [];
    const docs = {
      'quant/data/universe/master-manifest.json': { totals: { published: 1 + staged.additions.length }, shards: { index: [{ shard: 'KE', count: 1 }, { shard: newShard, count: staged.additions.length }] } },
      'quant/data/universe/search/manifest.json': { sym: [...oldSearch.sym, { shard: newShard, count: symEntries.length }], name: [...oldSearch.name.filter((row) => row.shard !== '00'), { shard: '00', count: oldNames.length + symEntries.length }] },
      ['quant/data/universe/search/sym/' + newShard + '.json']: { entries: symEntries },
      'quant/data/universe/search/name/00.json': { entries: [...oldNames, ...symEntries] },
      'quant/data/universe/market-capability.json': { members: staged.additions.map((row) => ({ s: row.ticker, m: row.securityId, i: row.instrumentId, ph: true })) },
      'discover/data/meta.json': { universeSource: { source: 'SECURITY_MASTER', file: paths.eligibility, sha256: staged.files.find((row) => row.path === paths.eligibility).stagedSha256 } }
    };
    const preparedFiles = Object.entries(docs).map(([path, doc]) => ({ path, bytes: Buffer.from(JSON.stringify(doc)) }));
    preparedFiles.push({ path: 'quant/data/product/universe-list-v1.json.gz', bytes: gzipSync(JSON.stringify({ entries: staged.additions.map((row) => ({ s: row.ticker, c: 12.5, d: '2026-10-01' })) })) });
    return attachCanonicalProjections({ root, staged, preparedFiles });
  };
  const proof = (staged) => ({ manifestSha256: staged.manifestSha256, checks: Object.fromEntries(REQUIRED_PUBLICATION_QA.map((check) => [check, 'PASS'])) });
  try { return fn({ root, output, baselineHashes, stage, attach, proof, write }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test('stage concretely appends raw, policy, names and minted instruments without editing baseline files', () => fixture(({ root, stage, baselineHashes }) => {
  const staged = stage(); assert.equal(staged.files.length, 4); assert.equal(staged.additions.length, 1);
  for (const [path, expected] of Object.entries(baselineHashes)) assert.equal(sha(readFileSync(join(root, path))), expected);
  for (const file of staged.files) {
    const stagedDoc = JSON.parse(readFileSync(join(dirname(staged.manifestPath), file.stagedPath)));
    if (existsSync(join(root, file.path))) {
      const before = JSON.parse(readFileSync(join(root, file.path)));
      const field = file.path === paths.raw ? 'securities' : file.path === paths.eligibility ? 'decisions' : file.path === paths.names ? 'rows' : 'instruments';
      assert.deepEqual(stagedDoc[field].slice(0, before[field].length), before[field]);
    }
  }
  const instrumentFile = staged.files.find((f) => f.path.startsWith(paths.instruments));
  const instrument = JSON.parse(readFileSync(join(dirname(staged.manifestPath), instrumentFile.stagedPath))).instruments.at(-1);
  assert.equal(instrument.instrumentId, Company.mintInstrumentId({ ...candidate().listing, provider: 'tiingo' }, 0));
  assert.deepEqual(instrument.legacyIds, ['ref_ZNEW']); assert.equal(instrument.masterMemberId, 'ref_ZNEW');
  const namesFile = staged.files.find((f) => f.path === paths.names);
  const addedName = JSON.parse(readFileSync(join(dirname(staged.manifestPath), namesFile.stagedPath))).rows.at(-1);
  assert.equal(addedName.candidates.TIINGO_METADATA.securityId, 'ref_ZNEW');
  assert.equal(addedName.candidates.TIINGO_METADATA.startDate, '2026-09-01');
  assert.equal(addedName.nameSource, 'TIINGO_METADATA');
  assert.equal(staged.additions[0].quantReady, false);
  assert.equal(stage().manifestSha256, staged.manifestSha256, 'identical stage resumes deterministically');
}));
test('new candidates must pass independent readiness and cannot reuse historical symbols or IDs', () => fixture(({ stage }) => {
  const invalid = candidate(); invalid.evidence.price.corporateActionValid = false;
  assert.throws(() => stage([invalid]), /CANDIDATE_NOT_PUBLICATION_READY/);
  assert.throws(() => stage([candidate('KEEP')]), /EXISTING_OR_HISTORICAL_IDENTITY/);
  const reusedId = candidate(); reusedId.securityId = 'ref_KEEP';
  assert.throws(() => stage([reusedId]), /EXISTING_OR_HISTORICAL_IDENTITY/);
}));
test('historically excluded debt remains excluded in stage and cannot be re-added', () => fixture(({ stage, output }) => {
  assert.throws(() => stage([candidate('KEEP')]), /HISTORICAL_EXCLUSION_REINTRODUCED/);
  const staged = stage([candidate('ZNEW')]);
  assert.deepEqual(staged.protectedHistoricalExclusions, [{ ticker: 'KEEP', securityId: 'ref_KEEP', historicallyExcluded: true }]);
  const file = staged.files.find((row) => row.path === paths.eligibility);
  const after = JSON.parse(readFileSync(join(output, file.stagedPath)));
  assert.equal(after.decisions[0].product_eligibility, 'EXCLUDED');
  assert.equal(after.decisions[0].instrument_type, 'DEBT');
  assert.deepEqual(staged.removals, []);
}, { historicalDebt: true }));
test('product attachment cannot reclassify a protected historical debt exclusion', () => fixture(({ root, output, stage, attach }) => {
  const staged = attach(stage());
  const entry = staged.files.find((row) => row.path === paths.eligibility);
  const document = JSON.parse(readFileSync(join(output, entry.stagedPath)));
  document.decisions[0].product_eligibility = 'ELIGIBLE';
  assert.throws(() => attachCanonicalProjections({ root, staged, preparedFiles: [
    { path: paths.eligibility, bytes: Buffer.from(JSON.stringify(document)) }
  ] }), /HISTORICAL_EXCLUSION_REINTRODUCED/);
}, { historicalDebt: true }));
test('product attachments use a strict allowlist and still require core projections', () => fixture(({ root, stage }) => {
  assert.equal(isProductizationProjectionPath('screener/data/universe-US_REAL.json'), true);
  assert.equal(isProductizationProjectionPath('discover/logos/files/ABC.svg'), true);
  for (const path of ['quant/data/market/tiingo/private.json', 'quant/config/policy.json', '../outside.json', 'assets/logos/../../secret']) {
    assert.equal(isProductizationProjectionPath(path), false, path);
  }
  assert.throws(() => attachCanonicalProjections({ root, staged: stage(), preparedFiles: [
    { path: 'screener/data/universe-US_REAL.json', bytes: Buffer.from('{}') }
  ] }), /CANONICAL_PROJECTION_MISSING/);
}));
test('incremental names stage includes the native coverage summary when it exists', () => fixture(({ stage, output, write }) => {
  const path = 'quant/data/market/security-master/company-names-summary.json';
  write(path, { version: 'baseline' });
  const staged = stage();
  const summary = staged.files.find((row) => row.path === path);
  assert.ok(summary);
  const doc = JSON.parse(readFileSync(join(output, summary.stagedPath)));
  assert.equal(doc.coverage.productUniverse, 2);
  assert.equal(doc.coverage.withName, 2);
}));
test('stage does not silently alter an existing staged manifest or files', () => fixture(({ stage, output }) => {
  const staged = stage();
  const manifestBefore = readFileSync(join(output, 'manifest.json'));
  const fileBefore = readFileSync(join(output, staged.files[0].stagedPath));
  assert.throws(() => stage([candidate('ZNXT')]), /STAGE_RUN_ALREADY_HAS_DIFFERENT_CONTENT/);
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), manifestBefore);
  assert.deepEqual(readFileSync(join(output, staged.files[0].stagedPath)), fileBefore);
}));
test('apply requires every QA proof green and bound to the exact manifest', () => fixture(({ root, stage, proof, baselineHashes }) => {
  const staged = stage(), complete = proof(staged);
  for (const check of REQUIRED_PUBLICATION_QA) {
    const incomplete = structuredClone(complete); delete incomplete.checks[check];
    assert.throws(() => applyCanonicalPublication({ root, staged, qaProof: incomplete }), /QA_NOT_GREEN/, check);
  }
  assert.throws(() => applyCanonicalPublication({ root, staged, qaProof: { ...complete, manifestSha256: 'other-stage' } }), /QA_NOT_GREEN/);
  for (const [path, expected] of Object.entries(baselineHashes)) assert.equal(sha(readFileSync(join(root, path))), expected);
}));
test('CAS checks all captured baseline files, including untouched identity shards', () => fixture(({ root, stage, attach, proof, write }) => {
  const staged = attach(stage());
  write(paths.instruments + '/KE.json', { instruments: [], count: 0 });
  assert.throws(() => applyCanonicalPublication({ root, staged, qaProof: proof(staged) }), /BASELINE_CAS_FAILED/);
  assert.equal(JSON.parse(readFileSync(join(root, paths.raw))).securities.length, 1);
}));
test('staged corruption is rejected before canonical writes', () => fixture(({ root, output, stage, attach, proof }) => {
  const staged = attach(stage());
  const target = staged.files.find((file) => file.path === paths.raw);
  writeFileSync(join(output, target.stagedPath), '{}');
  assert.throws(() => applyCanonicalPublication({ root, staged, qaProof: proof(staged) }), /CONTENT_INTEGRITY/);
  assert.equal(JSON.parse(readFileSync(join(root, paths.raw))).securities.length, 1);
}));
test('apply is idempotent and rollback restores exact baseline bytes and removes new shards', () => fixture(({ root, stage, attach, proof, baselineHashes }) => {
  const staged = attach(stage());
  assert.equal(applyCanonicalPublication({ root, staged, qaProof: proof(staged) }).status, 'APPLIED');
  assert.equal(applyCanonicalPublication({ root, staged, qaProof: proof(staged) }).status, 'ALREADY_APPLIED');
  assert.equal(JSON.parse(readFileSync(join(root, paths.raw))).securities.length, 2);
  assert.equal(rollbackCanonicalPublication({ root, staged }).status, 'ROLLED_BACK');
  for (const [path, expected] of Object.entries(baselineHashes)) assert.equal(sha(readFileSync(join(root, path))), expected);
  for (const file of staged.files.filter((f) => f.baselineSha256 === null)) assert.equal(existsSync(join(root, file.path)), false);
  assert.equal(rollbackCanonicalPublication({ root, staged }).status, 'ROLLED_BACK');
}));
test('rollback refuses to clobber subsequent canonical edits', () => fixture(({ root, stage, attach, proof, write }) => {
  const staged = attach(stage()); applyCanonicalPublication({ root, staged, qaProof: proof(staged) });
  write(paths.raw, { securities: [{ ticker: 'SUBSEQUENT' }] });
  assert.throws(() => rollbackCanonicalPublication({ root, staged }), /SUBSEQUENT_EDIT/);
  assert.equal(JSON.parse(readFileSync(join(root, paths.raw))).securities[0].ticker, 'SUBSEQUENT');
}));
test('full QA PASS cannot bypass missing actual canonical projections', () => fixture(({ root, stage, proof }) => {
  const staged = stage();
  assert.throws(() => applyCanonicalPublication({ root, staged, qaProof: proof(staged) }), /PROJECTIONS_NOT_MATERIALIZED/);
  assert.throws(() => attachCanonicalProjections({ root, staged, preparedFiles: [] }), /PROJECTION_MISSING/);
}));
test('verified ADR classification survives a generic provider Stock label', () => fixture(({ stage, output }) => {
  const row = candidate('ZADR'); row.instrument_type = 'ADR'; row.classification = { instrumentType: 'ADR', confidence: 'HIGH' };
  const staged = stage([row]);
  const file = staged.files.find((file) => file.path.startsWith(paths.instruments));
  assert.equal(JSON.parse(readFileSync(join(output, file.stagedPath))).instruments[0].securityType, 'ADR');
}));
test('verified REIT TRUST and SPAC common shares retain existing consumer policy', () => fixture(({ root, stage }) => {
  for (const [ticker, instrument_type, name] of [['ZRIT', 'REIT', 'New Realty Trust'], ['ZTRT', 'TRUST', 'New Royalty Trust'], ['ZSPC', 'SPAC', 'New Acquisition Corp']]) {
    const row = candidate(ticker); row.instrument_type = instrument_type; row.companyName = name; row.listing.name = name;
    const staged = stage([row], join(root, 'stage-' + ticker));
    assert.equal(staged.additions.length, 1);
    const decision = JSON.parse(readFileSync(join(dirname(staged.manifestPath), staged.files.find((f) => f.path === paths.eligibility).stagedPath))).decisions.at(-1);
    assert.equal(decision.instrument_type, instrument_type); assert.equal(decision.product_eligibility, 'SEPARATE_CLASS');
  }
}));
test('search projection cannot hide baseline shards by removing manifest references', () => fixture(({ root, output, stage, attach, write }) => {
  write('quant/data/universe/search/manifest.json', { sym: [{ shard: 'KE', count: 1 }], name: [] });
  write('quant/data/universe/search/sym/KE.json', { entries: [{ s: 'KEEP', i: 'existing-id' }] });
  const staged = attach(stage()), before = readFileSync(join(output, 'manifest.json'));
  const searchFile = staged.files.find((file) => file.path === 'quant/data/universe/search/manifest.json');
  const bad = JSON.parse(readFileSync(join(output, searchFile.stagedPath))); bad.sym = bad.sym.filter((row) => row.shard !== 'KE');
  assert.throws(() => attachCanonicalProjections({ root, staged, preparedFiles: [{ path: searchFile.path, bytes: Buffer.from(JSON.stringify(bad)) }] }), /BASELINE_SEARCH_SHARD_REFERENCE_DROPPED/);
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), before, 'failed attachments preserve prior reviewed manifest');
}));
test('a dead process lock is recovered and an interrupted transaction can roll back', () => fixture(({ root, output, stage, attach, proof, baselineHashes }) => {
  const staged = attach(stage()); applyCanonicalPublication({ root, staged, qaProof: proof(staged) });
  const receiptPath = join(output, 'applied.json'), receipt = JSON.parse(readFileSync(receiptPath));
  receipt.status = 'PREPARED'; writeFileSync(receiptPath, JSON.stringify(receipt));
  const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  writeFileSync(join(root, '.market-cache/tiingo2-publication.lock'), JSON.stringify({ pid: dead.pid, host: hostname() }));
  assert.equal(rollbackCanonicalPublication({ root, staged }).status, 'ROLLED_BACK');
  for (const [path, expected] of Object.entries(baselineHashes)) assert.equal(sha(readFileSync(join(root, path))), expected);
  assert.equal(existsSync(join(root, '.market-cache/tiingo2-publication.lock')), false);
}));
