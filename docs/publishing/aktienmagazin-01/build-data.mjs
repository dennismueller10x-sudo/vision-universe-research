// Vision Universe Aktienmagazin Nr. 01: zieht alle Kennzahlen aus den Repo-Artefakten nach data.js.
// Redaktionelle Fakten (Nachrichten, Zitate, Quartalszahlen) stehen mit Quelle in den Seiten.
// Aufruf: node docs/publishing/aktienmagazin-01/build-data.mjs [--out <datei>]
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? process.argv[outArg + 1] : path.join(here, 'data.js');
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const has = (p) => fs.existsSync(path.join(root, p));
const W0 = '2026-10-30', W1 = '2026-11-06';
const pct = (a, b) => (b / a - 1) * 100;
// Median: bei gerader Anzahl Mittelwert der beiden mittleren Werte (Befund Codex-Prüfung 08.11.2026)
const med = (a) => { const b = [...a].sort((x, y) => x - y); const n = b.length; if (!n) return null; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };

const stockFile = (t) => `discover/data/stocks/US_REAL/${t}.json`;
const seriesOf = (sid) => { const p = `quant/data/market/discover-series/${sid}.json`; return has(p) ? J(p).points : null; };

// --- Alle Aktien einmal lesen ---
const all = [];
for (const f of fs.readdirSync(path.join(root, 'discover/data/stocks/US_REAL'))) {
  let d; try { d = J(`discover/data/stocks/US_REAL/${f}`); } catch { continue; }
  const s = seriesOf(d.securityId); if (!s) continue;
  const m = Object.fromEntries(s);
  if (!m[W0] || !m[W1]) continue;
  all.push({ d, s, week: pct(m[W0], m[W1]) });
}

function card(t) {
  const x = all.find((a) => a.d.symbol === t); if (!x) throw new Error('fehlt ' + t);
  const d = x.d, mt = d.metrics, f = d.fundamentals || {};
  const sh = t.slice(0, 2), ts = has(`technical/data/stock/${sh}.json`) ? J(`technical/data/stock/${sh}.json`).stocks[t] : null;
  return {
    t, n: d.companyName, was: d.was, price: d.price.value, day: d.changePercent.value, week: x.week,
    r1m: mt.return1M, r12m: mt.return12M, hi: mt.distanceTo52wHigh, sma200: d.rawValues.distanceToSMA200,
    pe: mt.f_pe, ps: mt.f_ps, growth: mt.f_revenueGrowthTTM, margin: mt.f_netMargin, fcfm: mt.f_fcfMargin,
    rs: d.ranks.relativeStrengthPercentile, mom: d.ranks.momentumPercentile, vol: mt.volatility252d, beta: d.rawValues.beta252d,
    mcap: f.valuation?.marketCap?.value ?? null, revTTM: f.latest?.ttm?.revenue?.v ?? null, ttmThrough: f.ttmThrough ?? null,
    health: (f.health?.categories || []).map((c) => [c.label.replace('Profitabilitaet', 'Profitabilität'), c.grade]),
    tech: ts ? { structure: ts.structure, formations: ts.formations, rs: ts.rsRank } : null,
    logo: has(`discover/logos/files/${t}.png`) ? `../../../discover/logos/files/${t}.png` : null,
    series: x.s.slice(-130),
  };
}

const STOCKS = ['NVDA', 'AMD', 'MU', 'VRT', 'CRWV', 'ORCL', 'AVGO', 'LITE', 'MRVL', 'APP', 'PLTR', 'ABNB', 'FISV', 'AXON', 'IDXX', 'FSLR', 'MOS', 'TSM', 'DKNG', 'TEAM', 'FIS'];
const cards = Object.fromEntries(STOCKS.filter((t) => all.some((a) => a.d.symbol === t)).map((t) => [t, card(t)]));

// --- S&P 500 Wochenbilanz und Sektoren ---
const sp = all.filter((a) => (a.d.indexMemberships || []).some((m) => m.indexId === 'SP500'));
const bySector = {};
for (const a of sp) if (a.d.sector) (bySector[a.d.sector] ||= []).push(a.week);
const sectors = Object.entries(bySector).filter(([, v]) => v.length >= 8).map(([k, v]) => ({ sector: k, n: v.length, median: med(v) })).sort((a, b) => b.median - a.median);
const spSorted = [...sp].sort((a, b) => a.week - b.week);

// --- Screening: Standhaft im Ausverkauf ---
const screen = all.filter((a) => {
  const d = a.d, m = d.metrics;
  return (d.qualification?.avgDollarVolume20d || 0) >= 100e6 && a.week > 0 && d.rawValues?.priceAboveSMA200 === true &&
    (d.ranks?.relativeStrengthPercentile || 0) >= 80 && (m.f_revenueGrowthTTM ?? -1) >= 0.15 && (m.f_netMargin ?? -1) > 0.05;
}).sort((a, b) => b.d.ranks.relativeStrengthPercentile - a.d.ranks.relativeStrengthPercentile)
  .map((a) => ({ t: a.d.symbol, n: a.d.companyName, was: a.d.was, week: a.week, rs: a.d.ranks.relativeStrengthPercentile, growth: a.d.metrics.f_revenueGrowthTTM, margin: a.d.metrics.f_netMargin, pe: a.d.metrics.f_pe, sector: a.d.sector, logo: has(`discover/logos/files/${a.d.symbol}.png`) }));
