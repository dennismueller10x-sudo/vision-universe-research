/* =========================================================================
   VISION UNIVERSE VORSORGE — build-etf-data.mjs   (vorsorge-build-2.0.0)

   Deterministischer Daten-Build der Produktsaeule Vorsorge. Liest NUR
   committete Dateien - keine Arbeitsablage, keine Uhr - und ergibt bei
   gleichem Input byte-identische Ausgaben.

   QUELLEN
     vorsorge/data/ingest/universe.json + vorsorge/data/series/*.json
         voller Tiingo-ETF-Ingest (scripts/vorsorge/ingest-tiingo-etfs.mjs)
     quant/data/universe/instruments/*.json, .../us-security-master.json,
     quant/data/market/multi-asset/*, discover-series(-long)
         bisheriger Repository-Auszug (164 Listings)
     vorsorge/data/overrides.json   manuelle Festlegungen mit Begruendung

   AUSGABE
     vorsorge/data/etf-index.json       spaltenfoermiger Index (Screener, Suche)
     vorsorge/data/etf/<slug>.json      Detail: Taxonomie, Metriken (Kurs- und
                                        Gesamtrendite getrennt), DNA, Provenienz
     vorsorge/data/series/<SYM>.json    Reihen aus Repository-Quellen (origin
                                        repository-sources); Ingest-Reihen bleiben
     vorsorge/data/quality.json         Data-QA
     vorsorge/data/ucits-coverage.json  UCITS-Abdeckung (gemessen)
     vorsorge/data/data-gaps.json       Feldabdeckung je Quelle
     vorsorge/data/changes.json         Ereignisse gegenueber dem letzten Stand
     vorsorge/etf/<slug>/index.html     oeffentliche Seiten (nur Public Analysis
                                        Universe mit >= 1 Jahr Historie)
     vorsorge/sitemap.xml
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Identity = require(join(root, "core/identity.js")); // eine Identitaetsregel (ADR-001)
const Master = require(join(root, "vorsorge/engines/etf-master.js"));
const Tax = require(join(root, "vorsorge/engines/etf-taxonomy.js"));
const FUND = require(join(root, "vorsorge/engines/etf-fundamentals.js"));
const CHG = require(join(root, "vorsorge/engines/etf-changes.js"));
const costEvents = [];   // Kostenaenderungen zwischen zwei Prospektstaenden (SEC Risk/Return)
/** Vergleicht nur gleich definierte Felder zweier Prospektstaende derselben Anteilklasse. */
function costChanges(c) {
  if (!c || !c.previous) return [];
  const pick = (x) => ({ shareClassId: c.classId, expenseRatio: x.expenseRatio || null, netExpenseRatio: x.netExpenseRatio || null, managementFee: x.managementFee || null });
  const d = CHG.diffFundamentals(pick(c.previous), pick(c), { from: c.previous.filed, to: c.filed, source: "SEC_RR" });
  return d.events.map((x) => ({ eventType: x.eventType, field: x.entityId, label: x.entityName, oldValue: x.oldValue, newValue: x.newValue, from: c.previous.filed, to: c.filed,
    text: x.explanation.replace(/\.$/, "") + " (Prospekt " + c.previous.filed + " → " + c.filed + ")." }));
}
const A = require(join(root, "vorsorge/engines/etf-analytics.js"));
const Codec = require(join(root, "vorsorge/engines/series-codec.js"));
const Monitor = require(join(root, "vorsorge/engines/monitor.js"));

export const VERSION = "vorsorge-build-2.0.0";
const argv = process.argv.slice(2);
const OUT = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : join(root, "vorsorge");
const QUIET = argv.includes("--quiet");
const log = (...a) => { if (!QUIET) console.log(...a); };
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const tryJson = (p) => { try { return readJson(p); } catch { return null; } };
const r4 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);
// Verluste nahe -100 % nicht auf -1 runden: ein Totalverlust waere eine andere Aussage.
const rLoss = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : x > -1 && x <= -0.9995 ? Math.round(x * 1e6) / 1e6 : r4(x));
const EU_EXCHANGES = new Set(["XETRA", "XETR", "FRA", "FSX", "GER", "LSE", "LON", "XLON", "EURONEXT", "XPAR", "PAR", "XAMS", "AMS", "BRU", "MIL", "BIT", "SIX", "SWX", "XSWX", "MAD", "BME", "STO", "CPH", "HEL", "OSL", "VIE", "WSE", "ISE", "LIS", "EPA"]);

/* ------------------------------------------------------------ Stammzeilen */
function loadRows() {
  const rows = [];
  const ingest = tryJson(join(OUT, "data/ingest/universe.json"));
  const ingestBySym = {};
  for (const r of ingest?.rows || []) ingestBySym[r.symbol] = r;
  // Ticker-Identitaet: der Tiingo-Tagesendpunkt ist tickergebunden. Liegt ein
  // Ticker im Ingest vor, gilt dessen Boerse auch fuer die Repository-Zeilen.
  const ex = (sym, exch) => (ingestBySym[sym] && ingestBySym[sym].exchange) || exch;
  const dir = join(root, "quant/data/universe/instruments");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    for (const it of readJson(join(dir, f)).instruments || []) {
      rows.push({ symbol: it.symbol, name: it.companyName, exchange: ex(it.symbol, it.exchange), currency: it.currency, country: it.country,
        securityType: it.securityType, firstTradeDate: it.firstTradeDate, lastTradeDate: it.lastTradeDate || it.delistedAt || null,
        active: it.active, source: "tiingo:company-master" });
    }
  }
  const sm = tryJson(join(root, "quant/data/market/security-master/us-security-master.json"));
  for (const r of sm?.rows || []) {
    if (r.instrument_type !== "ETF" && r.asset_type !== "ETF") continue;
    rows.push({ symbol: r.ticker, name: r.security_name || null, exchange: ex(r.ticker, r.exchange), currency: r.currency, country: r.country,
      securityType: "ETF", firstTradeDate: r.start_date, lastTradeDate: r.active_status === "INACTIVE" ? r.end_date : null,
      active: r.active_status !== "INACTIVE", source: "tiingo:supported-tickers" });
  }
  const ma = tryJson(join(root, "quant/data/market/multi-asset/instruments.json"));
  for (const i of ma?.instruments || []) {
    if (i.assetClass !== "ETF") continue;
    rows.push({ symbol: i.symbol, name: i.name, exchange: ex(i.symbol, i.exchangeOrVenue), currency: i.currency, country: i.country,
      securityType: "ETF", active: i.status === "ACTIVE", trackedIndex: i.tracker?.tracksIndexName || null,
      assetClassHint: "EQUITY", source: "tiingo:multi-asset" });
  }
  for (const r of ingest?.rows || []) {
    rows.push({ symbol: r.symbol, name: r.name, description: r.description, exchange: r.exchange, currency: r.currency,
      country: null, securityType: "ETF", firstTradeDate: r.providerStartDate, lastTradeDate: null, active: true, source: "tiingo:etf-ingest" });
  }
  return { rows, ingest, ingestBySym };
}

