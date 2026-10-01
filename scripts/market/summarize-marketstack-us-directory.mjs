/** Complete US baseline versus authenticated exchange-directory metadata.
 * Directory membership/has_eod does not prove correct prices or company identity.
 * Aggregates bounded resumed page batches without treating partial absence as missing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXCHANGE_MICS, symbolVariants } from './benchmark-marketstack-us.mjs';
import { isConsumerInstrument } from './universe-source.mjs';
const countBy = (rows, fn) => rows.reduce((out, row) => { const k = fn(row) || 'UNKNOWN'; out[k] = (out[k] || 0) + 1; return out; }, {});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function summarizeUSDirectory(eligibility, probes, options = {}) {
  if (!Array.isArray(eligibility?.decisions) || !eligibility.decisions.length || !Array.isArray(probes)) throw new Error('Eligibility and probe array required');
  if (new Set(eligibility.decisions.map(r => r.securityId || r.ticker)).size !== eligibility.decisions.length)
    throw new Error('Duplicate baseline security identity');
  const venues = new Map();
  for (const probe of probes) for (const endpoint of probe.endpoints || []) {
    if (!String(endpoint.label || '').startsWith('complete-us-directory')) continue;
    const mic = /^exchanges\/([^/]+)\/tickers$/.exec(endpoint.endpoint)?.[1]; if (!mic) continue;
    const rawRows = Array.isArray(endpoint.data) ? endpoint.data : endpoint.data?.data;
    if (!Array.isArray(rawRows)) continue;
    const pagination = endpoint.pagination || endpoint.data?.pagination;
    const start = Number(endpoint.params?.offset || 0), total = pagination?.total;
    const end = endpoint.nextOffset ?? start + rawRows.length;
    const venue = venues.get(mic) || { mic, batches: [], rawRows: [] };
    venue.batches.push({ start, end, rows: rawRows.length, total: Number.isInteger(total) ? total : null,
      intervalValid: Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end - start === rawRows.length,
      checkedAt: endpoint.checkedAt, completeReported: endpoint.complete === true, run: probe.run,
      error: endpoint.ok === false ? endpoint.reason || 'ENDPOINT_ERROR' : null });
    venue.rawRows.push(...rawRows); venues.set(mic, venue);
  }
  const directoryRows = [];
  for (const venue of venues.values()) {
    const totals = [...new Set(venue.batches.map(b => b.total).filter(n => n !== null))];
    venue.total = totals.length === 1 ? totals[0] : null;
    let cursor = 0; const gaps = [];
    for (const batch of venue.batches.filter(b => b.intervalValid).sort((a, b) => a.start - b.start)) {
      if (batch.start > cursor) gaps.push({ from: cursor, to: batch.start });
      cursor = Math.max(cursor, batch.end);
    }
    if (venue.total !== null && cursor < venue.total) gaps.push({ from: cursor, to: venue.total });
    venue.invalidDirectoryRows = venue.rawRows.filter(r => typeof r?.symbol !== 'string' || !r.symbol.trim()).length;
    venue.complete = venue.total !== null && gaps.length === 0 && cursor === venue.total && venue.batches.every(b => b.intervalValid) && venue.invalidDirectoryRows === 0;
    venue.gaps = gaps; venue.inconsistentTotals = totals.length > 1;
    const bySymbol = new Map();
    for (const raw of venue.rawRows) {
      if (!raw.symbol || typeof raw.symbol !== 'string') continue;
      const symbol = raw.symbol.toUpperCase(); const values = bySymbol.get(symbol) || [];
      values.push(raw); bySymbol.set(symbol, values);
    }
    venue.uniqueSymbols = bySymbol.size;
    venue.duplicateSymbolRows = venue.rawRows.length - bySymbol.size;
    for (const [symbol, values] of bySymbol) {
      const flags = [...new Set(values.map(v => typeof v.has_eod === 'boolean' ? v.has_eod : null))];
      const intraday = [...new Set(values.map(v => typeof v.has_intraday === 'boolean' ? v.has_intraday : null))];
      directoryRows.push({ symbol, mic: venue.mic, names: [...new Set(values.map(v => v.name).filter(Boolean))],
        hasEod: flags.length === 1 ? flags[0] : null, hasIntraday: intraday.length === 1 ? intraday[0] : null,
        duplicateRows: values.length - 1, metadataConflict: flags.length > 1 || intraday.length > 1 });
    }
    delete venue.rawRows;
  }
  const bySymbol = new Map();
  for (const row of directoryRows) { const values = bySymbol.get(row.symbol) || []; values.push(row); bySymbol.set(row.symbol, values); }
  const rows = eligibility.decisions.map(security => {
    const symbol = (security.providerSymbol || security.ticker).toUpperCase();
    const mics = security.mic ? [security.mic] : EXCHANGE_MICS[security.exchange] || [];
    const exact = bySymbol.get(symbol) || [], sameVenue = exact.filter(r => mics.includes(r.mic));
    const variants = symbolVariants(symbol).flatMap(s => bySymbol.get(s) || []).filter(r => mics.includes(r.mic));
    const expectedVenuesComplete = mics.length > 0 && mics.every(m => venues.get(m)?.complete);
    let status = 'DIRECTORY_UNOBSERVED_PARTIAL';
    if (!mics.length) status = 'VENUE_UNRESOLVED';
    else if (sameVenue.length === 1) status = sameVenue[0].metadataConflict ? 'DIRECTORY_METADATA_CONFLICT' : 'DIRECTORY_MATCHED';
    else if (sameVenue.length > 1) status = 'AMBIGUOUS_LISTING';
    else if (variants.length) status = 'SYMBOL_VARIANT_REVIEW';
    else if (expectedVenuesComplete) status = exact.length ? 'EXCHANGE_MISMATCH' : 'DIRECTORY_ABSENT_COMPLETE';
    return { securityId: security.securityId || null, ticker: security.ticker, providerSymbol: symbol,
      exchange: security.exchange, expectedMics: mics, expectedVenuesComplete,
      activeStatus: security.active_status || 'UNKNOWN', instrumentType: security.instrument_type || 'UNKNOWN',
      productEligibility: security.product_eligibility, productMember: security.product_eligibility !== 'EXCLUDED',
      consumer: security.product_eligibility !== 'EXCLUDED' && isConsumerInstrument(security.instrument_type),
      status, directoryListing: sameVenue.length === 1 ? sameVenue[0] : null,
      otherVenueCandidates: exact.filter(r => !mics.includes(r.mic)), symbolVariantCandidates: variants,
      actualPriceValidation: 'NOT_TESTED_COMPLETE_UNIVERSE', companyIdentityValidation: 'NOT_PROVEN_BY_SYMBOL_MIC_AND_NAME',
      missingClassification: !['DIRECTORY_ABSENT_COMPLETE', 'EXCHANGE_MISMATCH'].includes(status) ? null :
        security.active_status === 'INACTIVE' ? 'INACTIVE_NOT_PROVEN_DELISTED' : security.instrument_type || 'UNKNOWN' };
  }).sort((a, b) => a.ticker.localeCompare(b.ticker, 'en'));
  const summary = selected => ({ total: selected.length, directoryMatched: selected.filter(r => r.status === 'DIRECTORY_MATCHED').length,
    hasEodAdvertised: selected.filter(r => r.status === 'DIRECTORY_MATCHED' && r.directoryListing.hasEod === true).length,
    hasEodFalse: selected.filter(r => r.status === 'DIRECTORY_MATCHED' && r.directoryListing.hasEod === false).length,
    byStatus: countBy(selected, r => r.status) });
  const matched = rows.filter(r => r.status === 'DIRECTORY_MATCHED'), missing = rows.filter(r => ['DIRECTORY_ABSENT_COMPLETE', 'EXCHANGE_MISMATCH'].includes(r.status));
  const requiredKnownMics = [...new Set(rows.flatMap(r => r.expectedMics))];
  return { schemaVersion: 1, generatedAt: new Date().toISOString(),
    scope: 'COMPLETE_RETAINED_US_BASELINE_AGAINST_AUTHENTICATED_METADATA',
    baselineSource: options.baselineSource || null, probeSources: options.probeSources || null,
    evidenceLevel: 'AUTHENTICATED_EXCHANGE_DIRECTORY_NOT_PRICE_VALIDATION',
    directoryComplete: requiredKnownMics.length > 0 && requiredKnownMics.every(mic => venues.get(mic)?.complete),
    requiredKnownMics,
    allBaselineVenuesCovered: rows.every(r => r.expectedVenuesComplete),
    venues: [...venues.values()],
    totals: { TOTAL_EXISTING_TIINGO: rows.length, TOTAL_MARKETSTACK_MATCHED: matched.length,
      TOTAL_MARKETSTACK_MISSING: missing.length, TOTAL_UNRESOLVED: rows.length - matched.length - missing.length,
      TOTAL_EOD_ADVERTISED: matched.filter(r => r.directoryListing.hasEod === true).length,
      TOTAL_SYMBOL_MISMATCH: rows.filter(r => r.status === 'SYMBOL_VARIANT_REVIEW').length,
      TOTAL_EXCHANGE_MISMATCH: rows.filter(r => r.status === 'EXCHANGE_MISMATCH').length,
      TOTAL_DATA_MISMATCH: null, TOTAL_ACTUAL_PRICES_TESTED_IN_COMPLETE_UNIVERSE: 0 },
    subsets: { baseline: summary(rows), product: summary(rows.filter(r => r.productMember)), consumer: summary(rows.filter(r => r.consumer)),
      activeCommonEquities: summary(rows.filter(r => r.instrumentType === 'EQUITY_COMMON' && r.activeStatus === 'ACTIVE')) },
    missingByClassification: countBy(missing, r => r.missingClassification),
    missingActiveCommonEquities: missing.filter(r => r.instrumentType === 'EQUITY_COMMON' && r.activeStatus === 'ACTIVE').map(r => r.ticker),
    limitations: ['has_eod and has_intraday are directory advertisements, not empirical endpoint or freshness guarantees.',
      'No complete-universe price, company identity, corporate-action or adjustment comparison is implied.',
      'Partial or unqueried venue absence remains unresolved, not provider-missing.',
      'Point-in-time directory consistency is not guaranteed across resumed calls; changed totals block completeness.',
      'Ticker reuse, duplicate names, stale venue labels and symbol variants require further identity verification.'], rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  if (!args.probes) throw new Error('Usage: --probes=probe1.json,probe2.json [--root=repo] [--out=report.json]');
  const root = resolve(args.root || process.cwd()); const baselinePath = 'quant/data/market/security-master/eligibility.json';
  const baselineBytes = readFileSync(resolve(root, baselinePath));
  const paths = args.probes.split(','); const probeBytes = paths.map(p => readFileSync(resolve(p)));
  const result = summarizeUSDirectory(JSON.parse(baselineBytes), probeBytes.map(b => JSON.parse(b)), {
    baselineSource: { path: baselinePath, sha256: sha(baselineBytes) }, probeSources: paths.map((p, i) => ({ path: p, sha256: sha(probeBytes[i]) })) });
  const out = resolve(args.out || root + '/reports/marketstack/marketstack_tiingo_us_api_diff.json');
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output: out, directoryComplete: result.directoryComplete, totals: result.totals, subsets: result.subsets,
    venues: result.venues.map(({ batches, ...v }) => v) }));
}
