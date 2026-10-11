/** Named private Europe 2.1 outputs from actual Core replay. No market-data IO. */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadPrivateReplayInputs, replayEuropeProductContract, writePrivateProductReplay } from './europe-product-contract-replay.mjs';
import { privateReplayRoot } from './europe-private-files.mjs';
import { assessEuropeSupertraderInputs } from '../supertrader/europe-readiness.mjs';
const require = createRequire(import.meta.url), Core = require('../../core/europe-market-data.js');
const Screener = require('../../screener/europe-readiness.js');
const Query = require('../../screener/engine/query.js');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const count = (rows, key) => Object.fromEntries([...new Set(rows.map(r => r[key]))].map(status => [status, rows.filter(r => r[key] === status).length]));
export const REPORTS_VERSION = 'europe-private-product-reports-2.1';

/** Reports preserve strict readiness separately from partial research usability. */
export function buildEuropeProductReports({ universe, projection, replay, sourceInputs, protectedIds = [] } = {}) {
  if (universe?.publicationAllowed !== false || projection?.publicationAllowed !== false || replay?.mode !== 'PRIVATE_RESEARCH' ||
      replay.publicationAllowed !== false || replay.providerRequests !== 0 || replay.usCalls !== 0 || replay.publicLoaderCalls !== 0 ||
      !sourceInputs || !/^[a-f0-9]{64}$/.test(sourceInputs.sha256 || '')) throw Error('SOURCE_BOUND_PRIVATE_CORE_REPLAY_REQUIRED');
  const ids = universe.securities.map(s => s.securityId).sort(), reportIds = replay.securities.map(s => s.securityId).sort();
  if (JSON.stringify(ids) !== JSON.stringify(reportIds)) throw Error('CURRENT_ADMITTED_REPLAY_ID_SET_MISMATCH');
  const header = { schema: REPORTS_VERSION, generatedAt: replay.generatedAt, mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    providerRequests: 0, providerCredits: 0, sourceInputs: copy(sourceInputs), existingUSPopulationChanged: false };
  const chartIndex = new Map(replay.charts.map(c => [c.securityId + '\n' + c.listingId, c]));
  const charts = [], adjustments = [], technical = [], quant = [], strategies = [], products = [];
  for (const s of universe.securities) {
    const record = replay.securities.find(r => r.securityId === s.securityId);
    products.push({ securityId: s.securityId, companyId: s.companyKey, primaryListingId: s.primaryListing,
      identity: record.identity, searchProof: record.searches, watchlistProof: record.watchlist,
      publication: copy(record.productPublication), logo: copy(record.logo), publicationAllowed: false });
    quant.push({ securityId: s.securityId, companyId: s.companyKey, listingId: s.primaryListing,
      status: record.readiness?.QUANT || 'QUANT_BLOCKED', source: 'ACTUAL_CORE_GET_READINESS_AND_GET_QUANT_DATA',
      consumer: copy(record.quant || { state: 'UNAVAILABLE', reason: 'QUANT_CONSUMER_PROOF_MISSING', data: null }),
      publication: copy(record.productPublication.products.QUANT), score: null, rank: null, rankingEligible: false,
      separateEuropePopulation: true, methodologyChanged: false });
    for (const listingKey of s.listings) {
      const l = universe.listings.find(l => l.listingKey === listingKey), evidence = projection.listingEvidence[listingKey] || {};
      const c = chartIndex.get(s.securityId + '\n' + listingKey), t = c?.technical;
      charts.push({ securityId: s.securityId, listingId: listingKey, isPrimary: listingKey === s.primaryListing,
        status: c?.state === 'AVAILABLE' ? c.chartStatus : 'CHART_BLOCKED', state: c?.state || 'UNAVAILABLE',
        reason: c?.reason || (!c ? 'NO_ADMITTED_HISTORY' : null), basis: c?.basis || 'RAW_UNADJUSTED', currency: c?.currency || l.currency,
        observations: c?.observations || 0, firstDate: c?.from || null, lastDate: c?.to || null,
        historyCoverage: c?.historyCoverage || 'UNAVAILABLE', rangeCompleteness: c?.rangeCompleteness || 'NOT_INFERRED',
        visibleLimitationRequired: c?.chartStatus === 'CHART_LIMITED', provenance: copy(c?.provenance || null) });
      adjustments.push({ securityId: s.securityId, listingId: listingKey,
        status: evidence.adjustment?.status || 'ADJUSTMENT_UNKNOWN', evidence: copy(evidence.adjustment || {}),
        providerAdjustedUniversallyTrusted: false, rawDiagnosticPreservedByProducer: true });
      technical.push({ securityId: s.securityId, listingId: listingKey,
        status: t?.state === 'AVAILABLE' ? t.status : 'TECHNICAL_BLOCKED', state: t?.state || 'UNAVAILABLE',
        reason: t?.reason || (!t ? 'NO_ADMITTED_TECHNICAL_INPUT' : null), metrics: copy(t?.metrics || null),
        methodology: t?.methodology || null, priceBasis: t?.priceBasis || null, currency: t?.currency || l.currency,
        RS: t?.state === 'AVAILABLE' ? t.RS : 'RS_BLOCKED', benchmark: copy(t?.benchmark || null),
        recalculatedByProduct: false, missingValuesAreZero: false });
      // Use actual validator objects when present. An absent independent
      // certificate remains absent; no booleans are fabricated from bar counts.
      const supplied = projection.strategyInputs?.[listingKey];
      if (supplied && (supplied.identity?.securityId !== s.securityId || supplied.identity?.listingId !== listingKey ||
          supplied.identity?.companyId !== s.companyKey || supplied.identity?.mic !== l.mic || supplied.identity?.currency !== l.currency)) throw Error('STRICT_STRATEGY_INPUT_BINDING_MISMATCH');
      const input = supplied ? copy(supplied) : { identity: { region: 'EUROPE', securityId: s.securityId,
        companyId: s.companyKey, listingId: listingKey, instrumentId: l.instrumentId || null, mic: l.mic,
        currency: l.currency, instrumentType: 'EQUITY', primaryListing: l.isPrimary === true, verified: false }, now: replay.generatedAt };
      input.now = replay.generatedAt;
      const assessment = assessEuropeSupertraderInputs(input, { protectedIds });
      strategies.push({ securityId: s.securityId, listingId: listingKey, status: assessment.inputStatus,
        backtestStatus: assessment.backtestStatus, validationEvidence: supplied ? 'SOURCE_BOUND_STRICT_VALIDATOR_OBJECTS' : 'STRICT_VALIDATOR_OBJECTS_UNAVAILABLE',
        coreInputReadiness: record.readiness?.SUPERTRADER || 'BLOCKED', coreBacktestReadiness: record.readiness?.BACKTEST || 'BLOCKED',
        assessment, strategyInvoked: false, productionWrites: 0 });
    }
  }
  const report = (rows, key) => ({ ...header, summary: { securities: ids.length, rows: rows.length, statuses: count(rows, key) }, rows });
  return {
    'europe_product_readiness.json': { ...header, summary: { securities: products.length, privateProducts: Object.fromEntries(
      ['IDENTITY','SEARCH','WATCHLIST','CHART','DISCOVER','SCREENER','TECHNICAL','FUNDAMENTALS','QUANT','SUPERTRADER','BACKTEST'].map(product =>
        [product, products.filter(row => row.publication.products[product].privateStatus === 'READY_PRIVATE').length])),
      publicProducts: products.reduce((n, row) => n + Object.values(row.publication.products).filter(p => p.publicStatus === 'READY_PUBLIC').length, 0) }, rows: products },
    'europe_chart_readiness.json': report(charts, 'status'),
    'europe_adjustment_readiness.json': report(adjustments, 'status'),
    'europe_technical_readiness.json': report(technical, 'status'),
    'europe_quant_readiness.json': report(quant, 'status'),
    'europe_supertrader_readiness.json': report(strategies, 'status')
  };
}