/* ----------------------------------------------------------------- Reihen */
function repoSeries(symbol) {
  const ma = tryJson(join(root, "quant/data/market/multi-asset/series", symbol + ".json"));
  if (ma?.points?.length && ma.assetClass === "ETF") return { daily: A.clean(ma.points), weekly: A.toWeekly(ma.points), sources: ["tiingo:multi-asset"] };
  const d = tryJson(join(root, "quant/data/market/discover-series", Identity.securityIdForTicker(symbol) + ".json"));
  const w = tryJson(join(root, "quant/data/market/discover-series-long", Identity.securityIdForTicker(symbol) + ".json"));
  const daily = A.clean(d?.points || []), longWeekly = A.clean(w?.points || []);
  if (!daily.length && !longWeekly.length) return null;
  return { daily, weekly: A.splice(longWeekly, A.toWeekly(daily)).points, sources: [d && "tiingo:discover-series", w && "tiingo:discover-series-long"].filter(Boolean) };
}

/** Liefert die Reihe eines Symbols und schreibt Repository-Reihen ins Serienverzeichnis. */
function seriesFor(symbol, written) {
  const path = join(OUT, "data/series", symbol + ".json");
  const existing = tryJson(path);
  if (existing && existing.origin === "tiingo:etf-ingest") {
    return { record: existing, price: { daily: Codec.decode(existing.price.daily), weekly: Codec.decode(existing.price.weekly) },
      total: existing.total ? { daily: Codec.decode(existing.total.daily), weekly: Codec.decode(existing.total.weekly) } : null, sources: ["tiingo:etf-ingest"] };
  }
  const s = repoSeries(symbol);
  if (!s) return null;
  const record = { schemaVersion: "vu-vorsorge-series-1.0.0", symbol, origin: "repository-sources", sources: s.sources,
    priceHistoryFrom: (s.weekly[0] || s.daily[0] || [null])[0], asOf: (s.daily[s.daily.length - 1] || s.weekly[s.weekly.length - 1] || [null])[0],
    observations: s.daily.length, recycledTickerSuspected: false, dividendEvents: null,
    totalReturn: { state: "TOTAL_RETURN_UNAVAILABLE", reason: "SOURCE_HAS_NO_DIVIDENDS" },
    price: { basis: "PRICE_RETURN", type: "SPLIT_ADJUSTED", daily: Codec.encode(s.daily.slice(-260)), weekly: Codec.encode(s.weekly) }, total: null };
  writeFileSync(path, JSON.stringify(record));
  written.add(symbol + ".json");
  return { record, price: { daily: s.daily, weekly: s.weekly }, total: null, sources: s.sources };
}

/* -------------------------------------------------------------- Metriken */
function metrics(daily, weekly, basis, benchmark) {
  daily = A.clean(daily); weekly = A.clean(weekly);
  const full = A.splice(weekly, daily).points;
  if (full.length < 2) return null;
  const perfDaily = A.performance(daily, { basis });
  const perfFull = A.performance(full, { basis });
  const windows = {};
  for (const id of A.WINDOWS) {
    const src = ["1D", "1W", "1M", "3M", "6M", "YTD"].includes(id) && daily.length > 2 ? perfDaily : perfFull;
    const w = src.windows[id];
    windows[id] = { value: r4(w.value), annualized: r4(w.annualized), status: w.status, from: w.from || null };
  }
  const riskSeries = weekly.length >= 104 ? weekly.slice(-260) : (daily.length >= 60 ? daily : weekly);
  const risk = A.risk(riskSeries);
  const riskMax = A.risk(full, { asOf: full[full.length - 1][0] });
  const trend = A.trend(daily.length >= 200 ? daily : weekly);
  const firstDate = full[0][0], lastDate = full[full.length - 1][0];
  const historyYears = (Date.parse(lastDate) - Date.parse(firstDate)) / (365.25 * 864e5);
  const rs = benchmark ? A.relativeStrength(full, benchmark, 12) : { value: null, status: "NO_BENCHMARK" };
  const roll1 = A.rolling(weekly.length > 60 ? weekly : full, 1), roll3 = A.rolling(weekly.length > 160 ? weekly : full, 3);
  const dd = riskMax.maxDrawdown;
  const ex = (x) => ({ value: r4(x.value), period: x.period || null, status: x.status });
  const last = daily.length ? daily[daily.length - 1] : weekly[weekly.length - 1];
  return {
    basis, basisLabel: basis === "TOTAL_RETURN" ? "Gesamtrendite (Ausschüttungen reinvestiert)" : "Kursentwicklung (ohne Ausschüttungen)",
    asOf: lastDate, price: last[1], priceDate: last[0], change1D: windows["1D"].value, windows, firstDate,
    historyYears: Math.round(historyYears * 100) / 100,
    volatility: { value: r4(risk.volatility.value), status: risk.volatility.status, basis: risk.volatility.basis || null },
    downsideDeviation: { value: r4(A.downsideDeviation(riskSeries).value) },
    maxDrawdown: { value: rLoss(dd.value), peakDate: dd.peakDate || null, troughDate: dd.troughDate || null, recoveredDate: dd.recoveredDate || null,
      recoveryDays: dd.recoveryDays ?? null, recoveryMonths: dd.recoveryMonths ?? null, durationDays: dd.durationDays ?? null, recovered: dd.recovered ?? null, status: dd.status },
    bestMonth: ex(riskMax.bestMonth), worstMonth: ex(riskMax.worstMonth), bestYear: ex(riskMax.bestYear), worstYear: ex(riskMax.worstYear),
    yearlyReturns: (riskMax.yearlyReturns || []).map((y) => ({ year: y.key, value: r4(y.value) })),
    rolling1Y: roll1.status === "CALCULATED" ? { worst: r4(roll1.worst), median: r4(roll1.median), best: r4(roll1.best), positiveShare: r4(roll1.positiveShare), count: roll1.count } : { status: roll1.status },
    rolling3Y: roll3.status === "CALCULATED" ? { worst: r4(roll3.worst), median: r4(roll3.median), best: r4(roll3.best), positiveShare: r4(roll3.positiveShare), count: roll3.count, annualized: true } : { status: roll3.status },
    trend: { status: trend.status, value: r4(trend.value), above: trend.above ?? null, window: trend.window || null },
    relativeStrengthVsSPY: { value: r4(rs.value), status: rs.status },
    observations: { daily: daily.length, weekly: weekly.length }
  };
}

