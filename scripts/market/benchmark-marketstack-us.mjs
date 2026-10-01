/** Complete retained US baseline comparison against an official Marketstack
 * listing catalog. Catalog inclusion is evidence of identity coverage only:
 * no price, entitlement, freshness, adjustment, or realtime claim is made.
 * This script never fetches a provider endpoint or changes universe membership.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isConsumerInstrument } from './universe-source.mjs';

export const EXCHANGE_MICS = Object.freeze({
  NASDAQ: ['XNAS'], NYSE: ['XNYS'], AMEX: ['XASE'], 'NYSE MKT': ['XASE'],
  'NYSE AMERICAN': ['XASE'], 'NYSE ARCA': ['ARCX'], BATS: ['BATS'],
  IEX: ['IEXG']
});
const upper = value => String(value ?? '').trim().toUpperCase();
const countBy = (rows, fn) => rows.reduce((counts, row) => {
  const key = fn(row) || 'UNKNOWN'; counts[key] = (counts[key] || 0) + 1; return counts;
}, {});
const hash = data => createHash('sha256').update(data).digest('hex');

/** Punctuation alternatives are review candidates, never automatically joined.
 * Removing punctuation entirely would merge preferreds and share classes. */
export function symbolVariants(symbol) {
  const s = upper(symbol);
  return [...new Set([s.replaceAll('-', '.'), s.replaceAll('.', '-')])].filter(v => v !== s);
}

export function buildUSBenchmark(eligibility, catalog, options = {}) {
  if (!Array.isArray(eligibility?.decisions) || !eligibility.decisions.length)
    throw new Error('Nonempty retained US eligibility baseline required');
  if (!Array.isArray(catalog?.rows) || !catalog.rows.length)
    throw new Error('Nonempty Marketstack listing catalog required');
  const baseline = eligibility.decisions;
  if (new Set(baseline.map(r => r.securityId || r.ticker)).size !== baseline.length)
    throw new Error('Duplicate baseline security identity');
  const bySymbol = new Map(); const seen = new Set(); let duplicates = 0;
  for (const raw of catalog.rows) {
    const row = { symbol: upper(raw.symbol ?? raw.ticker), mic: upper(raw.mic ?? raw.exchange_mic) };
    if (!row.symbol || !row.mic) throw new Error('Catalog listing requires symbol and MIC');
    const key = row.symbol + '\0' + row.mic;
    if (seen.has(key)) { duplicates++; continue; } seen.add(key);
    const list = bySymbol.get(row.symbol) || []; list.push(row); bySymbol.set(row.symbol, list);
  }
  const rows = baseline.map(security => {
    const providerSymbol = upper(security.providerSymbol || security.ticker);
    const expectedMics = security.mic ? [upper(security.mic)] : EXCHANGE_MICS[upper(security.exchange)] || [];
    const exact = bySymbol.get(providerSymbol) || [];
    const matches = exact.filter(row => expectedMics.includes(row.mic));
    const alternatives = symbolVariants(providerSymbol).flatMap(symbol => bySymbol.get(symbol) || [])
      .filter(row => expectedMics.includes(row.mic));
    let status = 'CATALOG_ABSENT';
    if (matches.length === 1) status = 'CATALOG_MATCHED';
    else if (matches.length > 1) status = 'AMBIGUOUS_LISTING';
    else if (!expectedMics.length && exact.length) status = 'EXCHANGE_UNRESOLVED';
    else if (alternatives.length) status = 'SYMBOL_VARIANT_REVIEW';
    else if (exact.length) status = 'EXCHANGE_MISMATCH';
    return {
      securityId: security.securityId || null, ticker: upper(security.ticker),
      providerSymbol, exchange: security.exchange || null, expectedMics,
      instrumentType: security.instrument_type || 'UNKNOWN',
      activeStatus: security.active_status || 'UNKNOWN',
      productEligibility: security.product_eligibility || 'UNKNOWN',
      productMember: security.product_eligibility !== 'EXCLUDED',
      consumer: security.product_eligibility !== 'EXCLUDED' && isConsumerInstrument(security.instrument_type),
      status, matchedListing: matches.length === 1 ? matches[0] : null,
      exactCandidates: exact, symbolVariantCandidates: alternatives,
      dataComparison: 'NOT_TESTED',
      missingClassification: status === 'CATALOG_MATCHED' ? null : (
        status === 'SYMBOL_VARIANT_REVIEW' ? 'PROVIDER_SYMBOL_DIFFERENCE_UNVERIFIED' :
        security.active_status === 'INACTIVE' ? 'INACTIVE_NOT_PROVEN_DELISTED' :
        security.instrument_type || 'UNKNOWN')
    };
  }).sort((a, b) => a.ticker.localeCompare(b.ticker, 'en'));
  const matched = rows.filter(r => r.status === 'CATALOG_MATCHED');
  const missing = rows.filter(r => r.status !== 'CATALOG_MATCHED');
  const product = rows.filter(r => r.productMember);
  const common = rows.filter(r => r.instrumentType === 'EQUITY_COMMON' && r.activeStatus === 'ACTIVE');
  const summarize = subset => ({ total: subset.length,
    catalogMatched: subset.filter(r => r.status === 'CATALOG_MATCHED').length,
    catalogUnmatched: subset.filter(r => r.status !== 'CATALOG_MATCHED').length,
    byStatus: countBy(subset, r => r.status), byInstrumentType: countBy(subset, r => r.instrumentType) });
  return {
    schemaVersion: 1, generatedAt: options.generatedAt || new Date().toISOString(),
    scope: 'COMPLETE_RETAINED_US_TIINGO_BASELINE',
    evidenceLevel: 'OFFICIAL_PUBLIC_CATALOG_ONLY',
    limitations: [
      'Catalog absence does not prove authenticated API unavailability.',
      'Catalog publication date and current freshness are unverified.',
      'Catalog includes Finnworlds/Tiingo data; provider independence is not established.',
      'Ticker punctuation alternatives require identity verification before routing.',
      'No actual prices, history depth, corporate actions or live endpoints compared.'
    ],
    source: { baseline: options.baselineSource || null, catalog: catalog.source || null,
      catalogRows: catalog.rows.length, uniqueCatalogListings: seen.size, duplicateCatalogRows: duplicates },
    requests: { authenticatedProviderRequests: 0, estimatedCreditsConsumed: 0 },
    totals: { TOTAL_EXISTING_TIINGO: rows.length, TOTAL_MARKETSTACK_MATCHED: matched.length,
      TOTAL_MARKETSTACK_MISSING: missing.length,
      TOTAL_SYMBOL_MISMATCH: rows.filter(r => r.status === 'SYMBOL_VARIANT_REVIEW').length,
      TOTAL_EXCHANGE_MISMATCH: rows.filter(r => r.status === 'EXCHANGE_MISMATCH').length,
      TOTAL_DATA_MISMATCH: null, TOTAL_DATA_COMPARISON_TESTED: 0 },
    baselineCounts: { byEligibility: countBy(rows, r => r.productEligibility),
      byActiveStatus: countBy(rows, r => r.activeStatus), byInstrumentType: countBy(rows, r => r.instrumentType),
      consumer: rows.filter(r => r.consumer).length, excluded: rows.filter(r => !r.productMember).length },
    subsets: { product: summarize(product), consumer: summarize(rows.filter(r => r.consumer)),
      activeCommonEquities: summarize(common), inactive: summarize(rows.filter(r => r.activeStatus === 'INACTIVE')) },
    missingByClassification: countBy(missing, r => r.missingClassification),
    missingActiveCommonEquities: common.filter(r => r.status !== 'CATALOG_MATCHED').map(r => r.ticker),
    rows
  };
}

