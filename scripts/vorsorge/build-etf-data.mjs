/* =========================================================================
   VISION UNIVERSE VORSORGE — build-etf-data.mjs

   Baut aus den bereits ausgelieferten Tiingo-Daten des Repositorys den
   ETF-Stamm der Produktsaeule Vorsorge:

     vorsorge/data/etf-master.json     Verzeichnis + Kennzahlen (Screener, Suche)
     vorsorge/data/etf/<SYM>.json      Detail: Reihen, Performance, Risiko, DNA
     vorsorge/data/quality.json        Data-QA (Abdeckung, Luecken, Duplikate)
     vorsorge/data/changes.json        Ereignisse gegenueber dem letzten Stand
     vorsorge/etf/<SYM>/index.html     oeffentliche ETF-Seiten (SEO-Einstieg)

   QUELLEN (alle Tiingo, alle bereits im Repository)
     quant/data/universe/instruments/*.json         Wertpapierstamm (Namen, Gattung)
     quant/data/market/security-master/us-security-master.json   Tickerliste-Auszug
     quant/data/market/multi-asset/instruments.json  Markt-Tracker (Index aus Beschreibung)
     quant/data/market/multi-asset/series/*.json     Tagesreihen der Tracker
     quant/data/market/discover-series/ref_*.json    Tagesreihen, 1 Jahr
     quant/data/market/discover-series-long/ref_*.json  Wochenreihen, MAX
   Optional, nur wenn vorhanden (CI-Lauf mit Anbieterzugang):
     .market-cache/vorsorge/etf-universe.json        ETF-Zeilen der vollen Tickerliste
     .market-cache/vorsorge/prices/<SYM>.json        Tagesreihen aus ingest-tiingo-etfs.mjs

   Reproduzierbar: kein Zeitstempel der Uhr, generatedAt = juengster Datenstand.
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "vorsorge/engines/etf-master.js"));
const A = require(join(root, "vorsorge/engines/etf-analytics.js"));
const Monitor = require(join(root, "vorsorge/engines/monitor.js"));

const argv = process.argv.slice(2);
const OUT = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : join(root, "vorsorge");
const QUIET = argv.includes("--quiet");
const log = (...a) => { if (!QUIET) console.log(...a); };
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const tryJson = (p) => { try { return readJson(p); } catch { return null; } };

/* ------------------------------------------------------------ Stammzeilen */
function loadRows() {
  const rows = [];
  const dir = join(root, "quant/data/universe/instruments");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    for (const it of readJson(join(dir, f)).instruments || []) {
      rows.push({ symbol: it.symbol, name: it.companyName, exchange: it.exchange, currency: it.currency, country: it.country,
        securityType: it.securityType, firstTradeDate: it.firstTradeDate, lastTradeDate: it.lastTradeDate || it.delistedAt || null,
        active: it.active, source: "tiingo:company-master" });
    }
  }
  const sm = tryJson(join(root, "quant/data/market/security-master/us-security-master.json"));
  for (const r of sm?.rows || []) {
    if (r.instrument_type !== "ETF" && r.asset_type !== "ETF") continue;
    rows.push({ symbol: r.ticker, name: r.security_name || null, exchange: r.exchange, currency: r.currency, country: r.country,
      securityType: "ETF", firstTradeDate: r.start_date, lastTradeDate: r.active_status === "INACTIVE" ? r.end_date : null,
      active: r.active_status !== "INACTIVE", source: "tiingo:supported-tickers" });
  }
  const ma = tryJson(join(root, "quant/data/market/multi-asset/instruments.json"));
  for (const i of ma?.instruments || []) {
    if (i.assetClass !== "ETF") continue;
    rows.push({ symbol: i.symbol, name: i.name, exchange: i.exchangeOrVenue, currency: i.currency, country: i.country,
      securityType: "ETF", active: i.status === "ACTIVE", trackedIndex: i.tracker?.tracksIndexName || null,
      assetClassHint: "EQUITY", source: "tiingo:multi-asset" });
  }
  // Volle Tickerliste aus der Arbeitsablage (nur im CI-Lauf mit Anbieterzugang vorhanden)
  const work = tryJson(join(root, ".market-cache/vorsorge/etf-universe.json"));
  for (const r of work?.rows || []) rows.push({ ...r, source: "tiingo:etf-universe" });
  return { rows, fullUniverse: !!work, workRows: work?.rows?.length || 0 };
}

