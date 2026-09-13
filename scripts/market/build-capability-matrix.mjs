/* =========================================================================
   VISION UNIVERSE — build-capability-matrix.mjs

   WAS KANN JEDES INSTRUMENT DES COMPANY MASTERS - GEMESSEN, NICHT VERMUTET

   Der Company Master (quant/data/market/security-master/eligibility.json)
   sagt, welche Titel zum Produktuniversum gehoeren. Diese Matrix sagt je
   Titel, was die Marktdaten-Schicht fuer ihn tatsaechlich hat:

     HAS_PROVIDER_MAPPING   Tiingo-Symbol vorhanden (Master, Quelle PROVIDER_SUPPORTED_TICKERS)
     HAS_MARKET_DATA        Tageskurse beim Anbieter abgerufen und in der Qualitaetspruefung bestanden
     HAS_HISTORICAL         kompakte Jahresreihe ausgeliefert (discover-series), >= 250 Bars in der Quelle
     HAS_INTRADAY           Snapshot der juengsten Sitzung (5-Minuten-Bars, IEX)
     HAS_LIVE               im Discover-Live-Umfang (Snapshot-Refresh waehrend der Sitzung) UND Snapshot
     HAS_FACTORS            Faktorzeile (market-factors) vorhanden
     HAS_FUNDAMENTALS       SEC-Kanon (quant/data/sec/canonical_index.json) vorhanden
     HAS_NAME               Firmenname ausgeliefert
     DISCOVER_ELIGIBLE      Karte im realen Discover-Universum, nicht als nicht handelbar ausgewiesen
     HAS_STOCK_PAGE         Detailseite ausgeliefert

   Jede Luecke traegt einen Grund (gaps[]). Es wird nichts erzeugt, nur
   gelesen: Master, Statusbericht des Ingests, discover-series, Faktoren,
   Intraday-Verzeichnis, Live-Umfang, SEC-Kanon, Discover-Daten.

   Ausgabe:
     quant/data/market/capabilities/matrix.json    eine Zeile je Master-Titel
     quant/data/market/capabilities/summary.json   Zaehlungen, Gruende, Stichprobe

   Aufruf: node scripts/market/build-capability-matrix.mjs [--root=…]
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProductUniverse, SECURITY_MASTER_FILE } from "./universe-source.mjs";

export const MATRIX_VERSION = "capability-matrix-1.0.0";
export const CAPABILITIES = ["HAS_PROVIDER_MAPPING", "HAS_MARKET_DATA", "HAS_HISTORICAL", "HAS_INTRADAY", "HAS_LIVE",
                             "HAS_FACTORS", "HAS_FUNDAMENTALS", "HAS_NAME", "DISCOVER_ELIGIBLE", "HAS_STOCK_PAGE"];
/* Bekannte Titel, die im Master auffindbar sein und ihre Faehigkeiten
   korrekt ausweisen muessen (Auftrag vom 13.09.2026). */
export const SPOT_CHECK = [
  ["Apple", "AAPL"], ["Microsoft", "MSFT"], ["NVIDIA", "NVDA"], ["Amazon", "AMZN"], ["Alphabet", "GOOGL"],
  ["Meta", "META"], ["Tesla", "TSLA"], ["AMD", "AMD"], ["Palantir", "PLTR"], ["Broadcom", "AVGO"],
  ["Eli Lilly", "LLY"], ["Walmart", "WMT"], ["JPMorgan", "JPM"], ["Visa", "V"], ["Micron", "MU"]
];

const readJSON = (f) => JSON.parse(readFileSync(f, "utf8"));
const maybeJSON = (f) => (existsSync(f) ? readJSON(f) : null);

