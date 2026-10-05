#!/usr/bin/env node
/* Tages-OHLC fuer die Elliott-Datenstudie (Mission VI §18–§20) — runner-privat, nie im Repository.

   node scripts/technical/elliott-forensics/fetch-ohlc.mjs --out DIR [--symbols A,B,...]

   Bestehender, lizenzierter Anbieter (Tiingo, Schluessel TIINGO_API_KEY nur im Authorization-Header). Eine Anfrage je Titel
   (EOD ab 2010) bzw. je Kryptopaar. Rohkurs + splitFactor/divCash (Split-Bereinigung macht die Studie selbst, fuer O/H/L/C
   gemeinsam). Kein neuer Anbieter, keine Weitergabe der Kurse (Ausgabe nur in --out, gedacht fuer $RUNNER_TEMP). */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openedCases } from "./lib.mjs";
import { PRODUCTION_NAMES } from "./ohlc-experiment.mjs";

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg("out", null), KEY = process.env.TIINGO_API_KEY, BASE = process.env.TIINGO_BASE_URL || "https://api.tiingo.com";
const CRYPTO = { BTCUSD: "btcusd" };
export function symbolList() {
  const s = new Set(openedCases().rows.map((r) => r.instrument.vuSymbol).filter(Boolean));
  for (const k of Object.keys(PRODUCTION_NAMES)) s.add(k);
  return [...s].sort();
}
export function mapEod(rows) { return rows.map((r) => ({ date: String(r.date).slice(0, 10), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, splitFactor: r.splitFactor ?? 1, dividend: r.divCash ?? 0 })); }
export function mapCrypto(json) { const d = Array.isArray(json) && json[0] ? json[0].priceData || [] : []; return d.map((r) => ({ date: String(r.date).slice(0, 10), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? null })); }
async function get(path) {
  for (let a = 0; a < 3; a++) {
    const r = await fetch(BASE + path, { headers: { Authorization: "Token " + KEY, "Content-Type": "application/json" } });
    if (r.ok) return r.json();
    if (r.status === 404) return null;
    await new Promise((res) => setTimeout(res, 2000 * (a + 1)));
  }
  return null;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!OUT) { console.error("--out fehlt"); process.exit(2); }
  if (!KEY) { console.error("Kein TIINGO_API_KEY – nichts abgerufen."); process.exit(3); }
  mkdirSync(OUT, { recursive: true });
  const syms = arg("symbols", null) ? arg("symbols").split(",") : symbolList(), report = {};
  let requests = 0;
  for (const s of syms) {
    requests++;
    if (CRYPTO[s]) { const j = await get(`/tiingo/crypto/prices?tickers=${CRYPTO[s]}&startDate=2011-01-01&resampleFreq=1day`); const bars = mapCrypto(j); writeFileSync(join(OUT, s + ".json"), JSON.stringify({ kind: "crypto", bars })); report[s] = bars.length; }
    else { const j = await get(`/tiingo/daily/${encodeURIComponent(s.replace(".", "-"))}/prices?startDate=2010-01-01&format=json`); const bars = Array.isArray(j) ? mapEod(j) : []; writeFileSync(join(OUT, s + ".json"), JSON.stringify({ kind: "equity", bars })); report[s] = bars.length; }
  }
  console.log(JSON.stringify({ requests, barsPerSymbol: report }));   // nur Anzahlen, keine Kurse
}
