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
import { resolveName, SUMMARY_FILE as NAME_SUMMARY_FILE } from '../../scripts/market/build-company-names.mjs';
import { stageCanonicalPublication, attachCanonicalProjections, bindProtectedProductQA, applyCanonicalPublication, verifyCanonicalPublicationReceipt, rollbackCanonicalPublication, REQUIRED_PUBLICATION_QA, REQUIRED_PROTECTED_PRODUCT_CHECKS, CANONICAL_PUBLICATION_PATHS as paths, PRODUCTIZATION_QA_SCHEMA, REQUIRED_PRODUCTIZATION_QA, CONDITIONAL_PRODUCTIZATION_QA, isProductizationProjectionPath, verifyStagedCanonicalPublication } from '../../scripts/market/tiingo2-publication.mjs';
import { budgets } from '../../scripts/vu2/resource-budget.mjs';
const Company = createRequire(import.meta.url)('../../quant/engines/company-master.js');
const FactorEvidence = createRequire(import.meta.url)('../../quant/engines/factor-evidence.js');
const today = '2026-10-02';
const factorShard = (record) => ({ schemaVersion: FactorEvidence.SHARD_SCHEMA, methodologyVersion: FactorEvidence.METHODOLOGY_VERSION, derivedFrom: FactorEvidence.DERIVED_FROM, shard: 'ZN', publication: { compositeAllowed: false, rankingAllowed: false }, publicationViolations: [], securities: { ZNEW: record } });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const partialFactors = () => Object.fromEntries(FactorEvidence.FACTOR_ORDER.map((id) => [id,
  id === 'momentum' ? { state: 'AVAILABLE', score: 63.5 } : { state: 'UNAVAILABLE', reason: 'INPUT_NOT_MATERIALIZED', score: null }]));
