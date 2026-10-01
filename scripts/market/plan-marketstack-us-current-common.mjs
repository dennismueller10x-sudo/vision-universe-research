/** Inventory existing exact current-MIC requests before further common-equity
 * diagnostics. Requests on another provider MIC are never cache substitutes.
 * Public inventory contains metadata only; execution belongs to the parent run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractUSLatestDiagnostics } from './classify-marketstack-us-gaps.mjs';
const VENUES = new Set(['XNAS', 'XNYS', 'XASE', 'ARCX', 'BATS', 'IEXG']);
export function inventoryCurrentUSCommonCache(unmatched, probes, options = {}) {
  const maxCredits = options.maxCredits ?? 478;
  if (!Number.isInteger(maxCredits) || maxCredits < 0 || maxCredits > 478 || !Array.isArray(probes) ||
      !Array.isArray(unmatched?.currentCommonEquityGaps) || !Array.isArray(unmatched?.rows)) throw new Error('Current common report, probes and max478 credit budget required');
  const input = unmatched.currentCommonEquityGaps;
  if (new Set(input.map(r => r.securityId)).size !== input.length) throw new Error('Duplicate current common security identity');
  const baseline = new Map(unmatched.rows.map(r => [r.securityId, r]));
  const endpoints = probes.flatMap(p => (p.endpoints || []).map(e => ({ ...e, runId: p.run?.runId || null })));
  const rows = input.map(r => {
    const original = baseline.get(r.securityId);
    if (!original || original.providerSymbol !== r.ticker || !original.consumer ||
        !original.independentCurrentListing?.genuineCommonEquityRoleObserved ||
        original.independentCurrentListing?.currentListing?.mic !== r.publicListingMic || !VENUES.has(r.publicListingMic))
      throw new Error('Current common identity, membership or venue disagreement');
    const matching = e => {
      const path = e.endpoint?.replace(/^\//, ''), ticker = /^tickers\/([^/]+)\/eod\/latest$/.exec(path || '');
      return e.params?.exchange === r.publicListingMic && (path === 'eod/latest' && String(e.params?.symbols || '').split(',').includes(r.ticker) || ticker?.[1] === r.ticker);
    };
    const cached = endpoints.filter(matching);
    const diagnosticProbes = cached.map(e => ({ run: { runId: e.runId }, endpoints: [{ ...e, label: 'us-current-common-gap-latest' }] }));
    const diagnostics = extractUSLatestDiagnostics(diagnosticProbes, r.ticker, r.publicListingMic,
      { securityId: r.securityId, ticker: r.ticker, instrumentType: original.instrumentClassification.investigativeType,
        activeStatus: original.activeStatus.baseline, consumer: original.consumer, productMember: original.productMember }, unmatched.asOfDate);
    return { securityId: r.securityId, symbol: r.ticker, mic: r.publicListingMic, baselineMics: original.expectedMics,
      protectedBaselineConsumer: original.consumer, independentlyObservedRole: 'EQUITY_COMMON',
      baselineCurrentVenueDisagreement: r.baselineCurrentVenueDisagreement === true,
      baselineCurrentIssuerDisplayNameDisagreement: r.baselineCurrentIssuerDisplayNameDisagreement === true,
      currentSecurityScope: r.currentSecurityScope || null,
      anyVenueSameSymbolPriceObservationReturned: r.anyVenueSameSymbolPriceObservationReturned === true,
      anyVenueSameSymbolLatestValidatedAtProviderMic: r.anyVenueSameSymbolLatestValidatedAtProviderMic === true,
      identifiedSecurityPriceObservationReturnedAtProviderMic: r.identifiedSecurityPriceObservationReturnedAtProviderMic === true,
      identifiedSecurityLatestValidatedAtProviderMic: r.identifiedSecurityLatestValidatedAtProviderMic === true,
      cacheStatus: cached.length ? 'EXACT_CURRENT_MIC_REQUEST_CACHED' : 'NO_EXACT_CURRENT_MIC_REQUEST_CACHED',
      cachedRequests: cached.length, responseDiagnostics: diagnostics,
      lastObservedStatus: diagnostics.at(-1)?.status || 'NOT_TESTED',
      passingLatestAtCurrentMic: diagnostics.at(-1)?.validLatest === true,
      observedProviderMicConflict: diagnostics.some(d => d.reportedMic && d.reportedMic !== r.publicListingMic),
      historicalSecurityContinuityProven: false, providerGloballyUnavailableProven: false, listingAcceptance: 'NOT_IMPLIED_BY_DIAGNOSTIC' };
  });
  const pending = rows.filter(r => !r.cachedRequests), byListing = new Map();
  for (const r of pending) { const key = r.mic + ':' + r.symbol; const item = byListing.get(key) || { symbol: r.symbol, mic: r.mic, securityIds: [] };
    item.securityIds.push(r.securityId); byListing.set(key, item); }
  const all = [...byListing.values()].sort((a, b) => a.mic.localeCompare(b.mic) || a.symbol.localeCompare(b.symbol));
  const selected = all.slice(0, maxCredits), tasks = [];
  for (const mic of [...new Set(selected.map(r => r.mic))]) {
    const members = selected.filter(r => r.mic === mic);
    for (let offset = 0; offset < members.length; offset += 100) { const batch = members.slice(offset, offset + 100);
      tasks.push({ id: 'us-current-common-complete-' + mic + '-' + offset, label: 'us-current-common-gap-coverage', endpoint: '/eod/latest',
        params: { symbols: batch.map(r => r.symbol).join(','), exchange: mic, limit: 1000 }, maxPages: 1, cacheTtlMs: 0, retries: 0,
        conservativeEstimatedCredits: batch.length, targets: batch }); }
  }
  const stamp = { schemaVersion: 1, generatedAt: options.generatedAt || new Date().toISOString(), asOfDate: unmatched.asOfDate,
    protectedBaselineSource: unmatched.protectedBaselineSource, canonicalWrites: 0, identityAcceptance: 'NOT_IMPLIED_BY_PRICE_RESPONSE',
    confirmedProviderGloballyUnavailable: 0 };
  const statuses = rows.reduce((out, r) => { out[r.lastObservedStatus] = (out[r.lastObservedStatus] || 0) + 1; return out; }, {});
  return { inventory: { ...stamp, scope: 'CURRENT_COMMON_CONSUMER_EXACT_VENUE_REQUEST_CACHE',
    totals: { currentCommonConsumerSubset: rows.length, cachedExactCurrentMic: rows.filter(r => r.cachedRequests).length,
      lackingExactCurrentMicCache: pending.length,
      requiredCurrentListingEndpointGaps: rows.filter(r => r.cachedRequests && !r.passingLatestAtCurrentMic).length,
      anyVenueSameSymbolQuoteObserved: rows.filter(r => r.anyVenueSameSymbolPriceObservationReturned).length,
      noSameSymbolQuoteObservedInQueriedRoutes: rows.filter(r => !r.anyVenueSameSymbolPriceObservationReturned).length,
      anyVenueSameSymbolLatestValidAtProviderMic: rows.filter(r => r.anyVenueSameSymbolLatestValidatedAtProviderMic).length,
      identifiedSecurityQuoteObservedAtProviderMic: rows.filter(r => r.identifiedSecurityPriceObservationReturnedAtProviderMic).length,
      identifiedSecurityLatestValidAtProviderMic: rows.filter(r => r.identifiedSecurityLatestValidatedAtProviderMic).length,
      passingLatestAtCurrentMic: rows.filter(r => r.passingLatestAtCurrentMic).length,
      statuses }, rows },
    plan: { ...stamp, scope: 'BOUNDED_UNCACHED_CURRENT_COMMON_MIC_LATEST_DIAGNOSTICS', maxEstimatedCredits: maxCredits,
      estimatedCredits: selected.length, estimatedRequests: tasks.length, maxPagesPerTask: 1, maxRetries: 0,
      selectedListings: selected.length, deferredListings: byListing.size - selected.length, cachedExactCurrentMicSkipped: rows.length - pending.length,
      tasks, deferred: all.slice(selected.length) } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  if (!args.probes || !args['request-plan']) throw new Error('--probes=private-paths and --request-plan=private-plan required');
  const load = p => JSON.parse(readFileSync(resolve(p)));
  const { inventory, plan } = inventoryCurrentUSCommonCache(load(args.unmatched || 'reports/marketstack/us_marketstack_unmatched_classification.json'), args.probes.split(',').map(load));
  writeFileSync(resolve(args.out || 'reports/marketstack/us_marketstack_current_common_cache.json'), JSON.stringify(inventory, null, 2) + '\n');
  writeFileSync(resolve(args['request-plan']), JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify({ inventory: inventory.totals, credits: plan.estimatedCredits, requests: plan.estimatedRequests }));
}
