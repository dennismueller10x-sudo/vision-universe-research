/** Offline, bounded supplemental US latest diagnostics. These tasks never
 * approve an identity, replace the US baseline, or fetch a historical window.
 * Callers execute the plan through the authoritative budgeted server client.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VENUES = new Set(['XNAS', 'XNYS', 'XASE', 'ARCX', 'BATS', 'IEXG']);
const rejectedIdentity = c => String(c.identityStatus || '').startsWith('REJECTED_') ||
  c.identityStatus === 'CONFLICTING_PROVIDER_IDENTITY_METADATA' || (c.metadataConflictFields || []).length > 0;
const priority = r => r.consumer && r.activeStatus.baseline === 'ACTIVE' &&
  ['EQUITY_COMMON', 'ADR', 'REIT'].includes(r.instrumentClassification.investigativeType) ? 1 : 3;

export function planUSGapPrices(unmatched, quality, options = {}) {
  const maxCredits = options.maxCredits ?? 2000, batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(maxCredits) || maxCredits < 0 || maxCredits > 2000 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error('Supplemental US diagnostics require max 2000 credits and batch size1..100');
  if (!Array.isArray(unmatched?.rows) || !Array.isArray(quality?.rows) ||
    unmatched.protectedBaselineSource?.sha256 !== quality.protectedBaselineSource?.sha256)
    throw new Error('Matching protected US investigation reports required');
  const byListing = new Map(), exclusions = [];
  const add = (r, symbol, mic, basis, diagnosticReason) => {
    if (!VENUES.has(mic) || typeof symbol !== 'string' || !/^[A-Z0-9.^_-]{1,32}$/.test(symbol)) {
      exclusions.push({ securityId: r.securityId, symbol, mic, reason: 'UNSUPPORTED_VENUE_OR_SYMBOL_REVIEW' }); return;
    }
    const key = mic + ':' + symbol, existing = byListing.get(key) || { id: key, symbol, mic, priority: priority(r), targets: [] };
    const target = { securityId: r.securityId, baselineSymbol: r.providerSymbol, expectedMics: r.expectedMics,
      baselineInstrumentType: r.baselineInstrumentType, investigativeType: r.instrumentClassification.investigativeType,
      baselineActiveStatus: r.activeStatus.baseline, expectedCurrency: 'USD', diagnosticReason, candidateBasis: basis,
      consumerUseApproved: false, canonicalWritesApproved: false };
    if (!existing.targets.some(t => t.securityId === r.securityId)) existing.targets.push(target);
    existing.priority = Math.min(existing.priority, priority(r)); byListing.set(key, existing);
  };
  for (const r of unmatched.rows) {
    for (const c of r.candidates || []) {
      if (rejectedIdentity(c)) { exclusions.push({ securityId: r.securityId, symbol: c.symbol, mic: c.mic, reason: 'CONFLICTING_IDENTITY_EVIDENCE' }); continue; }
      const alias = (r.symbolAliases || []).find(a => a.symbol === c.symbol);
      const observedExact = c.symbol === r.providerSymbol;
      if (!observedExact && !alias) continue;
      // Existing directory or ticker-metadata evidence makes a bounded price
      // diagnostic plausible. It does not establish issuer/listing equivalence.
      add(r, c.symbol, c.mic, alias?.basis || (c.secVenueCorroborated ? 'SEC_VENUE_CORROBORATED_EXACT_SYMBOL' :
        c.source?.kind === 'API_TICKER_METADATA' ? 'OBSERVED_TICKER_METADATA' : 'OBSERVED_OTHER_VENUE_DIRECTORY'), 'UNMATCHED_LISTING_DIAGNOSTIC');
    }
  }
  for (const r of quality.rows) {
    if (r.activeStatus.officialBaselineListingRemovalFiled && r.latestQuality?.originalStatus === 'STALE_LATEST_ACTIVE') {
      exclusions.push({ securityId: r.securityId, symbol: r.providerSymbol, mic: r.expectedMics[0] || null,
        reason: 'STALE_FLAG_EXPLAINED_BY_OFFICIAL_CLASS_REMOVAL_FILED_HISTORY_RETAINED' }); continue;
    }
    for (const mic of r.expectedMics) add(r, r.providerSymbol, mic, 'ORIGINAL_EXACT_DIRECTORY_MATCH', 'ONE_BOUNDED_RECHECK_OF_REJECTED_LATEST');
  }
  const all = [...byListing.values()].sort((a, b) => a.priority - b.priority || a.mic.localeCompare(b.mic, 'en') || a.symbol.localeCompare(b.symbol, 'en'));
  const selected = all.slice(0, maxCredits), deferred = all.slice(maxCredits).map(r => ({ ...r, reason: 'BOUNDED_CREDIT_CEILING' }));
  const tasks = [];
  for (const mic of [...new Set(selected.map(r => r.mic))].sort()) {
    const rows = selected.filter(r => r.mic === mic);
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const members = rows.slice(offset, offset + batchSize);
      tasks.push({ id: 'us-gap-extra-' + mic + '-' + offset, label: 'us-gap-latest-diagnostic', endpoint: '/eod/latest',
        params: { symbols: members.map(r => r.symbol).join(','), exchange: mic, limit: 1000 }, maxPages: 1,
        cacheTtlMs: 0, retries: 0, conservativeEstimatedCredits: members.length, targets: members });
    }
  }
  return { schemaVersion: 1, generatedAt: options.generatedAt || new Date().toISOString(),
    scope: 'BOUNDED_SUPPLEMENTAL_US_LATEST_DIAGNOSTICS_NOT_IDENTITY_APPROVAL',
    protectedBaselineSource: unmatched.protectedBaselineSource, matchedDirectoryBaselineUnchanged: unmatched.matchedDirectoryBaselineUnchanged,
    maxEstimatedCredits: maxCredits, maxPagesPerTask: 1, maxRetries: 0,
    estimatedCredits: selected.length, estimatedRequests: tasks.length,
    candidateProviderListings: all.length, selectedProviderListings: selected.length,
    uniqueBaselineSecuritiesRepresented: new Set(selected.flatMap(r => r.targets.map(t => t.securityId))).size,
    deferredProviderListings: deferred.length, excludedCandidates: exclusions.length,
    priceFrequency: 'EOD', delayState: 'EOD_ONLY', identityAcceptance: 'NOT_IMPLIED_BY_PRICE_RESPONSE',
    unchangedOriginalQualityRejections: quality.rows.length,
    instructions: ['Reserve credits before each request; stop at the shared budget ceiling and do not retry these diagnostics automatically.',
      'No history windows. Keep raw responses private and publish only identity, currency, date and rejection metadata.',
      'A same-symbol different-MIC or syntax alias is not an approved replacement listing.',
      'Every original quality flag remains recorded even if one fresh recheck passes.',
      'Regenerate after supplementary metadata to add newly observed candidates; do not infer symbols from names.'],
    tasks, deferred, exclusions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  const unmatched = JSON.parse(readFileSync(resolve(args.unmatched || 'reports/marketstack/us_marketstack_unmatched_classification.json')));
  const quality = JSON.parse(readFileSync(resolve(args.quality || 'reports/marketstack/us_marketstack_quality_flags.json')));
  const result = planUSGapPrices(unmatched, quality, { maxCredits: args['max-credits'] === undefined ? undefined : Number(args['max-credits']) });
  if (!args.out) throw new Error('Required --out=private-request-plan.json');
  writeFileSync(resolve(args.out), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output: args.out, estimatedCredits: result.estimatedCredits, estimatedRequests: result.estimatedRequests,
    candidateProviderListings: result.candidateProviderListings, uniqueBaselineSecuritiesRepresented: result.uniqueBaselineSecuritiesRepresented }));
}