/** Aligned canonical OHLC comparison flags discrepancies without choosing a winner.
 * Caller must fetch the SAME listing, trading dates and original currency. */
export function comparePriceSeries(reference, candidate, options = {}) {
  if (!reference.currency || !candidate.currency || reference.currency !== candidate.currency)
    throw new Error('Price comparison requires the same explicit trading currency');
  const sameListingId = reference.listingId && candidate.listingId && reference.listingId === candidate.listingId;
  const sameSecurity = reference.securityId && candidate.securityId && reference.securityId === candidate.securityId;
  const sameVenue = reference.mic && candidate.mic && reference.mic === candidate.mic;
  if (!sameListingId && !(sameSecurity && sameVenue))
    throw new Error('Price comparison requires the same explicit listing identity or security identity and MIC');
  const index = series => {
    const map = new Map();
    for (const bar of series.bars || []) {
      const date = new Date(bar.date + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date) || !Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== bar.date || map.has(bar.date))
        throw new Error('Invalid or duplicate trading date');
      map.set(bar.date, bar);
    } return map;
  };
  const a = index(reference), b = index(candidate), discrepancies = [], unavailable = [];
  const fields = ['open', 'high', 'low', 'close', 'adjustedClose', 'volume', 'splitFactor', 'dividend'];
  const tolerances = { open: .005, high: .005, low: .005, close: .005,
    adjustedClose: .01, volume: .10, splitFactor: 1e-8, dividend: .005, ...options.tolerances };
  let datesCompared = 0;
  for (const [date, left] of a) {
    const right = b.get(date); if (!right) continue; datesCompared++;
    for (const field of fields) {
      const x = left[field], y = right[field];
      if (!Number.isFinite(x) || !Number.isFinite(y)) { unavailable.push({ date, field }); continue; }
      const relativeDifference = Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1e-12);
      if (Math.abs(x - y) > (options.absoluteTolerance ?? 1e-6) && relativeDifference > tolerances[field])
        discrepancies.push({ date, field, reference: x, candidate: y, relativeDifference });
    }
  }
  return { status: datesCompared ? 'COMPARED' : 'NO_OVERLAP', datesCompared,
    referenceFirst: [...a.keys()].sort()[0] || null, candidateFirst: [...b.keys()].sort()[0] || null,
    missingCandidateDates: [...a.keys()].filter(d => !b.has(d)), missingReferenceDates: [...b.keys()].filter(d => !a.has(d)),
    discrepancies, unavailable, adjudication: 'FLAG_ONLY_NO_AUTOMATIC_OVERWRITE' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const eq = arg.indexOf('='); return [arg.slice(2, eq), arg.slice(eq + 1)];
  }));
  if (!args.catalog) throw new Error('Usage: --catalog=normalized-catalog.json [--root=repo] [--out=path]');
  const root = resolve(args.root || process.cwd());
  const baselinePath = resolve(root, 'quant/data/market/security-master/eligibility.json');
  const baselineBytes = readFileSync(baselinePath);
  const benchmark = buildUSBenchmark(JSON.parse(baselineBytes), JSON.parse(readFileSync(resolve(args.catalog))), {
    baselineSource: { path: 'quant/data/market/security-master/eligibility.json', sha256: hash(baselineBytes) }
  });
  const out = resolve(args.out || root + '/reports/marketstack/marketstack_tiingo_us_public_catalog_diff.json');
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(benchmark, null, 2) + '\n');
  console.log(JSON.stringify({ output: out, totals: benchmark.totals, subsets: benchmark.subsets }));
}
