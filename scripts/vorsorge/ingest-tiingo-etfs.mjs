/* =========================================================================
   VISION UNIVERSE VORSORGE — ingest-tiingo-etfs.mjs   (vorsorge-ingest-2.0.0)

   Nimmt das VOLLE Tiingo-ETF-Universum auf. Laeuft nur in GitHub Actions
   mit dem Secret TIINGO_API_KEY (der Schluessel steht nur im
   Authorization-Kopf, nie in einer URL, einem Log oder einer Datei).

   PHASE A  Katalog: supported_tickers.zip (eine Datei, keine Einzelabfragen)
            -> alle Zeilen mit assetType = ETF, Rohbilanz (aktiv/inaktiv,
               Boersen, Waehrungen, Duplikate, fehlerhafte Zeilen).
   PHASE B  Je aktivem ETF-Ticker GENAU zwei Anfragen:
              /tiingo/daily/<t>          Name, Beschreibung, Start/Ende
              /tiingo/daily/<t>/prices   Tageskerzen ab 1990 (close,
                                         adjClose, divCash, splitFactor)
            -> Kursrendite (split-bereinigt) UND, wenn die kanonische
               Rekonstruktion gelingt, Gesamtrendite - getrennt.
            -> Schutz gegen recycelte Ticker: eine Luecke von mehr als
               120 Kalendertagen trennt Vorgaenger und Nachfolger; nur
               das juengste Segment zaehlt.

   FORTSETZBAR  .market-cache/vorsorge/checkpoint.json (verarbeitet,
                gescheitert, letzter Ticker). Der Workflow sichert die
                Arbeitsablage mit actions/cache; ein Folgelauf macht dort
                weiter. Zeitbudget (--max-minutes) beendet sauber.

   AUSGABE (committet, deterministisch weiterverarbeitet von
   build-etf-data.mjs)
     vorsorge/data/ingest/universe.json         aktive, abgefragte ETFs
     vorsorge/data/ingest/catalog-stats.json    Rohbilanz der Tickerliste
     vorsorge/data/ingest/ingest-report.json    Lauf: Anfragen, Dauer, Ergebnis
     vorsorge/data/ingest/failed-etf-ingest.json
     vorsorge/data/series/<SYM>.json            kompakte Reihen (series-codec)
   ARBEITSABLAGE (nicht committet; Workflow-Artefakt)
     .market-cache/vorsorge/raw-etf-rows.json   alle ETF-Zeilen inkl. Archiv
   ========================================================================= */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TR = require(join(root, "quant/engines/canonical-total-return.js"));
const Codec = require(join(root, "vorsorge/engines/series-codec.js"));
const A = require(join(root, "vorsorge/engines/etf-analytics.js"));
const Master = require(join(root, "vorsorge/engines/etf-master.js"));

export const VERSION = "vorsorge-ingest-2.0.0";
const TICKERS_URL = "https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip";
const API = "https://api.tiingo.com/tiingo/daily/";
export const RECYCLE_GAP_DAYS = 120;
export const STALE_DAYS = 30;

/* ------------------------------------------------------------ Reine Teile */

/** Katalogzeilen -> ETF-Zeilen + Rohbilanz. */
export function catalog(rows) {
  const valid = (r) => r && r.ticker && /^[A-Za-z0-9.\-^=]+$/.test(r.ticker);
  const maxEnd = rows.reduce((a, r) => (r.endDate && r.endDate > a ? r.endDate : a), "");
  const staleBefore = maxEnd ? new Date(Date.parse(maxEnd) - STALE_DAYS * 864e5).toISOString().slice(0, 10) : "";
  const etf = rows.filter((r) => String(r.assetType || "").toUpperCase() === "ETF");
  const malformed = etf.filter((r) => !valid(r) || !r.exchange || (r.startDate && r.endDate && r.endDate < r.startDate));
  const clean = etf.filter((r) => !malformed.includes(r)).map((r) => ({
    symbol: String(r.ticker).toUpperCase(), exchange: String(r.exchange || "").toUpperCase() || null,
    currency: r.priceCurrency ? String(r.priceCurrency).toUpperCase() : null,
    providerStartDate: r.startDate || null, providerEndDate: r.endDate || null,
    active: !!(r.endDate && r.endDate >= staleBefore) || (!r.endDate && !!r.startDate)
  }));
  const tally = (list, f) => list.reduce((a, r) => { const k = r[f] ?? "UNKNOWN"; a[k] = (a[k] || 0) + 1; return a; }, {});
  const byTicker = {};
  clean.forEach((r) => { (byTicker[r.symbol] = byTicker[r.symbol] || []).push(r); });
  const dup = Object.keys(byTicker).filter((t) => byTicker[t].length > 1);
  const noDates = clean.filter((r) => !r.providerStartDate && !r.providerEndDate).length;
  return {
    rows: clean,
    stats: {
      catalogRows: rows.length, etfRows: etf.length, malformedRows: malformed.length,
      activeRows: clean.filter((r) => r.active).length, inactiveRows: clean.filter((r) => !r.active).length,
      rowsWithoutPriceDates: noDates, uniqueTickers: Object.keys(byTicker).length,
      tickersWithMultipleRows: dup.length,
      activeUniqueTickers: new Set(clean.filter((r) => r.active).map((r) => r.symbol)).size,
      byExchange: tally(clean, "exchange"), byCurrency: tally(clean, "currency"),
      activeByExchange: tally(clean.filter((r) => r.active), "exchange"),
      otherAssetTypes: tally(rows.filter((r) => String(r.assetType || "").toUpperCase() !== "ETF"), "assetType"),
      staleBefore, maxEndDate: maxEnd || null
    }
  };
}

