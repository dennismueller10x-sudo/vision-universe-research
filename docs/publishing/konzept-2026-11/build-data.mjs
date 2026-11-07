// Konzept Magazin + Aktienreport (07.11.2026): zieht alle Zahlen aus den Repo-Artefakten
// und schreibt sie mit Quelle nach data.js. Keine Zahl in den Seiten wird von Hand gesetzt,
// außer redaktionellen Fakten aus Pressemitteilungen und Nachrichten (Quellenliste in den Seiten).
// Aufruf: node docs/publishing/konzept-2026-11/build-data.mjs [--out <datei>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? process.argv[outArg + 1] : path.join(here, 'data.js');
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const series = (t) => J(`quant/data/market/discover-series/ref_${t}.json`).points;
const WEEK_FROM = '2026-10-30', WEEK_TO = '2026-11-06';
const pct = (a, b) => (b / a - 1) * 100;

// --- Wochenbilanz: S&P-500-Mitglieder (Discover-Indexmitgliedschaft) ---
const members = [];
for (const f of fs.readdirSync(path.join(root, 'discover/data/stocks/US_REAL'))) {
  let d; try { d = J(`discover/data/stocks/US_REAL/${f}`); } catch { continue; }
  if (!(d.indexMemberships || []).some((m) => m.indexId === 'SP500')) continue;
  const p = `quant/data/market/discover-series/${d.securityId}.json`;
  if (!fs.existsSync(path.join(root, p))) continue;
  const pts = Object.fromEntries(J(p).points);
  if (pts[WEEK_FROM] && pts[WEEK_TO]) members.push({ t: d.symbol, n: d.companyName, sector: d.sector, w: pct(pts[WEEK_FROM], pts[WEEK_TO]) });
}
members.sort((a, b) => a.w - b.w);
const ws = members.map((m) => m.w).sort((a, b) => a - b);
const median = ws[Math.floor(ws.length / 2)];
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const bySector = {};
for (const m of members) if (m.sector) (bySector[m.sector] ||= []).push(m.w);
const sectors = Object.entries(bySector).filter(([, v]) => v.length >= 8).map(([k, v]) => ({ sector: k, n: v.length, median: med(v), up: v.filter((x) => x > 0).length })).sort((a, b) => b.median - a.median);

// --- KI-Korb: Wochenveränderung ---
const KI = { NVDA: 'Nvidia', AMD: 'AMD', MU: 'Micron', AVGO: 'Broadcom', TSM: 'TSMC', ORCL: 'Oracle', PLTR: 'Palantir', VRT: 'Vertiv', CRWV: 'CoreWeave' };
const kiWeek = Object.entries(KI).map(([t, n]) => {
  const p = Object.fromEntries(series(t));
  return { t, n, w: pct(p[WEEK_FROM], p[WEEK_TO]), d5: pct(p['2026-11-04'], p['2026-11-05']) };
}).sort((a, b) => a.w - b.w);

// --- S&P-500-ETF (SPY) Tagesbewegung der Woche ---
const spy = series('SPY');
const spyWeek = [];
for (let i = 1; i < spy.length; i++) if (spy[i][0] > WEEK_FROM && spy[i][0] <= WEEK_TO) spyWeek.push({ d: spy[i][0], c: spy[i][1], ch: pct(spy[i - 1][1], spy[i][1]) });

// --- Marktregime ---
const reg = J('quant/data/product/market-regime-v1.json');

// --- AMD ---
const amd = J('discover/data/stocks/US_REAL/AMD.json');
const amdS = series('AMD');
const sma = (n) => amdS.map((_, i) => (i + 1 >= n ? amdS.slice(i + 1 - n, i + 1).reduce((s, p) => s + p[1], 0) / n : null));
const sma50 = sma(50), sma200 = sma(200);
const last = amdS.length - 1;
const hi = amdS.reduce((m, p) => (p[1] > m[1] ? p : m)), lo = amdS.reduce((m, p) => (p[1] < m[1] ? p : m));
const f = amd.fundamentals;
const tr = (k, from = 2015) => f.journey.tracks[k].filter((x) => x.fy >= from).map((x) => [x.fy, x.v]);
const techShard = J('technical/data/stock/AM.json');
const tech = (techShard.stocks.AMD) || techShard.stocks.find?.((s) => s.s === 'AMD');