const screenBase = all.filter((a) => (a.d.qualification?.avgDollarVolume20d || 0) >= 100e6).length;

// --- Quick-Check ---
const QC = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD', 'PLTR', 'NFLX', 'ORCL', 'MU', 'JPM', 'LLY', 'COST', 'V', 'WMT', 'XOM', 'BRK.B', 'UNH', 'CRWD'];
const quick = QC.map((t) => all.find((a) => a.d.symbol === t)).filter(Boolean).map((a) => ({ t: a.d.symbol, n: a.d.companyName, price: a.d.price.value, week: a.week, r12m: a.d.metrics.return12M, pe: a.d.metrics.f_pe, hi: a.d.metrics.distanceTo52wHigh, above200: a.d.rawValues.priceAboveSMA200, rs: a.d.ranks.relativeStrengthPercentile }));

// --- Indizes/ETF als Wochenbild ---
const etf = (t) => { const p = `quant/data/market/discover-series/ref_${t}.json`; if (!has(p)) return null; const s = J(p).points; const m = Object.fromEntries(s); return { t, last: s[s.length - 1][1], week: pct(m[W0], m[W1]), days: s.slice(-6) }; };
const etfs = ['SPY', 'QQQ', 'DIA', 'IWM', 'SMH', 'GLD', 'USO', 'TLT', 'IBIT'].map(etf).filter(Boolean);

// --- Marktregime ---
const reg = J('quant/data/product/market-regime-v1.json');

// --- Supertrader-Scanner (Regel-Zählung, keine Signale) ---
let st = null;
try { const x = J('supertrader/data/stock/AMD.json'); st = Object.entries(x.strategies).map(([k, v]) => ({ id: k, watch: v.scanner?.watch ?? 0, discovered: v.scanner?.discovered ?? 0, lastProcessed: v.lastProcessed })); } catch {}

// --- Eigentümerdaten (SEC Form 4, 13D/G, 13F) ---
const own = J('quant/data/product/ownership-signals-v1/highlights.json');
const insider = {};
for (const t of ['NVDA', 'AVGO', 'AMD', 'PLTR', 'META', 'MU', 'MSFT', 'ORCL', 'APP', 'AXON', 'TSM']) {
  const p = `quant/data/product/ownership-signals-v1/current/${t.slice(0, 2)}.json.gz`; if (!has(p)) continue;
  const x = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, p)))).issuers[t]; if (!x) continue;
  insider[t] = { ...x.insider, topBuyers: undefined };
}
const ownership = { asOf: own.asOf, mostNew: own.mostNewInstitutions.slice(0, 6), insider };

// --- Chart der Woche: Nvidia, Wochenkerzen 2 Jahre (Schluss) und Tageslinie 1 Jahr ---
const chartOf = (t) => { const x = all.find((a) => a.d.symbol === t); const s = x.s; const sma = (n) => s.map((_, i) => (i + 1 >= n ? s.slice(i + 1 - n, i + 1).reduce((a, p) => a + p[1], 0) / n : null));
  const lp = `quant/data/market/discover-series-long/${x.d.securityId}.json`; const long = has(lp) ? J(lp).points.slice(-110) : null;
  return { daily: s, sma50: sma(50), sma200: sma(200), weekly: long }; };
const charts = { NVDA: chartOf('NVDA') };

const data = {
  generatedAt: new Date().toISOString(), asOf: W1, week: { from: W0, to: W1 },
  cards, sp500: { count: sp.length, up: sp.filter((a) => a.week > 0).length, median: med(sp.map((a) => a.week)), sectorCovered: sectors.reduce((n, x) => n + x.n, 0),
    top: spSorted.slice(-8).reverse().map((a) => ({ t: a.d.symbol, n: a.d.companyName, w: a.week })),
    flop: spSorted.slice(0, 8).map((a) => ({ t: a.d.symbol, n: a.d.companyName, w: a.week })), sectors },
  screen: { base: screenBase, hits: screen.length, rows: screen,
    rule: 'Ø Tagesumsatz ≥ 100 Mio. $ · Woche im Plus · Kurs über 200-Tage-Linie · Relative Stärke ≥ 80. Perzentil · Umsatzwachstum (TTM) ≥ 15 % · Nettomarge > 5 %' },
  quick, etfs, supertrader: st, ownership, charts,
  regime: { asOf: reg.asOf, regime: reg.regime, plain: reg.matchedRule.plain, measures: reg.measures.map((m) => ({ id: m.id, label: m.label, share: m.share, observed: m.observed })) },
  universe: all.length,
};
fs.writeFileSync(out, 'window.VU_DATA = ' + JSON.stringify(data) + ';\n');
console.log('geschrieben', path.relative(root, out), 'Aktien', all.length, 'Karten', Object.keys(cards).length, 'Screening', screen.length, 'ETFs', etfs.map((e) => e.t).join(','));