/** Juengstes zusammenhaengendes Segment; Luecke > RECYCLE_GAP_DAYS = anderer Titel. */
export function latestSegment(bars) {
  let start = 0;
  for (let i = 1; i < bars.length; i++) {
    const gap = (Date.parse(bars[i].date) - Date.parse(bars[i - 1].date)) / 864e5;
    if (gap > RECYCLE_GAP_DAYS) start = i;
  }
  return { bars: bars.slice(start), droppedBefore: start ? bars[start].date : null, droppedBars: start };
}

/** Split-bereinigte Kursreihe (ohne Ausschuettungen) aus Rohkurs + Splitfaktor. */
export function priceReturnSeries(bars) {
  let f = 1; const out = new Array(bars.length);
  for (let i = bars.length - 1; i >= 0; i--) {
    out[i] = [bars[i].date, bars[i].close / f];
    const s = Number(bars[i].splitFactor);
    if (s && s !== 1 && s > 0) f *= s;
  }
  return out;
}

/** Tiingo-Kerzen -> Reihendatensatz (kompakt). */
export function seriesRecord(symbol, rawBars, meta) {
  const bars = (rawBars || []).map((b) => ({ date: String(b.date).slice(0, 10), close: Number(b.close), adjustedClose: b.adjClose === undefined ? undefined : Number(b.adjClose),
    dividend: b.divCash === undefined || b.divCash === null ? 0 : Number(b.divCash), splitFactor: b.splitFactor === undefined || b.splitFactor === null ? 1 : Number(b.splitFactor) }))
    .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.close > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (bars.length < 2) return { ok: false, reason: "NO_PRICES" };
  const seg = latestSegment(bars);
  const use = seg.bars;
  if (use.length < 2) return { ok: false, reason: "NO_PRICES_AFTER_GAP" };
  const price = priceReturnSeries(use);
  const evidence = Master.etfEvidence({ name: meta && meta.name, securityType: "ETF" });
  const rec = TR.reconstruct(use, { identity: { state: meta && meta.name && !evidence.conflict ? "CONFIRMED" : "UNVERIFIED" } });
  const total = rec.state === "TOTAL_RETURN_RECONSTRUCTED" ? use.map((b, i) => [b.date, rec.tr[i]]) : null;
  const dividends = use.filter((b) => b.dividend > 0).length;
  return {
    ok: true,
    record: {
      schemaVersion: "vu-vorsorge-series-1.0.0", symbol, origin: "tiingo:etf-ingest",
      priceHistoryFrom: use[0].date, asOf: use[use.length - 1].date, observations: use.length,
      recycledTickerSuspected: !!seg.droppedBefore, droppedBefore: seg.droppedBefore, droppedBars: seg.droppedBars,
      dividendEvents: dividends,
      totalReturn: { state: rec.state, reason: rec.reason || null, contract: rec.contract },
      price: { basis: "PRICE_RETURN", type: "SPLIT_ADJUSTED", daily: Codec.encode(price.slice(-260)), weekly: Codec.encode(A.toWeekly(price)) },
      total: total ? { basis: "TOTAL_RETURN", type: "TOTAL_RETURN_RECONSTRUCTED", daily: Codec.encode(total.slice(-260)), weekly: Codec.encode(A.toWeekly(total)) } : null
    }
  };
}

export function retryable(status) { return status === 429 || status === 408 || (status >= 500 && status < 600) || status === 0; }

