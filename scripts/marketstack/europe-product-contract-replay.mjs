/** Private artifact replay through the real Core contract. No network or UI. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { privateReplayRoot } from './europe-private-files.mjs';
import { readCentralLogoRegistry, createCentralLogoResolver } from './europe-company-logos.mjs';
export { privateReplayRoot } from './europe-private-files.mjs';
const require = createRequire(import.meta.url);
const Core = require('../../core/europe-market-data.js');
export const REPLAY_VERSION = 'marketstack-europe-private-product-replay-1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const unique = values => [...new Set(values.filter(Boolean))];
const ref = (securityId, listingId) => ({ region: 'EUROPE', securityId, ...(listingId ? { listingId } : {}) });
const isPrivate = doc => doc?.mode === 'PRIVATE_RESEARCH' && doc.publicationAllowed === false;
const privateRoot = privateReplayRoot;

/** Every accepted security is exercised individually, including watchlist save/reload.
 * Chart replay covers every accepted listing with admitted history, not only a sample.
 * Original source artifacts are never altered and absent inputs are never synthesized.
 */
export async function replayEuropeProductContract({ universe, projection, now, protectedIds = [], logoResolver } = {}) {
  if (!universe || !['PRIVATE_RESEARCH', 'PRIVATE_DISCOVERY'].includes(universe.mode) || universe.publicationAllowed !== false || !isPrivate(projection)) throw Error('PRIVATE_RESEARCH_ARTIFACTS_REQUIRED');
  if (!now || !Number.isFinite(Date.parse(now))) throw Error('EXPLICIT_EVALUATION_TIME_REQUIRED');
  if (!projection.listingEvidence || !Array.isArray(projection.series)) throw Error('CORE_PROJECTION_REQUIRED');
  const companyEvidence = projection.companyEvidence || {};
  const catalog = Core.fromFoundation(universe, { listingEvidence: projection.listingEvidence, companyEvidence, protectedIds });
  if (!logoResolver && Object.values(companyEvidence).some(e => e.logo?.status === 'LOGO_VALID'))
    logoResolver = createCentralLogoResolver({ companyEvidence }, readCentralLogoRegistry());
  const seriesIndex = new Map();
  for (const series of projection.series) {
    const key = `${series.securityId}\n${series.listingId}`;
    if (seriesIndex.has(key)) throw Error('DUPLICATE_CANONICAL_SERIES');
    if (series.basis !== 'RAW_UNADJUSTED') throw Error('RAW_REPLAY_BASIS_REQUIRED');
    seriesIndex.set(key, series);
  }
  let loads = 0, usCalls = 0;
  const usClient = new Proxy({}, { get() { return () => { usCalls++; throw Error('US_ACCESS_FORBIDDEN_IN_PRIVATE_EUROPE_REPLAY'); }; } });
  const loadSeries = request => {
    loads++;
    if (request.region !== 'EUROPE' || request.basis !== 'RAW_UNADJUSTED') throw Error('RAW_EUROPE_REQUEST_REQUIRED');
    const found = seriesIndex.get(`${request.securityId}\n${request.listingId}`);
    if (!found) throw Error('CANONICAL_SERIES_MISSING');
    return found;
  };
  const client = Core.create({ usClient, catalog, loadSeries, now, audience: 'research', rights: {}, logoResolver });
  // Independently prove that the same accepted catalog cannot escape the public gate.
  let publicLoads = 0;
  const publicClient = Core.create({ usClient, catalog, now, loadSeries: () => { publicLoads++; throw Error('PUBLIC_LOAD_FORBIDDEN'); } });
  const publicSearch = await publicClient.search('a');
  if (publicSearch.state !== 'UNAVAILABLE' || publicSearch.reason !== 'DISPLAY_RIGHTS_UNCONFIRMED') throw Error('PUBLIC_IDENTITY_GATE_OPEN');
  const securities = [], charts = [], searchCache = new Map();
  const catalogExcludedSecurityIds = (universe.securities || []).map(s => s.securityId).filter(id => !catalog.securities.some(s => s.securityId === id));
  const counters = { foundationSecurities: (universe.securities || []).length, catalogExcludedSecurities: catalogExcludedSecurityIds.length,
    acceptedSecurities: catalog.securities.length, acceptedListings: catalog.securities.reduce((n, s) => n + s.listings.length, 0),
    identityAvailable: 0, searchableSecurities: 0, searchQueries: 0, searchQueriesPassed: 0, missingSearchFields: 0,
    duplicateSearchResults: 0, watchlistAdd: 0, watchlistSave: 0, watchlistReload: 0, watchlistRemove: 0,
    chartAttempts: 0, chartAvailable: 0, chartUnavailable: 0, chartLimited: 0,
    primaryChartAvailable: 0, singleObservationCharts: 0, multiObservationCharts: 0,
    logoValid: 0, logoFallback: 0, logoMissing: 0, logoSuspect: 0, logoAssetUnavailable: 0,
    rawTechnicalPartial: 0, technicalUnavailable: 0,
    publicBlockedIdentities: 0, publicBlockedCharts: 0 };
  async function searchCheck(query, securityId, field) {
    let result = searchCache.get(query);
    if (!result) { result = await client.search(query, { limit: 100 }); searchCache.set(query, result); }
    const hits = result.data?.results || [], duplicates = hits.length - new Set(hits.map(h => h.securityId)).size;
    counters.searchQueries++; counters.duplicateSearchResults += duplicates;
    const matched = result.state === 'AVAILABLE' && hits.some(h => h.securityId === securityId);
    if (matched && duplicates === 0) counters.searchQueriesPassed++;
    return { field, query, passed: matched && duplicates === 0, resultCount: hits.length,
      reason: duplicates ? 'DUPLICATE_CANONICAL_ID' : matched ? null : hits.length === 100 ? 'SEARCH_LIMIT_MAY_TRUNCATE' : 'EXPECTED_SECURITY_NOT_FOUND' };
  }
  for (const security of catalog.securities) {
    const request = ref(security.securityId), identity = await client.getSecurity(request);
    if (identity.state === 'AVAILABLE') counters.identityAvailable++;
    const publicIdentity = await publicClient.getSecurity(request);
    if (publicIdentity.reason === 'DISPLAY_RIGHTS_UNCONFIRMED') counters.publicBlockedIdentities++;
    else throw Error('PUBLIC_IDENTITY_GATE_OPEN');
    const requiredSearchFields = { ticker: security.ticker, name: security.name, isin: security.isin };
    const missingSearchFields = Object.keys(requiredSearchFields).filter(field => typeof requiredSearchFields[field] !== 'string' || !requiredSearchFields[field].trim());
    counters.missingSearchFields += missingSearchFields.length;
    const queries = [ ['ticker', security.ticker], ['name', security.name], ['isin', security.isin],
      ...unique(security.aliases || []).map(alias => ['alias', alias]) ].filter(([, q]) => typeof q === 'string' && q.trim());
    const searches = [];
    for (const [field, query] of queries) searches.push(await searchCheck(query, security.securityId, field));
    if (!missingSearchFields.length && searches.length && searches.every(check => check.passed)) counters.searchableSecurities++;
    // One independently persisted security per iteration keeps the existing 500-item
    // watchlist cap intact even when the accepted universe exceeds 500 securities.
    const values = new Map([['vu.discover.watchlist', '["PROTECTED_US_SENTINEL"]']]);
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    let watchlistPassed = true, watchlistReason = null;
    try {
      const watchCatalog = { securities: [security] };
      const first = Core.createWatchlist({ catalog: watchCatalog, storage, protectedIds });
      first.add(security.securityId); first.add(security.securityId);
      if (first.values().length !== 1) throw Error('DUPLICATE_ADD'); counters.watchlistAdd++;
      first.save(); counters.watchlistSave++;
      const reloaded = Core.createWatchlist({ catalog: watchCatalog, storage, protectedIds });
      if (JSON.stringify(reloaded.reload()) !== JSON.stringify([security.securityId])) throw Error('RELOAD_ID_MISMATCH'); counters.watchlistReload++;
      reloaded.remove(security.securityId); reloaded.save();
      if (Core.createWatchlist({ catalog: watchCatalog, storage, protectedIds }).reload().length) throw Error('REMOVE_NOT_PERSISTED');
      if (values.get('vu.discover.watchlist') !== '["PROTECTED_US_SENTINEL"]') throw Error('US_STORAGE_CHANGED'); counters.watchlistRemove++;
    } catch (error) { watchlistPassed = false; watchlistReason = error.message; }
    const readiness = await client.getReadiness(request);
    const logoResult = await client.getLogo(request), logo = logoResult.data;
    const logoCounter = { LOGO_VALID: 'logoValid', LOGO_FALLBACK: 'logoFallback', LOGO_MISSING: 'logoMissing', LOGO_SUSPECT: 'logoSuspect' }[logo?.status];
    if (logoCounter) counters[logoCounter]++;
    if (logo?.status === 'LOGO_VALID' && !logo.asset) counters.logoAssetUnavailable++;
    securities.push({ securityId: security.securityId, companyId: security.companyId, primaryListingId: security.primaryListingId,
      identity: identity.state, searches, missingSearchFields, watchlist: { passed: watchlistPassed, reason: watchlistReason },
      readiness: readiness.data || null, logo: { state: logoResult.state, status: logo?.status || null, key: logo?.key || null,
        assetSha256: logo?.asset?.sha256 || null, fallback: logo?.fallback ?? true }, publicationAllowed: false });
    for (const listing of security.listings) {
      if (!listing.history?.valid || !(listing.history.observations > 0)) continue;
      const listingRef = ref(security.securityId, listing.listingId);
      const publicChart = await publicClient.getPriceSeries(listingRef, { range: 'MAX', basis: 'RAW_UNADJUSTED' });
      if (publicChart.state === 'AVAILABLE') throw Error('PUBLIC_PRICE_GATE_OPEN');
      if (publicChart.reason === 'DISPLAY_RIGHTS_UNCONFIRMED') counters.publicBlockedCharts++;
      const result = await client.getPriceSeries(listingRef, { range: 'MAX', basis: 'RAW_UNADJUSTED' });
      const listingReadiness = (await client.getReadiness(listingRef)).data;
      const technical = await client.getTechnicalData(listingRef);
      if (technical.state === 'AVAILABLE' && technical.data.status === 'TECHNICAL_PARTIAL') counters.rawTechnicalPartial++;
      else if (technical.state !== 'AVAILABLE') counters.technicalUnavailable++;
      if (technical.state === 'AVAILABLE' && (technical.data.priceBasis !== 'RAW_UNADJUSTED' || technical.data.RS !== 'RS_BLOCKED' || technical.data.metrics.relativeStrength !== null))
        throw Error('RAW_RESEARCH_TECHNICAL_BASIS_VIOLATION');
      counters.chartAttempts++;
      const available = result.state === 'AVAILABLE';
      if (available) {
        counters.chartAvailable++;
        if (listingReadiness.CHART === 'CHART_LIMITED') counters.chartLimited++;
        if (listing.listingId === security.primaryListingId) counters.primaryChartAvailable++;
        if (result.data.points.length === 1) counters.singleObservationCharts++; else counters.multiObservationCharts++;
      }
      else counters.chartUnavailable++;
      charts.push({ securityId: security.securityId, listingId: listing.listingId, isPrimary: listing.listingId === security.primaryListingId,
        state: result.state, reason: result.reason, chartStatus: listingReadiness.CHART,
        basis: available ? result.data.basis : 'RAW_UNADJUSTED', basisLabel: 'Unadjusted provider close — private research',
        currency: available ? result.data.currency : listing.currency, observations: available ? result.data.points.length : 0,
        historyCoverage: available ? result.data.points.length === 1 ? 'SINGLE_EOD_OBSERVATION' : 'OBSERVED_MULTI_SESSION_SERIES' : 'UNAVAILABLE',
        requestedRange: 'MAX', rangeCompleteness: 'NOT_INFERRED_FROM_RANGE_LABEL',
        from: available ? result.data.from : null, to: available ? result.data.to : null,
        provenance: available ? result.data.provenance : null, publicationAllowed: false });
      charts[charts.length - 1].technical = { state: technical.state, reason: technical.reason,
        status: technical.data?.status || null, metrics: technical.data?.metrics || null,
        priceBasis: technical.data?.priceBasis || null, methodology: technical.data?.methodology || null, RS: technical.data?.RS || 'RS_BLOCKED' };
    }
  }
  if (publicLoads || usCalls) throw Error('PROTECTED_ROUTE_ACCESS');
  return { schema: REPLAY_VERSION, generatedAt: now, mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    providerRequests: 0, providerCredits: 0, canonicalLoaderCalls: loads, publicLoaderCalls: publicLoads, usCalls,
    status: counters.catalogExcludedSecurities === 0 && counters.identityAvailable === counters.acceptedSecurities && counters.searchableSecurities === counters.acceptedSecurities &&
      counters.watchlistRemove === counters.acceptedSecurities && counters.chartUnavailable === 0 ? 'PRIVATE_CONTRACT_REPLAY_PASSED' : 'PRIVATE_CONTRACT_REPLAY_PARTIAL',
    summary: counters, catalogExcludedSecurityIds, securities, charts,
    constraints: ['NO_PRODUCT_UI_OR_PUBLICATION', 'NO_PROVIDER_REQUESTS', 'RAW_UNADJUSTED_ONLY', 'NO_NEW_TECHNICAL_OR_ADJUSTMENT_CERTIFICATION',
      'NO_US_DATA_STORAGE_OR_POPULATION_MUTATION', 'WATCHLIST_TESTED_INDEPENDENTLY_PER_ACCEPTED_SECURITY'] };
}

