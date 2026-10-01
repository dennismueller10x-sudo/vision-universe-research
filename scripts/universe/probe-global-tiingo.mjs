// Opt-in credentialed validation through the existing Tiingo adapter.
// Eight requests maximum, no raw prices published, no ingestion or rollout.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolveProductUniverse } from '../market/universe-source.mjs';
const require = createRequire(import.meta.url);
const Tiingo = require('../../providers/tiingo/adapter.js');
const Symbols = require('../../quant/engines/symbol-mapping.js');
const root = process.cwd(), key = process.env.TIINGO_API_KEY;
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6);
const report = { schemaVersion: 'global-tiingo-probe-1.0.0', checkedAt: new Date().toISOString(),
  state: key ? 'RUNNING' : 'NOT_CONFIGURED', requestBudget: 8, requests: 0, rows: [] };
if (key) {
  const universe = resolveProductUniverse(root);
  const tickers = ['NVDA', 'SAP', 'ASML', 'NVO', 'NVS', 'TSM', 'BABA', 'XPEV'];
  const selected = tickers.map(t => universe.securities.find(s => s.ticker === t)).filter(Boolean);
  const registry = Symbols.createRegistry(selected.map(s => ({ securityId: s.securityId, providerId: 'tiingo',
    providerSymbol: s.providerSymbol || s.ticker, mic: s.mic, currency: s.tradingCurrency || 'USD', country: s.listingCountry || 'US', confidence: 'verified' })));
  const provider = Tiingo.createTiingoProvider({ apiKey: key, symbolRegistry: registry,
    limits: { maxRetries: 0, concurrency: 1, requestsPerHour: 8, requestsPerDay: 8 },
    fetchImpl: async (url, init) => {
      if (report.requests >= report.requestBudget) throw Error('REQUEST_BUDGET_REACHED');
      report.requests++;
      return fetch(url, init);
    } });
  for (const s of selected) {
    const series = JSON.parse(readFileSync(root + '/quant/data/market/discover-series/' + s.securityId + '.json'));
    const last = series.points.at(-1)[0], from = new Date(Date.parse(last) - 7 * 86400000).toISOString().slice(0, 10);
    try {
      const result = await provider.getDailyBars(s.securityId, { from, to: last, maxWaitMs: 15000 });
      const bars = result.data?.bars || [];
      const valid = result.available && bars.length && bars.every(b => b.close > 0 && b.currency === (s.tradingCurrency || 'USD'));
      const prior = new Map(series.points), matches = bars.filter(b => prior.has(b.date.slice(0, 10)) && Math.abs(prior.get(b.date.slice(0, 10)) - b.close) <= 0.011).length;
      report.rows.push({ ticker: s.ticker, securityId: s.securityId, companyId: s.companyId || null,
        exchange: s.exchange, currency: result.data?.currency || null, historicalThrough: last,
        returnedBars: bars.length, positivePrices: Boolean(valid), sameDateMatches: matches,
        state: valid ? 'API_VERIFIED' : 'UNAVAILABLE', reason: result.available ? null : result.reason });
    } catch { report.rows.push({ ticker: s.ticker, state: 'UNAVAILABLE', reason: 'PROBE_FAILED' }); }
  }
  report.state = report.rows.length === 8 && report.rows.every(r => r.state === 'API_VERIFIED') ? 'PASS' : 'PARTIAL';
}
if (out) writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
