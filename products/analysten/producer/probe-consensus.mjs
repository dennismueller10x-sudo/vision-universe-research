#!/usr/bin/env node
/* Analysten-Konsens: Abdeckungsmessung kostenloser Quellen (Strang A, 06.11.2026).
   Fragt fuer eine feste Stichprobe des Produktuniversums (Seed, plus NVDA/AAPL/MSFT) je Quelle und Endpunkt ab,
   was der hinterlegte kostenlose Zugang liefert, und schreibt NUR einen Bericht (--out). Keine Produktdaten.

   Quellen und Endpunkte
     finnhub:recommendation   /api/v1/stock/recommendation     Einstufungs-Trend (strongBuy..strongSell je Monat)
     finnhub:price-target     /api/v1/stock/price-target       Kursziel (im Free-Plan meist gesperrt)
     fmp:price-target-consensus  /stable/price-target-consensus   Konsens-Kursziel (hoch/tief/Median)
     fmp:grades-consensus        /stable/grades-consensus         Einstufungs-Zaehlung
   Schluessel: FINNHUB_API_KEY (Kopf X-Finnhub-Token), FMP_API_KEY (Abfrageparameter, wird nie ausgegeben).

   Aufruf: node products/analysten/producer/probe-consensus.mjs --size 60 --seed 20261106 --out bericht.json
           [--sources finnhub,fmp] [--per-minute 50] */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProductUniverse } from "../../../scripts/market/universe-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ANCHORS = ["NVDA", "AAPL", "MSFT"];

/** Deterministische Stichprobe (mulberry32), Anker immer dabei. */
export function sample(tickers, size, seed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pool = [...new Set(tickers)].filter((t) => !ANCHORS.includes(t)).sort();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return ANCHORS.filter((t) => tickers.includes(t)).concat(pool.slice(0, Math.max(0, size)));
}

/** Auswertung einer Antwort je Endpunkt: gibt es Einstufungen / ein Kursziel, wie viele Analysten. */
export function readout(endpoint, body) {
  if (endpoint === "finnhub:recommendation") {
    const rows = Array.isArray(body) ? body.slice().sort((x, y) => (x.period < y.period ? 1 : -1)) : [];
    const r = rows[0];
    const n = r ? (r.strongBuy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strongSell || 0) : 0;
    return { ratings: n > 0, analysts: n || null, asOf: r ? r.period : null };
  }
  if (endpoint === "finnhub:price-target") {
    const ok = body && Number.isFinite(body.targetMean);
    return { target: !!ok, analysts: ok && Number.isFinite(body.numberAnalysts) ? body.numberAnalysts : null, asOf: ok ? body.lastUpdated || null : null };
  }
  if (endpoint === "fmp:price-target-consensus") {
    const x = Array.isArray(body) ? body[0] : body;
    return { target: !!(x && Number.isFinite(x.targetConsensus)), analysts: null, asOf: null };
  }
  if (endpoint === "fmp:grades-consensus") {
    const x = Array.isArray(body) ? body[0] : body;
    const n = x ? ["strongBuy", "buy", "hold", "sell", "strongSell"].reduce((s, k) => s + (Number(x[k]) || 0), 0) : 0;
    return { ratings: n > 0, analysts: n || null, asOf: null };
  }
  throw new Error("unbekannter Endpunkt " + endpoint);
}

export function summarize(results) {
  const by = {};
  for (const r of results) {
    const s = (by[r.endpoint] ||= { asked: 0, http: {}, ratings: 0, target: 0, analysts: [] });
    s.asked++; s.http[r.status] = (s.http[r.status] || 0) + 1;
    if (r.readout?.ratings) s.ratings++;
    if (r.readout?.target) s.target++;
    if (Number.isFinite(r.readout?.analysts)) s.analysts.push(r.readout.analysts);
  }
  for (const s of Object.values(by)) {
    const a = s.analysts.sort((x, y) => x - y);
    s.medianAnalysts = a.length ? a[Math.floor((a.length - 1) / 2)] : null;
    s.shareRatings = s.asked ? Math.round((s.ratings / s.asked) * 1000) / 1000 : 0;
    s.shareTarget = s.asked ? Math.round((s.target / s.asked) * 1000) / 1000 : 0;
    delete s.analysts;
  }
  return by;
}

async function main(argv) {
  const o = {}; for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!o.out) throw new Error("--out fehlt");
  const size = Number(o.size || 60), seed = Number(o.seed || 20261106), perMinute = Number(o["per-minute"] || 50);
  const sources = String(o.sources || "finnhub,fmp").split(",");
  const FINNHUB = process.env.FINNHUB_API_KEY || "", FMP = process.env.FMP_API_KEY || "";
  const universe = resolveProductUniverse(ROOT);
  const tickers = sample(universe.securities.map((s) => s.ticker), size, seed);
  const scrub = (s) => [FINNHUB, FMP].filter(Boolean).reduce((t, k) => t.split(k).join("***"), String(s));
  const gap = Math.ceil(60000 / perMinute);
  let last = 0;
  async function get(endpoint, url, headers) {
    const wait = last + gap - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      let body = null; try { body = await res.json(); } catch { body = null; }
      return { status: res.status, body: res.ok ? body : null };
    } catch (e) { return { status: "NETWORK", body: null, error: scrub(e.name) }; }
  }
  const plan = [];
  if (sources.includes("finnhub") && FINNHUB) for (const ep of ["recommendation", "price-target"]) plan.push(["finnhub:" + ep, (t) => [`https://finnhub.io/api/v1/stock/${ep}?symbol=${encodeURIComponent(t)}`, { "X-Finnhub-Token": FINNHUB }]]);
  if (sources.includes("fmp") && FMP) for (const ep of ["price-target-consensus", "grades-consensus"]) plan.push(["fmp:" + ep, (t) => [`https://financialmodelingprep.com/stable/${ep}?symbol=${encodeURIComponent(t)}&apikey=${encodeURIComponent(FMP)}`, {}]]);
  const results = [];
  for (const t of tickers) for (const [endpoint, mk] of plan) {
    const [url, headers] = mk(t);
    const r = await get(endpoint, url, headers);
    results.push({ ticker: t, endpoint, status: r.status, readout: r.body ? readout(endpoint, r.body) : null });
  }
  const report = { schema: "vu-analyst-probe-1", at: new Date().toISOString(), seed, sampleSize: tickers.length, universe: universe.securities.length,
    keys: { finnhub: !!FINNHUB, fmp: !!FMP }, summary: summarize(results),
    anchors: results.filter((r) => ANCHORS.includes(r.ticker)), results };
  writeFileSync(o.out, scrub(JSON.stringify(report, null, 1)));
  console.log(scrub(JSON.stringify({ sampleSize: report.sampleSize, keys: report.keys, summary: report.summary }, null, 1)));
  for (const r of report.anchors) console.log(`  ${r.ticker} ${r.endpoint}: HTTP ${r.status} ${JSON.stringify(r.readout)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => { console.error("ABBRUCH: " + e.message); process.exitCode = 1; });
}
