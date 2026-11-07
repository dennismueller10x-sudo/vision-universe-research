/* Gemeinsamer Artefaktadapter für DQ und Einzeldiagnose. Kein Anbieterzugriff. */
import { join } from 'node:path';
import { require, REPO_ROOT } from './lib.mjs';
const Q = require(join(REPO_ROOT, 'core/equity-quality.js'));
const Identity = require(join(REPO_ROOT, 'core/identity.js'));
const ReturnSeries = require(join(REPO_ROOT, 'quant/engines/return-series.js'));
const PublishedClose = require(join(REPO_ROOT, 'quant/engines/published-close.js'));
export async function equityRules({ load, now, expected, tickers = null }) {
  const missing = new Set();
  const opt = async path => { try { return await load(path); } catch { missing.add(path); return null; } };
  const index = tickers ? null : await opt('/discover/data/stock-index/US_REAL.json');
  const symbols = (tickers || index?.symbols || []).map(Identity.normalizeTicker).filter(Boolean);
  const logos = await opt('/discover/logos/index.json');
  const legacy = await opt('/dashboard/data/analyst_ratings.json');
  const depots = await opt('/quant/data/product/model-depots-v1.json');
  const trader = await opt('/supertrader/data/portfolio.json');
  const shards = new Map(), capShards = new Map();
  const seriesByTicker = new Map();
  const getSeries = ticker => {
    if (!seriesByTicker.has(ticker)) seriesByTicker.set(ticker, opt('/quant/data/market/discover-series/' + Identity.securityIdForTicker(ticker) + '.json'));
    return seriesByTicker.get(ticker);
  };
  const stocks = [], prices = [], ratings = [];
  // Begrenzte Parallelität; ganze Kursreihen nicht im Browser laden.
  for (const ticker of symbols) {
    const id = Identity.securityIdForTicker(ticker);
    const stock = await opt('/discover/data/stocks/US_REAL/' + ticker + '.json');
    const key = Identity.shardKey(ticker);
    let marketCap = stock?.marketCap?.value;
    if (!(typeof marketCap === 'number' && Number.isFinite(marketCap) && marketCap > 0)) {
      if (!capShards.has(key)) {
        const shard = await opt('/quant/data/product/factor-evidence-v1/' + key + '.json.gz');
        capShards.set(key, Object.fromEntries(Object.entries(shard?.securities || {}).map(([t, s]) =>
          [t, { securityId: s.securityId, marketCap: s.marketCap }])));
      }
      const evidence = capShards.get(key)?.[ticker];
      if (evidence?.securityId === id) marketCap = evidence.marketCap;
    }
    if (stock) stocks.push({ ticker, name: stock.companyName, marketCap, logo: logos?.files?.[ticker] });
    const series = await getSeries(ticker);
    if (series) {
      const weekly = await opt('/quant/data/market/discover-series-long/' + id + '.json');
      prices.push({ ticker, series, splits: (weekly?.corporateActions?.splits || []).map(s => ({ date: s[0], factor: s[1] })) });
    }
    if (!shards.has(key)) shards.set(key, await opt('/dashboard/data/analysts/shards/' + key + '.json'));
    const entry = shards.get(key)?.entries?.[id];
    if (entry) {
      if (entry.ratingsState === 'AVAILABLE') ratings.push({ ticker, asOf: entry.asOf });
    } else {
      const old = legacy?.symbols?.[ticker];
      if (old?.consensus_label) ratings.push({ ticker, asOf: (old.trend_history || []).map(h => h.period).sort().at(-1) });
    }
  }
  const positions = [];
  for (const depot of depots?.depots || []) for (const p of depot.positions || []) {
    if (tickers && !tickers.includes(p.ticker)) continue;
    positions.push({ ticker: p.ticker, owner: depot.profileId, series: await getSeries(p.ticker) });
  }
  const stops = [];
  for (const [owner, portfolio] of Object.entries(trader?.strategies || {})) for (const p of portfolio.positions || []) {
    if (!tickers || tickers.includes(p.symbol)) stops.push({ ticker: p.symbol, stop: p.stop, owner });
  }
  const rules = [Q.jumps(prices, ReturnSeries), Q.logos(logos ? stocks : []), Q.names(stocks), Q.analysts(ratings, now),
    Q.depotPrices(positions, expected, new Date(now).toISOString().slice(0, 10), PublishedClose), Q.stops(stops)];
  if (!logos) rules[1].note = 'Logo-Index nicht verfügbar.';
  return { rules, missingArtifacts: [...missing].sort() };
}