/* ----------------------------------------------------------------- Reihen */
function loadSeries(symbol) {
  const ingest = tryJson(join(root, ".market-cache/vorsorge/prices", symbol + ".json"));
  if (ingest?.points?.length) {
    return { daily: ingest.points, weekly: A.toWeekly(ingest.points), basis: ingest.basis || "PRICE_RETURN",
      priceSeriesType: ingest.priceSeriesType || "SPLIT_ADJUSTED", sources: ["tiingo:etf-ingest"], asOf: ingest.asOf };
  }
  const ma = tryJson(join(root, "quant/data/market/multi-asset/series", symbol + ".json"));
  if (ma?.points?.length && ma.assetClass === "ETF") {
    return { daily: ma.points, weekly: A.toWeekly(ma.points), basis: "PRICE_RETURN", priceSeriesType: "SPLIT_ADJUSTED",
      sources: ["tiingo:multi-asset"], asOf: ma.to };
  }
  const d = tryJson(join(root, "quant/data/market/discover-series", "ref_" + symbol + ".json"));
  const w = tryJson(join(root, "quant/data/market/discover-series-long", "ref_" + symbol + ".json"));
  const daily = d?.points || [], longWeekly = w?.points || [];
  if (!daily.length && !longWeekly.length) return null;
  const weekly = A.splice(longWeekly, A.toWeekly(daily)).points;
  return { daily, weekly, basis: "PRICE_RETURN", priceSeriesType: "SPLIT_ADJUSTED",
    sources: [d && "tiingo:discover-series", w && "tiingo:discover-series-long"].filter(Boolean), asOf: d?.asOf || w?.asOf };
}

const r4 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

function metricsFor(series, benchmark) {
  const daily = A.clean(series.daily), weekly = A.clean(series.weekly);
  const full = weekly.length > daily.length / 5 ? A.splice(weekly, daily).points : daily;
  const perfDaily = A.performance(daily, { basis: series.basis });
  const perfFull = A.performance(full, { basis: series.basis });
  // kurze Fenster aus der Tagesreihe, lange aus der laengsten Reihe
  const windows = {};
  for (const id of A.WINDOWS) {
    const src = ["1D", "1W", "1M", "3M", "6M", "YTD"].includes(id) && daily.length > 2 ? perfDaily : perfFull;
    const w = src.windows[id];
    windows[id] = { value: r4(w.value), annualized: r4(w.annualized), status: w.status, from: w.from || null };
  }
  const riskSeries = weekly.length >= 104 ? weekly.slice(-260) : (daily.length >= 60 ? daily : weekly);
  const risk = A.risk(riskSeries);
  const riskMax = A.risk(full.length > riskSeries.length ? full : riskSeries, { asOf: series.asOf });
  const trend = A.trend(daily.length >= 200 ? daily : weekly);
  const firstDate = full.length ? full[0][0] : null;
  const lastDate = full.length ? full[full.length - 1][0] : null;
  const historyYears = firstDate ? (Date.parse(lastDate) - Date.parse(firstDate)) / (365.25 * 864e5) : 0;
  const rs = benchmark ? A.relativeStrength(full, benchmark, 12) : { value: null, status: "NO_BENCHMARK" };
  const last = daily.length ? daily[daily.length - 1] : (weekly.length ? weekly[weekly.length - 1] : null);
  return {
    basis: series.basis, basisLabel: series.basis === "TOTAL_RETURN" ? "Gesamtrendite (inkl. Ausschüttungen)" : "Kursentwicklung (ohne Ausschüttungen)",
    priceSeriesType: series.priceSeriesType, sources: series.sources, asOf: lastDate,
    price: last ? last[1] : null, priceDate: last ? last[0] : null,
    change1D: windows["1D"].value, windows, firstDate, historyYears: Math.round(historyYears * 100) / 100,
    volatility: { value: r4(risk.volatility.value), status: risk.volatility.status, basis: risk.volatility.basis || null, window: riskSeries === weekly.slice(-260) ? "5J wöchentlich" : null },
    maxDrawdown: { value: r4(riskMax.maxDrawdown.value), peakDate: riskMax.maxDrawdown.peakDate || null, troughDate: riskMax.maxDrawdown.troughDate || null,
      recoveryDays: riskMax.maxDrawdown.recoveryDays ?? null, recovered: riskMax.maxDrawdown.recovered ?? null, status: riskMax.maxDrawdown.status },
    bestMonth: riskMax.bestMonth, worstMonth: riskMax.worstMonth, bestYear: riskMax.bestYear, worstYear: riskMax.worstYear,
    yearlyReturns: (riskMax.yearlyReturns || []).map((y) => ({ year: y.key, value: r4(y.value) })),
    trend: { status: trend.status, value: r4(trend.value), above: trend.above ?? null, window: trend.window || null },
    relativeStrengthVsSPY: { value: r4(rs.value), status: rs.status },
    observations: { daily: daily.length, weekly: weekly.length }
  };
}

