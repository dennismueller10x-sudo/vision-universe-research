/* =========================================================================
   VISION UNIVERSE VORSORGE — ingest-tiingo-etfs.mjs

   Nimmt das VOLLE Tiingo-ETF-Universum auf - nicht nur den Auszug, der
   heute im Repository liegt.

   1. supported_tickers.zip laden (offene Datei des Anbieters), alle Zeilen
      mit assetType = ETF behalten. Keine kuenstliche Beschraenkung auf
      grosse Standard-ETFs.
   2. Je ETF: Stammdaten (/tiingo/daily/<t>: Name, Beschreibung, Startdatum)
      und Tageskerzen (close, adjClose, divCash, splitFactor).
   3. Gesamtrendite mit der kanonischen Engine (canonical-total-return.js)
      aus Rohkurs, Split und Ausschuettung. Nur wenn die Rekonstruktion
      gelingt, traegt die Reihe basis = TOTAL_RETURN; sonst PRICE_RETURN
      (split-bereinigt) - nie eine Mischung.

   Alles landet in der Arbeitsablage .market-cache/vorsorge/ (gitignored).
   Danach baut scripts/vorsorge/build-etf-data.mjs daraus den Stamm.

   Ausfuehren (CI, Secret TIINGO_API_KEY):
     node scripts/vorsorge/ingest-tiingo-etfs.mjs [--limit N] [--per-hour 4500]
       [--active-only] [--us-primary-only] [--years 15]
   Ohne Schluessel bricht das Skript mit klarer Meldung ab (Exit 2) -
   es erzeugt keine Ersatzdaten.
   ========================================================================= */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parseCsv, readSingleFileFromZip } from "../market/build-market-universe.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TR = require(join(root, "quant/engines/canonical-total-return.js"));
const Master = require(join(root, "vorsorge/engines/etf-master.js"));

const TICKERS_URL = "https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip";
const API = "https://api.tiingo.com/tiingo/daily/";
const WORK = join(root, ".market-cache/vorsorge");
const US_PRIMARY = new Set(["NYSE", "NYSE ARCA", "NASDAQ", "BATS", "AMEX", "NYSE MKT"]);

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LIMIT = Number(opt("--limit", "0")) || Infinity;
const PER_HOUR = Number(opt("--per-hour", "4500"));
const YEARS = Number(opt("--years", "15"));
const ACTIVE_ONLY = argv.includes("--active-only");
const US_ONLY = argv.includes("--us-primary-only");

