/** Reproducible offline report builder. Network/API credentials are never used.
 * --config=<json> supplies reference CSVs, captured probe/checkpoint directories,
 * requested venue codes, validated provider suffixes and the index snapshot.
 * Full foundation goes to private .market-cache by default; public reports hold
 * only counts/blocked decisions instead of duplicating the delivered universe.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseT7InstrumentMaster, collectGermanDirectoryPages, classifyGermanDirectory,
  summarizeGermanyUniverse, compareGermanIndexCoverage, buildGermanyIdentityFoundation, validateGermanEquityMarketData } from './audit-marketstack-germany.mjs';

export function buildGermanyReports(config, root = process.cwd()) {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  if (!Array.isArray(config?.references) || !Array.isArray(config?.venues) || !config.venues.length)
    throw new Error('Reference and venue configuration required');
  if (new Set(config.venues.map(v => v.mic)).size !== config.venues.length || config.venues.some(v => v.listingCountry !== 'DE'))
    throw new Error('Unique verified German venue configuration required');
  const masters = config.references.map(reference => {
    const bytes = readFileSync(resolve(root, reference.path));
    if (reference.expectedSHA256 && createHash('sha256').update(bytes).digest('hex') !== reference.expectedSHA256)
      throw new Error('Official reference hash differs from expected archived snapshot');
    return parseT7InstrumentMaster(bytes.toString('utf8'), { ...reference.source, inputPath: reference.path,
      inputSHA256: createHash('sha256').update(bytes).digest('hex') });
  });
  const entries = [], capturedSources = [];
  for (const path of config.probes || []) {
    const probe = read(path); if (!Array.isArray(probe.endpoints)) throw new Error('Probe endpoint array required');
    entries.push(...probe.endpoints); capturedSources.push({ inputPath: path, run: probe.run || null });
  }
  for (const path of config.identityProbes || []) {
    const probe = read(path); if (!Array.isArray(probe.endpoints)) throw new Error('Identity probe endpoint array required');
    entries.push(...probe.endpoints);
  }
  for (const path of config.workingDirectories || []) {
    const checkpoint = read(resolve(path, 'checkpoint.json'));
    for (const task of Object.values(checkpoint.tasks || {})) {
      if (task.endpoint === 'exchanges' || /^exchanges\/[^/]+\/tickers$/.test(task.endpoint || '') || /^tickers\/[^/]+$/.test(task.endpoint || '') ||
        task.label === (config.equityValidation?.priceLabel || 'germany-full-equity-latest-week')) entries.push(read(resolve(path, task.file)));
    }
    capturedSources.push({ workingDirectory: path, runs: Object.keys(checkpoint.runs || {}) });
  }
  const directories = collectGermanDirectoryPages(entries, config.venues.map(v => v.mic));
  const audits = directories.map(directory => {
    const venue = config.venues.find(v => v.mic === directory.mic);
    return classifyGermanDirectory(directory, masters.flatMap(m => m.rows), venue);
  });
  const universe = summarizeGermanyUniverse(audits, { requestedVenues: config.venues.map(v => v.mic),
    sources: { officialReferences: masters.map(m => ({ mic: m.mic, updatedAt: m.updatedAt, source: m.source })), capturedDirectories: capturedSources } });
  const registeredByMIC = new Map();
  for (const entry of entries.filter(e => e.endpoint === 'exchanges' && e.ok)) {
    const rows = Array.isArray(entry.data) ? entry.data : entry.data?.data;
    if (!Array.isArray(rows)) continue;
    for (const row of rows.filter(r => r.country_code === 'DE')) registeredByMIC.set(row.mic, {
      providerMIC: row.mic, name: row.name, operatingMIC: row.operating_mic || null,
      status: row.exchange_status || 'UNKNOWN', marketCategory: row.market_category_code || null,
      validMICFormat: /^[A-Z0-9]{4}$/.test(row.mic || ''), checkedAt: entry.checkedAt,
      directoryCoverage: audits.find(a => a.mic === row.mic)?.directoryComplete ? 'COMPLETE_OBSERVED' :
        audits.find(a => a.mic === row.mic)?.counts.observedProviderRows ? 'PARTIAL_OBSERVED' : 'UNMEASURED_OR_REQUEST_UNAVAILABLE',
      note: 'Registration alone does not establish data access, asset types, prices or issuer geography.' });
  }
  const registrations = [...registeredByMIC.values()].sort((a, b) => a.providerMIC.localeCompare(b.providerMIC, 'en'));
  const exchanges = { schemaVersion: 'germany-marketstack-exchange-coverage-1.0.0', generatedAt: universe.generatedAt,
    scope: universe.scope, allRequestedDirectoriesObserved: universe.allRequestedDirectoriesObserved,
    countryScope: 'DE_LISTING_VENUES_NOT_ISSUER_DOMICILE',
    exchangeMetadataSource: config.exchangeMetadataSource || null,
    registeredGermanProviderCodesObserved: registrations.length,
    registeredGermanProviderCodesActive: registrations.filter(r => r.status === 'ACTIVE').length,
    registeredGermanProviderCodesExpired: registrations.filter(r => r.status === 'EXPIRED').length,
    invalidMICFormatRegistrationRows: registrations.filter(r => !r.validMICFormat).length,
    registrations,
    venues: audits.map(audit => {
      const configured = config.venues.find(v => v.mic === audit.mic), master = masters.find(m => m.mic === audit.mic);
      const activeEquities = master?.rows.filter(r => r.active && r.assetType === 'EQUITY') || [];
      const matched = new Set(audit.listings.filter(r => r.status === 'CLASSIFIED_CANDIDATE' && r.assetType === 'EQUITY').map(r => r.referenceIdentity.isin));
      return { ...configured, ...universe.venues.find(v => v.mic === audit.mic),
        officialReferenceAvailable: Boolean(master), officialReferenceUpdatedAt: master?.updatedAt || null,
        officialActiveEquityInstrumentCount: master ? activeEquities.length : null,
        officialActiveEquityISINsExactDirectoryMatched: master ? matched.size : null,
        officialActiveEquityISINsUnmatched: master ? [...new Set(activeEquities.map(r => r.isin))].filter(isin => !matched.has(isin)).length : null,
        actualEODPriceCoverage: 'NOT_ESTABLISHED_BY_DIRECTORY', maximumHistoryDepth: null,
        corporateActionCoverage: 'UNKNOWN', intradayCoverage: 'UNKNOWN', realtimeCoverage: 'UNKNOWN',
        completeVenueEquityCount: null };
    }), limitations: universe.limitations };
  const index = config.indexSnapshot ? compareGermanIndexCoverage(read(config.indexSnapshot), audits, {
    referenceRows: masters.flatMap(m => m.rows), identityProbes: entries,
    providerSuffixes: Object.fromEntries(config.venues.map(venue => [venue.mic, venue.providerSuffixes])),
    providerAliasCandidates: config.indexAliasCandidates || [] }) : null;
  const equityValidation = config.equityValidation ? validateGermanEquityMarketData(audits, entries, config.equityValidation) : null;
  const existing = config.existingCanonicalLayer ? read(config.existingCanonicalLayer).listings : [];
  const veto = new Map((equityValidation?.listings || []).filter(row => row.quarantineReasons.length).map(row => [row.providerSymbol, row.quarantineReasons]));
  const foundationAudits = audits.filter(a => !config.foundationVenues || config.foundationVenues.includes(a.mic))
    .map(audit => ({ ...audit, listings: audit.listings.filter(row => !veto.has(row.providerSymbol)) }));
  const foundation = buildGermanyIdentityFoundation(foundationAudits, masters.map(m => ({ mic: m.mic, ...m.source })), existing,
    { exchangeNames: Object.fromEntries(config.venues.map(v => [v.mic, v.name || v.mic])), generatedAt: universe.generatedAt });
  foundation.freshValidationVetoes = [...veto].map(([providerSymbol, reasons]) => ({ providerSymbol, reasons }));
  foundation.counts.freshValidationVetoedCandidates = veto.size;
  return { universe, exchanges, index, foundation, equityValidation };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = name => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
  const path = arg('config'); if (!path) throw new Error('Usage: --config=<json> [--root=<repo>] [--out=<directory>] [--foundation-out=<private-file>]');
  const root = resolve(arg('root') || process.cwd());
  const config = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const result = buildGermanyReports(config, root), out = resolve(root, arg('out') || 'reports/marketstack');
  mkdirSync(out, { recursive: true });
  const foundationOut = resolve(root, arg('foundation-out') || '.market-cache/marketstack/germany-canonical-foundation.json');
  if (/\/(quant\/data|discover\/data|dashboard\/data)(\/|$)/.test(foundationOut)) throw new Error('FOUNDATION_OUTPUT_MUST_BE_PRIVATE');
  mkdirSync(dirname(foundationOut), { recursive: true }); writeFileSync(foundationOut, JSON.stringify(result.foundation.layer) + '\n');
  const foundationSummary = { schemaVersion: 'germany-canonical-metadata-foundation-summary-1.0.0', generatedAt: result.foundation.layer.generatedAt,
    counts: result.foundation.counts, publication: result.foundation.publication, productionActivated: false,
    generationScript: 'scripts/market/build-marketstack-germany-reports.mjs',
    blockedDecisions: result.foundation.decisions.filter(d => d.status === 'BLOCKED'),
    freshValidationVetoes: result.foundation.freshValidationVetoes,
    retainedExistingListingIds: result.foundation.decisions.filter(d => d.retainedExistingListingId).map(d => d.listingId),
    limitations: result.foundation.limitations };
  for (const [name, report] of [['germany_marketstack_universe', result.universe], ['germany_exchange_coverage', result.exchanges],
    ['germany_index_coverage', result.index], ['germany_canonical_foundation_summary', foundationSummary],
    ['germany_full_equity_validation', result.equityValidation]])
    if (report) { const output = resolve(out, name + '.json'); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify({ output: out, foundationOutput: foundationOut, counts: result.universe.counts, foundation: result.foundation.counts, allRequestedDirectoriesObserved: result.universe.allRequestedDirectoriesObserved,
    indices: result.index?.indices.map(i => ({ index: i.index, observed: i.observedComponents, matched: i.exactISINVenueMatches })) || [] }));
}