/* ------------------------------------------------------------------ SEO */
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function seoPage(e) {
  const title = `${e.name} (${e.symbol}) – ETF-Analyse | Vision Universe Vorsorge`;
  const desc = `${e.name} (${e.symbol}, ${e.exchange || "Börse unbekannt"}, ${e.currency || ""}): Kursentwicklung, Schwankung, größter Rückgang und Einordnung für die Altersvorsorge. Keine Anlageberatung.`;
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="/vorsorge/etf/${esc(e.symbol)}/">
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/assets/site-navigation.css">
<script>location.replace("/vorsorge/#/etf/${encodeURIComponent(e.symbol)}");</script>
</head>
<body><vu-navigation></vu-navigation><script src="/assets/site-navigation.js"></script>
<main style="max-width:720px;margin:40px auto;padding:0 20px;font-family:Inter,-apple-system,sans-serif">
<h1>${esc(e.name)} (${esc(e.symbol)})</h1>
<p>${esc(e.category)} · ${esc(e.exchange)} · ${esc(e.currency)}</p>
<p><a href="/vorsorge/#/etf/${esc(e.symbol)}">ETF-Analyse in Vision Universe Vorsorge öffnen</a></p>
<p><small>Die dargestellten Informationen dienen der Analyse und Information und stellen keine individuelle Anlage-, Steuer- oder Rechtsberatung dar.</small></p>
</main>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ Lauf */
export function build() {
  const { rows, fullUniverse, workRows } = loadRows();
  const prev = tryJson(join(OUT, "data/etf-master.json"));
  const master = Master.buildMaster(rows);
  const spy = loadSeries("SPY");
  const benchmark = spy ? A.splice(spy.weekly, spy.daily).points : null;

  const etfs = [];
  let latest = "0000-00-00";
  const detailDir = join(OUT, "data/etf");
  if (existsSync(detailDir)) rmSync(detailDir, { recursive: true });
  mkdirSync(detailDir, { recursive: true });

  for (const e of master.etfs) {
    const s = loadSeries(e.symbol);
    const m = s ? metricsFor(s, e.symbol === "SPY" ? null : benchmark) : null;
    e.priceHistoryAvailable = !!(m && m.observations.daily + m.observations.weekly > 1);
    e.inceptionDate = e.inceptionDate || null;
    if (m?.asOf && m.asOf > latest) latest = m.asOf;
    const q = Master.dataQuality(e);
    const dna = Master.dna(e, m ? { volatility: m.volatility.value, maxDrawdown: m.maxDrawdown.value, momentum12m: m.windows["1Y"].value, historyYears: m.historyYears } : {});
    const summary = {
      symbol: e.symbol, name: e.name, issuer: e.issuer, exchange: e.exchange, currency: e.currency, country: e.country,
      assetClass: e.assetClass, region: e.region, index: e.index, theme: e.theme, category: e.category,
      structure: e.structure, management: e.management, leverage: e.leverage, inverse: e.inverse, complex: e.complex,
      singleStockUnderlying: e.singleStockUnderlying, status: e.status, consumerVisible: e.consumerVisible,
      canonicalETFId: e.canonicalETFId, listingId: e.listingId, listingsOfFund: e.listingsOfFund, duplicateTicker: e.duplicateTicker,
      ter: null, fundSize: null, distributionPolicy: null, replicationMethod: null, isin: null,
      firstTradeDate: e.firstTradeDate, lastTradeDate: e.lastTradeDate,
      tiingoAvailable: e.tiingoAvailable, priceHistoryAvailable: e.priceHistoryAvailable,
      coverage: q.coverage, confidence: q.confidence,
      m: m ? {
        price: m.price, priceDate: m.priceDate, d1: m.change1D,
        p: Object.fromEntries(["1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "MAX"].map((k) => [k, m.windows[k].annualized ?? m.windows[k].value])),
        pTotal: { "3Y": m.windows["3Y"].value, "5Y": m.windows["5Y"].value, MAX: m.windows.MAX.value },
        vol: m.volatility.value, mdd: m.maxDrawdown.value, trend: m.trend.value, rs: m.relativeStrengthVsSPY.value,
        hy: m.historyYears, basis: m.basis
      } : null
    };
    etfs.push(summary);
    const detail = {
      schemaVersion: "vu-vorsorge-etf-1.0.0", ...e, quality: q, dna, metrics: m,
      // Budget: im Vollausbau (~9.600 ETFs) nur 1 Jahr taeglich + 10 Jahre woechentlich je ETF
      series: s ? { daily: A.clean(s.daily).slice(fullUniverse ? -260 : -400), weekly: fullUniverse ? A.clean(s.weekly).slice(-520) : A.clean(s.weekly),
        basis: s.basis, priceSeriesType: s.priceSeriesType,
        publishBasis: "Schlusskurse des Produktuniversums (keine OHLCV-Kerzen); Freigabe der öffentlichen Anzeige wie quant/data/market/discover-series (publishBasis)." } : null,
      holdings: { status: "DATA_PENDING", reason: "Holdings liefert Tiingo nicht. Vorbereitet für Emittenten-Holdings (etf-holdings-1.0.0)." }
    };
    writeFileSync(join(detailDir, e.symbol + ".json"), JSON.stringify(detail));
  }

  const asOf = latest === "0000-00-00" ? null : latest;
  const counts = {
    rowsRead: rows.length, listings: master.counts.listings, canonicalFunds: master.counts.funds,
    consumerVisible: etfs.filter((e) => e.consumerVisible).length,
    withPriceHistory: etfs.filter((e) => e.priceHistoryAvailable).length,
    withHistory3Y: etfs.filter((e) => e.m && e.m.hy >= 3).length,
    complex: etfs.filter((e) => e.complex).length,
    leveragedOrInverse: etfs.filter((e) => e.leverage > 1 || e.inverse).length,
    inactive: etfs.filter((e) => e.status === "INACTIVE").length,
    review: etfs.filter((e) => e.status === "REVIEW").length
  };
  const tally = (f) => etfs.reduce((a, e) => { const k = e[f] ?? "UNKNOWN"; a[k] = (a[k] || 0) + 1; return a; }, {});
  const out = {
    schemaVersion: "vu-vorsorge-etf-master-1.0.0", engine: Master.VERSION, analytics: A.VERSION,
    generatedAt: asOf, asOf, provider: "tiingo",
    scope: fullUniverse ? "FULL_TIINGO_ETF_UNIVERSE" : "REPOSITORY_DELIVERED_EXTRACT",
    scopeNote: fullUniverse ? "Volle ETF-Zeilen der Tiingo-Tickerliste (Arbeitsablage) plus Repository-Auszug."
      : "Auszug: alle ETFs, die Tiingo-Daten im Repository bereits führen. Die volle Tiingo-Tickerliste nennt 9.587 ETF-Zeilen (quant/data/market/universe/summary.json); sie wird mit scripts/vorsorge/ingest-tiingo-etfs.mjs im CI-Lauf mit Anbieterzugang aufgenommen.",
    providerUniverseEtfRows: tryJson(join(root, "quant/data/market/universe/summary.json"))?.totals?.byInstrumentType?.ETF ?? null,
    counts, etfs
  };
  mkdirSync(join(OUT, "data"), { recursive: true });
  writeFileSync(join(OUT, "data/etf-master.json"), JSON.stringify(out));

  const missing = {};
  for (const e of master.etfs) for (const f of Master.dataQuality(e).missingFields) missing[f] = (missing[f] || 0) + 1;
  const quality = {
    schemaVersion: "vu-vorsorge-data-qa-1.0.0", asOf, scope: out.scope,
    tiingoEtfSymbols: { inRepository: master.counts.listings, providerUniverseEtfRows: out.providerUniverseEtfRows, fullUniverseLoaded: fullUniverse, workRows },
    canonicalETFs: master.counts.funds, listings: master.counts.listings,
    priceCoverage: { withAnyHistory: counts.withPriceHistory, withHistory3Y: counts.withHistory3Y, ratio: master.counts.listings ? counts.withPriceHistory / master.counts.listings : 0 },
    metadataCoverage: Object.fromEntries(Master.FIELDS.map((f) => [f, 1 - (missing[f] || 0) / Math.max(1, master.counts.listings)])),
    missingMetadata: missing, noSourceFields: Master.NO_SOURCE_FIELDS,
    duplicates: { duplicateTickers: master.duplicateTickers, multiListingFunds: master.multiListingFunds },
    conflicts: master.conflicts,
    leveragedInverse: etfs.filter((e) => e.leverage > 1 || e.inverse).map((e) => ({ symbol: e.symbol, leverage: e.leverage, inverse: e.inverse })),
    complex: counts.complex,
    currencies: tally("currency"), exchanges: tally("exchange"), assetClasses: tally("assetClass"), regions: tally("region"), issuers: tally("issuer"),
    statuses: tally("status")
  };
  writeFileSync(join(OUT, "data/quality.json"), JSON.stringify(quality, null, 1));

  const changes = Monitor.diffMasters(prev && prev.etfs ? { etfs: prev.etfs } : null, { etfs: etfs }, asOf);
  const prevChanges = tryJson(join(OUT, "data/changes.json"));
  if (!changes.events.length && prevChanges && prevChanges.events) changes.events = prevChanges.events; // nichts Neues: letzte Ereignisse bleiben sichtbar
  writeFileSync(join(OUT, "data/changes.json"), JSON.stringify(changes, null, 1));

  const seoDir = join(OUT, "etf");
  if (existsSync(seoDir)) rmSync(seoDir, { recursive: true });
  for (const e of etfs.filter((x) => x.consumerVisible)) {
    if (!/^[A-Z0-9.-]+$/.test(e.symbol)) continue;
    mkdirSync(join(seoDir, e.symbol), { recursive: true });
    writeFileSync(join(seoDir, e.symbol, "index.html"), seoPage(e));
  }
  return { counts, asOf, scope: out.scope };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = build();
  log(JSON.stringify(res, null, 2));
}