const data = {
  generatedAt: new Date().toISOString(),
  asOf: WEEK_TO,
  week: {
    from: WEEK_FROM, to: WEEK_TO,
    sp500: { count: members.length, up: members.filter((m) => m.w > 0).length, median,
      top: members.slice(-6).reverse(), flop: members.slice(0, 6), sectors,
      source: 'quant/data/market/discover-series/*, Mitgliedschaft discover/data/stocks/US_REAL/* (SP500)' },
    ki: { rows: kiWeek, source: 'quant/data/market/discover-series/ref_<T>.json' },
    spy: { rows: spyWeek, week: pct(Object.fromEntries(spy)[WEEK_FROM], Object.fromEntries(spy)[WEEK_TO]), source: 'quant/data/market/discover-series/ref_SPY.json' },
  },
  regime: { asOf: reg.asOf, regime: reg.regime, plain: reg.matchedRule.plain,
    measures: reg.measures.map((m) => ({ id: m.id, label: m.label, share: m.share, hits: m.hits, observed: m.observed })),
    source: 'quant/data/product/market-regime-v1.json' },
  amd: {
    asOf: amd.asOf, price: amd.price.value, change: amd.changePercent.value,
    series: amdS, sma50, sma200, hi, lo, last: amdS[last],
    dist: { sma20: amd.rawValues.distanceToSMA20, sma50: amd.rawValues.distanceToSMA50, sma200: amd.rawValues.distanceToSMA200, hi: amd.metrics.distanceTo52wHigh, lo: amd.metrics.distanceTo52wLow },
    risk: { vol: amd.metrics.volatility252d, dd: amd.metrics.maxDrawdown252d, beta: amd.rawValues.beta252d },
    returns: amd.rawValues.returns,
    pct: { leadership: amd.ranks.leadershipPercentile, momentum: amd.ranks.momentumPercentile, rs: amd.ranks.relativeStrengthPercentile, universe: amd.ranks.universeSize },
    memberships: amd.memberships,
    fundamentals: {
      asOf: f.asOf, ttmThrough: f.latestFiscalYear && f.ttmThrough,
      revenue: tr('revenue'), netIncome: tr('net_income'), fcf: tr('free_cash_flow'), grossMargin: f.journey.tracks.margins.gross.filter((x) => x.fy >= 2015).map((x) => [x.fy, x.v]),
      shares: tr('shares'),
      health: f.health.categories.map((c) => ({ id: c.id, label: c.label, grade: c.grade, detail: c.detail })),
      ttm: { revenue: f.latest.ttm.revenue.v, netIncome: f.latest.ttm.net_income.v, eps: f.latest.ttm.eps_diluted.v },
      valuation: { pe: f.valuation.pe.value, ps: f.valuation.ps.value, fcfYield: f.valuation.fcfYield.value, peMedian: f.valuation.relative.peMedian, peUniverse: f.valuation.relative.universeCount, marketCap: f.valuation.marketCap.value },
      source: 'discover/data/stocks/US_REAL/AMD.json (fundamentals, sec_edgar:companyfacts)',
    },
    tech: tech ? { structure: tech.structure, rsRank: tech.rsRank, formations: tech.formations, templates: tech.templates, source: 'technical/data/stock/AM.json' } : null,
    source: 'discover/data/stocks/US_REAL/AMD.json, quant/data/market/discover-series/ref_AMD.json',
  },
};
fs.writeFileSync(out, 'window.VU_DATA = ' + JSON.stringify(data) + ';\n');
console.log('geschrieben', path.relative(root, out), 'S&P-Mitglieder', members.length, 'Median', median.toFixed(1));