const KEY = process.env.TIINGO_API_KEY || "";
if (!KEY) {
  console.error("TIINGO_API_KEY fehlt. Dieses Skript laeuft nur mit Anbieterzugang (GitHub Actions Secret). Es werden keine Ersatzdaten erzeugt.");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gapMs = Math.ceil(3600000 / Math.max(1, PER_HOUR));
let lastCall = 0;
async function get(url, asBuffer) {
  const wait = lastCall + gapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: "Token " + KEY } });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * 2 ** attempt); continue; }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url.replace(KEY, "***")}`);
    return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.json();
  }
  throw new Error("RETRIES_EXHAUSTED " + url.split("?")[0]);
}

async function main() {
  mkdirSync(join(WORK, "prices"), { recursive: true });
  const zip = await get(TICKERS_URL, true);
  const { rows } = parseCsv(readSingleFileFromZip(zip).text);
  const maxEnd = rows.reduce((a, r) => (r.endDate > a ? r.endDate : a), "");
  const staleBefore = new Date(Date.parse(maxEnd) - 30 * 864e5).toISOString().slice(0, 10);
  let etfRows = rows.filter((r) => r.assetType === "ETF").map((r) => ({
    symbol: String(r.ticker).toUpperCase(), name: null, exchange: r.exchange || null, currency: r.priceCurrency || null,
    country: US_PRIMARY.has(String(r.exchange).toUpperCase()) ? "US" : null, securityType: "ETF",
    firstTradeDate: r.startDate || null, lastTradeDate: r.endDate && r.endDate < staleBefore ? r.endDate : null,
    active: !(r.endDate && r.endDate < staleBefore)
  }));
  const totalEtfRows = etfRows.length;
  if (ACTIVE_ONLY) etfRows = etfRows.filter((r) => r.active);
  if (US_ONLY) etfRows = etfRows.filter((r) => US_PRIMARY.has(String(r.exchange).toUpperCase()));
  console.log(`Tiingo-Tickerliste: ${rows.length} Zeilen, davon ETF ${totalEtfRows}, im Lauf ${etfRows.length}`);

  const from = new Date(Date.now() - YEARS * 365.25 * 864e5).toISOString().slice(0, 10);
  const report = { total: etfRows.length, meta: 0, prices: 0, totalReturn: 0, priceReturnOnly: 0, failed: 0, failures: {} };
  let n = 0;
  for (const r of etfRows) {
    if (n++ >= LIMIT) break;
    if (!r.active) continue;
    try {
      const meta = await get(API + encodeURIComponent(r.symbol.toLowerCase()));
      if (meta) { r.name = meta.name || null; r.description = meta.description ? String(meta.description).slice(0, 600) : null; r.inceptionDateProvider = meta.startDate || null; report.meta++; }
      const bars = await get(API + encodeURIComponent(r.symbol.toLowerCase()) + "/prices?startDate=" + from + "&columns=date,close,adjClose,divCash,splitFactor");
      if (!Array.isArray(bars) || bars.length < 2) continue;
      const norm = bars.map((b) => ({ date: String(b.date).slice(0, 10), close: b.close, adjustedClose: b.adjClose, dividend: b.divCash, splitFactor: b.splitFactor }));
      const evidence = Master.etfEvidence({ name: r.name, securityType: "ETF" });
      const rec = TR.reconstruct(norm, { identity: { state: meta && !evidence.conflict ? "CONFIRMED" : "UNVERIFIED" } });
      let points, basis;
      if (rec.state === "TOTAL_RETURN_RECONSTRUCTED") {
        points = norm.map((b, i) => [b.date, Math.round(rec.tr[i] * 1e4) / 1e4]); basis = "TOTAL_RETURN"; report.totalReturn++;
      } else {
        // split-bereinigter Kurs: Faktor rueckwaerts kumulieren, keine Ausschuettungen
        let f = 1; const adj = new Array(norm.length);
        for (let i = norm.length - 1; i >= 0; i--) { adj[i] = norm[i].close / f; if (norm[i].splitFactor && norm[i].splitFactor !== 1) f *= norm[i].splitFactor; }
        points = norm.map((b, i) => [b.date, Math.round(adj[i] * 1e4) / 1e4]); basis = "PRICE_RETURN"; report.priceReturnOnly++;
        report.failures[rec.reason] = (report.failures[rec.reason] || 0) + 1;
      }
      writeFileSync(join(WORK, "prices", r.symbol + ".json"), JSON.stringify({ symbol: r.symbol, asOf: points[points.length - 1][0], basis,
        priceSeriesType: basis === "TOTAL_RETURN" ? "TOTAL_RETURN_RECONSTRUCTED" : "SPLIT_ADJUSTED", reconstruction: rec.state, points }));
      report.prices++;
    } catch (e) {
      report.failed++; report.failures[String(e.message).slice(0, 40)] = (report.failures[String(e.message).slice(0, 40)] || 0) + 1;
    }
    if (n % 250 === 0) console.log(`  ${n}/${Math.min(LIMIT, etfRows.length)} …`);
  }
  writeFileSync(join(WORK, "etf-universe.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), source: TICKERS_URL, totalEtfRows, rows: etfRows }));
  writeFileSync(join(WORK, "ingest-report.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}

main().catch((e) => { console.error(String(e.message || e).replace(KEY, "***")); process.exit(1); });