export function writePrivateEuropeProductReports(reports, directory) {
  const root = privateReplayRoot(directory); mkdirSync(root, { recursive: true, mode: 0o700 });
  const files = [];
  for (const [name, report] of Object.entries(reports)) {
    if (!/^europe_[a-z_]+\.json$/.test(name) || report.mode !== 'PRIVATE_RESEARCH' || report.publicationAllowed !== false) throw Error('PRIVATE_NAMED_PRODUCT_REPORT_REQUIRED');
    const path = join(root, name);
    try { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) throw Error('PRIVATE_PRODUCT_OUTPUT_REGULAR_FILE_REQUIRED'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const bytes = JSON.stringify(report) + '\n'; writeFileSync(path, bytes, { mode: 0o600 });
    files.push({ name, path, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) });
  }
  return files;
}

/** The additional Screener proof uses the unchanged adapter and rejects any public load. */
export async function replayPrivateEuropeScreener({ universe, projection, now, protectedIds = [] } = {}) {
  const catalog = Core.fromFoundation(universe, { listingEvidence: projection.listingEvidence, companyEvidence: projection.companyEvidence || {}, protectedIds });
  const series = new Map(projection.series.map(s => [s.securityId + '\n' + s.listingId, s]));
  let loads = 0, usCalls = 0, publicCalls = 0;
  const usClient = new Proxy({}, { get() { return () => { usCalls++; throw Error('US_ROUTE_FORBIDDEN'); }; } });
  const client = Core.create({ catalog, usClient, now, audience: 'research', loadSeries: request => {
    loads++; return series.get(request.securityId + '\n' + request.listingId);
  } });
  const ids = catalog.securities.map(s => s.securityId);
  // This Europe 2.1 producer replays its strict OHLC/technical contract. The
  // separately source-bound Discover producer owns the additive base path.
  const legacyContract = Object.assign({}, client);
  delete legacyContract.getBaseScreenerRow;
  const adapter = Screener.create({ contract: legacyContract, securityIds: ids, enabled: true, audience: 'research', privateResearch: true });
  await adapter.load();
  const query = Query.empty({ universe: 'EUROPE' }); query.sort = { field: 'name', dir: 'asc' };
  const rows = adapter.rows(), readiness = adapter.readiness(), screen = await adapter.screen(query, { limit: ids.length });
  const publicContract = new Proxy(legacyContract, { get(target, property) {
    const value = target[property]; return typeof value === 'function' ? (...args) => { publicCalls++; return value(...args); } : value;
  } });
  const blocked = Screener.create({ contract: publicContract, securityIds: ids, enabled: true }); await blocked.load();
  if (usCalls || publicCalls || blocked.rows().length) throw Error('PRIVATE_SCREENER_PUBLIC_OR_US_GATE_OPEN');
  return { schema: REPORTS_VERSION, mode: 'PRIVATE_RESEARCH', publicationAllowed: false, generatedAt: now,
    providerRequests: 0, usCalls, publicCalls, canonicalLoads: loads, rows, readiness, screen,
    summary: { admittedSecurities: ids.length, rows: rows.length, blocked: readiness.filter(r => r.SCREENER === 'BLOCKED').length,
      nullRelativeStrength: rows.filter(r => r.relativeStrength === null).length }, publicDeliveryAllowed: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = key => process.argv.slice(2).find(arg => arg.startsWith('--' + key + '='))?.slice(key.length + 3);
  if (!value('input') || !value('out')) throw Error('Usage: europe-product-reports.mjs --input=/private/compiler-output --out=/private/final [--previous=/private/baseline] [--now=ISO]');
  const inputs = loadPrivateReplayInputs(value('input')), previousUniverse = value('previous') ? loadPrivateReplayInputs(value('previous')).universe : undefined;
  const now = value('now') || inputs.projection.generatedAt;
  const replay = await replayEuropeProductContract({ ...inputs, previousUniverse, now }); replay.inputManifest = inputs.inputManifest;
  const replayFile = writePrivateProductReplay(replay, value('out'));
  const reports = buildEuropeProductReports({ ...inputs, replay, sourceInputs: inputs.inputManifest });
  const files = writePrivateEuropeProductReports(reports, value('out'));
  const screener = await replayPrivateEuropeScreener({ ...inputs, now }); screener.sourceInputs = inputs.inputManifest;
  files.push(...writePrivateEuropeProductReports({ 'europe_core_screener_replay.json': screener }, value('out')));
  console.log(JSON.stringify({ status: replay.status, replay: replayFile, files, summary: replay.summary, publicationAllowed: false, providerRequests: 0 }));
}
