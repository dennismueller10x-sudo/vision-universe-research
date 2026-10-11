import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadEvidenceDirectory, compileEuropeEvidence, writePrivateEquityEvidence, refreshPrivateEquityMetadata, recordPrivateEquityConsumerReplay, applyPrivateAdjustmentCorrection, readOfficialIdentities, readIndexReferences } from '../../../scripts/marketstack/europe-build-evidence.mjs';
const require = createRequire(import.meta.url);
const { normalizeObservation } = require('../audit-adapter.js');
const hash = value => createHash('sha256').update(value).digest('hex');
const isin = 'NL0000235190', lei = 'MINO79WLOO247M1IL051', now = '2026-10-08T16:00:00Z';
const calendar = { verified: true, mic: 'XPAR', source: 'TEST_EXCHANGE_CALENDAR_EXPLICIT_SESSIONS',
  expectedLastCompletedSession: '2026-10-08', expectedSessions: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'] };
function official(extra = {}) { return { isin, lei, verified: true, issuerCountry: 'NL', legalJurisdiction: 'NL',
  issuerCountryBasis: 'GLEIF_ENTITY_JURISDICTION', entityCategory: 'GENERAL', entityStatus: 'ACTIVE',
  primaryMarketMic: 'XPAR', primaryMic: 'XPAR', mic: 'XETR', active: true, securityType: 'equity',
  officialInstrumentType: 'CS', typeSource: 'XETRA_REFERENCE', providerMnemonic: 'AIR',
  provenance: { source: 'OFFICIAL_TEST_ISIN_REGISTER', gleif: { url: 'https://example.test/gleif?isin=' + isin,
    httpStatus: 200, queryIsin: isin, sha256: 'a'.repeat(64) }, xetra: { url: 'https://example.test/xetra', sha256: 'b'.repeat(64) } }, ...extra }; }
function metadata(symbol = 'AIR.PA', extra = {}) { return { symbol, isin, name: 'Airbus SE', asset_type: 'equity',
  stock_exchange: { mic: 'XPAR' }, stock_exchanges: [{ mic: 'XPAR' }], currency: 'EUR', ...extra }; }
function bar(date = '2026-10-08', extra = {}) { return { symbol: 'AIR.PA', exchange: 'XPAR', currency: 'EUR', date: date + 'T00:00:00Z',
  open: 100, high: 105, low: 99, close: 104, volume: 250000, ...extra }; }
function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), 'vu-europe-compiler-test-')); mkdirSync(join(root, 'raw')); mkdirSync(join(root, 'normalized'));
  const manifest = [], results = [];
  entries.forEach(({ op, rows, mutate, status = 200, ok = true, complete = true }, ordinal) => {
    const id = String(ordinal + 1).padStart(6, '0'), body = JSON.stringify({ data: rows,
      ...(op.kind === 'history' ? { pagination: { offset: 0, count: rows.length, total: rows.length, limit: 1000 } } : {}) });
    writeFileSync(join(root, 'raw', id + '.json'), body);
    manifest.push({ id, host: 'api.marketstack.com', apiVersion: 'v2', endpoint: op.kind === 'metadata' ? '/tickers/' + op.symbol : op.kind === 'history' ? '/eod' : '/eod/latest',
      params: op.kind === 'metadata' ? {} : { exchange: op.mic || op.listing?.mic, symbols: (op.symbols || [op.listing?.providerTicker]).join(','),
        ...(op.kind === 'history' ? { date_from: op.from, date_to: op.to } : {}) },
      status, retrievedAt: now, sha256: hash(body) });
    const observations = rows.map(row => normalizeObservation(row, { kind: op.kind === 'metadata' ? 'METADATA' : 'EOD', retrievedAt: now }));
    const result = { ok, complete, [op.kind === 'metadata' ? 'observations' : 'data']: observations };
    if (mutate) mutate(observations, result);
    const resultPath = 'normalized/' + String(ordinal).padStart(6, '0') + '.json';
    writeFileSync(join(root, resultPath), JSON.stringify({ ordinal, operation: op, responseIds: [id], result }));
    results.push({ ordinal, operation: op, responseIds: [id], resultPath });
  });
  writeFileSync(join(root, 'raw-manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(root, 'summary.json'), JSON.stringify({ version: 'marketstack-europe-ingestion-1', lease: 'test-private-only', generatedAt: now, results }));
  return root;
}
const metaOp = symbol => ({ kind: 'metadata', symbol, mic: 'XPAR', expectedIsin: isin, assetKind: 'EQUITY' });
const latestOp = { kind: 'latest', listing: { mic: 'XPAR', providerTicker: 'AIR.PA' } };
function compile(entries, extra = {}) {
  const root = fixture(entries);
  try { return compileEuropeEvidence({ evidence: [loadEvidenceDirectory(root)], officialIdentity: { rows: [official()], manifests: [] },
    calendars: { XPAR: calendar }, now, ...extra }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
const basic = (latest = bar()) => [{ op: metaOp('AIR.PA'), rows: [metadata()] }, { op: latestOp, rows: [latest] }];
const sap = 'DE0007164600';
const germanyOfficial = (extra = {}) => official({ isin: sap, lei: '529900D6BF99LW9R2E68', issuerCountry: 'DE', legalJurisdiction: 'DE',
  mic: 'XETR', primaryMic: 'XETR', primaryMarketMic: 'XFRA', listingCurrency: 'EUR', providerMnemonic: 'SAP', nativeMnemonicVerifiedUnique: true,
  regulatoryLiquid: true, productPrimaryPolicy: 'GERMANY_LIQUID_LOCAL_XETRA',
  provenance: { source: 'OFFICIAL_TEST_GERMAN_CLASS', gleif: { httpStatus: 200, queryIsin: sap, url: 'https://api.gleif.org/api/v1/lei-records?filter[isin]=' + sap, sha256: 'a'.repeat(64) },
    xetra: { url: 'https://example.test/xetra.csv', sha256: 'b'.repeat(64) } }, ...extra });
const germanMetadata = (extra = {}) => metadata('SAP.DE', { isin: sap, item_type: 'equity', stock_exchange: { mic: 'XETR' }, stock_exchanges: [{ mic: 'XETR' }], ...extra });
const germanMetaOp = { kind: 'metadata', symbol: 'SAP.DE', mic: 'XETR', expectedIsin: sap, assetKind: 'EQUITY' };
const germanLatestOp = { kind: 'latest', listing: { mic: 'XETR', providerTicker: 'SAP.DE' } };
const germanBar = (date = '2026-10-08', extra = {}) => bar(date, { symbol: 'SAP.DE', exchange: 'XETR', ...extra });
function compileGerman(entries, extra = {}) { return compile(entries, { officialIdentity: { rows: [germanyOfficial()] },
  calendars: { XETR: { ...calendar, mic: 'XETR' } }, ...extra }); }

test('exact official class and issuer plus valid scoped local EOD admit privately; unknown ordinary/preferred stays explicit', () => {
  const result = compile(basic()), c = result.universe.candidates[0];
  assert.equal(c.status, 'ACCEPTED'); assert.equal(c.kind, 'EQUITY_SHARE_CLASS'); assert.equal(c.shareClassDetail, 'UNKNOWN');
  assert.equal(c.issuerCountry, 'NL'); assert.equal(c.mic, 'XPAR'); assert.equal(c.currency, 'EUR');
  assert.equal(c.identityEvidence[0].homeActivityEvidence.validPrice, true);
  assert.equal(result.productRows[0].readiness.LATEST_EOD, 'CURRENT');
  assert.equal(result.productRows[0].publicationAllowed, false); assert.equal(result.productRows[0].readiness.QUANT, 'QUANT_BLOCKED');
  assert.equal(result.productRows[0].readiness.SUPERTRADER, 'SUPERTRADER_BLOCKED');
  assert.equal(result.outputs.marketstack_europe_equity_universe.mode, 'PRIVATE_RESEARCH');
  assert.equal(result.outputs.marketstack_europe_equity_universe.listings[0].identityEvidence[0].verified, true);
});

test('a home CHF quote cannot inherit the same-class Xetra EUR reference currency', () => {
  const swIsin = 'CH0012221716', swSymbol = 'ABBN.SW';
  const rows = [{ op: { ...metaOp(swSymbol), mic: 'XSWX', expectedIsin: swIsin },
    rows: [metadata(swSymbol, { isin: swIsin, currency: 'CHF', stock_exchange: { mic: 'XSWX' }, stock_exchanges: [{ mic: 'XSWX' }] })] },
    { op: { kind: 'latest', listing: { mic: 'XSWX', providerTicker: swSymbol } },
      rows: [bar('2026-10-08', { symbol: swSymbol, exchange: 'XSWX', currency: 'CHF' })] }];
  const result = compile(rows, { officialIdentity: { rows: [official({ isin: swIsin, issuerCountry: 'CH', legalJurisdiction: 'CH',
    primaryMic: 'XSWX', primaryMarketMic: 'XSWX', listingCurrency: 'EUR',
    provenance: { ...official().provenance, gleif: { ...official().provenance.gleif, queryIsin: swIsin } } })] },
    calendars: { XSWX: { ...calendar, mic: 'XSWX' } } });
  const c = result.universe.candidates[0]; assert.equal(c.status, 'ACCEPTED', JSON.stringify(c.reasons)); assert.equal(c.currency, 'CHF');
  assert.equal(c.identityEvidence[0].listingCurrency, null); assert.equal(c.identityEvidence[0].officialReferenceCurrency, 'EUR');
  assert.equal(c.identityEvidence[0].officialReferenceMic, 'XETR');
  assert.equal(result.outputs.marketstack_europe_core_projection.series[0].provenance.priceCurrencyBasis, 'PROVIDER_REPORTED');
});

test('immediately prior verified session proves recent activity but contributes zero fresh listings', () => {
  const result = compile(basic(bar('2026-10-07')));
  assert.equal(result.universe.candidates[0].status, 'ACCEPTED');
  assert.equal(result.productRows[0].readiness.LATEST_EOD, 'DELAYED');
  assert.equal(result.productRows[0].readiness.CHART, 'CHART_LIMITED');
  assert.equal(result.outputs.marketstack_europe_evidence_summary.europe.freshEod, 0);
});

test('older home price, impossible OHLC, negative price, zero volume, absent currency and wrong MIC cannot establish activity', () => {
  for (const raw of [bar('2026-10-06'), bar('2026-10-08', { high: 90 }), bar('2026-10-08', { close: -1 }),
    bar('2026-10-08', { volume: 0 }), bar('2026-10-08', { currency: null }), bar('2026-10-08', { exchange: 'XLON' })]) {
    const result = compile(basic(raw)); assert.equal(result.universe.candidates[0].status, 'REVIEW', JSON.stringify(raw));
  }
  assert.equal(compile(basic(), { calendars: { XPAR: { ...calendar, mic: 'XETR' } } }).universe.candidates[0].status, 'REVIEW');
});

test('official reference primary MIC must match exactly, and inactive/ETF metadata cannot bypass classification', () => {
  assert.equal(compile(basic(), { officialIdentity: { rows: [official({ primaryMarketMic: 'XLON' })] } }).universe.candidates[0].status, 'REVIEW');
  for (const extra of [{ active: false }, { asset_type: 'ETF' }]) {
    const result = compile([{ op: metaOp('AIR.PA'), rows: [metadata('AIR.PA', extra)] }, { op: latestOp, rows: [bar()] }]);
    assert.equal(result.universe.candidates[0].status, 'REJECTED');
  }
});

test('a singular foreign provider MIC cannot be erased by a plural requested-home venue array', () => {
  const result = compile([{ op: metaOp('AIR.PA'), rows: [metadata('AIR.PA', { stock_exchange: { mic: 'XNAS' }, stock_exchanges: [{ mic: 'XPAR' }] })] },
    { op: latestOp, rows: [bar()] }]);
  assert.equal(result.universe.candidates[0].status, 'REVIEW'); assert.equal(result.universe.metadataFailures.length, 1);
  assert.equal(result.outputs.marketstack_europe_evidence_summary.europe.companies, 0);
});

test('verified exact ISIN/MIC aliases collapse while distinct classes and name-only rows do not', () => {
  const rows = basic(); rows.splice(1, 0, { op: metaOp('AIR.XPAR'), rows: [metadata('AIR.XPAR')] });
  const result = compile(rows); assert.equal(result.universe.securities.length, 1); assert.equal(result.universe.candidates.length, 1);
  assert.deepEqual(result.universe.aliasGroups[0].symbols, ['AIR.PA', 'AIR.XPAR']);
  assert.ok(result.universe.securities[0].aliases.includes('AIR.XPAR'));
  assert.equal(result.universe.candidates[0].observations.length, 2);
  const unresolved = compile(rows, { officialIdentity: { rows: [] } });
  assert.equal(unresolved.universe.candidates.length, 2); assert.equal(unresolved.universe.securities.length, 0);
});

test('tampered normalized ISIN, MIC, close and as-of are quarantined over intact hash-verified raw responses', () => {
  const mutations = [x => { x[0].normalized.isin = 'DE0007164600'; }, x => { x[0].normalized.providerExchange = 'XLON'; },
    x => { x[0].normalized.close = 999; }, x => { x[0].normalized.tradingDate = '2026-10-09'; }];
  for (const mutate of mutations) {
    const root = fixture([{ op: latestOp, rows: [bar()], mutate }]);
    try { const evidence = loadEvidenceDirectory(root); assert.equal(evidence.operations[0].observations.length, 0);
      assert.equal(evidence.quarantined[0].reason, 'NORMALIZED_FIELD_DIFFERS_FROM_AUTHENTICATED_RAW'); }
    finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('raw hash tampering fails closed; HTTP504 bodies and wrong request scope cannot become price evidence', () => {
  const root = fixture([{ op: latestOp, rows: [bar()] }]);
  try { writeFileSync(join(root, 'raw', '000001.json'), '{}'); assert.throws(() => loadEvidenceDirectory(root), /RAW_HASH_MISMATCH/); }
  finally { rmSync(root, { recursive: true, force: true }); }
  const failed = compile([{ op: metaOp('AIR.PA'), rows: [metadata()] }, { op: latestOp, rows: [bar()], status: 504, ok: false }]);
  assert.equal(failed.universe.candidates[0].status, 'REVIEW');
  const wrong = fixture([{ op: latestOp, rows: [bar()] }]);
  try { const path = join(wrong, 'raw-manifest.json'), manifest = JSON.parse(readFileSync(path));
    manifest[0].params.exchange = 'XLON'; writeFileSync(path, JSON.stringify(manifest));
    assert.equal(loadEvidenceDirectory(wrong).operations[0].observations.length, 0); }
  finally { rmSync(wrong, { recursive: true, force: true }); }
});

test('normalization cannot omit ambiguous latest rows or an invalid historical bar from authenticated responses', () => {
  const ambiguous = compile([{ op: metaOp('AIR.PA'), rows: [metadata()] },
    { op: latestOp, rows: [bar(), bar('2026-10-08', { close: 103 })], mutate: x => x.pop() }]);
  assert.equal(ambiguous.universe.candidates[0].status, 'REVIEW');
  assert.ok(ambiguous.outputs.marketstack_europe_evidence_summary.quarantine.some(q => q.reason === 'NORMALIZED_RAW_MULTISET_DIFFERS_FROM_SCOPED_RESPONSE'));
  const historyOp = { kind: 'history', listing: { mic: 'XPAR', providerTicker: 'AIR.PA' }, from: '2026-10-05', to: '2026-10-08' };
  const historical = compile([...basic(), { op: historyOp, rows: [bar('2026-10-05'), bar('2026-10-06', { close: -1 }), bar('2026-10-08')], mutate: x => x.splice(1, 1) }]);
  assert.ok(historical.outputs.marketstack_europe_evidence_summary.quarantine.some(q => q.reason === 'NORMALIZED_RAW_MULTISET_DIFFERS_FROM_SCOPED_RESPONSE'));
  assert.notEqual(historical.productRows[0].readiness.CHART, 'CHART_READY');
  assert.equal(historical.outputs.marketstack_europe_core_projection.series[0].points.length, 1);
});

test('latestBatch cannot arbitrarily partition an ambiguous raw symbol into accepted and rejected observations', () => {
  const op = { kind: 'latestBatch', mic: 'XPAR', symbols: ['AIR.PA'] };
  const result = compile([{ op: metaOp('AIR.PA'), rows: [metadata()] }, { op, rows: [bar(), bar('2026-10-08', { close: 103 })],
    mutate: (data, result) => { result.rejectedObservations = [data.pop()]; } }]);
  assert.equal(result.universe.candidates[0].status, 'REVIEW');
  assert.ok(result.outputs.marketstack_europe_evidence_summary.quarantine.some(q => q.reason === 'LATEST_BATCH_NORMALIZATION_PARTITION_MISMATCH'));
});

test('a historical invalid bar cannot be hidden in a fabricated latestBatch-only rejected partition', () => {
  const op = { kind: 'history', listing: { mic: 'XPAR', providerTicker: 'AIR.PA' }, from: '2026-10-05', to: '2026-10-08' };
  const result = compile([...basic(), { op, rows: [bar('2026-10-05'), bar('2026-10-06', { close: -1 }), bar('2026-10-08')],
    mutate: (data, result) => { result.rejectedObservations = data.splice(1, 1); } }]);
  assert.ok(result.outputs.marketstack_europe_evidence_summary.quarantine.some(q => q.reason === 'UNEXPECTED_REJECTED_OBSERVATIONS_OUTSIDE_LATEST_BATCH'));
  assert.notEqual(result.productRows[0].readiness.CHART, 'CHART_READY');
});

test('future, uncompleted and out-of-request historical dates remain quarantined and cannot produce ready charts', () => {
  const historyOp = { kind: 'history', listing: { mic: 'XPAR', providerTicker: 'AIR.PA' }, from: '2026-10-06', to: '2026-10-08' };
  const result = compile([...basic(), { op: historyOp, rows: [bar('2026-10-05'), bar('2026-10-06'), bar('2026-10-08'), bar('2026-10-09')] }]);
  const q = result.outputs.marketstack_europe_price_quality.rows[0].quality;
  assert.equal(q.counts.raw, 4); assert.equal(q.counts.quarantined, 2);
  assert.ok(q.quarantine.some(row => row.reasons.includes('FUTURE_EOD_DATE')));
  assert.ok(q.quarantine.some(row => row.reasons.includes('OUTSIDE_REQUESTED_RANGE')));
  assert.notEqual(result.productRows[0].readiness.CHART, 'CHART_READY');
});

test('contemporaneous verified aliases with contradictory prices have INVALID latest and no freshness promotion', () => {
  const result = compile([{ op: metaOp('AIR.PA'), rows: [metadata()] }, { op: metaOp('AIR.XPAR'), rows: [metadata('AIR.XPAR')] },
    { op: latestOp, rows: [bar()] }, { op: { kind: 'latest', listing: { mic: 'XPAR', providerTicker: 'AIR.XPAR' } },
      rows: [bar('2026-10-08', { symbol: 'AIR.XPAR', close: 103 })] }]);
  assert.equal(result.universe.candidates[0].status, 'REVIEW');
  assert.equal(result.productRows[0].readiness.LATEST_EOD, 'INVALID');
  assert.equal(result.outputs.marketstack_europe_evidence_summary.europe.freshEod, 0);
  assert.deepEqual(result.outputs.marketstack_europe_price_quality.rows[0].conflicts, ['LATEST_ALIAS_PRICE_CONFLICT']);
});

test('Core projection merges actual newer EOD with historical bars but a same-date contradiction is withheld', () => {
  const historyOp = { kind: 'history', listing: { mic: 'XPAR', providerTicker: 'AIR.PA' }, from: '2026-10-06', to: '2026-10-08' };
  const result = compile([...basic(), { op: historyOp, rows: [bar('2026-10-06'), bar('2026-10-07')] }]);
  const series = result.outputs.marketstack_europe_core_projection.series[0];
  assert.equal(series.points.length, 3); assert.deepEqual(series.points.at(-1), ['2026-10-08', 104]); assert.equal(series.basis, 'RAW_UNADJUSTED');
  const projected = result.outputs.marketstack_europe_core_projection.listingEvidence[series.listingId].technical;
  assert.equal(projected.status, 'TECHNICAL_PARTIAL'); assert.equal(projected.researchStatus, 'RAW_RESEARCH_ONLY');
  assert.equal(projected.securityId, series.securityId); assert.equal(projected.listingId, series.listingId);
  assert.equal(projected.asOf, '2026-10-08'); assert.equal(projected.currency, series.currency);
  assert.match(projected.methodology, /^EXISTING_ENGINE:/);
  assert.equal(projected.methodologyEvidence.parametersSource, 'UNCHANGED_ENGINE_DEFAULTS');
  assert.equal(projected.metrics.sma20, null); assert.equal(projected.metrics.relativeStrength, null);
  assert.equal(projected.quantReady, false); assert.equal(result.productRows[0].readiness.QUANT, 'QUANT_BLOCKED');
  const conflicting = compile([...basic(), { op: historyOp, rows: [bar('2026-10-06'), bar('2026-10-08', { close: 103 })] }]);
  assert.equal(conflicting.outputs.marketstack_europe_core_projection.series.length, 0);
  assert.equal(conflicting.outputs.marketstack_europe_core_projection.listingEvidence[series.listingId].technical, null);
  assert.deepEqual(conflicting.outputs.marketstack_europe_price_quality.rows[0].conflicts, ['LATEST_HISTORY_BAR_CONFLICT']);
});

test('index coverage uses exact valid current official ISIN roster; unresolved indices remain null', () => {
  const reference = { index: 'AEX', referenceVerified: true, sourceContentVerified: true, rosterExtractionVerified: true, asOf: '2026-10-08',
    targetBasis: 'ACTUAL_OFFICIAL_COMPONENT_ROWS', source: { url: 'https://example.test/current-roster', sha256: 'a'.repeat(64) },
    rows: [{ isin }, { isin: 'DE0007164600' }] };
  const result = compile(basic(), { indexReferences: [reference] });
  const aex = result.indexCoverage.find(r => r.index === 'AEX'); assert.equal(aex.target, 2); assert.equal(aex.mapped, 1); assert.equal(aex.missing, 1);
  assert.equal(result.indexCoverage.find(r => r.index === 'DAX').mapped, null);
  const invalid = compile(basic(), { indexReferences: [{ ...reference, asOf: '2026-09-99' }] });
  assert.equal(invalid.indexCoverage.find(r => r.index === 'AEX').mapped, null);
});

test('private writer produces all nine required equity artifacts and independently verifiable hashes', () => {
  const root = mkdtempSync(join(tmpdir(), 'vu-europe-output-test-'));
  try { const manifest = writePrivateEquityEvidence(compile(basic()), root); assert.equal(manifest.publicationAllowed, false);
    assert.equal(manifest.files.length, 12);
    for (const file of manifest.files) assert.equal(hash(readFileSync(join(root, file.name))), file.sha256);
    assert.throws(() => writePrivateEquityEvidence(compile(basic()), join(process.cwd(), 'data/compiler-output')), /OUTSIDE_REPOSITORY/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('reference-only refresh verifies prior output hashes and joins exact ISIN without changing admitted identity or price proofs', () => {
  const root = mkdtempSync(join(tmpdir(), 'vu-europe-metadata-refresh-'));
  try {
    const before = writePrivateEquityEvidence(compile(basic()), root);
    const price = readFileSync(join(root, 'marketstack_europe_price_quality.json'));
    const reference = { index: 'IBEX35', referenceVerified: true, sourceContentVerified: true, rosterExtractionVerified: true,
      asOf: '2026-10-08', source: { url: 'https://example.test/verified-roster', sha256: 'a'.repeat(64) }, rows: [{ isin }] };
    refreshPrivateEquityMetadata(root, { indexReferences: [reference], centralLogos: false, now });
    assert.deepEqual(readFileSync(join(root, 'marketstack_europe_price_quality.json')), price);
    const universe = JSON.parse(readFileSync(join(root, 'marketstack_europe_equity_universe.json')));
    assert.equal(universe.summary.accepted, 1); assert.equal(universe.listings[0].indexMembership[0].index, 'IBEX35');
    const coverage = JSON.parse(readFileSync(join(root, 'marketstack_europe_index_coverage.json'))).rows.find(r => r.index === 'IBEX35');
    assert.equal(coverage.mapped, 1); assert.equal(coverage.target, 1);
    const summary = JSON.parse(readFileSync(join(root, 'marketstack_europe_evidence_summary.json')));
    assert.equal(summary.metadataRefresh.admissionAndPriceEvidenceUnchanged, true);
    assert.equal(summary.metadataRefresh.previousManifestSha256.length, 64);
    const path = join(root, before.files[0].name); writeFileSync(path, '{}');
    assert.throws(() => refreshPrivateEquityMetadata(root, { centralLogos: false, now }), /PRIVATE_OUTPUT_HASH_MISMATCH/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('consumer replay records private actual readiness only with exact prior manifest and canonical ID sets, preserving series hashes', () => {
  const root = mkdtempSync(join(tmpdir(), 'vu-europe-consumer-record-'));
  try {
    const built = compile(basic()); writePrivateEquityEvidence(built, root);
    const manifestBytes = readFileSync(join(root, 'evidence-output-manifest.json'));
    const projectionBytes = readFileSync(join(root, 'marketstack_europe_core_projection.json'));
    const l = built.universe.listings[0], report = { mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
      status: 'PRIVATE_CONTRACT_REPLAY_PASSED', generatedAt: now, inputManifest: { sha256: hash(manifestBytes) },
      providerRequests: 0, providerCredits: 0, publicLoaderCalls: 0, usCalls: 0, summary: {},
      securities: [{ securityId: l.securityId, identity: 'AVAILABLE', publicationAllowed: false,
        watchlist: { passed: true }, missingSearchFields: [], searches: [{ passed: true, resultCount: 1 }],
        readiness: { DISCOVER: 'BLOCKED', SCREENER: 'BLOCKED', BACKTEST: 'RESEARCH_ONLY' } }],
      charts: [{ securityId: l.securityId, listingId: l.listingKey, publicationAllowed: false, basis: 'RAW_UNADJUSTED',
        state: 'AVAILABLE', chartStatus: 'CHART_LIMITED', technical: { state: 'UNAVAILABLE' } }] };
    const path = join(root, 'consumer-replay.json');
    const write = value => { const text = JSON.stringify(value); writeFileSync(path, text); return hash(text); };
    assert.throws(() => recordPrivateEquityConsumerReplay(root, path, write({ ...report, inputManifest: { sha256: '0'.repeat(64) } })), /SCOPE_MISMATCH/);
    assert.throws(() => recordPrivateEquityConsumerReplay(root, path, write({ ...report, securities: [] })), /SECURITY_SET_MISMATCH/);
    assert.throws(() => recordPrivateEquityConsumerReplay(root, path, '0'.repeat(64)), /HASH_MISMATCH/);
    recordPrivateEquityConsumerReplay(root, path, write(report));
    assert.deepEqual(readFileSync(join(root, 'marketstack_europe_core_projection.json')), projectionBytes);
    const row = JSON.parse(readFileSync(join(root, 'marketstack_europe_product_readiness.json'))).rows[0];
    assert.equal(row.consumerReplay, 'REPLAY_PASSED'); assert.equal(row.readiness.SEARCH, 'SEARCH_READY');
    assert.equal(row.readiness.WATCHLIST, 'WATCHLIST_READY'); assert.equal(row.readiness.SCREENER, 'SCREENER_BLOCKED');
    assert.equal(row.readiness.TECHNICAL, 'TECHNICAL_BLOCKED'); assert.equal(row.publicationAllowed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('adjustment correction binds exact source rows and counts, preserves raw price series, and rejects certification or price tampering', () => {
  const root = mkdtempSync(join(tmpdir(), 'vu-europe-adjustment-record-'));
  try {
    const built = compile(basic()), old = built.outputs.marketstack_europe_adjustment_status.rows[0];
    writePrivateEquityEvidence(built, root);
    const parentManifest = hash(readFileSync(join(root, 'evidence-output-manifest.json')));
    const fileHash = name => hash(readFileSync(join(root, name + '.json')));
    const q = built.outputs.marketstack_europe_price_quality.rows[0], before = JSON.stringify(built.outputs.marketstack_europe_core_projection.series);
    const row = { listingKey: old.listingKey, identityStatus: old.identityStatus, previousStatus: old.status,
      oldPriceproofSha: hash(JSON.stringify(q)), oldClassificationSha: hash(JSON.stringify(old)),
      classification: { status: 'ADJUSTMENT_UNKNOWN', useProviderAdjusted: false, coverage: { providerBasisCertified: false } },
      rawDiagnostic: { scope: 'FULL_AUTHENTICATED_OPERATION_ROWS_BEFORE_RAW_PRICE_QUARANTINE', admittedBasis: 'VALID_RAW_OHLC_PRICE_SCOPE_ONLY',
        noAdjustedFieldRepair: true, rawPriceQuarantineCount: 0, invalidOnValidRaw: [], invalidOnQuarantinedRaw: [],
        classification: { status: 'ADJUSTMENT_UNKNOWN', useProviderAdjusted: false } },
      validation: { unchangedPriceGateCounts: true, counts: q.quality.counts, corporateActionStatusPreserved: old.corporateActions.status,
        sourceNormalizedSha256: q.provenance.latest.normalizedSha256,
        rawResponseHashes: q.provenance.latest.responses.map(r => ({ id: r.id, sha256: r.sha256 })) } };
    const correction = { sourceGeneration: now, mode: 'PRIVATE_RESEARCH', publicationAllowed: false, productionWrites: 0, errors: [],
      oldPriceQualityFileSha256: fileHash('marketstack_europe_price_quality'), oldAdjustmentFileSha256: fileHash('marketstack_europe_adjustment_status'), rows: [row] };
    const path = join(root, 'adjustment-map.json'), write = value => { const bytes = JSON.stringify(value); writeFileSync(path, bytes); return hash(bytes); };
    assert.throws(() => applyPrivateAdjustmentCorrection(root, path, write(correction), '0'.repeat(64)), /MANIFEST_MISMATCH/);
    assert.throws(() => applyPrivateAdjustmentCorrection(root, path, write({ ...correction, rows: [{ ...row, oldPriceproofSha: '0'.repeat(64) }] }), parentManifest), /ROW_MISMATCH/);
    assert.throws(() => applyPrivateAdjustmentCorrection(root, path, write({ ...correction, rows: [{ ...row, classification: { status: 'ADJUSTMENT_CERTIFIED', useProviderAdjusted: true } }] }), parentManifest), /ROW_MISMATCH/);
    assert.throws(() => applyPrivateAdjustmentCorrection(root, path, write({ ...correction, rows: [{ ...row, rawDiagnostic: null }] }), parentManifest), /RAW_DIAGNOSTIC_MISMATCH/);
    applyPrivateAdjustmentCorrection(root, path, write(correction), parentManifest);
    const projection = JSON.parse(readFileSync(join(root, 'marketstack_europe_core_projection.json')));
    assert.equal(JSON.stringify(projection.series), before);
    assert.equal(fileHash('marketstack_europe_price_quality'), correction.oldPriceQualityFileSha256);
    assert.equal(projection.listingEvidence[row.listingKey].adjustment.status, 'ADJUSTMENT_UNKNOWN');
    const adjusted = JSON.parse(readFileSync(join(root, 'marketstack_europe_adjustment_status.json'))).rows[0];
    assert.deepEqual(adjusted.rawAdjustedDiagnostic, row.rawDiagnostic);
    const product = JSON.parse(readFileSync(join(root, 'marketstack_europe_product_readiness.json'))).rows[0];
    assert.equal(product.consumerReplay, 'REPLAY_REVALIDATION_PENDING'); assert.equal(product.readiness.QUANT, 'QUANT_BLOCKED');
    assert.equal(product.publicationAllowed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('normal compilation preserves full RAW adjusted failures beside partial admitted-series coverage', () => {
  const op = { kind: 'history', listing: { mic: 'XPAR', providerTicker: 'AIR.PA' }, from: '2026-10-06', to: '2026-10-08' };
  const result = compile([...basic(), { op, rows: [bar('2026-10-06', { adj_close: 103, adj_open: null, adj_high: null, adj_low: null }),
    bar('2026-10-07', { close: -1, adj_close: -1 }), bar('2026-10-08', { adj_close: 104, adj_open: null, adj_high: null, adj_low: null })] }]);
  const adjusted = result.outputs.marketstack_europe_adjustment_status.rows[0];
  assert.equal(adjusted.status, 'ADJUSTMENT_PARTIAL'); assert.equal(adjusted.useProviderAdjusted, false);
  assert.equal(adjusted.rawAdjustedDiagnostic.classification.status, 'ADJUSTMENT_INVALID');
  assert.equal(adjusted.rawAdjustedDiagnostic.invalidOnValidRaw.length, 0);
  assert.equal(adjusted.rawAdjustedDiagnostic.invalidOnQuarantinedRaw.length, 1);
  assert.equal(adjusted.rawAdjustedDiagnostic.noAdjustedFieldRepair, true);
  const core = result.outputs.marketstack_europe_core_projection.listingEvidence[result.universe.listings[0].listingKey];
  assert.match(core.adjustment.rawDiagnosticEvidenceRef, /^marketstack_europe_adjustment_status\.json#/);
  assert.equal(result.productRows[0].readiness.QUANT, 'QUANT_BLOCKED');
});

test('official reader binds issuer and cash-share facts to actual GLEIF and Xetra source bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'vu-europe-official-test-'));
  try {
    const queryUrl = 'https://api.gleif.org/api/v1/lei-records?filter%5Bisin%5D=' + isin;
    const gleif = JSON.stringify({ links: { first: queryUrl }, data: [{ id: lei, attributes: { lei, entity: { jurisdiction: 'NL', category: 'GENERAL', status: 'ACTIVE' } } }] });
    const xetra = 'Market:;XETR\nISIN;MIC Code;Instrument Type;Primary Market MIC Code;Instrument Status;Product Status;Regulatory Liquid Instrument;Mnemonic;Currency;First Trading Date\n' + isin + ';XETR;CS;XPAR;Active;Active;Y;AIR;EUR;2001-09-05\n';
    const xetraPath = join(root, 'xetra.csv'); writeFileSync(xetraPath, xetra); writeFileSync(join(root, isin + '.gleif.raw.json'), gleif);
    const row = official(); row.provenance.gleif.url = queryUrl; row.provenance.gleif.sha256 = hash(gleif); row.provenance.xetra.sha256 = hash(xetra); row.provenance.xetra.path = xetraPath;
    const path = join(root, 'identity.json'); writeFileSync(path, JSON.stringify({ rows: [row], complete: true }));
    assert.equal(readOfficialIdentities([path]).rows.length, 1);
    writeFileSync(path, JSON.stringify({ rows: [{ ...row, issuerCountry: 'DE', legalJurisdiction: 'DE' }] }));
    const conflict = readOfficialIdentities([path]); assert.equal(conflict.rows.length, 0); assert.equal(conflict.quarantined[0].reason, 'OFFICIAL_GLEIF_ENTITY_FACT_CONFLICT');
    const wrongIsin = 'DE0007164600'; writeFileSync(join(root, wrongIsin + '.gleif.raw.json'), gleif);
    const copied = structuredClone(row); copied.isin = wrongIsin; copied.provenance.gleif.queryIsin = wrongIsin;
    copied.provenance.gleif.url = queryUrl.replace(isin, wrongIsin);
    writeFileSync(path, JSON.stringify({ rows: [copied] }));
    assert.equal(readOfficialIdentities([path]).quarantined[0].reason, 'OFFICIAL_GLEIF_RAW_QUERY_ISIN_CONFLICT');
    writeFileSync(path, JSON.stringify({ rows: [{ ...row, officialInstrumentType: 'ETF' }] }));
    assert.equal(readOfficialIdentities([path]).quarantined[0].reason, 'OFFICIAL_XETRA_CLASS_FACT_CONFLICT');
    writeFileSync(path, JSON.stringify({ rows: [row] })); writeFileSync(join(root, isin + '.gleif.raw.json'), '{}');
    assert.throws(() => readOfficialIdentities([path]), /OFFICIAL_GLEIF_RAW_HASH_MISMATCH/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('current official roster extraction is bound to raw exact ISINs and completeness, rejecting edited or omitted members', () => {
  const root = mkdtempSync(join(tmpdir(), 'vu-index-reference-test-'));
  try {
    const raw = JSON.stringify({ data: [{ isin }, { isin: 'DE0007164600' }], recordsTotal: 2 }), rawPath = join(root, 'raw.json');
    writeFileSync(rawPath, raw); const path = join(root, 'roster.json');
    const doc = { index: 'DAX', target: 2, referenceVerified: true, rows: [{ isin }, { isin: 'DE0007164600' }],
      source: { url: 'https://api.live.deutsche-boerse.com/v1/search/equity_search', path: rawPath, sha256: hash(raw),
        requestBody: { indices: ['DE0008469008'], offset: 0, limit: 100 } } };
    writeFileSync(path, JSON.stringify(doc)); assert.equal(readIndexReferences([path])[0].rosterExtractionVerified, true);
    writeFileSync(path, JSON.stringify({ ...doc, rows: [{ isin }] }));
    assert.throws(() => readIndexReferences([path]), /ROSTER_DIFFERS_FROM_AUTHENTICATED_SOURCE/);
    writeFileSync(path, JSON.stringify({ ...doc, index: 'EURO STOXX 50' }));
    assert.throws(() => readIndexReferences([path]), /REQUEST_SCOPE_CONFLICT/);
    writeFileSync(path, JSON.stringify({ ...doc, rows: [{ isin }, { isin: 'DE0007236101' }] }));
    assert.throws(() => readIndexReferences([path]), /ROSTER_DIFFERS_FROM_AUTHENTICATED_SOURCE/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('scoped empty-ISIN native bridge preserves raw/provider ISIN and rejects wrong MIC, symbol, class, nonempty contradiction and currency', () => {
  const entries = [{ op: germanMetaOp, rows: [germanMetadata({ isin: null })] }, { op: germanLatestOp, rows: [germanBar()] }];
  const result = compileGerman(entries), c = result.universe.candidates[0];
  assert.equal(c.status, 'ACCEPTED'); assert.equal(c.isin, sap); assert.equal(c.isinBasis, 'OFFICIAL_NATIVE_MNEMONIC_MIC_BRIDGE');
  assert.equal(c.observations[0].raw.isin, null); assert.equal(c.observations[0].normalized.isin, null);
  assert.equal(c.observations[0].normalized.resolvedIsin, sap); assert.equal(c.observations[0].input.providerNormalized.isin, null);
  assert.equal(result.productRows[0].readiness.CHART, 'CHART_LIMITED');
  for (const extra of [{ isin: 'DE0007236101' }, { isin: false }, { isin: 0 }, { isin: {} }, { isin: ' ' },
    { stock_exchange: { mic: 'XSWX' } }, { symbol: 'SAP.XETRA' }, { item_type: 'ETF', asset_type: 'ETF' }]) {
    const bad = compileGerman([{ op: germanMetaOp, rows: [germanMetadata({ isin: null, ...extra })] }, { op: germanLatestOp, rows: [germanBar()] }]);
    assert.equal(bad.universe.candidates[0].status, 'REVIEW', JSON.stringify(extra));
  }
  for (const missing of [true, false]) {
    const bad = compileGerman([{ op: germanMetaOp, rows: [germanMetadata({ isin: missing ? null : sap, currency: 'USD' })] },
      { op: germanLatestOp, rows: [germanBar('2026-10-08', { currency: 'USD' })] }]);
    assert.equal(bad.universe.candidates[0].status, 'REVIEW');
  }
  const ambiguousNative = compileGerman(entries, { officialIdentity: { rows: [germanyOfficial({ nativeMnemonicVerifiedUnique: false })] } });
  assert.equal(ambiguousNative.universe.candidates[0].status, 'REVIEW');
});

test('same-listing official reference currency fills only canonical Xetra nulls; any provider contradiction blocks and stale prices stay review', () => {
  for (const providerIsin of [null, sap]) {
    const result = compileGerman([{ op: germanMetaOp, rows: [germanMetadata({ isin: providerIsin, currency: null })] },
      { op: germanLatestOp, rows: [germanBar('2026-10-08', { currency: null })] }]);
    const c = result.universe.candidates[0]; assert.equal(c.status, 'ACCEPTED'); assert.equal(c.currency, 'EUR');
    assert.equal(c.observations[0].normalized.currency, null); assert.equal(c.observations[0].normalized.resolvedCurrency, 'EUR');
    assert.equal(c.priceCurrencyBasis, 'CANONICAL_REFERENCE_CURRENCY');
    assert.equal(c.observations[0].raw.currency, null);
    const series = result.outputs.marketstack_europe_core_projection.series[0];
    assert.equal(series.provenance.priceCurrencyBasis, 'CANONICAL_REFERENCE_CURRENCY');
    assert.equal(series.provenance.priceCurrencyEvidence[0].rawField, 'Currency');
    assert.equal(series.provenance.priceCurrencyEvidence[0].rawCurrencyValue, 'EUR');
  }
  for (const malformed of [false, 0, '', ' eur ', {}, 'US']) {
    for (const providerIsin of [null, sap]) {
      const badMetadata = compileGerman([{ op: germanMetaOp, rows: [germanMetadata({ isin: providerIsin, currency: malformed })] },
        { op: germanLatestOp, rows: [germanBar('2026-10-08', { currency: null })] }]);
      assert.equal(badMetadata.universe.candidates[0].status, 'REVIEW', `malformed metadata ${JSON.stringify(malformed)}`);
    }
    const badBridgePrice = compileGerman([{ op: germanMetaOp, rows: [germanMetadata({ isin: null, currency: null })] },
      { op: germanLatestOp, rows: [germanBar('2026-10-08', { currency: malformed })] }]);
    assert.equal(badBridgePrice.universe.candidates[0].status, 'REVIEW', `malformed price ${JSON.stringify(malformed)}`);
    const badExactPrice = compileGerman([{ op: germanMetaOp, rows: [germanMetadata({ isin: sap, currency: null })] },
      { op: germanLatestOp, rows: [germanBar('2026-10-08', { currency: malformed })] }]);
    assert.equal(badExactPrice.universe.candidates[0].status, 'REVIEW', `malformed exact-ISIN price ${JSON.stringify(malformed)} ${JSON.stringify(badExactPrice.outputs.marketstack_europe_price_quality.rows[0].latestQuality)}`);
  }
  const bad = compileGerman([{ op: germanMetaOp, rows: [germanMetadata({ currency: 'EUR' })] },
    { op: germanLatestOp, rows: [germanBar('2026-10-08', { currency: 'USD' })] }]);
  assert.equal(bad.universe.candidates[0].status, 'REVIEW'); assert.ok(bad.universe.candidates[0].reasons.includes('PROVIDER_QUOTE_CURRENCY_CONFLICT'));
  const stale = compileGerman([{ op: germanMetaOp, rows: [germanMetadata()] }, { op: germanLatestOp, rows: [germanBar('2026-10-05')] }]);
  assert.equal(stale.universe.candidates[0].status, 'REVIEW'); assert.ok(stale.universe.candidates[0].reasons.includes('STALE_PRICE_CONSUMER_REVIEW'));
});

test('European issuer priorities are not exclusions; German index local policy requires exact current roster and European issuer', () => {
  const reference = { index: 'DAX', referenceVerified: true, sourceContentVerified: true, rosterExtractionVerified: true,
    asOf: '2026-10-08', source: { sha256: 'c'.repeat(64), url: 'https://example.test/official-dax' }, rows: [{ isin: sap }] };
  const rows = [{ op: germanMetaOp, rows: [germanMetadata()] }, { op: germanLatestOp, rows: [germanBar()] }];
  for (const country of ['LU', 'IE', 'BG']) {
    const e = germanyOfficial({ issuerCountry: country, legalJurisdiction: country, primaryMic: 'XFRA', productPrimaryPolicy: null });
    const result = compileGerman(rows, { officialIdentity: { rows: [e] }, indexReferences: [reference] });
    assert.equal(result.universe.candidates[0].status, 'ACCEPTED'); assert.equal(result.universe.companies[0].issuerCountry, country);
    assert.equal(result.universe.germany.summary.companies, 0);
  }
  for (const e of [germanyOfficial({ issuerCountry: 'NL', legalJurisdiction: 'NL', primaryMarketMic: 'XNYS', productPrimaryPolicy: null }),
    germanyOfficial({ issuerCountry: 'US', legalJurisdiction: 'US', productPrimaryPolicy: null })]) {
    assert.notEqual(compileGerman(rows, { officialIdentity: { rows: [e] }, indexReferences: [reference] }).universe.candidates[0].status, 'ACCEPTED');
  }
});

test('measured liquid German class needs exact last20 EUR positive-volume sessions, real median threshold and no skipped bad session', () => {
  const dates = ['2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
    '2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
  const historyOp = { kind: 'history', listing: { mic: 'XETR', providerTicker: 'SAP.DE' }, from: '2026-09-10', to: '2026-10-08' };
  const opts = { officialIdentity: { rows: [germanyOfficial({ regulatoryLiquid: false, productPrimaryPolicy: null, primaryMic: null })] },
    calendars: { XETR: { ...calendar, mic: 'XETR', expectedSessions: dates } } };
  const base = [{ op: germanMetaOp, rows: [germanMetadata()] }, { op: germanLatestOp, rows: [germanBar('2026-10-08', { volume: 1000 })] }];
  const build = bars => compileGerman([...base, { op: historyOp, rows: bars }], opts);
  const result = build(dates.map(date => germanBar(date, { volume: 1000 })));
  assert.equal(result.universe.candidates[0].status, 'ACCEPTED');
  assert.equal(result.universe.candidates[0].identityEvidence[0].liquidityEvidence.medianDailyTurnoverEUR, 104000);
  assert.equal(result.productRows[0].readiness.QUANT, 'QUANT_BLOCKED');
  assert.equal(build(dates.map(date => germanBar(date, { volume: 100 }))).universe.candidates[0].status, 'REVIEW');
  assert.equal(build(dates.slice(1).map(date => germanBar(date, { volume: 1000 }))).universe.candidates[0].status, 'REVIEW');
  const badWindow = dates.map((date, i) => germanBar(date, { volume: i === 10 ? 0 : 1000 }));
  assert.equal(build(badWindow).universe.candidates[0].status, 'REVIEW');
  assert.equal(build([germanBar('2026-09-10', { close: -1 }), ...dates.map(date => germanBar(date, { volume: 1000 }))]).universe.candidates[0].status, 'ACCEPTED');
});
