// Existing committed Golden Five sources -> existing Quant event-study input. Offline only.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadGoldenFiveSeries } from './golden-five-series.mjs';
const require = createRequire(import.meta.url);
const C = require('../../quant/engines/technical/canonical-bars.js');
const I = require('../../core/identity.js');
const S = require('../../quant/engines/research-studies.cjs');
export function build(root = fileURLToPath(new URL('../..', import.meta.url))) {
  const spy = JSON.parse(readFileSync(join(root, 'quant/data/market/multi-asset/series/SPY.json'), 'utf8'));
  if (spy.symbol !== 'SPY' || spy.frequency !== 'DAILY' || spy.valueSemantics !== 'PRICE' || spy.unitId !== 'USD_PER_SHARE') throw new Error('SPY_PRICE_SOURCE_REQUIRED');
  const asOf = spy.to, points = spy.points.filter(p => p[0] <= asOf), calendar = points.map(p => p[0]);
  const calendarSet = new Set(calendar), series = loadGoldenFiveSeries(root, C);
  if (Object.keys(series).length !== 5) throw new Error('GOLDEN_FIVE_INPUTS_MISSING');
  const listings = Object.entries(series).map(([ticker, s]) => {
    const securityId = I.securityIdForTicker(ticker);
    const raw = JSON.parse(readFileSync(join(root, 'quant/data/market/golden-preview/daily', securityId + '.json'), 'utf8'));
    const sourceHash = S.hash(raw);
    return { listingId: securityId, issuerId: securityId, sourceHash,
      identity: { mic: raw.mic, instrumentClass: 'COMMON_STOCK', primary: true, validFrom: s.timestamps[0].slice(0, 10), availableAt: raw.updatedAt, sourceHash },
      bars: s.timestamps.map((t, k) => ({ date: t.slice(0, 10), open: s.open[k], high: s.high[k], low: s.low[k], close: s.close[k], volume: s.volume[k],
        closeAt: t.slice(0, 10) + 'T23:59:59.999Z' })).filter(b => calendarSet.has(b.date)) };
  });
  return { schemaVersion: 'technical-event-study-input-1.0.0', asOf, priceBasis: 'SPLIT_ADJUSTED_PRICE', returnBasis: 'PRICE_RETURN',
    currency: 'USD', sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', calendar,
    population: { definition: 'GOLDEN_FIVE_CONDITIONAL_CURRENT_COHORT', sourceHash: S.hash(listings.map(l => l.sourceHash)),
      limitations: ['FIVE_HAND_PICKED_CURRENT_SURVIVORS', 'NO_HISTORICAL_INDEX_MEMBERSHIP', 'PRICE_RETURNS_NO_DIVIDENDS_BOTH_SIDES',
        'DAY_END_CONSERVATIVE_CLOSE_CLOCK_NOT_EXCHANGE_TIMESTAMP', 'CURRENT_SECURITY_ID_USED_AS_ISSUER_PROXY', 'NOT_A_BROAD_POPULATION_OR_CONFIRMATORY_STUDY'] },
    listings, benchmark: { id: 'SPY', currency: 'USD', returnBasis: 'PRICE_RETURN', bars: points.map(([date, close]) => ({ date, close })) } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), p = a.indexOf('--out');
  if (p < 0 || !a[p + 1]) throw new Error('--out outside repository required');
  const out = resolve(a[p + 1]), root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  if (out.startsWith(root + '/')) throw new Error('RESEARCH_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  writeFileSync(out, JSON.stringify(build(root)) + '\n');
}