export function buildCapabilityMatrix(opt) {
  opt = opt || {};
  const root = opt.root || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const master = readJSON(join(root, SECURITY_MASTER_FILE));
  const produkt = resolveProductUniverse(root);
  const produktIds = new Set(produkt.securities.map((s) => s.securityId));

  /* Quellen - jede optional; fehlt eine, faellt die Spalte auf false mit Grund. */
  const status = maybeJSON(join(root, "quant", "data", "market", "tiingo-status.json"));
  const perSecurity = (status && status.securities) || {};
  const seriesDir = join(root, "quant", "data", "market", "discover-series");
  const factors = maybeJSON(join(root, "quant", "data", "market", "factors", "factors-FULL_UNIVERSE.json"));
  const factorRows = new Map((factors && factors.securities || []).map((r) => [r.securityId || "ref_" + r.ticker, r]));
  const factorSkipped = new Map((factors && factors.skipped || []).map((r) => ["ref_" + r.ticker, r]));
  const intradayIndex = maybeJSON(join(root, "quant", "data", "market", "intraday", "index.json"));
  const intradayStatus = maybeJSON(join(root, "quant", "data", "market", "intraday", "status.json"));
  const sessions = intradayIndex ? Object.keys(intradayIndex.available || {}).sort() : [];
  const latestSession = sessions[sessions.length - 1] || null;
  const intradaySymbols = new Set(latestSession ? intradayIndex.available[latestSession] : []);
  const intradayReasons = (intradayStatus && intradayStatus.perSymbol) || {};
  const liveScope = maybeJSON(join(root, "discover", "data", "live-scope", "US_REAL.json"));
  const liveSymbols = new Set(liveScope ? liveScope.symbols : []);
  const sec = maybeJSON(join(root, "quant", "data", "sec", "canonical_index.json"));
  const secTickers = new Set((sec && sec.companies || []).map((c) => c.ticker));
  const search = maybeJSON(join(root, "discover", "data", "search", "US_REAL.json"));
  const discoverEntries = new Map((search && search.entries || []).map((e) => [e.s, e]));
  const meta = maybeJSON(join(root, "discover", "data", "meta.json"));
  const realMeta = meta ? (meta.universes || []).find((u) => u.universeId === "US_REAL") : null;
  const notTrading = new Map((realMeta && realMeta.notTradingExcluded || []).map((x) => [x.symbol, x.reason]));
  const stocksDir = join(root, "discover", "data", "stocks", "US_REAL");
  const stockPages = new Set(existsSync(stocksDir) ? readdirSync(stocksDir).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)) : []);

  const rows = [];
  for (const e of master.decisions || []) {
    const id = e.securityId || "ref_" + e.ticker;
    const sym = e.ticker;
    const inProduct = produktIds.has(id);
    const st = perSecurity[id] || null;
    const seriesFile = join(seriesDir, id + ".json");
    const series = existsSync(seriesFile) ? readJSON(seriesFile) : null;
    const gaps = [];
    const cap = {};

    cap.HAS_PROVIDER_MAPPING = !!e.ticker && e.evidence_source === "SECURITY_MASTER";
    if (!cap.HAS_PROVIDER_MAPPING) gaps.push("PROVIDER_MAPPING_MISSING");
    if (!inProduct) gaps.push("NOT_IN_PRODUCT_UNIVERSE:" + (e.instrument_type || e.product_eligibility));
    if (e.active_status === "INACTIVE") gaps.push("INACTIVE");

    /* Marktdaten: der Ingest hat die Reihe geholt und bestanden. */
    if (st && st.ok) cap.HAS_MARKET_DATA = true;
    else if (series && Array.isArray(series.points) && series.points.length) cap.HAS_MARKET_DATA = true;
    else {
      cap.HAS_MARKET_DATA = false;
      if (st && st.reason === "qualityCheckFailed") gaps.push("QUALITY_REJECTED:" + String(st.message || "").split(",")[0].trim());
      else if (st && st.reason === "adjustmentContradicted") gaps.push("QUALITY_REJECTED:adjustmentContradicted");
      else if (st && st.reason) gaps.push("PROVIDER_" + String(st.reason).toUpperCase());
      else if (inProduct) gaps.push(status ? "NOT_INGESTED_YET" : "NO_INGEST_STATUS");
    }
    /* Eine kompakte Reihe wird nur nach bestandener Pruefung veroeffentlicht:
       sie belegt die Annahme auch dann, wenn der Statusbericht des letzten
       Laufs den Titel nicht (mehr) einzeln nennt. */
    cap.HISTORICAL_QUALITY_ACCEPTED = !!((st && st.ok) || (series && Array.isArray(series.points) && series.points.length));

    cap.HAS_HISTORICAL = !!(series && Array.isArray(series.points) && series.points.length >= 30 &&
                            (series.sourceBarCount || series.points.length) >= 250);
    if (!cap.HAS_HISTORICAL && cap.HAS_MARKET_DATA) gaps.push(series ? "INSUFFICIENT_HISTORY" : "NO_COMPACT_SERIES");

    cap.HAS_INTRADAY = intradaySymbols.has(sym);
    if (!cap.HAS_INTRADAY && inProduct) {
      const r = intradayReasons[sym];
      gaps.push(r && r.reason === "noRegularBars" ? "NO_IEX_BARS" : latestSession ? "NO_INTRADAY_SNAPSHOT" : "NO_INTRADAY_RUN");
    }
    cap.HAS_LIVE = cap.HAS_INTRADAY && liveSymbols.has(sym);
    if (!cap.HAS_LIVE && cap.HAS_INTRADAY) gaps.push("NOT_IN_LIVE_SCOPE");

    cap.HAS_FACTORS = factorRows.has(id);
    if (!cap.HAS_FACTORS && inProduct) {
      const sk = factorSkipped.get(id);
      gaps.push(sk ? "NO_FACTOR_ROW:" + sk.reason : cap.HAS_MARKET_DATA ? "NO_FACTOR_ROW" : "NO_FACTOR_ROW:NO_MARKET_DATA");
    }
    cap.HAS_FUNDAMENTALS = secTickers.has(sym);
    if (!cap.HAS_FUNDAMENTALS) gaps.push("NO_FUNDAMENTALS");

    const disc = discoverEntries.get(sym) || null;
    cap.HAS_NAME = !!(disc && disc.n);
    if (!cap.HAS_NAME) gaps.push("NAME_MISSING");
    cap.DISCOVER_ELIGIBLE = !!disc && !notTrading.has(sym);
    if (!cap.DISCOVER_ELIGIBLE && inProduct) gaps.push(disc ? "NOT_TRADING:" + notTrading.get(sym) : "NO_DISCOVER_CARD");
    cap.HAS_STOCK_PAGE = stockPages.has(sym);
    if (!cap.HAS_STOCK_PAGE && inProduct) gaps.push("NO_STOCK_PAGE");

    rows.push(Object.assign({
      securityId: id, ticker: sym, exchange: e.exchange || null, instrumentType: e.instrument_type || null,
      activeStatus: e.active_status || null, eligibility: e.product_eligibility, inProductUniverse: inProduct,
      name: disc && disc.n ? disc.n : null
    }, cap, { gaps }));
  }

  const inProduct = rows.filter((r) => r.inProductUniverse);
  const count = (list, f) => list.filter(f).length;
  const gapCounter = {};
  for (const r of inProduct) for (const g of r.gaps) gapCounter[g] = (gapCounter[g] || 0) + 1;
  const spot = SPOT_CHECK.map(([name, ticker]) => {
    const r = rows.find((x) => x.ticker === ticker);
    return { name, ticker, found: !!r, inProductUniverse: r ? r.inProductUniverse : false,
             capabilities: r ? Object.fromEntries(CAPABILITIES.map((c) => [c, !!r[c]])) : null,
             gaps: r ? r.gaps : ["NOT_IN_MASTER"] };
  });
  const summary = {
    version: MATRIX_VERSION, generatedAt: new Date().toISOString(),
    master: { file: SECURITY_MASTER_FILE, version: master.version, generatedAt: master.generatedAt,
              total: rows.length, productUniverse: inProduct.length },
    sources: { ingestStatus: status ? status.generatedAt : null, factors: factors ? factors.generatedAt : null,
               intradaySession: latestSession, discover: meta ? meta.generatedAt : null },
    counts: {
      companyMasterTotal: rows.length,
      productUniverse: inProduct.length,
      activeEquities: count(inProduct, (r) => r.activeStatus === "ACTIVE" && r.instrumentType === "EQUITY_COMMON"),
      tiingoResolved: count(inProduct, (r) => r.HAS_PROVIDER_MAPPING),
      tiingoUnresolved: count(inProduct, (r) => !r.HAS_PROVIDER_MAPPING),
      marketDataFetched: count(inProduct, (r) => r.HAS_MARKET_DATA || (perSecurity[r.securityId] && perSecurity[r.securityId].reason)),
      historicalAvailable: count(inProduct, (r) => r.HAS_HISTORICAL),
      historicalQualityAccepted: count(inProduct, (r) => r.HISTORICAL_QUALITY_ACCEPTED),
      intradayAvailable: count(inProduct, (r) => r.HAS_INTRADAY),
      liveCapable: count(inProduct, (r) => r.HAS_LIVE),
      factorEligible: count(inProduct, (r) => r.HAS_FACTORS),
      fundamentals: count(inProduct, (r) => r.HAS_FUNDAMENTALS),
      discoverEligible: count(inProduct, (r) => r.DISCOVER_ELIGIBLE),
      stockPages: count(inProduct, (r) => r.HAS_STOCK_PAGE),
      namesMissing: count(inProduct, (r) => !r.HAS_NAME),
      providerMappingsMissing: count(inProduct, (r) => !r.HAS_PROVIDER_MAPPING)
    },
    gapReasons: Object.fromEntries(Object.entries(gapCounter).sort((a, b) => b[1] - a[1])),
    spotCheck: spot,
    note: "Gemessen aus den ausgelieferten Artefakten; keine Spalte ist vermutet. HAS_LIVE heisst: Snapshot-Refresh " +
          "waehrend der Sitzung (Discover-Live-Umfang), kein Strom."
  };
  if (!opt.dryRun) {
    const outDir = join(root, "quant", "data", "market", "capabilities");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "matrix.json"), JSON.stringify({ version: MATRIX_VERSION, generatedAt: summary.generatedAt,
      capabilities: CAPABILITIES, rows }));
    writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  }
  return { rows, summary };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rootArg = process.argv.find((a) => a.startsWith("--root="));
  const { summary } = buildCapabilityMatrix({ root: rootArg ? rootArg.slice(7) : undefined, dryRun: process.argv.includes("--dry-run") });
  console.log("Vision Universe — Capability Matrix\n");
  for (const [k, v] of Object.entries(summary.counts)) console.log("  " + k.padEnd(28) + String(v).padStart(6));
  console.log("\n  Luecken (Produktuniversum):");
  for (const [k, v] of Object.entries(summary.gapReasons).slice(0, 14)) console.log("    " + k.padEnd(44) + String(v).padStart(6));
  console.log("\n  Stichprobe:");
  for (const s of summary.spotCheck) {
    const c = s.capabilities || {};
    console.log("    " + s.ticker.padEnd(6) + (s.found ? (s.inProductUniverse ? "im Produktuniversum " : "ausgeschlossen ") : "NICHT IM MASTER ") +
      CAPABILITIES.filter((k) => c[k]).map((k) => k.replace("HAS_", "")).join(",") + (s.gaps.length ? "  Luecken: " + s.gaps.join(", ") : ""));
  }
}
