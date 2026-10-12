/* =========================================================================
   Emerging Leaders – gemeinsame Eingaben fuer Studie und Tageslauf.

   Eine Definition, zwei Leser: scripts/quant/build-emerging-leaders-study.mjs
   (historisch) und scripts/discover/build-emerging-leaders.mjs (heute)
   bereiten Kerzen, Fundamentaldaten und die Leadership-Nachbildung genau
   gleich auf. Nur zur Laufzeit; nichts hiervon landet im Artefakt.
   ========================================================================= */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const RS = require(join(ROOT, "quant/engines/return-series.js"));
const PIT = require(join(ROOT, "quant/engines/pit-fundamental-history.js"));
const Identity = require(join(ROOT, "core/identity.js"));
const Scoring = require(join(ROOT, "discover/engines/scoring.js"));
const DISCOVER = JSON.parse(readFileSync(join(ROOT, "discover/methodology/discover-v1.json"), "utf8"));

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Kerzen sortiert, je Tag eine (die spaetere gewinnt), nur Schluss > 0. */
export function uniqueBars(bars) {
  const s = (bars || []).filter((b) => b && typeof b.date === "string" && b.close > 0)
    .map((b) => ({ ...b, date: b.date.slice(0, 10) })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out = [];
  for (const b of s) { if (out.length && out[out.length - 1].date === b.date) out[out.length - 1] = b; else out.push(b); }
  return out;
}

/** SPY als Kalender: Daten und split-bereinigter Schluss. */
export function benchmarkFromBars(bars) {
  const b = uniqueBars(bars), f = RS.splitFactors(b);
  return { dates: b.map((x) => x.date), close: Float64Array.from(b.map((x, i) => x.close / f[i])) };
}

/**
 * Engine-Eingabe einer Reihe (ADR-002: Splitfaktoren nur aus return-series.js).
 * Kurse geteilt, Volumen multipliziert; Roh-Schluss und Roh-Volumen fuer die
 * Zulaessigkeit am Tag t. bench: SPY-Schluss am selben Datum oder NaN.
 */
export function engineSeries(bars, benchIndex, benchClose) {
  const f = RS.splitFactors(bars);
  const num = (v) => (isNum(v) ? v : NaN);
  const dates = bars.map((b) => b.date);
  return {
    dates,
    close: Float64Array.from(bars, (b, i) => b.close / f[i]),
    high: Float64Array.from(bars, (b, i) => (num(b.high) > 0 ? b.high / f[i] : b.close / f[i])),
    low: Float64Array.from(bars, (b, i) => (num(b.low) > 0 ? b.low / f[i] : b.close / f[i])),
    volume: Float64Array.from(bars, (b, i) => num(b.volume) * f[i]),
    rawClose: Float64Array.from(bars, (b) => b.close),
    rawVolume: Float64Array.from(bars, (b) => num(b.volume)),
    bench: Float64Array.from(dates, (d) => { const k = benchIndex.get(d); return k === undefined ? NaN : benchClose[k]; })
  };
}

/** Heute gelistete Stammaktien (Security Master), als securityId. */
export function commonEquityIds() {
  const sm = JSON.parse(readFileSync(join(ROOT, "quant/data/market/security-master/us-security-master.json"), "utf8"));
  const ids = new Set();
  for (const r of sm.rows) if (r.instrument_type === "EQUITY_COMMON") ids.add(r.baseline_security_id || Identity.securityIdForTicker(r.ticker));
  return ids;
}

/** Im Security Master als INACTIVE gefuehrte Stammaktien (securityId). */
export function inactiveEquityIds() {
  const sm = JSON.parse(readFileSync(join(ROOT, "quant/data/market/security-master/us-security-master.json"), "utf8"));
  const ids = new Set();
  for (const r of sm.rows) if (r.instrument_type === "EQUITY_COMMON" && r.active_status === "INACTIVE") ids.add(r.baseline_security_id || Identity.securityIdForTicker(r.ticker));
  return ids;
}

const FUND_METRICS = ["revenue", "net_income", "free_cash_flow"];
/** SEC-Consumer-Buendel je heutigem Kuerzel (nur die drei benutzten Kennzahlen). */
export function loadFundamentals(tickers) {
  const dir = join(ROOT, "quant/data/sec/consumer");
  const byTicker = new Map();
  if (!existsSync(dir)) return byTicker;
  for (const file of readdirSync(dir)) {
    if (!file.startsWith("CIK") || !file.endsWith(".json")) continue;
    let p; try { p = JSON.parse(readFileSync(join(dir, file), "utf8")); } catch { continue; }
    const names = (p.tickers || []).filter((t) => tickers.has(t));
    if (!names.length) continue;
    const annual = {};
    for (const m of FUND_METRICS) if (Array.isArray(p.annual?.[m])) annual[m] = p.annual[m];
    for (const t of names) byTicker.set(t, { annual });
  }
  return byTicker;
}

/** Gruppe E am Stichtag: nur, was eingereicht war (PIT.visibleAnnual: filed <= asOf). */
export function fundamentalsAt(bundle, asOf) {
  const out = { revenueAccel: NaN, revenueGrowthYoy: NaN, netMarginChange: NaN, fcfMargin: NaN };
  if (!bundle) return out;
  const byFy = (metric) => { const m = new Map(); for (const r of PIT.visibleAnnual(bundle, metric, asOf)) m.set(Number(r[0]), r[3]); return m; };
  const rev = byFy("revenue");
  if (!rev.size) return out;
  const fy = Math.max(...rev.keys());
  const g = (y) => (rev.get(y - 1) > 0 && isNum(rev.get(y)) ? rev.get(y) / rev.get(y - 1) - 1 : NaN);
  out.revenueGrowthYoy = g(fy);
  out.revenueAccel = g(fy) - g(fy - 1);
  const ni = byFy("net_income"), fcf = byFy("free_cash_flow");
  const margin = (y) => (rev.get(y) > 0 && isNum(ni.get(y)) ? ni.get(y) / rev.get(y) : NaN);
  out.netMarginChange = margin(fy) - margin(fy - 1);
  out.fcfMargin = rev.get(fy) > 0 && isNum(fcf.get(fy)) ? fcf.get(fy) / rev.get(fy) : NaN;
  return out;
}

/** Discover-Leadership-Score (leadership-1.0.0) aus Engine-Merkmalen nachgebildet. */
export function leadershipScore(ft) {
  return Scoring.composite(DISCOVER.leadershipScore, { distanceTo52wHigh: ft.distanceTo52wHigh, return3M: ft.ret63, return6M: ft.ret126,
    return12M1M: ft.mom12_1, relativeStrength12M: ft.rel252, relativeStrength3M: ft.rel63, trendAlignment: ft.trendAlignment,
    volumeRatio20over60: ft.volumeRatio20over60, maxDrawdown252d: ft.maxDrawdown252d }).score;
}
