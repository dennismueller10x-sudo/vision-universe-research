#!/usr/bin/env node
/* Daten fuer die interne Elliott-Werkbank (Remediation §61–§65): Faelle zum Pruefen und Annotieren.
     PRACTITIONER   veroeffentlichte, datierte Zaehlungen (ungeprueft, Suchzusammenfassungen) — Blindrekonstruktion
     REAL_DEV       echte Wochencharts, Emittenten-Split DEVELOPMENT/VALIDATION (HOLDOUT bleibt gesperrt)
     SYNTHETIC      Korpusfaelle mit bekannter Struktur (zum Einueben der Annotation; Wahrheit erst auf Klick)
   Je Fall: Kurs bis Stichtag, Engine 3.0 (Haupt, Alternative, hoeherer Grad, Unterwellen, Begruendung), Engine 2.2 (Haupt),
   Zaehlungs-Historie der letzten 26 Schritte mit Wechselgrund. Keine Bewertung — die macht ein Mensch. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, readJson, weeklySeriesFromPoints } from "./lib/ti-data.mjs";
import { reasonOf, transition } from "./lib/ti-product.mjs";
import { corpusCase, CLASSES } from "../../quant/tests/elliott-corpus.mjs";
import { ew3Split, fnv1a } from "./elliott-stability.mjs";
const require = createRequire(import.meta.url);
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const r4 = (v) => (typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v);
const slim = (c, s) => c && { pattern: c.pattern, name: c.patternName, complete: c.complete, wave: c.complete ? null : c.currentWave.label, next: c.nextMove,
  waves: c.waves.map((w) => ({ l: w.label, a: s.timestamps[w.fromIndex], b: s.timestamps[w.toIndex], pa: r4(w.fromPrice), pb: r4(w.toPrice), st: w.status === "DEVELOPING" ? 1 : 0,
    sub: w.subdivision && w.subdivision.waves ? { p: w.subdivision.pattern, w: w.subdivision.waves.map((x) => [x.toTime, x.toPrice, x.label]) } : w.subdivision ? { p: w.subdivision.pattern } : null })),
  inv: c.invalidation ? r4(c.invalidation.price) : null, quality: c.countQuality ? c.countQuality.level : null };
function analyze(s, bpy) {
  const P = Ctx.prepare(s), n = s.length, hist = [];
  let prev = null, prevInfo = null;
  for (let t = Math.max(1, n - 52); t < n; t++) {
    const E = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: bpy, previous: prev });
    const p = E.primary;
    const info = p ? { key: p.persistenceKey, complete: p.complete, inv: p.invalidation ? p.invalidation.price : null, invDir: p.invalidation ? p.invalidation.direction : null, name: p.patternName, wave: p.complete ? "abgeschlossen" : p.currentWave.label,
                        span: [p.waves[0].fromIndex, p.waves[p.waves.length - 1].toIndex], waveStarts: p.waves.map((w) => w.fromIndex) } : null;
    if (t >= n - 26) { const tr = transition(prevInfo, info, s.close[t]); const why = reasonOf(prevInfo, info, tr, s.close[t], s.close[t - 1], P.features.columns.atr[t]); hist.push({ d: s.timestamps[t], c: r4(s.close[t]), to: info ? info.name + " · " + info.wave : null, tr, why, ab: !!(E.applicability && E.applicability.abstain) }); }
    prev = p ? { key: p.persistenceKey, pivots: p.persistencePivots } : null; prevInfo = info;
  }
  const E3 = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: bpy, previous: prev });
  const E2 = EV2.analyzeElliottV2({ series: s, features: P.features, pivots: P.pivots, barsPerYear: bpy });
  const from = Math.max(0, n - 156);
  return {
    chart: { d: s.timestamps.slice(from), c: s.close.slice(from).map(r4) },
    v3: { primary: slim(E3.primary, s), alternative: slim(E3.alternatives && E3.alternatives[0], s), higher: E3.higherDegree ? { name: E3.higherDegree.patternName, current: E3.higherDegree.current.notation } : null,
          applicability: E3.applicability ? { level: E3.applicability.level, score: E3.applicability.score, reasons: E3.applicability.reasons } : null, ambiguity: E3.ambiguity, trace: E3.trace ? { chosen: E3.trace.chosen, rejectedTop: E3.trace.rejectedTop } : null, engine: E3.engineVersion },
    v2: { primary: slim(E2.primary, s), engine: E2.engineVersion, applicability: E2.applicability ? E2.applicability.level : null },
    history: hist
  };
}
const cases = [];
/* 1. Praktiker */
const refs = JSON.parse(readFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/practitioner/practitioner-refs.json"), "utf8"));
const MAP = { SPX: "SPY", NDX: "QQQ", DJIA: "DIA", RUT: "IWM", BTCUSD: "BTCUSD", WTI: "WTI", N225: "N225", XAUUSD: "XAUUSD", EEM: "EEM" };
for (const e of refs.entries) {
  if (e.timeframe === "intraday" || !MAP[e.instrument]) continue;
  const pts = readJson(join(ROOT, "quant/data/market/multi-asset/series", MAP[e.instrument] + ".json")).points.filter((p) => p[1] > 0 && p[0] <= e.publicationDate);
  const tf = e.timeframe === "weekly" ? "1W" : "1D";
  let rows = pts;
  if (tf === "1W") { const wk = new Map(); for (const [d, v] of rows) { const dt = new Date(d + "T00:00:00Z"); wk.set(new Date(dt.getTime() + ((5 - dt.getUTCDay() + 7) % 7) * 864e5).toISOString().slice(0, 10), [d, v]); } rows = [...wk.values()]; }
  const s = Canonical.fromRows(rows.map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null })), { instrumentId: e.instrument, exchange: "X", currency: "USD", timeframe: tf, priceSeriesType: "SPLIT_ADJUSTED", source: "multi-asset" });
  if (s.length < 300) continue;
  cases.push(Object.assign({ id: e.id, kind: "PRACTITIONER", symbol: MAP[e.instrument] + " (" + e.instrument + ")", date: e.publicationDate, timeframe: tf,
    reference: { sourceType: "EXTERNAL_PRACTITIONER", verified: false, organization: e.organization, author: e.author, url: e.url, claim: e.currentWaveClaim, pattern: e.patternClaim, next: e.primaryDirectionNext, invalidation: e.invalidationLevel, target: e.targetZone, conflictGroup: e.conflictGroup } },
    analyze(s, tf === "1W" ? 52 : 252)));
}
/* 2. Echte Wochencharts (DEVELOPMENT + VALIDATION, je 20; Stichtag deterministisch) */
const dir = join(ROOT, "quant/data/market/discover-series-long");
const master = readJson(join(ROOT, "quant/data/market/security-master/us-security-master.json"));
const common = new Set(); master.rows.forEach((r) => { if (r.instrument_type === "EQUITY_COMMON") common.add(r.ticker); });
for (const split of ["DEVELOPMENT", "VALIDATION"]) {
  const files = readdirSync(dir).filter((f) => f.startsWith("ref_")).map((f) => f.replace(/^ref_|\.json$/g, "")).filter((t) => !/_/.test(t) && common.has(t) && fnv1a(t.split(/[_.-]/)[0]) % 10 >= 3 && ew3Split(t) === split)
    .sort((a, b) => fnv1a(a + "|wb") - fnv1a(b + "|wb")).slice(0, 40);
  let k = 0;
  for (const t of files) {
    if (k >= 20) break;
    const j = readJson(join(dir, "ref_" + t + ".json"));
    if ((j.points || []).length < 520) continue;
    const cut = 400 + (fnv1a(t + "|cut") % (j.points.length - 420));
    const s = weeklySeriesFromPoints(j.points.slice(0, cut + 1), t);
    cases.push(Object.assign({ id: "R-" + split.slice(0, 3) + "-" + t, kind: "REAL_" + split, symbol: t, date: s.timestamps[s.length - 1], timeframe: "1W", reference: null }, analyze(s, 52)));
    k++;
  }
}
/* 3. Synthetisch (Struktur bekannt; Wahrheit erst auf Klick) */
for (const cls of Object.keys(CLASSES).filter((c) => !CLASSES[c].negativeOf)) {
  const cs = corpusCase(cls, 3, "low");
  const s = weeklySeriesFromPoints(cs.dates.map((d, i) => [d, cs.closes[i]]), "SYN");
  cases.push(Object.assign({ id: "S-" + cls, kind: "SYNTHETIC", symbol: "SYN", date: cs.dates[cs.dates.length - 1], timeframe: "1W",
    reference: { sourceType: "SYNTHETIC", truth: { pattern: cls, expect: cs.truth.expect, pivots: cs.truth.topIdx.map((i, k) => [cs.dates[i], r4(cs.closes[i])]) } } }, analyze(s, 52)));
}
mkdirSync(join(ROOT, "quant/research/elliott-workbench"), { recursive: true });
writeFileSync(join(ROOT, "quant/research/elliott-workbench/data.json"), JSON.stringify({ schemaVersion: "vu-elliott-workbench-1.0.0", generatedAt: new Date().toISOString(), engines: { v3: EV3.ENGINE_VERSION, v2: EV2.ENGINE_VERSION },
  note: "Interne Werkbank. Praktiker-Referenzen ungeprueft (Suchzusammenfassungen). HOLDOUT-Emittenten sind ausgeschlossen.", cases }));
console.log("Werkbank:", cases.length, "Faelle", JSON.stringify(cases.reduce((a, c) => { a[c.kind] = (a[c.kind] || 0) + 1; return a; }, {})));
