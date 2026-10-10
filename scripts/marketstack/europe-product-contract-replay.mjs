/** Private artifact replay through the real Core contract. No network or UI. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { privateReplayRoot } from './europe-private-files.mjs';
import { readCentralLogoRegistry, createCentralLogoResolver } from './europe-company-logos.mjs';
import { auditEuropeCanonicalGraph, projectEuropeProductPublication } from './europe-product-readiness.mjs';
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
export async function replayEuropeProductContract({ universe, projection, now, protectedIds = [], logoResolver, previousUniverse, referenceUniverse } = {}) {
  if (!universe || !['PRIVATE_RESEARCH', 'PRIVATE_DISCOVERY'].includes(universe.mode) || universe.publicationAllowed !== false || !isPrivate(projection)) throw Error('PRIVATE_RESEARCH_ARTIFACTS_REQUIRED');
  if (!now || !Number.isFinite(Date.parse(now))) throw Error('EXPLICIT_EVALUATION_TIME_REQUIRED');
  if (!projection.listingEvidence || !Array.isArray(projection.series)) throw Error('CORE_PROJECTION_REQUIRED');
  const companyEvidence = projection.companyEvidence || {};
  const catalog = Core.fromFoundation(universe, { listingEvidence: projection.listingEvidence, companyEvidence, protectedIds });
  // Known identity and current product admission have different membership.
  // Reference-only identities may remain materialized while their current
  // listings fail price/admission gates. They never enter this consumer catalog.
  let referenceGraph = null;
  if (referenceUniverse) {
    if (!['PRIVATE_RESEARCH', 'PRIVATE_DISCOVERY'].includes(referenceUniverse.mode) || referenceUniverse.publicationAllowed !== false)
      throw Error('PRIVATE_CANONICAL_REFERENCE_REQUIRED');
    const referenceCatalog = Core.fromFoundation(referenceUniverse, { protectedIds });
    referenceGraph = auditEuropeCanonicalGraph(referenceUniverse, { catalog: referenceCatalog, previousUniverse, protectedIds });
    referenceGraph.consumerAdmissionInferred = false;
    const referenceIds = new Map(referenceUniverse.securities.map(s => [s.securityId, s]));
    for (const s of universe.securities) {
      const known = referenceIds.get(s.securityId);
      if (!known || known.isin !== s.isin || known.companyKey !== s.companyKey) {
        referenceGraph.findings.push({ code: 'CURRENT_ADMISSION_REFERENCE_BINDING_MISMATCH', securityId: s.securityId });
      }
    }
    if (referenceGraph.findings.length) {
      referenceGraph.status = 'CANONICAL_GRAPH_BLOCKED'; referenceGraph.coreMaterializationVerified = false;
      referenceGraph.summary.findings = referenceGraph.findings.length;
    }
  }
  const canonicalGraph = auditEuropeCanonicalGraph(universe, { catalog, previousUniverse, protectedIds,
    previousMembershipPolicy: referenceUniverse ? 'SHARED_CURRENT_ADMISSION_ONLY' : 'ALL' });
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
  const securities = [], charts = [], searchCache = new Map(), dimensionSearches = [];
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
  // Metadata queries intentionally respect the existing 100-result UI cap.
  // Validate every returned ID and disclose truncated membership, rather than
  // claim that a broad country query returned the entire accepted country.
  for (const [field, queries] of [
    ['country', unique(catalog.securities.flatMap(s => s.listings.map(l => l.country)).filter(Boolean))],
    ['exchange', unique(catalog.securities.flatMap(s => s.listings.flatMap(l => [l.mic, l.exchange])).filter(Boolean))]
  ]) for (const query of queries) {
    const result = await client.search(query, { limit: 100 }), hits = result.data?.results || [];
    const duplicates = hits.length - new Set(hits.map(h => h.securityId)).size;
    const expected = catalog.securities.filter(s => s.listings.some(l => (field === 'country' ? [l.country] : [l.mic, l.exchange]).includes(query)));
    // Other text fields may also match the query under existing substring rules;
    // each returned ID still must resolve to the accepted canonical catalog.
    const validIds = hits.every(h => catalog.securities.some(s => s.securityId === h.securityId));
    const expectedHit = hits.some(h => expected.some(s => s.securityId === h.securityId));
    dimensionSearches.push({ field, query, passed: result.state === 'AVAILABLE' && !duplicates && validIds && expectedHit,
      expectedDimensionMembers: expected.length, resultCount: hits.length, duplicates,
      membershipCoverage: expected.filter(s => hits.some(h => h.securityId === s.securityId)).length,
      completeness: hits.length === 100 ? 'UI_RESULT_CAP_NOT_COMPLETE' : 'BOUNDED_QUERY_RESPONSE' });
  }
  const bulkWatchlist = [];
  for (let offset = 0; offset < catalog.securities.length; offset += 500) {
    const batch = catalog.securities.slice(offset, offset + 500), ids = batch.map(s => s.securityId);
    const values = new Map([['vu.discover.watchlist', '["PROTECTED_US_SENTINEL"]']]);
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const first = Core.createWatchlist({ catalog, storage, protectedIds });
    let passed = true, reason = null;
    try {
      for (const id of ids) { first.add(id); first.add(id); } first.save();
      const next = Core.createWatchlist({ catalog, storage, protectedIds });
      if (JSON.stringify(next.reload()) !== JSON.stringify(ids)) throw Error('BULK_CANONICAL_RELOAD_MISMATCH');
      for (const id of ids) next.remove(id); next.save();
      if (Core.createWatchlist({ catalog, storage, protectedIds }).reload().length || values.get('vu.discover.watchlist') !== '["PROTECTED_US_SENTINEL"]') throw Error('BULK_REMOVE_OR_US_STORAGE_MISMATCH');
    } catch (error) { passed = false; reason = error.message; }
    bulkWatchlist.push({ securityIds: ids, count: ids.length, passed, reason });
  }
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
    const sourceSecurity = universe.securities.find(s => s.securityId === security.securityId);
    const sourceAliases = (universe.listings || []).filter(l => (sourceSecurity?.listings || []).includes(l.listingKey)).flatMap(l => l.verifiedAliases || []);
    const queries = [ ['ticker', security.ticker], ['name', security.name], ['isin', security.isin],
      ...unique([...(security.aliases || []), ...sourceAliases]).map(alias => ['alias', alias]) ].filter(([, q]) => typeof q === 'string' && q.trim());
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
    const securityReport = { securityId: security.securityId, companyId: security.companyId, primaryListingId: security.primaryListingId,
      identity: identity.state, searches, missingSearchFields, watchlist: { passed: watchlistPassed, reason: watchlistReason },
      readiness: readiness.data || null, logo: { state: logoResult.state, status: logo?.status || null, key: logo?.key || null,
        assetSha256: logo?.asset?.sha256 || null, fallback: logo?.fallback ?? true }, publicationAllowed: false };
    securities.push(securityReport);
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
        securityId: technical.data?.securityId || null, listingId: technical.data?.listingId || null,
        currency: technical.data?.currency || projection.listingEvidence[listing.listingId]?.technical?.currency || null,
        status: technical.data?.status || null, metrics: technical.data?.metrics || null,
        priceBasis: technical.data?.priceBasis || null, methodology: technical.data?.methodology || null,
        benchmark: technical.data?.benchmark || null, RS: technical.data?.RS || 'RS_BLOCKED' };
    }
    const primaryChart = charts.find(c => c.securityId === security.securityId && c.isPrimary);
    const screener = await client.getScreenerRow(request), fundamentals = await client.getFundamentals(request), quant = await client.getQuantData(request);
    securityReport.screener = { state: screener.state, reason: screener.reason, data: screener.data || null };
    securityReport.fundamentals = { state: fundamentals.state, reason: fundamentals.reason };
    securityReport.quant = { state: quant.state, reason: quant.reason, data: quant.data || null };
    securityReport.productPublication = projectEuropeProductPublication({ identity, readiness: readiness.data,
      searchesPassed: !missingSearchFields.length && searches.every(s => s.passed), watchlistPassed,
      chart: primaryChart, technical: primaryChart?.technical, screener, fundamentals, quant });
  }
  if (publicLoads || usCalls) throw Error('PROTECTED_ROUTE_ACCESS');
  return { schema: REPLAY_VERSION, generatedAt: now, mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    providerRequests: 0, providerCredits: 0, canonicalLoaderCalls: loads, publicLoaderCalls: publicLoads, usCalls,
    status: canonicalGraph.status === 'CANONICAL_GRAPH_VERIFIED' && (!referenceGraph || referenceGraph.status === 'CANONICAL_GRAPH_VERIFIED') && dimensionSearches.every(s => s.passed) && bulkWatchlist.every(b => b.passed) &&
      counters.catalogExcludedSecurities === 0 && counters.identityAvailable === counters.acceptedSecurities && counters.searchableSecurities === counters.acceptedSecurities &&
      counters.watchlistRemove === counters.acceptedSecurities && counters.chartUnavailable === 0 ? 'PRIVATE_CONTRACT_REPLAY_PASSED' : 'PRIVATE_CONTRACT_REPLAY_PARTIAL',
    summary: counters, canonicalGraph, referenceGraph, dimensionSearches, bulkWatchlist, catalogExcludedSecurityIds, securities, charts,
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
  try { const stat = lstatSync(path); if (stat.isSymbolicLink() || !stat.isFile()) throw Error('SYMLINK_OR_NONREGULAR_REPLAY_OUTPUT'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
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