export function loadPrivateReplayInputs(directory) {
  const root = privateRoot(directory), documents = {}, files = [];
  const manifestPath = join(root, 'evidence-output-manifest.json');
  if (!existsSync(manifestPath) || lstatSync(manifestPath).isSymbolicLink()) throw Error('PRIVATE_COMPILER_MANIFEST_REQUIRED');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.publicationAllowed !== false || !Array.isArray(manifest.files)) throw Error('PRIVATE_COMPILER_MANIFEST_REQUIRED');
  for (const [key, name] of [['universe', 'marketstack_europe_equity_universe.json'], ['projection', 'marketstack_europe_core_projection.json']]) {
    const path = join(root, name), entry = manifest.files.find(file => file.name === name);
    if (!entry || !existsSync(path) || lstatSync(path).isSymbolicLink()) throw Error('PRIVATE_REPLAY_INPUT_MISSING:' + name);
    const bytes = readFileSync(path);
    if (sha(bytes) !== entry.sha256 || bytes.length !== entry.bytes) throw Error('PRIVATE_REPLAY_INPUT_HASH_MISMATCH:' + name);
    documents[key] = JSON.parse(bytes); files.push({ name, sha256: entry.sha256, bytes: entry.bytes });
  }
  return { ...documents, inputManifest: { sha256: sha(readFileSync(manifestPath)), files } };
}

export function writePrivateProductReplay(report, directory) {
  if (!isPrivate(report)) throw Error('PRIVATE_RESEARCH_REPORT_REQUIRED');
  const root = privateRoot(directory); mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, 'marketstack_europe_product_contract_replay.json');
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw Error('SYMLINK_REPLAY_OUTPUT');
  const bytes = JSON.stringify(report) + '\n'; writeFileSync(path, bytes, { mode: 0o600 });
  return { path, sha256: sha(bytes), bytes: Buffer.byteLength(bytes) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = name => process.argv.slice(2).find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value('input') || !value('out')) throw Error('Usage: europe-product-contract-replay.mjs --input=/private/compiler-output --out=/private/replay-output [--now=ISO]');
  const inputs = loadPrivateReplayInputs(value('input'));
  const report = await replayEuropeProductContract({ ...inputs, now: value('now') || inputs.projection.generatedAt });
  report.inputManifest = inputs.inputManifest;
  console.log(JSON.stringify({ ...writePrivateProductReplay(report, value('out')), status: report.status, summary: report.summary,
    publicationAllowed: false, providerRequests: 0 }));
}
