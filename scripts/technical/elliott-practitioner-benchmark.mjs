#!/usr/bin/env node
/* Praktiker-Abgleich (Remediation §26–§32): Blindrekonstruktion veroeffentlichter, datierter Elliott-Zaehlungen.
   Die Engine sieht nur Kurse bis zum Veroeffentlichungstag (Tagesschluss, Close-only; „weekly"-Referenzen auf Wochenschluss).
   Referenzen sind PRACTITIONER REFERENCE — keine Wahrheit; dieser Satz beruht auf Suchergebnis-Zusammenfassungen, nicht auf
   geprueften Volltexten (siehe note im Datensatz). Intraday-Zaehlungen sind mit Tagesdaten nicht rekonstruierbar und werden
   nur gezaehlt.
   Kennzahlen: Richtungsuebereinstimmung (laufende Welle bzw. naechste Bewegung der Engine gegen die erwartete Richtung des
   Praktikers), Rolle der laufenden Welle (Motiv/Korrektur), Abstand der Invalidierungsniveaus, Enthaltung; Vergleichsbasis
   „immer aufwaerts" und 20-Tage-Trend. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, readJson } from "./lib/ti-data.mjs";
const require = createRequire(import.meta.url);
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const REF = join(ROOT, "quant/data/technical-intelligence/elliott-validation/practitioner/practitioner-refs.json");
const MAP = { SPX: "SPY", NDX: "QQQ", DJIA: "DIA", RUT: "IWM", BTCUSD: "BTCUSD", WTI: "WTI", N225: "N225", XAUUSD: "XAUUSD", EEM: "EEM" };
const refs = JSON.parse(readFileSync(REF, "utf8"));
const cache = {};
function loadDaily(sym) {
  if (cache[sym]) return cache[sym];
  const pts = readJson(join(ROOT, "quant/data/market/multi-asset/series", sym + ".json")).points.filter((p) => p[1] > 0);
  return (cache[sym] = pts);
}
function toSeries(pts, tf, until) {
  let rows = pts.filter((p) => p[0] <= until);
  if (tf === "1W") { const wk = new Map(); for (const [d, v] of rows) { const dt = new Date(d + "T00:00:00Z"); const fri = new Date(dt.getTime() + ((5 - dt.getUTCDay() + 7) % 7) * 864e5).toISOString().slice(0, 10); wk.set(fri, [d, v]); } rows = [...wk.values()]; }
  return Canonical.fromRows(rows.map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null })), { instrumentId: "X", exchange: "X", currency: "USD", timeframe: tf, priceSeriesType: "SPLIT_ADJUSTED", source: "multi-asset" });
}
function role(claim) {
  const m = String(claim || "").match(/wave[s]?\s*[\(\[]?\s*((?:i{1,3}|iv|v|[1-5]|[a-ewxyz]))\s*[\)\]]?/i);
  if (!m) return null;
  const l = m[1].toUpperCase();
  if (["1", "3", "5", "I", "III", "V", "A", "C"].includes(l)) return "MOTIVE";
  if (["2", "4", "II", "IV", "B", "D", "E", "W", "X", "Y", "Z"].includes(l)) return "CORRECTIVE";
  return null;
}
const rows = [];
for (const e of refs.entries) {
  const sym = MAP[e.instrument];
  const row = { id: e.id, instrument: e.instrument, date: e.publicationDate, timeframe: e.timeframe, conflictGroup: e.conflictGroup || null, refDir: e.primaryDirectionNext, refRole: role(e.currentWaveClaim) };
  if (!sym || e.timeframe === "intraday" || e.timeframe === "unknown") { row.skipped = e.timeframe === "intraday" ? "INTRADAY_NOT_REPRODUCIBLE" : "NO_DATA"; rows.push(row); continue; }
  const tf = e.timeframe === "weekly" || e.timeframe === "monthly" ? "1W" : "1D";
  const s = toSeries(loadDaily(sym), tf, e.publicationDate);
  if (s.length < 300) { row.skipped = "TOO_SHORT"; rows.push(row); continue; }
  const P = Ctx.prepare(s), bpy = tf === "1W" ? 52 : 252;
  for (const [name, fn] of [["v3", () => EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: bpy })], ["v2", () => EV2.analyzeElliottV2({ series: s, features: P.features, pivots: P.pivots, barsPerYear: bpy })]]) {
    const r = fn(), c = r.primary;
    row[name] = c ? { pattern: c.pattern, wave: c.complete ? "complete" : c.currentWave.label, curDir: c.currentWave.direction, next: c.nextMove, role: c.currentWave.role === "MOTIVE" ? "MOTIVE" : c.currentWave.role === "COMPLETE" ? "COMPLETE" : "CORRECTIVE",
                     inv: c.invalidation ? c.invalidation.price : null, applicability: r.applicability ? r.applicability.level : null } : { pattern: null, applicability: "LOW" };
  }
  const c = s.close, n = c.length;
  row.trend20 = c[n - 1] >= c[Math.max(0, n - 21)] ? "UP" : "DOWN";
  row.lastClose = c[n - 1]; row.refInv = e.invalidationLevel;
  rows.push(row);
}
const used = rows.filter((r) => !r.skipped && (r.refDir === "UP" || r.refDir === "DOWN"));
const rate = (f, a = used) => { const x = a.filter((r) => f(r) !== null); return { n: x.length, agree: x.filter((r) => f(r)).length, share: x.length ? +(x.filter((r) => f(r)).length / x.length).toFixed(3) : null }; };
const summary = {
  entries: refs.entries.length, skipped: rows.filter((r) => r.skipped).reduce((a, r) => { a[r.skipped] = (a[r.skipped] || 0) + 1; return a; }, {}), usedForDirection: used.length,
  direction: {
    v3CurrentWave: rate((r) => (r.v3 && r.v3.curDir ? r.v3.curDir === r.refDir : null)), v3NextMove: rate((r) => (r.v3 && r.v3.next ? r.v3.next === r.refDir : null)),
    v2CurrentWave: rate((r) => (r.v2 && r.v2.curDir ? r.v2.curDir === r.refDir : null)), v2NextMove: rate((r) => (r.v2 && r.v2.next ? r.v2.next === r.refDir : null)),
    baselineAlwaysUp: rate((r) => r.refDir === "UP"), baselineTrend20: rate((r) => r.trend20 === r.refDir)
  },
  role: { v3: rate((r) => (r.refRole && r.v3 && r.v3.role !== "COMPLETE" && r.v3.pattern ? r.v3.role === r.refRole : null), rows.filter((r) => !r.skipped)),
          v2: rate((r) => (r.refRole && r.v2 && r.v2.role !== "COMPLETE" && r.v2.pattern ? r.v2.role === r.refRole : null), rows.filter((r) => !r.skipped)) },
  v3Abstain: rows.filter((r) => r.v3 && r.v3.applicability === "LOW").length, v3Evaluated: rows.filter((r) => r.v3).length,
  invalidationGapPct: (() => { const a = rows.filter((r) => r.v3 && r.v3.inv && r.refInv).map((r) => Math.abs(r.v3.inv - r.refInv / (r.instrument === "SPX" || r.instrument === "NDX" || r.instrument === "DJIA" || r.instrument === "RUT" ? NaN : 1)) / r.lastClose).filter(Number.isFinite); a.sort((x, y) => x - y); return { n: a.length, median: a.length ? +a[Math.floor(a.length / 2)].toFixed(3) : null, note: "nur Instrumente ohne Index/ETF-Skalenunterschied" }; })()
};
const out = { schemaVersion: "vu-elliott-practitioner-benchmark-1.0.0", generatedAt: new Date().toISOString(), engine: { v3: EV3.ENGINE_VERSION, v2: EV2.ENGINE_VERSION },
  status: "PRACTITIONER REFERENCE — unverified (search-summary based), not ground truth", referenceNote: refs.note, summary, rows };
mkdirSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/practitioner"), { recursive: true });
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/practitioner/practitioner-benchmark.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(summary, null, 1));
