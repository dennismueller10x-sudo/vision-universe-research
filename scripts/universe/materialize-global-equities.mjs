// Add identity to existing published artifacts without rebuilding US records.
// Valuation corrections must come from an isolated normal Discover build at
// the same price date. This is a controlled initial rollout, not a new pipeline.
import { readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { loadGlobalEquities } from '../market/universe-source.mjs';
const G = createRequire(import.meta.url)('../../quant/engines/global-equities.js');
const arg = n => process.argv.find(a => a.startsWith('--' + n + '='))?.slice(n.length + 3);
const root = resolve(arg('root') || '.'), apply = process.argv.includes('--apply');
const layer = G.validate(loadGlobalEquities(root));
const build = arg('discover-build');
if (!build) throw Error('ISOLATED_DISCOVER_BUILD_REQUIRED');
const byTicker = new Map(layer.listings.map(g => [g.ticker, g]));
const byListing = new Map(layer.listings.map(g => [g.listingId, g]));
const details = new Map();
for (const g of layer.listings) {
  const next = JSON.parse(readFileSync(join(resolve(build), 'stocks/US_REAL', g.ticker + '.json')));
  const before = JSON.parse(readFileSync(join(root, 'discover/data/stocks/US_REAL', g.ticker + '.json')));
  if (next.companyId !== g.companyId || next.listingId !== g.listingId || next.securityId !== g.securityId || before.securityId !== g.securityId || next.asOf !== before.asOf) throw Error('GLOBAL_BUILD_IDENTITY_OR_DATE_MISMATCH:' + g.ticker);
  details.set(g.ticker, next);
}
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.json') ? [join(dir, e.name)] : []); }
function metadata(g) { return { companyId: g.companyId, listingId: g.listingId, country: g.country,
  region: G.region(g.country), listingCountry: g.listingCountry, currency: g.tradingCurrency,
  reportingCurrency: g.reportingCurrency, listingType: g.listingType, coverage: g.coverage }; }
function decorate(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(decorate); return; }
  if (value.symbol && value.metrics && byTicker.has(value.symbol)) {
    const g = byTicker.get(value.symbol), next = details.get(value.symbol);
    if (value.securityId && value.securityId !== g.securityId) throw Error('GLOBAL_PRODUCT_IDENTITY_MISMATCH');
    Object.assign(value, metadata(g));
    // Only the share-based fields corrected by the existing builder change.
    for (const k of ['f_pe', 'f_ps', 'f_fcfYield']) {
      if (Object.hasOwn(value.metrics, k)) value.metrics[k] = next.metrics[k] ?? null;
      if (value.metricStatus && next.metricStatus[k]) value.metricStatus[k] = next.metricStatus[k];
    }
    if (value.fundamentals?.valuation && next.fundamentals?.valuation) {
      const context = value.fundamentals.valuation.context;
      value.fundamentals.valuation = { ...next.fundamentals.valuation, context };
    }
  }
  if (value.i && value.s && byListing.has(value.i)) {
    const g = byListing.get(value.i);
    if (g.ticker !== value.s) throw Error('GLOBAL_SEARCH_IDENTITY_MISMATCH');
    // Preserve the legacy country/exchange fields and add company geography.
    Object.assign(value, { cc: g.country, ci: g.companyId, li: g.listingId, u: g.tradingCurrency });
    if (Object.hasOwn(value, 'm')) { value.rg = G.region(g.country); value.x = g.exchange; }
    else value.r = G.region(g.country);
  }
  Object.values(value).forEach(decorate);
}
const changed = [];
for (const dir of ['quant/data/universe/instruments', 'quant/data/universe/search', 'discover/data']) {
  for (const file of files(join(root, dir))) {
    // Preserve every non-global US detail byte-for-byte, including its
    // historical recommendation payload. Shared current cards are enriched.
    if (file.startsWith(join(root, 'discover/data/stocks/US_REAL') + '/') && !byTicker.has(file.split('/').at(-1).slice(0, -5))) continue;
    const data = JSON.parse(readFileSync(file)), before = JSON.stringify(data);
    if (dir.endsWith('/instruments')) data.instruments = G.overlay(data.instruments, layer);
    else decorate(data);
    if (JSON.stringify(data) === before) continue;
    changed.push(file.slice(root.length + 1));
    if (apply) { const temp = file + '.tmp'; writeFileSync(temp, JSON.stringify(data) + '\n'); renameSync(temp, file); }
  }
}
console.log(JSON.stringify({ applied: apply, listings: layer.listings.length, changedFiles: changed.length, paths: changed }));