/* ----------------------------------------------------------------- Lauf */
async function main() {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
  const LIMIT = Number(opt("--limit", "0")) || Infinity;
  const PER_HOUR = Number(opt("--per-hour", "4500"));
  const MAX_MIN = Number(opt("--max-minutes", "320"));
  const KEY = process.env.TIINGO_API_KEY || "";
  if (!KEY) { console.error("TIINGO_API_KEY fehlt. Kein Lauf, keine Ersatzdaten."); process.exit(2); }
  const scrub = (s) => String(s).split(KEY).join("***");
  const WORK = join(root, ".market-cache/vorsorge");
  const OUT = join(root, "vorsorge/data");
  mkdirSync(join(WORK, "series"), { recursive: true }); mkdirSync(join(OUT, "ingest"), { recursive: true }); mkdirSync(join(OUT, "series"), { recursive: true });
  const t0 = Date.now();
  const deadline = t0 + MAX_MIN * 60000;
  const gap = Math.ceil(3600000 / Math.max(1, PER_HOUR));
  let last = 0, requests = 0, rateLimited = 0, consecutive429 = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function get(url, asBuffer) {
    let attempt = 0, lastStatus = 0, lastErr = "";
    while (attempt < 6) {
      attempt++;
      const wait = last + gap - Date.now(); if (wait > 0) await sleep(wait);
      last = Date.now(); requests++;
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
      try {
        const res = await fetch(url, { headers: { Authorization: "Token " + KEY }, signal: ctl.signal });
        clearTimeout(to);
        lastStatus = res.status;
        if (res.status === 404) return { ok: false, status: 404, attempts: attempt };
        if (res.status === 429) {
          rateLimited++; consecutive429++;
          const ra = Number(res.headers.get("retry-after")) || 0;
          if (consecutive429 >= 12) return { ok: false, status: 429, attempts: attempt, quota: true };
          await sleep(Math.max(ra * 1000, 5000 * 2 ** attempt)); continue;
        }
        consecutive429 = 0;
        if (!res.ok) { if (retryable(res.status)) { await sleep(2000 * 2 ** attempt); continue; } return { ok: false, status: res.status, attempts: attempt }; }
        return { ok: true, status: res.status, attempts: attempt, body: asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.json() };
      } catch (e) {
        clearTimeout(to); lastErr = e.name === "AbortError" ? "TIMEOUT" : "CONNECTION";
        await sleep(2000 * 2 ** attempt);
      }
    }
    return { ok: false, status: lastStatus, attempts: attempt, error: lastErr };
  }

  // Phase A
  const { parseCsv, readSingleFileFromZip } = await import("../market/build-market-universe.mjs");
  const zip = await get(TICKERS_URL, true);
  if (!zip.ok) { console.error("Tickerliste nicht abrufbar: HTTP " + zip.status); process.exit(1); }
  const cat = catalog(parseCsv(readSingleFileFromZip(zip.body).text).rows);
  writeFileSync(join(WORK, "raw-etf-rows.json"), JSON.stringify({ source: TICKERS_URL, rows: cat.rows }));
  writeFileSync(join(OUT, "ingest/catalog-stats.json"), JSON.stringify({ schemaVersion: "vu-vorsorge-catalog-stats-1.0.0", source: TICKERS_URL, ...cat.stats }, null, 1));
  console.log("Katalog: " + JSON.stringify({ etfRows: cat.stats.etfRows, active: cat.stats.activeRows, activeTickers: cat.stats.activeUniqueTickers }));

  // Phase B
  const cpPath = join(WORK, "checkpoint.json");
  const cp = existsSync(cpPath) ? JSON.parse(readFileSync(cpPath, "utf8")) : { processed: {}, failed: {}, meta: {} };
  const tickers = [...new Set(cat.rows.filter((r) => r.active).map((r) => r.symbol))].sort();
  let done = 0, newly = 0, stopped = null;
  const save = () => { cp.lastSymbol = cp.lastSymbol || null; cp.updatedAt = new Date().toISOString(); writeFileSync(cpPath, JSON.stringify(cp)); };
  for (const sym of tickers) {
    if (newly >= LIMIT) { stopped = "LIMIT"; break; }
    if (Date.now() > deadline) { stopped = "TIME_BUDGET"; break; }
    if (cp.processed[sym] === "OK" || cp.processed[sym] === "NO_PRICES" || cp.processed[sym] === "NOT_FOUND") { done++; continue; }
    newly++;
    const path = encodeURIComponent(sym.toLowerCase());
    const meta = await get(API + path);
    if (meta.quota) { stopped = "QUOTA"; break; }
    if (!meta.ok) {
      if (meta.status === 404) { cp.processed[sym] = "NOT_FOUND"; cp.failed[sym] = { symbol: sym, endpoint: "meta", status: 404, reason: "NOT_FOUND", retryable: false, attempts: meta.attempts }; }
      else cp.failed[sym] = { symbol: sym, endpoint: "meta", status: meta.status, reason: meta.error || "HTTP_" + meta.status, retryable: true, attempts: meta.attempts };
      continue;
    }
    const m = meta.body || {};
    cp.meta[sym] = { name: m.name || null, description: m.description ? String(m.description).slice(0, 400) : null, exchangeCode: m.exchangeCode || null, startDate: m.startDate || null, endDate: m.endDate || null };
    const px = await get(API + path + "/prices?startDate=1990-01-01");
    if (px.quota) { stopped = "QUOTA"; break; }
    if (!px.ok) { cp.failed[sym] = { symbol: sym, endpoint: "prices", status: px.status, reason: px.error || "HTTP_" + px.status, retryable: retryable(px.status), attempts: px.attempts }; continue; }
    const sr = seriesRecord(sym, px.body, cp.meta[sym]);
    if (!sr.ok) { cp.processed[sym] = "NO_PRICES"; cp.failed[sym] = { symbol: sym, endpoint: "prices", status: 200, reason: sr.reason, retryable: false, attempts: px.attempts }; continue; }
    // Erst in die (gecachte) Arbeitsablage, am Ende ins Repository - ein abgewiesener Push verliert nichts
    writeFileSync(join(WORK, "series", sym + ".json"), JSON.stringify(sr.record));
    cp.meta[sym].series = { from: sr.record.priceHistoryFrom, asOf: sr.record.asOf, observations: sr.record.observations, totalReturn: sr.record.totalReturn.state,
      recycledTickerSuspected: sr.record.recycledTickerSuspected, dividendEvents: sr.record.dividendEvents };
    cp.processed[sym] = "OK"; delete cp.failed[sym]; cp.lastSymbol = sym; done++;
    if (newly % 25 === 0) { save(); console.log(`  ${done}/${tickers.length} · Anfragen ${requests} · 429 ${rateLimited} · ${Math.round((Date.now() - t0) / 60000)} min`); }
  }
  save();

  // Ausgaben: alle bisher verarbeiteten Reihen (auch aus frueheren Laeufen) ins Repository
  const { readdirSync, copyFileSync } = await import("node:fs");
  for (const f of readdirSync(join(WORK, "series"))) if (cp.processed[f.replace(/\.json$/, "")] === "OK") copyFileSync(join(WORK, "series", f), join(OUT, "series", f));
  const rowsBySym = {};
  cat.rows.filter((r) => r.active).forEach((r) => { (rowsBySym[r.symbol] = rowsBySym[r.symbol] || []).push(r); });
  const universe = tickers.filter((s) => cp.processed[s] === "OK").map((s) => {
    const m = cp.meta[s] || {}, rows = rowsBySym[s] || [];
    const r = rows.find((x) => (m.exchangeCode && x.exchange === String(m.exchangeCode).toUpperCase())) || rows[0] || {};
    return { symbol: s, name: m.name, description: m.description, exchange: r.exchange || (m.exchangeCode ? String(m.exchangeCode).toUpperCase() : null),
      currency: r.currency || null, providerStartDate: r.providerStartDate || m.startDate || null, providerEndDate: r.providerEndDate || m.endDate || null,
      catalogRows: rows.length, series: m.series || null };
  });
  writeFileSync(join(OUT, "ingest/universe.json"), JSON.stringify({ schemaVersion: "vu-vorsorge-ingest-universe-1.0.0", ingest: VERSION, source: "tiingo",
    asOf: universe.reduce((a, u) => (u.series && u.series.asOf > a ? u.series.asOf : a), ""), rows: universe }));
  const failed = Object.values(cp.failed).sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
  writeFileSync(join(OUT, "ingest/failed-etf-ingest.json"), JSON.stringify({ schemaVersion: "vu-vorsorge-failed-ingest-1.0.0", count: failed.length, failed }, null, 1));
  const report = { schemaVersion: "vu-vorsorge-ingest-report-1.0.0", ingest: VERSION, activeTickers: tickers.length,
    processedOk: tickers.filter((s) => cp.processed[s] === "OK").length, notFound: tickers.filter((s) => cp.processed[s] === "NOT_FOUND").length,
    noPrices: tickers.filter((s) => cp.processed[s] === "NO_PRICES").length, failed: failed.length,
    pending: tickers.filter((s) => !cp.processed[s]).length, complete: tickers.every((s) => cp.processed[s]) && !stopped,
    stoppedBecause: stopped, thisRun: { requests, rateLimited, minutes: Math.round((Date.now() - t0) / 60000), newlyAttempted: newly } };
  writeFileSync(join(OUT, "ingest/ingest-report.json"), JSON.stringify(report, null, 1));
  console.log(scrub(JSON.stringify(report, null, 1)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(String(e && e.message || e).split(process.env.TIINGO_API_KEY || "\u0000").join("***")); process.exit(1); });
}
