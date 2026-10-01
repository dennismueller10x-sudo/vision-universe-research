// Read-only diagnostics. Heuristic warnings never delete or mutate data.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { resolveProductUniverse, loadGlobalEquities } from '../market/universe-source.mjs';
const G = createRequire(import.meta.url)('../../quant/engines/global-equities.js');
const arg = name => process.argv.find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3);
const root = resolve(arg('root') || '.'), layer = loadGlobalEquities(root);
if (!layer) throw Error('GLOBAL_LAYER_MISSING');
G.validate(layer);
const source = resolveProductUniverse(root), members = new Map(source.securities.map(s => [s.securityId, s]));
const rows = layer.listings.map(g => {
  const member = members.get(g.securityId), errors = [], warnings = [];
  if (!member || member.ticker !== g.ticker || member.listingId !== g.listingId) errors.push('CENTRAL_IDENTITY_MISMATCH');
  const seriesPath = join(root, 'quant/data/market/discover-series', g.securityId + '.json');
  const series = existsSync(seriesPath) ? JSON.parse(readFileSync(seriesPath)) : null;
  const quality = G.priceQuality(series?.points);
  for (const issue of quality) (issue === 'PRICE_SPIKE_REVIEW' ? warnings : errors).push(issue);
  const priceAsOf = series?.points?.at(-1)?.[0] || null;
  if (priceAsOf && Date.now() - Date.parse(priceAsOf) > 7 * 86400000) warnings.push('PRICE_SERIES_STALE');
  const fundamentalPath = join(root, 'quant/data/sec/consumer', 'CIK' + g.cik + '.json');
  if (g.coverage.fundamentals !== 'NONE' && !existsSync(fundamentalPath)) errors.push('FUNDAMENTAL_COVERAGE_MISMATCH');
  const valuationReason = G.valuationGate({ ...g, companyCountry: g.country }, g.reportingCurrency);
  if (valuationReason) warnings.push(valuationReason);
  return { securityId: g.securityId, companyId: g.companyId, listingId: g.listingId,
    ticker: g.ticker, country: g.country, region: G.region(g.country), exchange: g.exchange,
    tradingCurrency: g.tradingCurrency, reportingCurrency: g.reportingCurrency,
    coverage: g.coverage, priceAsOf, sourceUpdatedAt: g.sourceUpdatedAt, errors, warnings };
});
const report = { schemaVersion: 'global-equities-validation-1.0.0', checkedAt: new Date().toISOString(),
  productMembers: source.securities.length, listings: rows.length,
  errors: rows.reduce((n, r) => n + r.errors.length, 0),
  warnings: rows.reduce((n, r) => n + r.warnings.length, 0), rows };
if (arg('out')) writeFileSync(resolve(arg('out')), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ listings: report.listings, errors: report.errors, warnings: report.warnings, productMembers: report.productMembers }));
process.exitCode = report.errors ? 1 : 0;