function candidate(ticker = 'ZNEW') {
  return { ticker, securityId: `ref_${ticker}`, instrument_type: 'EQUITY_COMMON', active: true, companyName: 'New Software Corporation',
    listing: { ticker, name: 'New Software Corporation', assetType: 'Stock', exchange: 'NASDAQ', currency: 'USD', startDate: '2026-09-01', endDate: '2026-10-01' },
    evidence: { identity: { resolved: true }, price: { historyValid: true, latestValid: true, latestDate: '2026-10-01', corporateActionValid: true } } };
}
function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'vu-tiingo2-publication-'));
  const output = join(root, '.market-cache/stage');
  const write = (path, doc) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(doc, null, 1) + '\n'); };
  const keep = { ticker: 'KEEP', securityId: 'ref_KEEP', exchange: 'NASDAQ', active: true, assetType: 'Stock', name: 'Existing Software Inc' };
  write(paths.raw, { actualSize: 1, securities: [keep], byExchange: { NASDAQ: 1 }, bySector: { UNKNOWN: 1 } });
  write(paths.eligibility, { version: 'us-security-master-1.2.0', counts: { universeMembers: 1, ELIGIBLE: 1, SEPARATE_CLASS: 0, EXCLUDED: 0, REVIEW: 0, productUniverse: 1 }, decisions: [{ ...keep, product_eligibility: 'ELIGIBLE', instrument_type: 'EQUITY_COMMON' }], nonDestructive: {} });
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
  assert.equal(staged.additions[0].quantReady, false);
  const namesFile = staged.files.find((f) => f.path === paths.names);
  const named = JSON.parse(readFileSync(join(dirname(staged.manifestPath), namesFile.stagedPath))).rows.at(-1);
  assert.equal(resolveName(named.ticker, named.candidates).companyName, named.companyName, 'native name resolution reproduces the staged provider name');
  assert.equal(named.candidates.TIINGO_METADATA.providerSymbol, named.ticker);
  assert.equal(named.candidates.TIINGO_METADATA.securityId, named.securityId);
  assert.equal(named.candidates.TIINGO_METADATA.exchange, named.exchange);
  assert.equal(named.candidates.TIINGO_METADATA.startDate, candidate().listing.startDate);
  assert.equal(named.candidates.TIINGO_METADATA.asOf, today);
  assert.equal(stage().manifestSha256, staged.manifestSha256, 'identical stage resumes deterministically');
}));
test('new candidates must pass independent readiness and cannot reuse historical symbols or IDs', () => fixture(({ stage }) => {
  const invalid = candidate(); invalid.evidence.price.corporateActionValid = false;
  assert.throws(() => stage([invalid]), /CANDIDATE_NOT_PUBLICATION_READY/);
  assert.throws(() => stage([candidate('KEEP')]), /EXISTING_OR_HISTORICAL_IDENTITY/);
  const reusedId = candidate(); reusedId.securityId = 'ref_KEEP';
  assert.throws(() => stage([reusedId]), /EXISTING_OR_HISTORICAL_IDENTITY/);
}));
test('incremental staging updates the existing native name summary against the exact new membership', () => fixture(({ root, stage, write, attach, proof }) => {
  write(NAME_SUMMARY_FILE, { coverage: { productUniverse: 1 } });
  const staged = stage(), summaryFile = staged.files.find((file) => file.path === NAME_SUMMARY_FILE);
  const summary = JSON.parse(readFileSync(join(dirname(staged.manifestPath), summaryFile.stagedPath)));
  const namesFile = staged.files.find((file) => file.path === paths.names), names = JSON.parse(readFileSync(join(dirname(staged.manifestPath), namesFile.stagedPath)));
  assert.equal(summary.coverage.productUniverse, 2);
  assert.equal(summary.coverage.withName, 2);
  assert.deepEqual(summary.master, names.master);
  assert.equal(summary.master.sha256, staged.files.find((file) => file.path === paths.eligibility).stagedSha256);
  assert.equal(isProductizationProjectionPath(NAME_SUMMARY_FILE), true);
  const projected = attach(staged);
  applyCanonicalPublication({ root, staged: projected, qaProof: proof(projected) });
  assert.deepEqual(JSON.parse(readFileSync(join(root, NAME_SUMMARY_FILE))), summary);
  rollbackCanonicalPublication({ root, staged: projected });
  assert.deepEqual(JSON.parse(readFileSync(join(root, NAME_SUMMARY_FILE))), { coverage: { productUniverse: 1 } });
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

function productizationFixture(context, mutate = (input) => input, mutateQA = () => {}) {
  const staged = context.attach(context.stage()), addition = staged.additions[0], shard = Company.shardKey(addition.ticker);
  const chartPath = 'quant/data/market/discover-series/' + addition.securityId + '.json';
  const products = Object.fromEntries(CONDITIONAL_PRODUCTIZATION_QA.map((name) => [name, { state: 'UNAVAILABLE', reasonCodes: ['REQUIRED_PRODUCT_EVIDENCE_NOT_AVAILABLE'], artifactPaths: [] }]));
  products.SEARCH = { state: 'PASS', artifactPaths: ['quant/data/universe/search/sym/' + shard + '.json'] };
  products.CHARTS = { state: 'PASS', artifactPaths: [chartPath] };
  products.WATCHLIST = { state: 'PASS', artifactPaths: [paths.instruments + '/' + shard + '.json'] };
  const readiness = [{ ticker: addition.ticker, securityId: addition.securityId, instrumentId: addition.instrumentId, products }];
  const chart = { ticker: addition.ticker, securityId: addition.securityId, source: 'tiingo', status: 'CALCULATED', currency: 'USD', priceSeriesType: 'SPLIT_ADJUSTED', points: Array.from({ length: 30 }, (_, i) => ['2026-09-' + String(i + 1).padStart(2, '0'), 10]) };
  const prepared = [{ path: chartPath, bytes: Buffer.from(JSON.stringify(chart)) }];
  const input = mutate({ root: context.root, staged, preparedFiles: prepared, productizationReadiness: readiness });
  const unbound = attachCanonicalProjections(input);
  const changed = unbound.files.filter(entry => entry.projection && entry.baselineSha256 !== null && entry.baselineSha256 !== entry.stagedSha256);
  const shadowReport = { schemaVersion: 'tiingo2-product-shadow-qa-1', runId: unbound.runId, sourceCommit: 'a'.repeat(40),
    sourceManifestSha256: unbound.manifestSha256, sourceReadinessSha256: unbound.productizationReadinessSha256,
    scope: unbound.additions.map(row => row.ticker), productionWrites: 0, findings: [],
    checks: REQUIRED_PROTECTED_PRODUCT_CHECKS.map(name => ({ name, status: 'PASS' })),
    changedExistingFiles: changed.map(entry => ({ path: entry.path, beforeSha256: entry.baselineSha256,
      afterSha256: entry.stagedSha256, reasonCode: 'ADDITIVE_MEMBERSHIP_OR_INDEX', explanation: 'New listing added to existing product projection.' })),
    derivedFactorChanges: {}, populationChangeExplanation: 'Canonical population changes explain rank normalization for existing factors.' };
  const browserReport = { schemaVersion: 'tiingo2-resource-budget-qa-1', sourceManifestSha256: unbound.manifestSha256,
    sourceCommit: shadowReport.sourceCommit, results: Object.entries(budgets).flatMap(([view, budget]) => [1440, 390].map(width =>
      ({ view, width, decodedBytes: 100, requests: 1, budget: { ...budget }, pass: true, failures: [] }))) };
  const factorPopulationReport = { schemaVersion: 'tiingo2-derived-factor-population-qa-1', runId: unbound.runId,
    sourceManifestSha256: unbound.manifestSha256, sourceReadinessSha256: unbound.productizationReadinessSha256,
    status: 'PASS', reasonCodes: [], comparisonBasis: 'ACTUAL_PUBLISHED_FACTOR_DNA_ARTIFACTS',
    rawProviderValuesExported: false, population: { before: 1, after: 1, baselinePreserved: 1, added: [], removed: [] }, factors: {} };
  mutateQA(shadowReport, browserReport, factorPopulationReport);
  const productized = bindProtectedProductQA({ root: context.root, staged: unbound, shadowReport, browserReport, factorPopulationReport });
  const qaProof = { schemaVersion: PRODUCTIZATION_QA_SCHEMA, manifestSha256: productized.manifestSha256,
    productReadinessSha256: productized.productizationReadinessSha256, checks: Object.fromEntries(REQUIRED_PRODUCTIZATION_QA.map((name) => [name, 'PASS'])) };
  return { staged: productized, qaProof };
}

function shortListingFixture(context, count = 2, mutate = (input) => input) {
  return productizationFixture(context, (input) => {
    const addition = input.staged.additions[0], price = JSON.parse(input.preparedFiles[0].bytes);
    const points = Array.from({ length: count }, (_, i) => [new Date(Date.parse(today) - (count - i) * 86400000).toISOString().slice(0, 10), 10]);
    Object.assign(price, { provider: 'tiingo', historyCoverage: 'SHORT_HISTORY', corporateActionStatus: 'PASS', publishCheckedAt: today, barCount: count, sourceBarCount: count, from: points[0][0], to: points.at(-1)[0], asOf: points.at(-1)[0], points });
    input.preparedFiles[0].bytes = Buffer.from(JSON.stringify(price));
    input.preparedFiles.push({ path: 'quant/data/universe/market-capability.json', bytes: Buffer.from(JSON.stringify({ members: [{ s: addition.ticker, m: addition.securityId, i: addition.instrumentId, ph: false, ps: true, b: count, f: price.from, l: price.to, fr: false, t: 'INSUFFICIENT_HISTORY' }] })) });
    input.preparedFiles.push({ path: 'quant/data/product/universe-list-v1.json.gz', bytes: gzipSync(JSON.stringify({ entries: [{ s: addition.ticker, c: 10, d: price.to }] })) });
    input.productizationReadiness[0].products.CHARTS = { state: 'UNAVAILABLE', reasonCodes: ['INSUFFICIENT_CHART_HISTORY'], artifactPaths: [], eligibilityEvidence: { priceArtifactPath: input.preparedFiles[0].path } };
    return mutate(input);
  });
}

test('two-to-four-session listings retain actual latest quote, Search and Watchlist while Charts stay explicitly unavailable', () => {
  for (const count of [2, 4]) fixture((context) => {
    const { staged, qaProof } = shortListingFixture(context, count);
    const products = staged.productizationReadiness[0].products;
    assert.equal(products.SEARCH.state, 'PASS');assert.equal(products.WATCHLIST.state, 'PASS');assert.equal(products.CHARTS.state, 'UNAVAILABLE');
    assert.deepEqual(products.CHARTS.reasonCodes, ['INSUFFICIENT_CHART_HISTORY']);assert.deepEqual(products.CHARTS.artifactPaths, []);
    assert.match(products.CHARTS.eligibilityEvidence.priceArtifactSha256, /^[a-f0-9]{64}$/);
    assert.equal(verifyStagedCanonicalPublication({ root: context.root, staged }).status, 'VERIFIED_READ_ONLY');
    assert.equal(applyCanonicalPublication({ root: context.root, staged, qaProof }).status, 'APPLIED');
    assert.equal(rollbackCanonicalPublication({ root: context.root, staged }).status, 'ROLLED_BACK');
  });
});

test('price-only IPO history cannot predate its exact canonical listing generation', () => {
  for (const date of [null, '2026-10-02', '2026-02-30']) fixture((context) => {
    assert.throws(() => shortListingFixture(context, 2, (input) => {
      const file = input.staged.files.find((entry) => entry.path.startsWith(paths.instruments + '/'));
      const document = JSON.parse(readFileSync(join(dirname(input.staged.manifestPath), file.stagedPath)));
      document.instruments.find((row) => row.symbol === 'ZNEW').firstTradeDate = date;
      input.preparedFiles.push({ path: file.path, bytes: Buffer.from(JSON.stringify(document)) });return input;
    }), /SHORT_LISTING_PRICE_NOT_MATERIALIZED/);
  });
});

test('short-listing exception rejects invented reasons, missing/invalid prices, wrong IDs, sufficient chart history and stale evidence', () => {
  const mutatePrice = (change) => (input) => { const document = JSON.parse(input.preparedFiles[0].bytes);change(document);input.preparedFiles[0].bytes = Buffer.from(JSON.stringify(document));return input; };
  for (const mutate of [
    (input) => { input.productizationReadiness[0].products.CHARTS.reasonCodes = ['NO_DATA'];return input; },
    (input) => { input.productizationReadiness[0].products.CHARTS.reasonCodes.push('BAD_SERIES');return input; },
    (input) => { delete input.productizationReadiness[0].products.CHARTS.eligibilityEvidence;return input; },
    (input) => { input.preparedFiles.shift();return input; },
    (input) => { input.productizationReadiness[0].products.CHARTS.eligibilityEvidence.priceArtifactPath = 'quant/data/market/discover-series/ref_OTHER.json';return input; },
    mutatePrice((p) => { p.securityId = 'ref_OTHER'; }),mutatePrice((p) => { p.ticker = 'OTHER'; }),
    mutatePrice((p) => { p.currency = 'EUR'; }),mutatePrice((p) => { p.corporateActionStatus = 'SUSPICIOUS_PRICE_BREAK'; }),
    mutatePrice((p) => { p.sourceBarCount = 20; }),mutatePrice((p) => { p.points[1][1] = -1; }),
    mutatePrice((p) => { p.points.reverse(); }),mutatePrice((p) => { p.points[1][0] = '2026-09-15'; }),
    mutatePrice((p) => { p.publishCheckedAt = '2026-09-01'; }),
    (input) => { const file = input.preparedFiles.find((p) => p.path.endsWith('market-capability.json'));const doc = JSON.parse(file.bytes);doc.members[0].ph = true;file.bytes = Buffer.from(JSON.stringify(doc));return input; },
    (input) => { const file = input.preparedFiles.find((p) => p.path.endsWith('universe-list-v1.json.gz'));file.bytes = gzipSync(JSON.stringify({ entries: [{ s: 'ZNEW', c: 50, d: today }] }));return input; }
  ]) fixture((context) => { assert.throws(() => shortListingFixture(context, 2, mutate), /SHORT_LISTING|PRODUCT_READINESS/); });
  fixture((context) => { assert.throws(() => shortListingFixture(context, 5), /SHORT_LISTING_PRICE_NOT_MATERIALIZED/); });
  fixture((context) => { assert.throws(() => shortListingFixture(context, 2, (input) => { delete input.productizationReadiness;return input; }), /CHART_ADDITION_NOT_MATERIALIZED/, 'legacy publication still requires materialized chart capability'); });
});

test('productization QA permits verified search/chart/watchlist when conditional products are honestly unavailable', () => fixture((context) => {
  const { staged, qaProof } = productizationFixture(context);
  assert.equal(staged.productizationReadiness[0].products.QUANT.state, 'UNAVAILABLE');
  assert.ok(staged.productizationReadiness[0].products.CHARTS.artifactHashes);
  assert.equal(verifyStagedCanonicalPublication({ root: context.root, staged }).protectedQAStatus, 'BOUND_AND_VERIFIED');
  assert.equal(applyCanonicalPublication({ root: context.root, staged, qaProof }).status, 'APPLIED');
  assert.deepEqual(verifyCanonicalPublicationReceipt({ root: context.root, staged }).storageStatus, 'UNVERIFIED');
  assert.equal(verifyCanonicalPublicationReceipt({ root: context.root, staged }).completeForNoChanges, false);
  assert.equal(rollbackCanonicalPublication({ root: context.root, staged }).status, 'ROLLED_BACK');
  assert.throws(() => verifyCanonicalPublicationReceipt({ root: context.root, staged }), /RECEIPT_MISMATCH/);
  for (const [path, hash] of Object.entries(context.baselineHashes)) assert.equal(sha(readFileSync(join(context.root, path))), hash);
}));

test('product attachment cannot apply without bound protected diff, factor-population and byte-budget evidence', () => fixture((context) => {
  const { staged, qaProof } = productizationFixture(context);
  const document = JSON.parse(readFileSync(staged.manifestPath));
  delete document.protectedProductQA;
  const bytes = Buffer.from(JSON.stringify(document, null, 2) + '\n'); writeFileSync(staged.manifestPath, bytes);
  assert.equal(verifyStagedCanonicalPublication({ root: context.root, staged }).protectedQAStatus, 'UNBOUND');
  assert.throws(() => applyCanonicalPublication({ root: context.root, staged,
    qaProof: { ...qaProof, manifestSha256: sha(bytes) } }), /PROTECTED_PRODUCT_QA_UNBOUND/);
  assert.equal(JSON.parse(readFileSync(join(context.root, paths.raw))).securities.length, 1);
}));

test('a modified protected QA blob invalidates the manifest before canonical writes', () => fixture((context) => {
  const { staged, qaProof } = productizationFixture(context);
  const qa = staged.protectedProductQA, blob = join(dirname(staged.manifestPath), 'qa-blobs', qa.browserSha256 + '.json');
  writeFileSync(blob, JSON.stringify({ results: [] }));
  assert.throws(() => applyCanonicalPublication({ root: context.root, staged, qaProof }), /PROTECTED_PRODUCT_QA_CONTENT_MISMATCH/);
  assert.equal(JSON.parse(readFileSync(join(context.root, paths.raw))).securities.length, 1);
}));

test('protected QA rejects unexplained existing output changes, rank population removals and raised browser budgets', () => {
  fixture(context => {
    context.write('screener/data/universe-US_REAL.json', { rows: [{ s: 'KEEP' }] });
    assert.throws(() => productizationFixture(context, input => {
      input.preparedFiles.push({ path: 'screener/data/universe-US_REAL.json',
        bytes: Buffer.from(JSON.stringify({ rows: [{ s: 'KEEP' }, { s: 'ZNEW' }] })) });
      return input;
    }, shadow => { shadow.changedExistingFiles = []; }), /PROTECTED_PRODUCT_DIFF_UNEXPLAINED|PROTECTED_PRODUCT_SHADOW_QA/);
  });
  fixture(context => assert.throws(() => productizationFixture(context, input => input,
    (_shadow, _browser, factor) => { factor.population.removed = ['KEEP']; }), /PROTECTED_FACTOR_POPULATION_QA_NOT_GREEN/));
  fixture(context => assert.throws(() => productizationFixture(context, input => input,
    (_shadow, browser) => { browser.results.find(row => row.view === 'screener').budget.decodedBytes += 1; }), /PROTECTED_PRODUCT_BUDGET_QA_NOT_GREEN/));
});

test('Markets readiness binds current stock assignment, Screener exchange/sector and canonical market capability', () => {
  const attachMarkets = (exchange, context) => productizationFixture(context, (input) => {
    const addition = input.staged.additions[0], stockPath = 'discover/data/stocks/US_REAL/ZNEW.json';
    const capPath = 'quant/data/universe/market-capability.json', screenPath = 'screener/data/universe-US_REAL.json';
    input.preparedFiles.push(
      { path: stockPath, bytes: Buffer.from(JSON.stringify({ symbol: addition.ticker, securityId: addition.securityId,
        instrumentId: addition.instrumentId, provider: 'tiingo', dataMode: 'real', exchange, sector: 'Technology' })) },
      { path: capPath, bytes: Buffer.from(JSON.stringify({ members: [{ s: addition.ticker, m: addition.securityId,
        i: addition.instrumentId, ph: true, ps: true }] })) },
      { path: screenPath, bytes: Buffer.from(JSON.stringify({ rows: [{ s: addition.ticker, ex: 'NASDAQ', sec: 'Technology' }] })) }
    );
    input.productizationReadiness[0].products.MARKETS = { state: 'PASS', artifactPaths: [stockPath, capPath, screenPath] };
    return input;
  });
  fixture(context => { const { staged } = attachMarkets('NASDAQ', context); assert.equal(staged.productizationReadiness[0].products.MARKETS.state, 'PASS'); });
  fixture(context => assert.throws(() => attachMarkets('NYSE', context), /MARKETS_READINESS_NOT_MATERIALIZED/));
});

test('SuperTrader readiness requires the ticker technical shard and available 60-session signal result', () => {
  const attachSuperTrader = (signalState, context) => productizationFixture(context, (input) => {
    const addition = input.staged.additions[0], shardPath = 'quant/data/product/technical-signals-v1/ZN.json.gz';
    const signalPath = 'quant/data/product/technical-signals-v1/signals-60.json.gz';
    const timestamps = Array.from({ length: 60 }, (_, i) => new Date(Date.parse(today) - (60 - i) * 86400000).toISOString().slice(0, 10));
    input.preparedFiles.push(
      { path: shardPath, bytes: gzipSync(JSON.stringify({ instruments: { ZNEW: { securityId: addition.securityId,
        isMock: false, source: 'tiingo', priceSeriesType: 'SPLIT_ADJUSTED', bars: { timestamps } } } })) },
      { path: signalPath, bytes: gzipSync(JSON.stringify({ results: [{ ticker: addition.ticker, state: signalState,
        lookback: 60, asOf: today, events: [] }] })) }
    );
    input.productizationReadiness[0].products.SUPERTRADER = { state: 'PASS', artifactPaths: [shardPath, signalPath] };
    return input;
  });
  fixture(context => { const { staged } = attachSuperTrader('AVAILABLE', context); assert.equal(staged.productizationReadiness[0].products.SUPERTRADER.state, 'PASS'); });
  fixture(context => assert.throws(() => attachSuperTrader('UNAVAILABLE', context), /SUPERTRADER_READINESS_NOT_MATERIALIZED/));
});

test('conditional product evidence cannot replace missing critical QA or use a stale readiness digest', () => fixture((context) => {
  const { staged, qaProof } = productizationFixture(context);
  for (const name of REQUIRED_PRODUCTIZATION_QA) {
    const bad = structuredClone(qaProof); delete bad.checks[name];
    assert.throws(() => applyCanonicalPublication({ root: context.root, staged, qaProof: bad }), /QA_NOT_GREEN/);
  }
  assert.throws(() => applyCanonicalPublication({ root: context.root, staged, qaProof: { ...qaProof, productReadinessSha256: 'forged' } }), /QA_NOT_GREEN/);
  assert.throws(() => applyCanonicalPublication({ root: context.root, staged, qaProof: { ...qaProof, checks: { ...qaProof.checks, SEC: 'FAIL' } } }), /QA_NOT_GREEN/);
  const legacy = { ...qaProof }; delete legacy.schemaVersion;
  assert.throws(() => applyCanonicalPublication({ root: context.root, staged, qaProof: legacy }), /QA_NOT_GREEN/, 'legacy proofs still require all 13 checks');
}));

test('productization requires listing-bound readiness, explicit unavailable reasons and actual critical artifacts', () => {
  const invalid = [
    (input) => { input.productizationReadiness[0].securityId = 'ref_DIFFERENT'; },
    (input) => { delete input.productizationReadiness[0].products.SEC; },
    (input) => { input.productizationReadiness[0].products.QUANT.reasonCodes = []; },
    (input) => { input.productizationReadiness[0].products.CHARTS = { state: 'UNAVAILABLE', reasonCodes: ['NOT_MATERIALIZED'] }; },
    (input) => { input.productizationReadiness = []; },
    (input) => { input.preparedFiles = []; }
  ];
  for (const mutate of invalid) fixture((context) => {
    assert.throws(() => productizationFixture(context, (input) => { mutate(input); return input; }), /PRODUCT_READINESS|UNAVAILABLE_PRODUCT|CRITICAL_ADDITION|SHORT_LISTING/);
    assert.equal(JSON.parse(readFileSync(join(context.root, paths.raw))).securities.length, 1);
  });
});

test('materialized factor components do not claim full Quant readiness while its canonical contract is inactive', () => fixture((context) => {
  assert.throws(() => productizationFixture(context, (input) => {
    const addition = input.staged.additions[0], path = 'quant/data/product/factor-evidence-v1/ZN.json.gz';
    input.preparedFiles.push({ path, bytes: gzipSync(JSON.stringify({ publication: { compositeAllowed: false }, securities: { ZNEW: { ticker: 'ZNEW', securityId: addition.securityId, factors: { momentum: { state: 'AVAILABLE' } } } } })) });
    input.productizationReadiness[0].products.QUANT = { state: 'PASS', artifactPaths: [path] };
    return input;
  }), /FULL_QUANT_READINESS_NOT_MATERIALIZED/);
}));

test('partial Factor DNA readiness keeps disabled composites and publishes only evidenced typed factors', () => fixture((context) => {
  const { staged, qaProof } = productizationFixture(context, (input) => {
    const addition = input.staged.additions[0], path = 'quant/data/product/factor-evidence-v1/ZN.json.gz';
    input.preparedFiles.push({ path, bytes: gzipSync(JSON.stringify(factorShard({ ticker: 'ZNEW', securityId: addition.securityId, factors: partialFactors(), composite: { state: 'WITHHELD', reason: 'QUANT_V2_NOT_ACTIVE' } }))) });
    input.productizationReadiness[0].products.QUANT = { state: 'PASS', coverage: 'TECHNICAL_ONLY', artifactPaths: [path] };
    return input;
  });
  assert.equal(staged.productizationReadiness[0].products.QUANT.coverage, 'TECHNICAL_ONLY');
  assert.equal(applyCanonicalPublication({ root: context.root, staged, qaProof }).status, 'APPLIED');
  rollbackCanonicalPublication({ root: context.root, staged });
}));

test('an invented full-composite publication flag cannot override the repository Quant methodology', () => fixture((context) => {
  context.write('quant/methodology/quant-v2.json', { publication: { allowed: false } });
  assert.throws(() => productizationFixture(context, (input) => {
    const addition = input.staged.additions[0], path = 'quant/data/product/factor-evidence-v1/ZN.json.gz';
    const document = factorShard({ ticker: 'ZNEW', securityId: addition.securityId, factors: partialFactors(), composite: null });document.publication.compositeAllowed = true;
    input.preparedFiles.push({ path, bytes: gzipSync(JSON.stringify(document)) });
    input.productizationReadiness[0].products.QUANT = { state: 'PASS', coverage: 'FULL', artifactPaths: [path] };return input;
  }), /FULL_QUANT_READINESS_NOT_MATERIALIZED/);
}));

test('partial Factor DNA refuses numeric composites, fabricated factors and publication violations', () => {
  for (const change of [
    (record, doc) => { record.composite = { score: 65 }; },
    (record, doc) => { record.factors.momentum.score = '63'; },
    (record, doc) => { doc.publicationViolations = ['MISSING_PIT']; }
  ]) fixture((context) => {
    assert.throws(() => productizationFixture(context, (input) => {
      const addition = input.staged.additions[0], path = 'quant/data/product/factor-evidence-v1/ZN.json.gz';
      const record = { ticker: 'ZNEW', securityId: addition.securityId, factors: partialFactors(), composite: null };
      const doc = factorShard(record);change(record, doc);
      input.preparedFiles.push({ path, bytes: gzipSync(JSON.stringify(doc)) });
      input.productizationReadiness[0].products.QUANT = { state: 'PASS', coverage: 'PARTIAL', artifactPaths: [path] };
      return input;
    }), /PARTIAL_QUANT|QUANT_PUBLICATION_VIOLATIONS/);
  });
});

test('partial Factor DNA publication requires the existing canonical shard schema and methodology', () => {
  for (const change of [d => { d.schemaVersion = 'invented'; }, d => { d.methodologyVersion = 'invented'; }, d => { d.derivedFrom = 'invented'; }, d => { d.shard = 'DI'; }, d => { d.publication.rankingAllowed = true; }]) fixture((context) => {
    assert.throws(() => productizationFixture(context, (input) => {
      const addition = input.staged.additions[0], path = 'quant/data/product/factor-evidence-v1/ZN.json.gz';
      const doc = factorShard({ ticker: 'ZNEW', securityId: addition.securityId, factors: partialFactors(), composite: null });change(doc);
      input.preparedFiles.push({ path, bytes: gzipSync(JSON.stringify(doc)) });
      input.productizationReadiness[0].products.QUANT = { state: 'PASS', coverage: 'PARTIAL', artifactPaths: [path] };return input;
    }), /PARTIAL_QUANT_SHARD_CONTRACT_INVALID/);
  });
});

test('partial publication recomputes canonical evidence violations despite a forged clean producer summary', () => {
  for (const change of [
    (record) => { record.quantScore = 77; },
    (record) => { record.rank = 1; },
    (record) => { delete record.factors.growth; },
    (record) => { record.factors.invented = { state: 'AVAILABLE', score: 80 }; },
    (record) => { record.factors.quality.score = 80; },
    (record) => { record.factors.quality.reason = 'UNVERIFIED_REASON'; }
  ]) fixture((context) => {
    assert.throws(() => productizationFixture(context, (input) => {
      const addition = input.staged.additions[0], path = 'quant/data/product/factor-evidence-v1/ZN.json.gz';
      const record = { ticker: 'ZNEW', securityId: addition.securityId, factors: partialFactors(), composite: { state: 'WITHHELD', reason: 'QUANT_V2_NOT_ACTIVE' }, publicationViolations: [] };
      change(record);
      input.preparedFiles.push({ path, bytes: gzipSync(JSON.stringify(factorShard(record))) });
      input.productizationReadiness[0].products.QUANT = { state: 'PASS', coverage: 'PARTIAL', artifactPaths: [path] };
      return input;
    }), /QUANT_PUBLICATION_VIOLATIONS/);
    assert.equal(JSON.parse(readFileSync(join(context.root, paths.raw))).securities.length, 1);
  });
});

test('factor readiness is bound to exact canonical listing identity inside the actual shard', () => {
  for (const changed of [{ securityId: 'ref_DIFFERENT' }, { ticker: 'DIFFERENT' }]) fixture((context) => {
    assert.throws(() => productizationFixture(context, (input) => {
      const addition = input.staged.additions[0], path = 'quant/data/product/factor-evidence-v1/ZN.json.gz';
      const record = { ticker: 'ZNEW', securityId: addition.securityId, factors: partialFactors(), composite: { state: 'WITHHELD', reason: 'QUANT_V2_NOT_ACTIVE' }, ...changed };
      input.preparedFiles.push({ path, bytes: gzipSync(JSON.stringify(factorShard(record))) });
      input.productizationReadiness[0].products.QUANT = { state: 'PASS', coverage: 'PARTIAL', artifactPaths: [path] };
      return input;
    }), /QUANT_READINESS_IDENTITY_MISMATCH/);
  });
});

test('columnar Screener membership and short IPO chart use actual listing-bound public projections', () => fixture((context) => {
  const { staged } = productizationFixture(context, (input) => {
    const chart = JSON.parse(input.preparedFiles[0].bytes);chart.points = chart.points.slice(-21);chart.historyCoverage = 'SHORT_HISTORY';chart.sourceBarCount = 21;chart.from = chart.points[0][0];chart.to = chart.points.at(-1)[0];
    input.preparedFiles[0].bytes = Buffer.from(JSON.stringify(chart));
    const path = 'screener/data/universe-US_REAL.json';input.preparedFiles.push({ path, bytes: Buffer.from(JSON.stringify({ columns: ['s', 'n'], cols: { s: ['ZNEW'], n: ['New Software Corporation'] } })) });
    input.productizationReadiness[0].products.SCREENER = { state: 'PASS', artifactPaths: [path] };return input;
  });
  assert.equal(staged.productizationReadiness[0].products.SCREENER.state, 'PASS');
  assert.equal(staged.productizationReadiness[0].products.CHARTS.state, 'PASS');
}));

test('canonical SEC bundles use their existing index for issuer binding without inventing a top-level CIK', () => {
 const attachSec = (context, change=()=>{}, compressed=false) => productizationFixture(context, input => {
  const addition=input.staged.additions[0],file=input.staged.files.find(entry=>entry.path.startsWith(paths.instruments+'/'));
  const instruments=JSON.parse(readFileSync(join(dirname(input.staged.manifestPath),file.stagedPath)));
  const instrument=instruments.instruments.find(row=>row.symbol==='ZNEW');instrument.cik='0001234567';instrument.issuerId='iss_cik_0001234567';
  const canonical={schema:'vu-canonical-v1',security:{securityId:'sec_ZNEW',ticker:'ZNEW'},dataSource:{isMock:false},facts:[{periodEnd:'2026-06-30',filedAt:'2026-08-07',availableAt:'2026-08-07'}]},index={companies:[{ticker:'ZNEW',securityId:'sec_ZNEW',cik:'0001234567',file:'canonical/ZNEW.json'}]};
  change(canonical,index);
  const canonicalPath='quant/data/sec/canonical/ZNEW.json'+(compressed?'.gz':''),indexPath='quant/data/sec/canonical_index.json';
  if(compressed)index.companies[0].file='canonical/ZNEW.json.gz';
  input.preparedFiles.push({path:file.path,bytes:Buffer.from(JSON.stringify(instruments))},{path:canonicalPath,bytes:compressed?gzipSync(JSON.stringify(canonical)):Buffer.from(JSON.stringify(canonical))},{path:indexPath,bytes:Buffer.from(JSON.stringify(index))});
  input.productizationReadiness[0].products.SEC={state:'PASS',artifactPaths:[canonicalPath,indexPath]};return input;
 });
 fixture(context=>{const {staged,qaProof}=attachSec(context);assert.equal(staged.productizationReadiness[0].products.SEC.state,'PASS');assert.equal(applyCanonicalPublication({root:context.root,staged,qaProof}).status,'APPLIED');});
 fixture(context=>{const {staged,qaProof}=attachSec(context,()=>{},true);assert.equal(staged.productizationReadiness[0].products.SEC.state,'PASS');assert.equal(applyCanonicalPublication({root:context.root,staged,qaProof}).status,'APPLIED');});
 for(const compressed of [false,true]) {
  fixture(context=>assert.throws(()=>attachSec(context,d=>{d.facts=[];},compressed),/SEC_READINESS_PIT_CHRONOLOGY_INVALID/));
  fixture(context=>assert.throws(()=>attachSec(context,d=>{d.facts=[{periodEnd:'2026-06-30',filedAt:'2026-05-07',availableAt:'2026-05-07'}];},compressed),/SEC_READINESS_PIT_CHRONOLOGY_INVALID/));
  fixture(context=>assert.throws(()=>attachSec(context,d=>{d.facts=[{periodEnd:'2026-06-30',filedAt:'2026-08-07',availableAt:'2026-10-03'}];},compressed),/SEC_READINESS_PIT_CHRONOLOGY_INVALID/));
  fixture(context=>{const {staged}=attachSec(context,d=>{d.facts=[{periodEnd:'2026-06-30',filedAt:'2026-08-07',availableAt:'2026-08-07'}];},compressed);assert.equal(staged.productizationReadiness[0].products.SEC.state,'PASS');});
 }

 for(const change of [(d,i)=>{i.companies[0].cik='0007654321';},(d,i)=>{i.companies[0].securityId='sec_OTHER';},(d,i)=>{i.companies[0].file='canonical/OTHER.json';},(d,i)=>{i.companies.push(i.companies[0]);},d=>{d.security.securityId='sec_OTHER';},d=>{d.security.ticker='OTHER';},d=>{d.security.isMock=true;},d=>{d.schema='invented';},d=>{d.dataSource.isMock=true;}])fixture(context=>{assert.throws(()=>attachSec(context,change),/SEC_READINESS_ISSUER_MISMATCH/);});
});

test('published factor history snapshots cannot be overwritten during product projection attachment', () => fixture((context) => {
  const path = 'quant/data/product/factor-evidence-history/vu-factor-evidence-2.0.0/2026-10-01.json.gz';
  mkdirSync(dirname(join(context.root, path)), { recursive: true });writeFileSync(join(context.root, path), gzipSync('{"immutable":true}'));
  const staged = context.attach(context.stage());
  assert.throws(() => attachCanonicalProjections({ root: context.root, staged, preparedFiles: [{ path, bytes: gzipSync('{"immutable":false}') }] }), /IMMUTABLE_FACTOR_SNAPSHOT_CHANGED/);
}));

test('product projection paths admit existing public formats and reject private history, raw SEC, code and routing', () => {
  assert.equal(isProductizationProjectionPath('quant/data/product/sic-peer-taxonomy-v1.json'),true);
  for(const shard of ['C-','F-','T-'])assert.equal(isProductizationProjectionPath('quant/data/product/factor-evidence-v1/'+shard+'.json.gz'),true);
  assert.equal(isProductizationProjectionPath('quant/data/sec/canonical/Q.json.gz'),true);
  assert.equal(isProductizationProjectionPath('quant/data/sec/consumer/index.json'),true);
  assert.equal(isProductizationProjectionPath('quant/data/fundamentals/history-coverage.json'),true);
  for (const path of ['quant/data/market/discover-series/ref_CART.json', 'quant/data/market/discover-series-long/ref_CART.json', 'screener/data/universe-US_REAL.json', 'quant/data/product/technical-signals-v1/signals-60.json.gz', 'quant/data/sec/consumer/CIK0001234567.json', 'quant/data/fundamentals/issuers/567.json', 'discover/data/stocks/US_REAL/CART.json', 'assets/logos/CART.svg', 'quant/data/market/capabilities/matrix.json', 'quant/data/market/capabilities/summary.json', 'quant/data/product/capabilities-v1.json', 'quant/data/product/capabilities-summary-v1.json', 'quant/data/product/strategy-index-v1.json.gz', 'quant/data/product/pattern-match-v1/CA.json.gz', 'quant/data/product/pattern-match-v1/C-.json.gz', 'quant/data/product/pattern-match-v1/summary.json']) assert.equal(isProductizationProjectionPath(path), true, path);
  for (const path of ['.market-cache/tiingo/daily/ref_CART.json', 'quant/data/market/daily/ref_CART.json', 'quant/data/sec/raw/CIK0001234567.json', 'scripts/market/tiingo2-publication.mjs', 'quant/config/feature-gates.json', 'quant/methodology/quant-v2.json', 'worker/src/routing.js', 'quant/data/technical/instruments/CART.json', 'assets/logos/../../worker.js', 'quant/data/market/capabilities/free-source-probe.json', 'quant/data/product/pattern-match-v1/raw-history.json', 'quant/data/product/strategy-index-v2.json.gz']) assert.equal(isProductizationProjectionPath(path), false, path);
});

test('attachment may reconcile new instrument SEC IDs but cannot rewrite baseline rows', () => fixture((context) => {
  const staged = context.attach(context.stage()), path = paths.instruments + '/KE.json';
  const baseline = JSON.parse(readFileSync(join(context.root, path))); baseline.instruments[0].companyName = 'Other issuer';
  assert.throws(() => attachCanonicalProjections({ root: context.root, staged, preparedFiles: [{ path, bytes: Buffer.from(JSON.stringify(baseline)) }] }), /BASELINE_ROW_CHANGED/);
}));

test('public per-security projections cannot introduce orphan securities outside the canonical stage', () => fixture((context) => {
  const staged = context.attach(context.stage());
  assert.throws(() => attachCanonicalProjections({ root: context.root, staged, preparedFiles: [{ path: 'quant/data/market/discover-series/ref_UNKNOWN.json', bytes: Buffer.from('{"ticker":"UNKNOWN"}') }] }), /UNSCOPED_PUBLIC_PRODUCT_PROJECTION/);
  assert.throws(() => attachCanonicalProjections({ root: context.root, staged, preparedFiles: [{ path: 'discover/data/stocks/US_REAL/UNKNOWN.json', bytes: Buffer.from('{"ticker":"UNKNOWN"}') }] }), /UNSCOPED_PUBLIC_PRODUCT_PROJECTION/);
}));

test('finalizer verification reads exact staged bytes and readiness without publication writes', () => fixture((context) => {
  const { staged } = productizationFixture(context), verified = verifyStagedCanonicalPublication({ root: context.root, staged });
  assert.equal(verified.status, 'VERIFIED_READ_ONLY');assert.equal(verified.manifestSha256, staged.manifestSha256);
  assert.equal(verified.productReadinessSha256, staged.productizationReadinessSha256);assert.equal(verified.productionMutations, 0);
  assert.equal(existsSync(join(context.output, 'applied.json')), false);
  for (const [path, hash] of Object.entries(context.baselineHashes)) assert.equal(sha(readFileSync(join(context.root, path))), hash);
  const chart = staged.files.find((entry) => entry.path.startsWith('quant/data/market/discover-series/'));
  writeFileSync(join(context.output, chart.stagedPath), '{}');
  assert.throws(() => verifyStagedCanonicalPublication({ root: context.root, staged }), /STAGED_CONTENT_INTEGRITY_FAILED/);
}));