/* ------------------------------------------------------------------- SEO */
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function seoPage(e) {
  const title = `${e.name} (${e.symbol}) – ETF-Analyse | Vision Universe Altersvorsorge`;
  const desc = `${e.name} (${e.symbol}, ${e.exchange || "Börse unbekannt"}, ${e.currency || ""}): historische Kursentwicklung, Schwankung, größter Rückgang und Einordnung. Keine Anlageberatung.`;
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://research.visionuniverse.de/vorsorge/etf/${esc(e.slug)}/">
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/assets/site-navigation.css">
<script>location.replace("/vorsorge/#/etf/${encodeURIComponent(e.slug)}");</script>
</head>
<body><vu-navigation></vu-navigation><script src="/assets/site-navigation.js"></script>
<main style="max-width:720px;margin:40px auto;padding:0 20px;font-family:Inter,-apple-system,sans-serif">
<h1>${esc(e.name)} (${esc(e.symbol)})</h1>
<p>${esc(e.category)} · ${esc(e.exchange)} · ${esc(e.currency)}</p>
<p><a href="/vorsorge/#/etf/${esc(e.slug)}">ETF-Analyse in Vision Universe Altersvorsorge öffnen</a></p>
<p><small>Die dargestellten Informationen dienen der Analyse und Information und stellen keine individuelle Anlage-, Steuer- oder Rechtsberatung dar.</small></p>
</main>
</body>
</html>
`;
}

/* ------------------------------------------------------------- Index-Spalten */
export const INDEX_FIELDS = ["slug", "id", "symbol", "name", "issuer", "exchange", "currency", "productType", "assetClass", "region", "index", "theme", "category",
  "strategy", "retirementClass", "layer", "leverage", "inverse", "status", "single", "hy", "from", "price", "priceDate", "d1",
  "p1W", "p1M", "p3M", "p6M", "pYTD", "p1Y", "p3Y", "p5Y", "p10Y", "pMAX", "t1Y", "t5Y", "vol", "mdd", "trend", "rs", "coverage", "dist", "ucits",
  "ter", "aum", "hp", "t10", "hAsOf", "hch", "us", "hs", "dom"];

/* --------------------------------------------- Primaerquellen (SEC) */
const NOT_IN_NPORT = "Für diesen Fonds liegt keine N-PORT-Meldung vor (z. B. Unit Investment Trust wie SPY/QQQ/DIA, Rohstoff-Trust oder Nicht-US-Fonds). Holdings eines Emittenten dürfen ohne Lizenz nicht automatisiert übernommen werden.";
// "2026q2" -> "2026-06-30" (Stand eines SEC-Quartals-Datasets; Feld lastSuccessfulFetch = Datenstand, keine Abrufzeit)
const quarterEnd = (q) => (q ? q.slice(0, 4) + ["-03-31", "-06-30", "-09-30", "-12-31"][Number(q[5]) - 1] : null);
function secSources(e, hIdx, rr) {
  // Nur US-Boersenlistings erben SEC-Daten (gleicher Ticker an einer anderen Boerse waere ein anderes Wertpapier).
  const otc = !/^(NYSE|NASDAQ|BATS|ARCA|NYSE ARCA|AMEX|NYSE MKT)$/.test(String(e.exchange || "").toUpperCase());
  const h = !otc && hIdx && hIdx.bySymbol[e.symbol] || null;
  const c = !otc && rr && rr.bySymbol && rr.bySymbol[e.symbol] || null;
  const srcs = [];
  srcs.push({ fields: {
    name: FUND.field(e.name, { source: "TIINGO", sourceType: "MARKET_DATA_PROVIDER", confidence: "MEDIUM" }),
    ticker: FUND.field(e.symbol, { source: "TIINGO", sourceType: "MARKET_DATA_PROVIDER", confidence: "HIGH" }),
    exchange: FUND.field(e.exchange, { source: "TIINGO", sourceType: "MARKET_DATA_PROVIDER", confidence: "HIGH" }),
    listingCurrency: FUND.field(e.currency, { source: "TIINGO", sourceType: "MARKET_DATA_PROVIDER", confidence: "HIGH" }),
    issuer: FUND.field(FUND.normalizeIssuer(e.name) || e.issuer || null, { source: "VU_NAME_RULES", sourceType: "HEURISTIC", confidence: "MEDIUM" })
  } });
  if (h) {
    const [series, asOf, positions, , netAssets] = h;
    const ctx = { source: "SEC_NPORT", sourceType: "REGULATORY", sourceUrl: "https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets", asOf, confidence: "HIGH" };
    srcs.push({ fields: {
      aum: FUND.field(netAssets, ctx), aumCurrency: FUND.field("USD", ctx), aumLevel: FUND.field("FUND", ctx), numberOfHoldings: FUND.field(positions, ctx),
      // Abgeleitet aus der Tatsache, dass der Fonds N-PORT meldet (US-registrierte Investmentgesellschaft) - nicht direkt gemeldet.
      domicile: FUND.field("US", Object.assign({}, ctx, { sourceType: "DERIVED", confidence: "MEDIUM", originalField: "abgeleitet: N-PORT-Melder (US-registrierte Investmentgesellschaft)" })),
      ucits: FUND.field(false, Object.assign({}, ctx, { sourceType: "DERIVED", confidence: "MEDIUM", originalField: "abgeleitet: US Investment Company Act 1940 - kein UCITS" })),
      legalStructure: FUND.field("US_INVESTMENT_COMPANY_ACT_1940", Object.assign({}, ctx, { sourceType: "DERIVED", confidence: "MEDIUM" }))
    } });
  }
  if (c) {
    const cx = (f) => ({ source: "SEC_RR", sourceType: "REGULATORY", sourceUrl: "https://www.sec.gov/data-research/sec-markets-data/mutual-fund-prospectus-riskreturn-summary-data-sets", asOf: f.filed, confidence: "HIGH", originalField: "Prospekt-Gebührentabelle (XBRL)" });
    srcs.push({ fields: {
      expenseRatio: c.expenseRatio ? FUND.field(c.expenseRatio.value, cx(c.expenseRatio)) : null,
      netExpenseRatio: c.netExpenseRatio ? FUND.field(c.netExpenseRatio.value, cx(c.netExpenseRatio)) : null,
      managementFee: c.managementFee ? FUND.field(c.managementFee.value, cx(c.managementFee)) : null
    } });
  }
  const merged = FUND.merge(srcs, { fundId: h ? "sec:" + h[0] : e.canonicalETFId || null, shareClassId: e.shareClassId || null, listingId: e.listingId || null }).record;
  const er = c && (c.netExpenseRatio || c.expenseRatio);
  return { h, c, merged, costValue: er ? er.value : null, costBasis: c ? (c.netExpenseRatio ? "NET_EXPENSE_RATIO" : "EXPENSE_RATIO") : null };
}

/* ------------------------------------------------------------------ Lauf */
export function build() {
  const { rows, ingest } = loadRows();
  const hIdx = tryJson(join(OUT, "data/holdings/index.json"));
  const rr = tryJson(join(OUT, "data/sources/sec-rr-costs.json"));
  const overrides = tryJson(join(OUT, "data/overrides.json"))?.overrides || {};
  const prevIndex = tryJson(join(OUT, "data/etf-index.json"));
  const prevExtraRows = (tryJson(join(OUT, "data/etf-index-extra.json")) || {}).rows || null;
  const master = Master.buildMaster(rows, { overrides });
  mkdirSync(join(OUT, "data/series"), { recursive: true });
  const written = new Set();
  const spy = seriesFor("SPY", written);
  const benchmark = spy ? A.splice(spy.price.weekly, spy.price.daily).points : null;

  // Slugs: Ticker, solange eindeutig unter nicht-archivierten Listings
  const live = {};
  master.etfs.forEach((e) => { if (e.status !== "INACTIVE") live[e.symbol] = (live[e.symbol] || 0) + 1; });
  const total = {};
  master.etfs.forEach((e) => { total[e.symbol] = (total[e.symbol] || 0) + 1; });
  // Ticker allein, wenn er eindeutig ist - oder das einzige aktive Listing eines mehrfach gefuehrten Tickers
  const slugOf = (e) => (total[e.symbol] === 1 || (e.status !== "INACTIVE" && live[e.symbol] === 1) ? e.symbol : e.symbol + "-" + String(e.exchange || "X").replace(/[^A-Z0-9]+/gi, ""));

  const detailDir = join(OUT, "data/etf");
  if (existsSync(detailDir)) rmSync(detailDir, { recursive: true });
  mkdirSync(detailDir, { recursive: true });

  let latest = "";
  const entries = [];
  for (const e of master.etfs) {
    const s = e.status === "INACTIVE" && !existsSync(join(OUT, "data/series", e.symbol + ".json")) ? null : seriesFor(e.symbol, written);
    const priceM = s ? metrics(s.price.daily, s.price.weekly, "PRICE_RETURN", e.symbol === "SPY" ? null : benchmark) : null;
    const totalM = s && s.total ? metrics(s.total.daily, s.total.weekly, "TOTAL_RETURN", null) : null;
    e.priceHistoryAvailable = !!priceM;
    if (priceM && priceM.asOf > latest) latest = priceM.asOf;
    const tax = Tax.classify({ name: e.name, securityType: "ETF", assetClassHint: e.assetClass, historyYears: priceM ? priceM.historyYears : null, override: (overrides[e.symbol + "@" + e.exchange] || {}).taxonomy });
    // Assetklasse: Taxonomie (breiter) mit Rueckfall auf den Master
    const assetClass = tax.assetClass || e.assetClass;
    const anomaly = s ? Tax.priceAnomaly(A.clean(s.price.weekly)) : null;
    const rec = s ? s.record : null;
    // Nur Ingest-Reihen beginnen beim ersten Kurs des Anbieters; Repository-Reihen sind gekuerzt
    const tickerReuse = !!(rec && rec.origin === "tiingo:etf-ingest" && (rec.recycledTickerSuspected || (e.providerStartDate && rec.priceHistoryFrom && Date.parse(rec.priceHistoryFrom) - Date.parse(e.providerStartDate) > 400 * 864e5)));
    const twoYearsAgo = priceM ? new Date(Date.parse(priceM.asOf) - 730 * 864e5).toISOString().slice(0, 10) : null;
    const dist = rec && rec.dividendEvents !== null && rec.dividendEvents !== undefined && rec.dividendEvents > 0 ? "DISTRIBUTING_OBSERVED" : null;
    const ucits = /\bucits\b/i.test(e.name || "") ? "NAME" : null;
    const exch = String(e.exchange || "").toUpperCase();
    const countryFromExchange = /^(SHE|SHG|SHEB|SHGB)$/.test(exch) ? "CN" : /^(NYSE|NYSE ARCA|NASDAQ|BATS|AMEX|NYSE MKT|PINK|OTC.*|EXPM|NMFQS)$/.test(exch) ? "US" : null;
    if (!e.country && countryFromExchange) e.country = countryFromExchange;
    if (!e.region && countryFromExchange === "CN") { e.region = "CHINA"; e.derivation = Object.assign({}, e.derivation, { region: "EXCHANGE_COUNTRY" }); }
    const full = Object.assign({}, e, {
      assetClass, productType: tax.productType, productTypeBasis: tax.productTypeBasis, productTypeConfidence: tax.productTypeConfidence,
      strategies: tax.strategies, primaryStrategy: tax.primaryStrategy,
      leverage: Math.max(e.leverage || 1, tax.leverage), inverse: e.inverse || tax.inverse,
      singleStockUnderlying: e.singleStockUnderlying || tax.singleStockUnderlying,
      retirementClass: tax.retirement.class, retirementReasons: tax.retirement.reasons,
      conflict: e.status === "REVIEW" ? (master.conflicts.find((c) => c.symbol === e.symbol) || {}).conflict || "REVIEW" : null,
      priceAnomaly: anomaly, tickerReuseSuspected: tickerReuse,
      priceHistoryFrom: rec ? rec.priceHistoryFrom : null, distributionPolicy: dist,
      distributionBasis: dist ? "Ausschüttungen in der Kursreihe beobachtet (" + rec.dividendEvents + " Ereignisse)" : null,
      ucits, otc: /^(PINK|OTC|OTCGREY|OTCMKTS|OTCBB|OTCQB|OTCQX|OTCD|OTCCE|EXPM|NMFQS)$/.test(String(e.exchange || "").toUpperCase())
    });
    // Einordnung aus den ZUSAMMENGEFUEHRTEN Werten (Master + Taxonomie), nie aus nur einer Quelle
    const ret = Tax.retirementClass({ productType: full.productType, assetClass: full.assetClass, strategies: full.strategies,
      leverage: full.leverage, inverse: full.inverse, singleStockUnderlying: full.singleStockUnderlying }, { historyYears: priceM ? priceM.historyYears : null });
    full.retirementClass = ret.class; full.retirementReasons = ret.reasons;
    if ((full.leverage > 1 || full.inverse) && !/LEVERAGED|INVERSE/.test(full.primaryStrategy)) {
      full.strategies = [full.leverage > 1 && full.inverse ? "LEVERAGED_INVERSE" : full.leverage > 1 ? "LEVERAGED" : "INVERSE"].concat(full.strategies.filter((x) => x !== "EQUITY" && x !== "UNKNOWN"));
      full.primaryStrategy = full.strategies[0];
    }
    full.complex = full.retirementClass !== "STANDARD";
    const layer = Tax.layerOf(full);
    full.layer = layer.layer; full.layerReasons = layer.reasons;
    full.consumerVisible = full.layer === "PUBLIC_ANALYSIS" || full.layer === "COMPLEX";
    full.slug = slugOf(e);
    const q = Master.dataQuality(full);
    const provenance = {
      source: "tiingo", sourceId: e.listingId, sources: e.sources, retrievedAt: (ingest && ingest.asOf) || null, asOf: priceM ? priceM.asOf : null,
      classificationMethod: tax.basis + " (" + Tax.VERSION + ")", classificationConfidence: tax.productTypeConfidence,
      coverage: q.coverage, missingFields: q.missingFields, canonicalizationMethod: e.canonicalizationMethod,
      canonicalizationConfidence: e.canonicalizationConfidence, manualOverride: e.manualOverride || null
    };
    const sec = secSources(full, hIdx, rr);
    full.fundamentals = sec.merged;
    full.secSeries = sec.h ? sec.h[0] : null;
    const dna = Master.dna(full, priceM ? { volatility: priceM.volatility.value, maxDrawdown: priceM.maxDrawdown.value, momentum12m: priceM.windows["1Y"].value, historyYears: priceM.historyYears } : {},
      { cost: sec.costValue, effectiveNumber: sec.h && Number.isFinite(sec.h[9]) ? sec.h[9] : null, top10: sec.h ? sec.h[3] : null });
    dna.dataQuality = { value: Math.round(q.coverage * 100), status: "CALCULATED", label: "Datenqualität (Feldabdeckung)" };
    writeFileSync(join(detailDir, full.slug + ".json"), JSON.stringify({
      schemaVersion: "vu-vorsorge-etf-2.0.0", ...full, quality: q, provenance, dna, metrics: priceM, metricsTotal: totalM,
      totalReturn: rec ? rec.totalReturn : { state: "NO_SERIES" }, seriesPath: s ? "/vorsorge/data/series/" + e.symbol + ".json" : null,
      holdings: sec.h ? { status: "AVAILABLE", source: "SEC_NPORT", sourceType: "REGULATORY", series: sec.h[0], path: "/vorsorge/data/holdings/" + sec.h[0] + ".json", asOf: sec.h[1], positions: sec.h[2], top10: sec.h[3] }
        : { status: full.otc ? "NOT_APPLICABLE" : "NOT_IN_NPORT", reason: full.otc ? "US-Freiverkehrszeile eines ausländischen Fonds." : NOT_IN_NPORT },
      costs: sec.c ? { status: "AVAILABLE", basis: sec.costBasis, value: sec.costValue, expenseRatio: full.fundamentals.expenseRatio, netExpenseRatio: full.fundamentals.netExpenseRatio, managementFee: full.fundamentals.managementFee,
        ...(sec.c.previous ? { previousFiling: sec.c.previous.filed, changes: costChanges(sec.c) } : {}),
        note: "Laufende Kostenquote laut Prospekt-Gebührentabelle. Handels-, Depot- und Transaktionskosten sind nicht enthalten." }
        : { status: "SOURCE_NOT_CONNECTED", value: null, note: "Keine Kostenquote aus einer Primär- oder Regulierungsquelle verfügbar." }
    }));
    // Je Ticker eine Meldung (mehrere Kostenfelder zusammengefasst); Groesse = groesste Aenderung in Prozentpunkten
    const cc = costChanges(sec.c);
    if (cc.length) costEvents.push({ type: "COST_CHANGE", symbol: full.symbol, fields: cc.map((x) => x.field), // Groesse = Aenderung der tatsaechlich berechneten Kosten (netto, sonst brutto, sonst Verwaltungsgebuehr)
      magnitude: ((x) => Math.abs(x.newValue - x.oldValue))(cc.find((x) => x.field === "netExpenseRatio") || cc.find((x) => x.field === "expenseRatio") || cc[0]), asOf: cc[0].to,
      text: full.symbol + " · " + cc.map((x) => x.text.replace(/ \(Prospekt[^)]*\)\.$/, "")).join("; ") + " (Prospekt " + cc[0].from + " → " + cc[0].to + ")." });
    entries.push({ full, priceM, totalM });
  }

  // Serien aus Repository-Quellen, die nicht mehr gebraucht werden, entfernen
  for (const f of readdirSync(join(OUT, "data/series"))) {
    const rec = tryJson(join(OUT, "data/series", f));
    if (rec && rec.origin === "repository-sources" && !written.has(f)) rmSync(join(OUT, "data/series", f));
  }

  const asOf = latest || null;
  const row = ({ full: e, priceM: m, totalM: t }) => {
    const p = (k) => (m ? (m.windows[k].annualized ?? m.windows[k].value) : null);
    return [e.slug, e.listingId, e.symbol, e.name, e.issuer, e.exchange, e.currency, e.productType, e.assetClass, e.region, e.index, e.theme, e.category,
      e.primaryStrategy, e.retirementClass, e.layer, e.leverage, e.inverse ? 1 : 0, e.status, e.singleStockUnderlying, m ? m.historyYears : null, e.priceHistoryFrom || (m ? m.firstDate : null),
      m ? m.price : null, m ? m.priceDate : null, m ? m.change1D : null,
      p("1W"), p("1M"), p("3M"), p("6M"), p("YTD"), p("1Y"), p("3Y"), p("5Y"), p("10Y"), p("MAX"),
      t ? t.windows["1Y"].value : null, t ? (t.windows["5Y"].annualized ?? null) : null,
      m ? m.volatility.value : null, m ? m.maxDrawdown.value : null, m ? m.trend.value : null, m ? m.relativeStrengthVsSPY.value : null,
      Master.dataQuality(e).coverage, e.distributionPolicy, e.ucits,
      FUND.valueOf(e.fundamentals && (e.fundamentals.netExpenseRatio || e.fundamentals.expenseRatio)), FUND.valueOf(e.fundamentals && e.fundamentals.aum),
      hIdx && hIdx.bySymbol[e.symbol] && e.secSeries ? hIdx.bySymbol[e.symbol][2] : null, hIdx && e.secSeries ? hIdx.bySymbol[e.symbol][3] : null,
      hIdx && e.secSeries ? hIdx.bySymbol[e.symbol][1] : null, hIdx && e.secSeries ? hIdx.bySymbol[e.symbol][6] : null,
      hIdx && e.secSeries ? hIdx.bySymbol[e.symbol][5] : null, e.secSeries || null, FUND.valueOf(e.fundamentals && e.fundamentals.domicile)];
  };
  const layerCount = (l) => entries.filter((x) => x.full.layer === l).length;
  const all = entries.map((x) => x.full);
  const tally = (list, f) => list.reduce((a, e) => { const k = Array.isArray(e[f]) ? e[f][0] : e[f]; const kk = k ?? "UNKNOWN"; a[kk] = (a[kk] || 0) + 1; return a; }, {});
  const hist = (y) => entries.filter((x) => x.priceM && x.priceM.historyYears >= y).length;
  const counts = {
    rowsRead: rows.length, listings: all.length, canonicalFunds: master.counts.funds,
    shareClasses: new Set(all.map((e) => e.shareClassId)).size, uniqueTickers: new Set(all.map((e) => e.symbol)).size,
    publicAnalysis: layerCount("PUBLIC_ANALYSIS"), complex: layerCount("COMPLEX"), archive: layerCount("ARCHIVE"), review: layerCount("REVIEW"),
    consumerVisible: all.filter((e) => e.consumerVisible).length,
    withPriceHistory: hist(0), withHistory1Y: hist(1), withHistory3Y: hist(3), withHistory5Y: hist(5), withHistory10Y: hist(10),
    withTotalReturn: entries.filter((x) => x.totalM).length,
    leveragedOrInverse: all.filter((e) => e.leverage > 1 || e.inverse).length, inactive: all.filter((e) => e.status === "INACTIVE").length
  };
  const index = { schemaVersion: "vu-vorsorge-etf-index-2.0.0", build: VERSION, taxonomy: Tax.VERSION, analytics: A.VERSION, generatedAt: asOf, asOf, provider: "tiingo",
    scope: ingest ? "TIINGO_ETF_INGEST" : "REPOSITORY_DELIVERED_EXTRACT",
    scopeNote: ingest ? "Aktive ETF-Ticker der Tiingo-Tickerliste mit Stammdaten und Kursreihen (Ingest " + (ingest.ingest || "") + ") plus bisheriger Repository-Auszug."
      : "Repository-Auszug. Der volle Tiingo-Ingest läuft über .github/workflows/vorsorge-etf-universe.yml.",
    providerUniverseEtfRows: tryJson(join(OUT, "data/ingest/catalog-stats.json"))?.etfRows ?? tryJson(join(root, "quant/data/market/universe/summary.json"))?.totals?.byInstrumentType?.ETF ?? null,
    counts, fields: INDEX_FIELDS, rows: entries.map(row) };
  // Auslieferung in zwei Teilen: der Browser laedt zuerst nur Public + Komplex;
  // Archiv und Pruefschicht kommen erst, wenn jemand sie braucht.
  const isMain = (r) => r[INDEX_FIELDS.indexOf("layer")] === "PUBLIC_ANALYSIS" || r[INDEX_FIELDS.indexOf("layer")] === "COMPLEX";
  const mainIndex = Object.assign({}, index, { part: "MAIN", rows: index.rows.filter(isMain), extraPath: "/vorsorge/data/etf-index-extra.json" });
  writeFileSync(join(OUT, "data/etf-index.json"), JSON.stringify(mainIndex));
  writeFileSync(join(OUT, "data/etf-index-extra.json"), JSON.stringify({ schemaVersion: index.schemaVersion, part: "EXTRA", asOf, fields: INDEX_FIELDS, rows: index.rows.filter((r) => !isMain(r)) }));
  if (existsSync(join(OUT, "data/etf-master.json"))) rmSync(join(OUT, "data/etf-master.json"));

  // ------------------------------------------------------------ Data-QA
  const missing = {};
  for (const e of all) for (const f of Master.dataQuality(e).missingFields) missing[f] = (missing[f] || 0) + 1;
  const cat = tryJson(join(OUT, "data/ingest/catalog-stats.json"));
  const rep = tryJson(join(OUT, "data/ingest/ingest-report.json"));
  const failedRep = tryJson(join(OUT, "data/ingest/failed-etf-ingest.json"));
  const quality = {
    schemaVersion: "vu-vorsorge-data-qa-2.0.0", asOf, scope: index.scope,
    ingest: { status: rep ? (rep.complete ? "COMPLETE" : "PARTIAL") : "NOT_RUN", report: rep, catalog: cat, failedCount: failedRep ? failedRep.count : null },
    layers: { raw: cat ? cat.etfRows : null, canonical: counts.canonicalFunds, listings: counts.listings, publicAnalysis: counts.publicAnalysis, complex: counts.complex, archive: counts.archive, review: counts.review },
    counts,
    priceCoverage: { withAnyHistory: counts.withPriceHistory, ratio: all.length ? counts.withPriceHistory / all.length : 0, y1: counts.withHistory1Y, y3: counts.withHistory3Y, y5: counts.withHistory5Y, y10: counts.withHistory10Y, totalReturn: counts.withTotalReturn },
    metadataCoverage: Object.fromEntries(Master.FIELDS.map((f) => [f, Math.round((1 - (missing[f] || 0) / Math.max(1, all.length)) * 1000) / 1000])),
    missingMetadata: missing, missingName: all.filter((e) => !e.name).length, missingPrice: all.filter((e) => !e.priceHistoryAvailable).length,
    noSourceFields: Master.NO_SOURCE_FIELDS,
    duplicates: { duplicateTickers: master.duplicateTickers, multiListingFunds: master.multiListingFunds },
    conflicts: master.conflicts, tickerReuseSuspected: all.filter((e) => e.tickerReuseSuspected).map((e) => e.symbol),
    priceAnomalies: all.filter((e) => e.priceAnomaly).map((e) => ({ symbol: e.symbol, anomaly: e.priceAnomaly })),
    productTypes: tally(all, "productType"), strategies: tally(all, "primaryStrategy"), retirementClasses: tally(all, "retirementClass"),
    leveragedInverse: all.filter((e) => e.leverage > 1 || e.inverse).length,
    singleStock: all.filter((e) => e.singleStockUnderlying).length,
    currencies: tally(all, "currency"), exchanges: tally(all, "exchange"), countries: tally(all, "country"), assetClasses: tally(all, "assetClass"),
    regions: tally(all, "region"), issuers: tally(all, "issuer"), statuses: tally(all, "status"), unknownClassification: all.filter((e) => e.productType === "UNKNOWN" || !e.assetClass).length
  };
  // ------------------------------------------- ETF Intelligence (Primaerquellen)
  const pub = all.filter((e) => e.layer === "PUBLIC_ANALYSIS" || e.layer === "COMPLEX");
  const share = (list, fn) => ({ count: list.filter(fn).length, ratio: r4(list.filter(fn).length / Math.max(1, list.length)) });
  const fv = (e, k) => FUND.valueOf(e.fundamentals && e.fundamentals[k]);
  const euIdx = tryJson(join(OUT, "data/eu/etf-eu-index.json"));
  const euItems = euIdx ? euIdx.rows.map((r) => Object.fromEntries(euIdx.fields.map((f, i) => [f, r[i]]))) : [];
  const euReg = tryJson(join(OUT, "data/eu/etf-eu-ucits.json"));          // ESMA-Fondsregister (amtlicher UCITS-Status)
  const xetraStats = tryJson(join(OUT, "data/sources/xetra-refdata-stats.json"));   // Xetra-Referenzdaten: nur Abdeckung, Rechte UNKNOWN
  const regHosts = euReg ? euReg.rows.map((r) => String(r[euReg.fields.indexOf("hostCountries")] || "").split(" ")) : [];
  const nport = tryJson(join(OUT, "data/sources/nport-manifest.json"));
  const rrM = tryJson(join(OUT, "data/sources/sec-rr-costs.json"));
  const sicM = tryJson(join(OUT, "data/sources/sec-sic.json"));
  const probe = tryJson(join(OUT, "data/sources/etf-source-probe.json"));
  const DE_MIC = /^(XETR|XETA|XETU|XFRA|FRAA|FRAU|XSTU|STU[BDF]|XMUN|MUN[BD]|XHAM|HAM[BN]|XHAN|HAN[BD]|XDUS|XBER|XGAT|TGAT)$/;
  quality.intelligence = {
    publicUniverse: pub.length,
    coverage: {
      costs: share(pub, (e) => fv(e, "expenseRatio") !== null || fv(e, "netExpenseRatio") !== null),
      aum: share(pub, (e) => fv(e, "aum") !== null), holdings: share(pub, (e) => !!e.secSeries),
      domicile: share(pub, (e) => fv(e, "domicile") !== null), ucitsStatus: share(pub, (e) => fv(e, "ucits") !== null),
      isin: share(pub, () => false), wkn: share(pub, () => false), replication: share(pub, () => false), nav: share(pub, () => false)
    },
    holdings: hIdx ? hIdx.stats : null, holdingsQuarters: hIdx ? hIdx.quarters : [],
    europe: euIdx ? { asOf: euIdx.asOf, shareClasses: euItems.length, ucitsInName: euItems.filter((x) => x.ucitsInName).length,
      listedInGermany: euItems.filter((x) => String(x.venues || "").split(" ").some((m) => DE_MIC.test(m))).length,
      venues: euItems.reduce((a, x) => a + String(x.venues || "").split(" ").filter(Boolean).length, 0),
      domicile: euItems.reduce((a, x) => { const k = x.domicile || "UNKNOWN"; a[k] = (a[k] || 0) + 1; return a; }, {}),
      distribution: euItems.reduce((a, x) => { const k = x.distribution || "UNKNOWN"; a[k] = (a[k] || 0) + 1; return a; }, {}),
      withPriceFeed: 0, isin: euItems.length, wkn: 0, ter: 0, holdings: 0,
      ucitsRegister: euReg ? euReg.rows.length : 0, notifiedInGermany: regHosts.filter((h) => h.includes("DE")).length,
      domicileFromIsin: euItems.filter((x) => x.domicileBasis === "ISIN_PREFIX").length,
      // Gefunden, aber nicht veroeffentlicht (Nutzungsrechte UNKNOWN): Abdeckung der Xetra-Referenzdaten
      pendingRights: xetraStats ? { source: "Deutsche Börse (Xetra-Referenzdaten)", asOf: xetraStats.masterAsOf, etfs: xetraStats.masterEtfs, ongoingCharges: xetraStats.coverage.ongoingCharges,
        replication: xetraStats.coverage.replication, distribution: xetraStats.coverage.distribution, benchmark: xetraStats.coverage.benchmark, wkn: xetraStats.coverage.wkn, published: !!xetraStats.published } : null } : null,
    providers: [
      { id: "TIINGO", type: "MARKET_DATA_PROVIDER", status: rep && rep.complete ? "HEALTHY" : rep ? "DEGRADED" : "NOT_CONFIGURED", lastSuccessfulFetch: (ingest && ingest.asOf) || null, items: counts.withPriceHistory, fields: "Kurse, Ausschüttungen, Splits, Namen" },
      { id: "SEC_NPORT", type: "REGULATORY", status: nport && nport.snapshots ? "HEALTHY" : "NOT_CONFIGURED", lastSuccessfulFetch: hIdx ? Object.values(hIdx.bySymbol).map((r) => r[1]).filter(Boolean).sort().pop() || null : null, items: nport ? nport.snapshots : 0, fields: "Holdings, Fondsvermögen, Historie (quartalsweise)" },
      { id: "SEC_RR", type: "REGULATORY", status: rrM && rrM.count ? "HEALTHY" : "NOT_CONFIGURED", lastSuccessfulFetch: rrM ? quarterEnd((rrM.datasets || []).map((d) => (/(\d{4}q[1-4])/.exec(d.file) || [])[1]).filter(Boolean).sort().pop()) : null, items: rrM ? rrM.count : 0, fields: "Kostenquote, Verwaltungsgebühr (Prospekt)" },
      { id: "SEC_SIC", type: "REGULATORY", status: sicM && sicM.count ? "HEALTHY" : "NOT_CONFIGURED", lastSuccessfulFetch: null, items: sicM ? sicM.count : 0, fields: "Wirtschaftszweig der Emittenten" },
      { id: "ESMA_FIRDS", type: "REGULATORY", status: euIdx ? "HEALTHY" : "NOT_CONFIGURED", lastSuccessfulFetch: euIdx ? euIdx.asOf : null, items: euItems.length, fields: "ISIN, Handelsplätze, Währung, CFI" },
      { id: "GLEIF", type: "REGULATORY", status: euIdx ? "HEALTHY" : "NOT_CONFIGURED", lastSuccessfulFetch: euIdx ? euIdx.asOf : null, items: euItems.filter((x) => x.domicile).length, fields: "Rechtlicher Emittent, Domizil" },
      { id: "ESMA_FONDSREGISTER", type: "REGULATORY", status: euReg ? "HEALTHY" : "NOT_CONFIGURED", lastSuccessfulFetch: euIdx ? euIdx.asOf : null, items: euReg ? euReg.rows.length : 0, fields: "UCITS-Status (amtlich), Verwaltungsgesellschaft, Vertriebsländer" },
      { id: "DEUTSCHE_BOERSE_REFDATA", type: "MARKET_DATA_PROVIDER", status: xetraStats ? (xetraStats.published ? "HEALTHY" : "RIGHTS_PENDING") : "NOT_CONFIGURED", lastSuccessfulFetch: xetraStats ? xetraStats.masterAsOf : null, items: xetraStats ? xetraStats.masterEtfs : 0, fields: "Laufende Kosten, Replikation, Ertragsverwendung, Index, WKN – Nutzungsrechte in Klärung, nicht veröffentlicht" },
      ...["BLACKROCK", "VANGUARD", "AMUNDI", "DWS", "STATE_STREET", "INVESCO", "WISDOMTREE", "UBS", "JPMORGAN", "HSBC", "VANECK", "LEGAL_GENERAL", "GLOBAL_X", "FIDELITY", "FRANKLIN_TEMPLETON", "BNP_PARIBAS"]
        .map((id) => ({ id, type: "PRIMARY_ISSUER", status: "NOT_PERMITTED", lastSuccessfulFetch: null, items: 0, fields: "Nutzungsbedingungen erlauben keinen automatisierten Abruf; Import-Parser bereit" }))
    ],
    termsChecked: probe ? probe.terms.filter((t) => t.status === 200).length : 0
  };
  writeFileSync(join(OUT, "data/quality.json"), JSON.stringify(quality, null, 1));

  // ---------------------------------------------------------------- UCITS
  const euEx = all.filter((e) => EU_EXCHANGES.has(String(e.exchange || "").toUpperCase()));
  const catEu = cat ? Object.entries(cat.byExchange || {}).filter(([k]) => EU_EXCHANGES.has(k)).reduce((a, [, v]) => a + v, 0) : null;
  writeFileSync(join(OUT, "data/ucits-coverage.json"), JSON.stringify({
    schemaVersion: "vu-vorsorge-ucits-coverage-1.0.0", asOf, measuredOn: index.scope,
    catalogEtfRowsOnEuropeanExchanges: catEu, catalogExchanges: cat ? cat.byExchange : null,
    listingsOnEuropeanExchanges: euEx.length, listingsNamedUcits: all.filter((e) => e.ucits).length,
    listingsInEurGbpChf: all.filter((e) => ["EUR", "GBP", "CHF"].includes(e.currency)).length,
    isinAvailable: all.filter((e) => e.isin).length,
    examples: all.filter((e) => e.ucits || EU_EXCHANGES.has(String(e.exchange || "").toUpperCase())).slice(0, 20).map((e) => ({ symbol: e.symbol, name: e.name, exchange: e.exchange, currency: e.currency })),
    conclusion: (euEx.length + all.filter((e) => e.ucits).length) === 0
      ? "Im gemessenen Tiingo-Bestand ist kein UCITS-Listing (europäische Börse, UCITS im Namen oder EUR/GBP/CHF-Handelswährung) enthalten. Für deutsche Privatanleger relevante UCITS-ETFs brauchen eine zweite Datenquelle."
      : euEx.length === 0
        ? `${all.filter((e) => e.ucits).length} UCITS-Fonds erscheinen nur als US-Freiverkehrszeile (OTC, z. B. PINK, in USD) – nicht als europäisches Börsenlisting, ohne ISIN. Die für deutsche Privatanleger handelbaren Listings (Xetra, LSE, Euronext …) fehlen; dafür braucht es eine zweite Datenquelle.`
        : "Einzelne europäische Listings vorhanden; ISIN fehlt. Abdeckung für deutsche Privatanleger unzureichend.",
    ucitsByExchange: all.filter((e) => e.ucits).reduce((a, e) => { a[e.exchange] = (a[e.exchange] || 0) + 1; return a; }, {})
  }, null, 1));

  // ------------------------------------------------------- Datenlücken-Matrix
  const cov = (f) => quality.metadataCoverage[f];
  writeFileSync(join(OUT, "data/data-gaps.json"), JSON.stringify({
    schemaVersion: "vu-vorsorge-data-gaps-1.0.0", asOf,
    fields: [
      ["US-Kurse", "Tiingo EOD", r4(quality.priceCoverage.ratio), "nein"],
      ["Gesamtrendite", "Tiingo divCash + kanonische Rekonstruktion", r4(counts.withTotalReturn / Math.max(1, all.length)), "nein"],
      ["UCITS-/EU-Kurse", "keine", 0, "ja – europäischer Kursanbieter"],
      ["US-Holdings", "SEC N-PORT (quartalsweise)", quality.intelligence.coverage.holdings.ratio, "aktuelle Tagesbestände nur über lizenzierte Emittentendaten"],
      ["UCITS-Holdings", "keine", 0, "ja – Lizenz eines Emittenten/Datenanbieters"],
      ["Kostenquote (US)", "SEC Prospektdaten (Risk/Return)", quality.intelligence.coverage.costs.ratio, "TER/laufende Kosten für UCITS: EMT/Emittent (Lizenz)"],
      ["Fondsvermögen (US)", "SEC N-PORT (Fondsebene)", quality.intelligence.coverage.aum.ratio, "Anteilklassen-Ebene: Emittent"],
      ["ISIN (EU)", "ESMA FIRDS", euIdx ? 1 : 0, "nein"], ["ISIN (US-Listings)", "keine", 0, "ja"], ["WKN", "Deutsche Börse Instrumentenliste – gefunden, Nutzungsrechte in Klärung, nicht veröffentlicht", 0, "Freigabe Deutsche Börse oder Lizenz"],
      ["Domizil", "SEC (US) · GLEIF (EU)", quality.intelligence.coverage.domicile.ratio, "nein"],
      ["UCITS-Status", "SEC (US = kein UCITS) · ESMA-Fondsregister (EU, amtlich, Namenszuordnung)", quality.intelligence.coverage.ucitsStatus.ratio, euReg ? "EU-Anteilklassen ohne eindeutigen Registertreffer: nur Hinweis aus dem Namen" : "verbindlich nur Emittent/KID"],
      ["UCITS-Status (EU)", "ESMA-Fondsregister (grenzüberschreitender Vertrieb)", euReg && euItems.length ? r4(euReg.rows.length / euItems.length) : 0, "Register ohne ISIN – Zuordnung über Fondsnamen"],
      ["Laufende Kosten (EU)", "Deutsche Börse Referenzdaten – gefunden, Nutzungsrechte in Klärung, nicht veröffentlicht", 0, "Freigabe Deutsche Börse oder Lizenz (EMT/Datenanbieter)"],
      ["Ertragsverwendung", "Ausschüttungen beobachtet (US) · CFI (EU)", r4(all.filter((e) => e.distributionPolicy).length / Math.max(1, all.length)), "thesaurierend (US) nicht belegbar"],
      ["Replikation", "keine", 0, "ja"], ["Index (verbindlich)", "aus Namen abgeleitet", cov("index"), "ja"], ["Tracking Difference", "nicht berechenbar ohne Indexstände", 0, "ja"],
      ["NAV", "keine", 0, "ja"], ["Börse (US)", "Tiingo-Tickerliste", cov("exchange"), "nein"], ["Börsen (EU)", "ESMA FIRDS", euIdx ? 1 : 0, "nein"]
    ].map(([field, tiingo, coverage, secondProvider]) => ({ field, primarySource: tiingo, tiingo, coverage, gap: secondProvider, secondProviderNeeded: secondProvider }))
  }, null, 1));

  // ------------------------------------------------------------ Änderungen
  const prevRows = prevIndex && prevIndex.rows ? prevIndex.rows.concat(prevExtraRows || []).map((r) => Object.fromEntries(prevIndex.fields.map((f, i) => [f, r[i]]))) : null;
  const nextRows = index.rows.map((r) => Object.fromEntries(INDEX_FIELDS.map((f, i) => [f, r[i]])));
  const toM = (list) => list && { etfs: list.map((r) => ({ listingId: r.id, symbol: r.symbol, name: r.name, status: r.status, index: r.index, vol: r.vol, hy: r.hy })) };
  const changes = Monitor.diffMasters(toM(prevRows), toM(nextRows), asOf);
  const prevChanges = tryJson(join(OUT, "data/changes.json"));
  // Rohereignisse aufbewahren; angezeigt wird die priorisierte, gebuendelte Liste (Monitor-Rauschen).
  const raw = changes.events.length ? changes.events : (prevChanges && (prevChanges.rawEvents || prevChanges.events)) || [];
  const layerOf = Object.fromEntries(nextRows.map((r) => [r.symbol, r.layer]));
  changes.rawEvents = raw;
  // Kostenaenderungen stammen aus Prospektstaenden (nicht aus dem Vergleich zweier Builds) und werden je Build neu ermittelt.
  changes.costEvents = costEvents.length;
  changes.events = Monitor.prioritize(raw.concat(costEvents), layerOf);
  writeFileSync(join(OUT, "data/changes.json"), JSON.stringify(changes, null, 1));

  // ------------------------------------------------------------ SEO
  const seoDir = join(OUT, "etf");
  if (existsSync(seoDir)) rmSync(seoDir, { recursive: true });
  const seo = all.filter((e) => e.layer === "PUBLIC_ANALYSIS" && /^[A-Z0-9.-]+$/.test(e.slug) && entries.find((x) => x.full === e).priceM?.historyYears >= 1);
  for (const e of seo) { mkdirSync(join(seoDir, e.slug), { recursive: true }); writeFileSync(join(seoDir, e.slug, "index.html"), seoPage(e)); }
  writeFileSync(join(OUT, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ['<url><loc>https://research.visionuniverse.de/vorsorge/</loc></url>'].concat(seo.map((e) => `<url><loc>https://research.visionuniverse.de/vorsorge/etf/${esc(e.slug)}/</loc>${asOf ? `<lastmod>${asOf}</lastmod>` : ""}</url>`)).join("\n") + "\n</urlset>\n");
  return { counts, asOf, scope: index.scope, seoPages: seo.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = Date.now();
  const res = build();
  log(JSON.stringify({ ...res, buildMs: Date.now() - t }, null, 2));
}
