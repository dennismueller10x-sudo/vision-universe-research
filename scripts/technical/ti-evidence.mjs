#!/usr/bin/env node
/* =========================================================================
   VU Technical Intelligence — Empirische Evidenzstudie (Backtest)

   Was gemessen wird
     Fuer jeden Titel und jeden ERKENNUNGSZEITPUNKT t (Bestaetigung eines
     Pivots der Setup-Skala) rechnet die Produktengine (ti/engine.js) das
     Ergebnis mit Bars <= t. Das Hauptszenario wird anschliessend ab t+1
     nach festen Regeln simuliert (ti/outcomes.js). Pro Titel werden nur
     NICHT UEBERLAPPENDE Signale gezaehlt (naechstes Signal erst nach dem
     Ausstieg des vorherigen) — so sind die Stichproben nicht kuenstlich
     aufgeblaeht.

   Vergleiche
     • Baseline gleicher Geometrie an 3 Zufallsbars desselben Titels
     • Martingal-Erwartung b/(a+b)
     • Richtungs-Trefferquote je Methodenfamilie allein vs. Konfluenz
       (Ablation des Informationsgehalts) gegen die Rendite nach 13 Bars

   Zeitliche Trennung (vorab festgelegt)
     TRAIN  < 2013-01-01   VALIDATION 2013–2018   TEST >= 2019-01-01
     Kalibrierung wird nur auf TRAIN geschaetzt und auf TEST geprueft.

   Quellen
     --mode weekly  discover-series-long (Wochenschluss, split-bereinigt,
                    nur heute gelistete Titel → SURVIVORSHIP-BIAS, offen
                    ausgewiesen; kein Volumen)
     --mode daily   golden-preview (5 Titel, OHLCV, 2015–2026) oder
                    --work-dir <dir>/tiingo/daily/*.json (kanonische
                    Historie in CI, gesamtes Universum)

   Inferenz (STATISTICS_AUDIT.md, 03.10.2026)
     Alle Quoten- und Lift-Intervalle aus einem Zweiweg-Cluster-Bootstrap
     (Titel × Kalenderquartal, B = 1000, fester Seed): berichtet wird das
     breiteste Intervall aus Titel-, Quartals- und Zweiweg-Schaetzung
     (Cameron-Gelbach-Miller). Die frueheren Wilson-/Normal-Intervalle
     bleiben als *Wilson / *Normal-Felder erhalten. Segmenttabellen tragen
     Benjamini-Hochberg-q-Werte (FDR 5 %) und eine Kennzeichnung
     PREREGISTERED / DESCRIPTIVE / EXPLORATORY.

   Aufruf
     node scripts/technical/ti-evidence.mjs --mode weekly [--limit N] [--workers 4] [--delisted FILE] [--boot B]
                                            [--records FILE] [--from-records FILE --time-block MONTH|QUARTER|HALF|YEAR]
     node scripts/technical/ti-evidence.mjs --mode daily [--work-dir DIR]
     --delisted FILE  privates Delisting-Wochenbuendel (build-survivorship-control.mjs
                      --bundle-out, nur im CI-Runner); ohne Datei: SURVIVORS_ONLY
   ========================================================================= */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readdirSync, writeFileSync, mkdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ROOT, readJson, weeklySeriesFromPoints, dailySeriesFromPayload } from "./lib/ti-data.mjs";
import { PRODUCT_METHODOLOGY } from "./lib/ti-product.mjs";

const require = createRequire(import.meta.url);
const TI = require(join(ROOT, "quant/engines/technical/ti/engine.js"));
const Out = require(join(ROOT, "quant/engines/technical/ti/outcomes.js"));
const Hash = require(join(ROOT, "quant/engines/hash.js"));
const VS = require(join(ROOT, "scripts/technical/lib/validation-stats.cjs"));
/* Messabgleich (03.10.2026, STATISTICS_AUDIT.md): die Studie rechnet mit DERSELBEN Methodik wie das Produkt
   (Elliott-Engine laut PRODUCT_METHODOLOGY, derzeit 3.x mit Konfluenzgewicht 0). Bis dahin lief sie mit der
   Engine-Voreinstellung (Elliott 2.x) — Evidenz und Produkt passten nicht zusammen. Keine Regel, kein Parameter geaendert. */
const METHODOLOGY = PRODUCT_METHODOLOGY;
/* Inferenz (03.10.2026): Zweiweg-Cluster-Bootstrap (Titel × Kalenderquartal), B Ziehungen, fester Seed je Tabellenzeile. */
const BOOT = { B: 1000, timeBlock: "QUARTER" };

const SPLITS = { trainEnd: "2013-01-01", testStart: "2019-01-01" };
const PROFILES = {
  weekly: { setupScale: "scale-2", entryWindow: 8, horizon: 26, fwd: 13, baselineDraws: 3, minBars: 160 },
  daily: { setupScale: "scale-2", entryWindow: 20, horizon: 126, fwd: 63, baselineDraws: 3, minBars: 520 }
};

/** SHA-256 (gekuerzt) der Engine-Dateien, die das Ergebnis bestimmen — belegt, mit welchem Stand gerechnet wurde. */
function engineHash() {
  const out = {};
  for (const f of ["quant/engines/technical/elliott/elliott-v3.js", "quant/engines/technical/elliott/elliott-v2.js", "quant/engines/technical/ti/scenario.js", "quant/engines/technical/ti/engine.js", "quant/engines/technical/ti/outcomes.js"])
    out[f.split("/").pop()] = createHash("sha256").update(readFileSync(join(ROOT, f))).digest("hex").slice(0, 16);
  return out;
}
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 ? process.argv[i + 1] : def; }

// ===================================================================== Worker
function regimeAt(spy, date) {
  /* spy-trend-26w (wie signal-backtest.js): 26-Wochen-Rendite > +5 % UP, < −5 % DOWN */
  if (!spy) return "UNKNOWN";
  let lo = 0, hi = spy.dates.length - 1, b = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (spy.dates[m] <= date) { b = m; lo = m + 1; } else hi = m - 1; }
  if (b < 130) return "UNKNOWN";
  const r = spy.close[b] / spy.close[b - 126] - 1;
  return r > 0.05 ? "RISK_ON" : r < -0.05 ? "RISK_OFF" : "NEUTRAL";
}

function processSeries(series, meta, prof, spy) {
  const recs = [];
  if (series.length < prof.minBars) return { recs, skipped: "TOO_SHORT" };
  const P = TI.prepare(series, { weekly: series.timeframe === "1D" });
  const piv = P.main.pivots.scales[prof.setupScale].pivots;
  const events = Array.from(new Set(piv.map((p) => p.confirmedIndex))).filter((t) => t >= Math.min(prof.minBars, 200) && t < series.length - 2).sort((a, b) => a - b);
  const rand = Hash.mulberry32(Hash.seedFromString("ti-evidence|" + meta.symbol));
  let busyUntil = -1;
  /* Elliott-Ergebnis je Erkennungsbar wiederverwenden (identische Eingaben: Ctx.at(P.main, t), gleiche Methodik, ohne Vorzustand) —
     reine Laufzeitersparnis fuer die Elliott-Studie unten, kein Einfluss auf Ergebnisse. */
  const elliottAt = new Map();
  for (const t of events) {
    if (t <= busyUntil) continue;
    let res;
    try { res = TI.analyzeAt(P, t, { skipHigher: series.timeframe !== "1D", methodology: METHODOLOGY }); } catch (e) { continue; }
    elliottAt.set(t, res.methods.elliott);
    const p = res.primaryScenario;
    const conf = res.confluence, fam = {};
    conf.families.forEach((f) => { fam[f.family] = f.direction; });
    const fwdIdx = t + prof.fwd;
    const fwd = fwdIdx < series.length ? series.close[fwdIdx] / series.close[t] - 1 : null;
    const base = { symbol: meta.symbol, sector: meta.sector || null, date: series.timestamps[t], t, outlook: res.outlook.label, agreement: conf.agreement, confidence: res.confidence.overall,
                   structural: res.confidence.structural, volRegime: res.regime.volatility, trendPhase: res.regime.trendPhase, market: regimeAt(spy, series.timestamps[t]),
                   elliott: res.methods.elliott.primary ? res.methods.elliott.primary.pattern : "NONE", elliottWave: res.methods.elliott.primary ? (res.methods.elliott.primary.complete ? "done" : res.methods.elliott.primary.currentWave.label) : null,
                   elliottRole: res.methods.elliott.primary ? (res.methods.elliott.primary.complete ? "COMPLETE" : res.methods.elliott.primary.currentWave.role) : "NONE",
                   elliottClarity: res.methods.elliott.clarityLevel || null, fam, fwd, alignment: res.timeframes.alignment,
                   patterns: res.methods.patterns.active.map((x) => x.type + ":" + x.status), wyckoff: res.methods.wyckoff.phase || null };
    if (!p || p.direction === "NEUTRAL" || !p.entryZone || !p.invalidation || !p.targets.length) { recs.push(Object.assign(base, { scenario: null })); continue; }
    const g = { dir: p.direction === "BULLISH" ? 1 : -1, entryLow: p.entryZone.zoneLow, entryHigh: p.entryZone.zoneHigh, invalidation: p.invalidation.price,
                t1Low: p.targets[0].zoneLow, t1High: p.targets[0].zoneHigh, t2Low: p.targets[1] ? p.targets[1].zoneLow : undefined, t2High: p.targets[1] ? p.targets[1].zoneHigh : undefined };
    const sim = Out.simulate(series, t, g, { entryWindow: prof.entryWindow, horizon: prof.horizon });
    let baselineHit = null, baselineDraws = 0;
    const rg = Out.relativeGeometry(sim, g);
    if (rg && (sim.outcome === "TARGET1" || sim.outcome === "INVALIDATED" || sim.outcome === "TIMEOUT")) {
      let hits = 0, draws = 0;
      for (let k = 0; k < prof.baselineDraws * 4 && draws < prof.baselineDraws; k++) {
        const u = 60 + Math.floor(rand() * (series.length - 60 - prof.horizon - 2));
        if (u <= 60) break;
        const b = Out.baseline(series, u, rg, { horizon: prof.horizon });
        if (b.outcome === "TARGET1" || b.outcome === "INVALIDATED" || b.outcome === "TIMEOUT") { draws++; if (b.outcome === "TARGET1") hits++; }
      }
      if (draws) { baselineHit = hits; baselineDraws = draws; }
      busyUntil = sim.exitIndex;
    } else if (sim.outcome === "NO_ENTRY") busyUntil = t + prof.entryWindow;
    recs.push(Object.assign(base, { scenario: { direction: p.direction, template: p.template, key: res.signature ? res.signature.key : null, riskAtr: p.riskAtr, rr: p.rewardRiskT1, elliottShaped: p.elliottShaped },
                                     outcome: sim.outcome, barsToT1: sim.barsToT1, barsToExit: sim.barsToExit, mfeR: sim.mfeR, maeR: sim.maeR, mfePct: sim.mfePct, maePct: sim.maePct,
                                     returnPct: sim.returnPct, forwardReturnH: sim.forwardReturnH, riskPct: sim.riskPct, rewardPct: sim.rewardPct, target2: sim.target2, baselineHits: baselineHit, baselineDraws }));
  }
  /* ---- Empirisches Elliott: alle Erkennungszeitpunkte (auch ueberlappend), Ausgang der Lehrbuch-Erwartung ---- */
  const ew = [];
  const seenCount = new Set();
  for (const t of events) {
    let E;
    try { E = elliottAt.get(t) || TI.engines(require(join(ROOT, "quant/engines/technical/ti/context.js")).at(P.main, t), METHODOLOGY).elliott; } catch (e) { continue; }
    const pc = E.primary;
    if (!pc || pc.complete) continue;
    const w = pc.waves, dir = pc.direction === "UP" ? 1 : -1, wave = pc.currentWave.label;
    let setup = null, levels = null;
    if (pc.pattern === "IMPULSE" && wave === "3" && w.length === 3) {
      const P0 = w[0].fromPrice, P1 = w[0].toPrice, P2 = w[1].toPrice, L1 = Math.abs(P1 - P0);
      setup = "IMPULSE_W3_AFTER_W2"; levels = { invalid: P0, confirm: P1, base: P2, unit: L1, ext: [1.0, 1.618, 2.618] };
    } else if (pc.pattern === "IMPULSE" && wave === "5" && w.length === 5) {
      const P0 = w[0].fromPrice, P1 = w[0].toPrice, P3 = w[2].toPrice, P4 = w[3].toPrice, L1 = Math.abs(P1 - P0);
      setup = "IMPULSE_W5_AFTER_W4"; levels = { invalid: P1, confirm: P3, base: P4, unit: L1, ext: [0.618, 1.0, 1.618] };
    } else if ((pc.pattern === "ZIGZAG" || pc.pattern === "FLAT") && wave === "C" && w.length === 3) {
      const P0 = w[0].fromPrice, P1 = w[0].toPrice, P2 = w[1].toPrice, LA = Math.abs(P1 - P0);
      setup = pc.pattern + "_C_AFTER_B"; levels = { invalid: P2 + 0 * LA, confirm: P1, base: P2, unit: LA, ext: [0.618, 1.0, 1.618], invalidIsB: true };
    }
    if (!setup) continue;
    const id = setup + "|" + w.map((x) => x.toIndex).join(",");
    if (seenCount.has(id)) continue;           // dieselbe Zaehlung nur einmal (erste Erkennung)
    seenCount.add(id);
    const H = prof.horizon * 2, s = series;
    let confirmIdx = -1, invIdx = -1; const extIdx = levels.ext.map(() => -1);
    for (let k = t + 1; k < Math.min(s.length, t + 1 + H); k++) {
      const fav = dir > 0 ? s.high[k] : s.low[k];
      if (invIdx < 0 && (dir > 0 ? s.close[k] < levels.invalid : s.close[k] > levels.invalid)) { invIdx = k; break; }
      if (confirmIdx < 0 && (dir > 0 ? fav > levels.confirm : fav < levels.confirm)) confirmIdx = k;
      levels.ext.forEach((r, q) => { if (extIdx[q] < 0 && (dir > 0 ? fav >= levels.base + r * levels.unit : fav <= levels.base - r * levels.unit)) extIdx[q] = k; });
    }
    const horizonEnded = t + H < s.length;
    if (!horizonEnded && invIdx < 0 && confirmIdx < 0) continue;      // Ausgang unbekannt
    /* Baseline: dieselben relativen Abstaende (bis Bestaetigung / bis Invalidation) ab Zufallsbar. */
    const px = s.close[t], upPct = Math.abs(levels.confirm - px) / px, dnPct = Math.abs(px - levels.invalid) / px;
    let bHits = 0, bN = 0;
    for (let q = 0; q < 3; q++) {
      const u = 60 + Math.floor(rand() * Math.max(1, s.length - 60 - H - 2));
      if (u + H >= s.length) continue;
      const bp = s.close[u]; let res = null;
      for (let k = u + 1; k < u + 1 + H; k++) {
        if (dir > 0 ? s.close[k] < bp * (1 - dnPct) : s.close[k] > bp * (1 + dnPct)) { res = false; break; }
        if (dir > 0 ? s.high[k] > bp * (1 + upPct) : s.low[k] < bp * (1 - upPct)) { res = true; break; }
      }
      if (res !== null) { bN++; if (res) bHits++; }
    }
    ew.push({ setup, date: s.timestamps[t], symbol: meta.symbol, direction: pc.direction, clarity: E.clarityLevel, structural: E.structuralLevel,
              subdivision: pc.rankComponents.subdivision, higherDegree: pc.rankComponents.higherDegree, trendContext: pc.rankComponents.trendContext,
              confirmed: confirmIdx >= 0 && (invIdx < 0 || confirmIdx < invIdx), invalidated: invIdx >= 0 && (confirmIdx < 0 || invIdx < confirmIdx),
              barsToConfirm: confirmIdx >= 0 ? confirmIdx - t : null, ext: extIdx.map((x) => (x >= 0 && (invIdx < 0 || x < invIdx) ? x - t : null)), extRatios: levels.ext,
              alreadyBeyondConfirm: dir > 0 ? s.close[t] > levels.confirm : s.close[t] < levels.confirm, baselineHits: bHits, baselineN: bN });
  }

  /* Fibonacci-Studie: Retracement-Tiefe jeder bestaetigten Gegenbewegung (scale-2) innerhalb des Swings davor. */
  const fib = [];
  const pv = P.main.pivots.scales[prof.setupScale].pivots;
  for (let k = 2; k < pv.length; k++) {
    const a = pv[k - 2].pivotPrice, b = pv[k - 1].pivotPrice, c = pv[k].pivotPrice;
    const r = Math.abs(c - b) / Math.abs(b - a);
    /* Titel und Bestaetigungsdatum je Ruecklauf fuer den Cluster-Bootstrap */
    if (r > 0 && r < 1.5) fib.push({ r: Math.round(r * 1000) / 1000, s: meta.symbol, d: series.timestamps[Math.min(series.length - 1, pv[k].confirmedIndex)] });
  }
  return { recs, fib, ew };
}

if (!isMainThread) {
  const { mode, prof, workDir } = workerData;
  const spyRaw = existsSync(join(ROOT, "quant/data/market/multi-asset/series/SPY.json")) ? readJson(join(ROOT, "quant/data/market/multi-asset/series/SPY.json")).points : null;
  const spy = spyRaw ? { dates: spyRaw.map((p) => p[0]), close: spyRaw.map((p) => p[1]) } : null;
  const out = { recs: [], fib: [], ew: [], skipped: 0, errors: [] };
  /* Dynamische Verteilung: der Hauptthread schickt je Anfrage den naechsten Titel (Laufzeiten je Titel streuen stark). */
  const handle = (f) => {
    try {
      let series, meta;
      if (f.inline) { series = weeklySeriesFromPoints(f.inline.points, f.inline.symbol); meta = { symbol: f.inline.symbol, sector: f.sector, delisted: true }; }
      else if (mode === "weekly") { const j = readJson(f.path); series = weeklySeriesFromPoints(j.points || [], j.ticker); meta = { symbol: j.ticker, sector: f.sector }; }
      else { const j = readJson(f.path); series = dailySeriesFromPayload(j, j.ticker); meta = { symbol: j.ticker, sector: f.sector }; }
      const r = processSeries(series, meta, prof, spy);
      if (r.skipped) { out.skipped++; return; }
      if (meta.delisted) { r.recs.forEach((x) => { x.delisted = true; }); r.ew.forEach((x) => { x.delisted = true; }); }
      out.recs.push(...r.recs); out.fib.push(...r.fib); out.ew.push(...r.ew);
    } catch (e) { out.errors.push(String(f.path || (f.inline && f.inline.symbol)).split("/").pop() + ": " + e.message); }
  };
  parentPort.on("message", (m) => {
    if (m.file) { handle(m.file); parentPort.postMessage({ progress: 1, next: true }); }
    else if (m.finish) { parentPort.postMessage({ done: out }); parentPort.close(); }
  });
  parentPort.postMessage({ next: true });
}

// ===================================================================== Main
const FILLED = new Set(["TARGET1", "INVALIDATED", "TIMEOUT"]);
const blockOf = (d) => VS.timeBlockOf(d, BOOT.timeBlock);
const ciOf = (x) => x && { lo: x.lo, hi: x.hi, se: x.se, by: x.by, symbol: x.symbol, time: x.time, twoWay: x.twoWay, iidCell: x.iidCell, pigeonhole: x.pigeonhole };
/**
 * Out.aggregate + Zweiweg-Cluster-Bootstrap fuer Trefferquote und Lift.
 * Produktfelder behalten ihre Namen und tragen jetzt das Cluster-Intervall:
 *   t1Ci, liftCiLow, liftCiHigh  ← Cluster-Bootstrap (breitestes Schema)
 *   t1CiWilson, liftCiLowNormal, liftCiHighNormal  ← fruehere Werte (Unabhaengigkeitsannahme)
 */
function agg(arr, label) {
  const a = Out.aggregate(arr);
  const filled = arr.filter((r) => FILLED.has(r.outcome));
  const bs = VS.twoWayBoot(filled, (r) => r.symbol, (r) => blockOf(r.date),
    (r) => { const ok = typeof r.baselineDraws === "number" && r.baselineDraws > 0; return [r.outcome === "TARGET1" ? 1 : 0, 1, ok ? r.baselineHits : 0, ok ? r.baselineDraws : 0]; },
    { lift: (s) => (s[1] && s[3] ? s[0] / s[1] - s[2] / s[3] : null), t1HitRate: (s) => (s[1] ? s[0] / s[1] : null) }, { B: BOOT.B, seed: VS.seedOf(label) });
  const L = bs.stats.lift, H = bs.stats.t1HitRate;
  a.t1CiWilson = a.t1Ci; a.liftCiLowNormal = a.liftCiLow; a.liftCiHighNormal = a.liftCiHigh;
  a.t1Ci = [H.lo, H.hi]; a.liftCiLow = L.lo; a.liftCiHigh = L.hi;
  a.pLift = L.p;
  a.ciCluster = { method: "TWO_WAY_CLUSTER_BOOTSTRAP", clusters: { symbols: bs.symbols, timeBlocks: bs.timeBlocks, cells: bs.cells }, timeBlock: BOOT.timeBlock, B: BOOT.B,
                  lift: ciOf(L), t1HitRate: ciOf(H) };
  return a;
}
function summarize(recs, keyFn, name) {
  const groups = {};
  for (const r of recs) { if (!r.scenario) continue; const k = keyFn(r); if (k === null) continue; (groups[k] = groups[k] || []).push(r); }
  const out = {};
  for (const k of Object.keys(groups).sort()) out[k] = agg(groups[k], name + "|" + k);
  return out;
}
/**
 * Kennzeichnung und Benjamini-Hochberg je Tabelle (Familie = alle Zeilen der Tabelle mit p-Wert).
 * pField: Feld mit dem zweiseitigen p-Wert (H0: Lift = 0); rows: { key → Zeile } oder Liste von [key, zeile].
 */
const REG = [];
function annotate(name, rows, registration, pField) {
  pField = pField || "pLift";
  const list = Array.isArray(rows) ? rows : Object.entries(rows);
  const q = VS.bhAdjust(list.map(([, v]) => (v ? v[pField] : null)));
  list.forEach(([k, v], i) => { if (!v) return; v.registration = typeof registration === "function" ? registration(k) : registration; v.qBH = q[i]; v.significantBH = q[i] !== null && q[i] <= 0.05; });
  REG.push({ table: name, rows: list.length, registration: typeof registration === "function" ? "MIXED" : registration, pField, significantBH: list.filter(([, v]) => v && v.significantBH).map(([k]) => k), list });
}
function period(d) { return d < SPLITS.trainEnd ? "TRAIN" : d < SPLITS.testStart ? "VALIDATION" : "TEST"; }

function directionAblation(recs, label) {
  /* Wie oft trifft das Vorzeichen jeder Familie (allein) das Vorzeichen der Rendite nach h Bars? */
  const fams = ["TREND", "MOMENTUM", "STRUCTURE", "HIGHER_TIMEFRAME", "VOLUME", "PATTERN", "ELLIOTT", "WYCKOFF"];
  const out = {};
  const evalFn = (name, dirOf) => {
    let n = 0, k = 0, sumRet = 0;
    const rows = [];
    for (const r of recs) {
      if (r.fwd === null || r.fwd === undefined) continue;
      const d = dirOf(r); if (!d) continue;
      n++; if (Math.sign(r.fwd) === d) k++; sumRet += d * r.fwd;
      rows.push([r.symbol, r.date, Math.sign(r.fwd) === d ? 1 : 0]);
    }
    /* ci = Cluster-Intervall (Produktfeld, liest derive-method-evidence.mjs); ciWilson = fruehere Unabhaengigkeitsannahme. p gegen 50 %. */
    const bs = VS.twoWayBoot(rows, (x) => x[0], (x) => blockOf(x[1]), (x) => [x[2], 1], { hitRate: (s) => (s[1] ? s[0] / s[1] : null) }, { B: BOOT.B, seed: VS.seedOf("direction|" + label + "|" + name), nullValue: { hitRate: 0.5 } });
    const H = bs.stats.hitRate;
    out[name] = { n, hitRate: n ? Math.round(k / n * 1e4) / 1e4 : null, ci: [H.lo, H.hi], ciWilson: Out.wilson(k, n), pVs50: H.p,
                  ciCluster: { method: "TWO_WAY_CLUSTER_BOOTSTRAP", timeBlock: BOOT.timeBlock, B: BOOT.B, clusters: { symbols: bs.symbols, timeBlocks: bs.timeBlocks }, hitRate: ciOf(H) },
                  meanSignedReturn: n ? Math.round(sumRet / n * 1e4) / 1e4 : null };
  };
  evalFn("CONFLUENCE", (r) => r.agreement >= 0.15 ? 1 : r.agreement <= -0.15 ? -1 : 0);
  evalFn("CONFLUENCE_STRONG", (r) => r.agreement >= 0.5 ? 1 : r.agreement <= -0.5 ? -1 : 0);
  fams.forEach((f) => evalFn(f, (r) => { const v = r.fam[f]; return v === undefined ? 0 : v > 0.1 ? 1 : v < -0.1 ? -1 : 0; }));
  evalFn("ALWAYS_LONG", () => 1);
  /* Konfluenz ohne Familie f: Agreement neu aus den uebrigen Stimmen (Prior-Gewichte). */
  const W = require(join(ROOT, "quant/engines/technical/ti/scenario.js")).DEFAULTS.familyWeights;
  fams.forEach((drop) => evalFn("WITHOUT_" + drop, (r) => {
    let s = 0, w = 0; for (const [f, v] of Object.entries(r.fam)) { if (f === drop || !W[f]) continue; s += W[f] * v; w += W[f]; }
    const a = w ? s / w : 0; return a >= 0.15 ? 1 : a <= -0.15 ? -1 : 0;
  }));
  return out;
}

function conditionalLift(recs) {
  /* Trefferquote Ziel 1, wenn eine Familie das Hauptszenario stuetzt vs. widerspricht. */
  const out = {};
  for (const f of ["TREND", "MOMENTUM", "STRUCTURE", "HIGHER_TIMEFRAME", "VOLUME", "PATTERN", "ELLIOTT", "WYCKOFF"]) {
    const sup = [], opp = [];
    for (const r of recs) {
      if (!r.scenario) continue; const d = r.scenario.direction === "BULLISH" ? 1 : -1, v = r.fam[f];
      if (v === undefined) continue;
      if (v * d > 0.1) sup.push(r); else if (v * d < -0.1) opp.push(r);
    }
    out[f] = { supports: agg(sup, "cond|" + f + "|supports"), opposes: agg(opp, "cond|" + f + "|opposes") };
  }
  return out;
}

function calibration(recs, evalPeriod) {
  evalPeriod = evalPeriod || "TEST";
  /* Kalibrierung: Trefferquote je Zelle (Template × Richtung × Agreement) auf TRAIN gelernt, auf TEST geprueft. */
  const filled = recs.filter((r) => r.scenario && ["TARGET1", "INVALIDATED", "TIMEOUT"].includes(r.outcome));
  const cell = (r) => r.scenario.key;
  const train = filled.filter((r) => period(r.date) === "TRAIN"), test = filled.filter((r) => period(r.date) === evalPeriod);
  const table = {}, base = { k: 0, n: 0 };
  for (const r of train) { const c = cell(r); table[c] = table[c] || { k: 0, n: 0 }; table[c].n++; base.n++; if (r.outcome === "TARGET1") { table[c].k++; base.k++; } }
  const baseRate = base.n ? base.k / base.n : null;
  /* Shrinkage zum Gesamtmittel (Beta-Prior mit Gewicht 20) gegen Ueberanpassung kleiner Zellen. */
  const pred = (r) => { const c = table[cell(r)]; return c ? (c.k + 20 * baseRate) / (c.n + 20) : baseRate; };
  const preds = test.map(pred), ys = test.map((r) => r.outcome === "TARGET1");
  const rel = Out.reliability(preds, ys, 5);
  const constBrier = test.length ? test.reduce((a, r) => a + Math.pow(baseRate - (r.outcome === "TARGET1" ? 1 : 0), 2), 0) / test.length : null;
  const skill = rel.brier !== null && constBrier ? 1 - rel.brier / constBrier : null;
  const maxGap = rel.bins.reduce((a, b) => Math.max(a, Math.abs(b.predicted - b.observed)), 0);
  const passed = skill !== null && skill > 0.01 && maxGap <= 0.07 && test.length >= 300;
  return { method: "CELL_RATE_SHRUNK_BETA20", trainN: train.length, testN: test.length, baseRateTrain: baseRate && Math.round(baseRate * 1e4) / 1e4, reliability: rel, constantBrier: constBrier && Math.round(constBrier * 1e4) / 1e4,
           brierSkill: skill === null ? null : Math.round(skill * 1e4) / 1e4, maxReliabilityGap: Math.round(maxGap * 1e4) / 1e4, passed,
           gate: "Brier-Skill > 0,01 gegenueber konstanter Train-Quote UND max. Reliability-Abweichung <= 7 Prozentpunkte UND n_test >= 300",
           table: Object.fromEntries(Object.entries(table).map(([k, v]) => [k, { n: v.n, rate: Math.round((v.k + 20 * baseRate) / (v.n + 20) * 1e4) / 1e4 }])) };
}

function elliottStudy(allRows) {
  /* Zeilen, deren Kurs bei Erkennung bereits jenseits des Bestaetigungsniveaus lag, sind trivial "bestaetigt"
     und wuerden die Quote aufblaehen (Review-Befund 3) — ausgeschlossen, Anzahl separat ausgewiesen. */
  const rows = allRows.filter((r) => !r.alreadyBeyondConfirm);
  const excludedAlreadyBeyondConfirm = allRows.length - rows.length;
  /* Pro Setup-Typ: Bestaetigung der Lehrbuch-Erwartung vor Regelbruch, Extensionen, Dauer — gegen Baseline gleicher Abstaende. */
  const group = (arr, label) => {
    const n = arr.length, k = arr.filter((r) => r.confirmed).length, inv = arr.filter((r) => r.invalidated).length;
    const bn = arr.reduce((a, r) => a + r.baselineN, 0), bk = arr.reduce((a, r) => a + r.baselineHits, 0);
    const p = n ? k / n : null, pb = bn ? bk / bn : null, se = n && bn ? Math.sqrt(p * (1 - p) / n + pb * (1 - pb) / bn) : null;
    const ratios = arr[0] ? arr[0].extRatios : [];
    /* Erkennungen ueberlappen hier (alle Zaehlungen, nicht nur nicht ueberlappende) → Cluster-Bootstrap ist Pflicht. */
    const bs = VS.twoWayBoot(arr, (r) => r.symbol, (r) => blockOf(r.date), (r) => [r.confirmed ? 1 : 0, 1, r.baselineHits, r.baselineN],
      { lift: (s) => (s[1] && s[3] ? s[0] / s[1] - s[2] / s[3] : null), confirmRate: (s) => (s[1] ? s[0] / s[1] : null) }, { B: BOOT.B, seed: VS.seedOf("elliott|" + label) });
    const L = bs.stats.lift, C = bs.stats.confirmRate;
    return { n, symbols: new Set(arr.map((r) => r.symbol)).size, confirmRate: p === null ? null : Math.round(p * 1e4) / 1e4, confirmCi: [C.lo, C.hi], confirmCiWilson: Out.wilson(k, n), invalidationRate: n ? Math.round(inv / n * 1e4) / 1e4 : null,
             baselineRate: pb === null ? null : Math.round(pb * 1e4) / 1e4, lift: p !== null && pb !== null ? Math.round((p - pb) * 1e4) / 1e4 : null, liftCiLow: L.lo, liftCiHigh: L.hi,
             liftCiLowNormal: se ? Math.round((p - pb - 1.96 * se) * 1e4) / 1e4 : null, pLift: L.p,
             ciCluster: { method: "TWO_WAY_CLUSTER_BOOTSTRAP", timeBlock: BOOT.timeBlock, B: BOOT.B, clusters: { symbols: bs.symbols, timeBlocks: bs.timeBlocks }, lift: ciOf(L), confirmRate: ciOf(C) },
             medianBarsToConfirm: Out.median(arr.map((r) => r.barsToConfirm)), p25BarsToConfirm: Out.quantile(arr.map((r) => r.barsToConfirm), 0.25), p75BarsToConfirm: Out.quantile(arr.map((r) => r.barsToConfirm), 0.75),
             extensionReached: Object.fromEntries(ratios.map((x, q) => [x, n ? Math.round(arr.filter((r) => r.ext[q] !== null).length / n * 1e4) / 1e4 : null])),
             medianBarsToExtension: Object.fromEntries(ratios.map((x, q) => [x, Out.median(arr.map((r) => r.ext[q]))])) };
  };
  const by = (keyFn, name) => {
    const g = {}; rows.forEach((r) => { const k = keyFn(r); (g[k] = g[k] || []).push(r); });
    const t = Object.fromEntries(Object.keys(g).sort().map((k) => [k, group(g[k], name + "|" + k)]));
    annotate("elliott." + name, t, "EXPLORATORY");
    return t;
  };
  return {
    excludedAlreadyBeyondConfirm,
    note: "Erste Erkennung je Zaehlung; ohne Faelle, deren Kurs bei Erkennung schon jenseits des Bestaetigungsniveaus lag; Bestaetigung = Kurs erreicht das Lehrbuch-Bestaetigungsniveau (z. B. W1-Ende fuer W3) vor einem Schluss jenseits der harten Invalidation.",
    bySetup: by((r) => r.setup, "bySetup"), bySetupDirection: by((r) => r.setup + "|" + r.direction, "bySetupDirection"), bySetupClarity: by((r) => r.setup + "|" + r.clarity, "bySetupClarity"),
    bySubdivision: by((r) => r.setup + "|" + (r.subdivision >= 0.75 ? "SUBDIVISION_CONSISTENT" : r.subdivision <= 0.35 ? "SUBDIVISION_CONFLICT" : "SUBDIVISION_UNRESOLVED"), "bySubdivision"),
    byHigherDegree: by((r) => r.setup + "|" + (r.higherDegree >= 0.8 ? "HIGHER_CONSISTENT" : r.higherDegree <= 0.4 ? "HIGHER_CONFLICT" : "HIGHER_NEUTRAL"), "byHigherDegree"),
    byPeriod: by((r) => r.setup + "|" + period(r.date), "byPeriod")
  };
}

function fibStudy(items) {
  /* Dichte der Retracement-Tiefen: Haeufung an 38,2/50/61,8 % gegenueber den Nachbarbaendern? */
  const values = items.map((x) => (typeof x === "number" ? x : x.r));
  const bw = 0.02, levels = [0.382, 0.5, 0.618, 0.786];
  const count = (lo, hi) => values.filter((v) => v >= lo && v < hi).length;
  const out = { n: values.length, bandWidth: bw, levels: {} };
  for (const L of levels) {
    const at = count(L - bw / 2, L + bw / 2), left = count(L - 1.5 * bw, L - bw / 2), right = count(L + bw / 2, L + 1.5 * bw);
    const neigh = (left + right) / 2;
    /* Cluster-Intervall des Verhaeltnisses (Titel × Quartal der Pivot-Bestaetigung); p gegen Verhaeltnis 1. */
    const bs = VS.twoWayBoot(items.filter((x) => typeof x === "object"), (x) => x.s, (x) => blockOf(x.d),
      (x) => [x.r >= L - bw / 2 && x.r < L + bw / 2 ? 1 : 0, (x.r >= L - 1.5 * bw && x.r < L - bw / 2) || (x.r >= L + bw / 2 && x.r < L + 1.5 * bw) ? 1 : 0],
      { ratio: (s) => (s[1] ? 2 * s[0] / s[1] : null) }, { B: BOOT.B, seed: VS.seedOf("fib|" + L), nullValue: { ratio: 1 } });
    const R = bs.stats.ratio;
    out.levels[L] = { atLevel: at, neighbourMean: neigh, ratio: neigh ? Math.round(at / neigh * 1000) / 1000 : null, ratioCi: [R.lo, R.hi], pVs1: R.p,
                      ciCluster: { method: "TWO_WAY_CLUSTER_BOOTSTRAP", timeBlock: BOOT.timeBlock, B: BOOT.B, clusters: { symbols: bs.symbols, timeBlocks: bs.timeBlocks }, ratio: ciOf(R) },
                      note: "Verhaeltnis ~1 = keine Haeufung; > 1 = mehr Wendepunkte genau am Niveau als knapp daneben" };
  }
  const hist = []; for (let x = 0; x < 1.2; x += 0.05) hist.push({ from: Math.round(x * 100) / 100, share: values.length ? Math.round(count(x, x + 0.05) / values.length * 1e4) / 1e4 : 0 });
  out.histogram = hist;
  out.median = Out.median(values);
  annotate("fibonacci.levels", out.levels, "EXPLORATORY", "pVs1");
  return out;
}

async function main() {
  const mode = arg("mode", "weekly"), limit = +arg("limit", "0"), workers = +arg("workers", "4"), workDir = arg("work-dir", null), delistedFile = arg("delisted", null);
  BOOT.B = Math.max(1000, +arg("boot", "1000"));
  /* Zeitblock nur fuer Sensitivitaeten aenderbar (Vorgabe QUARTER, Begruendung in STATISTICS_AUDIT.md §3). */
  BOOT.timeBlock = ["MONTH", "QUARTER", "HALF", "YEAR"].includes(arg("time-block", "QUARTER")) ? arg("time-block", "QUARTER") : "QUARTER";
  const outDir = arg("out", join(ROOT, "quant/data/technical-intelligence/evidence"));
  const prof = PROFILES[mode];
  const tax = readJson(join(ROOT, "quant/data/product/sic-peer-taxonomy-v1.json"));
  const ci = tax.rowColumns.indexOf("securityId"), di = tax.rowColumns.indexOf("sicDivision"), ti = tax.rowColumns.indexOf("ticker");
  const sectorBy = {}; tax.rows.forEach((r) => { sectorBy[r[ci]] = r[di]; sectorBy[r[ti]] = r[di]; });
  let files;
  if (mode === "weekly") {
    const dir = join(ROOT, "quant/data/market/discover-series-long");
    files = readdirSync(dir).filter((f) => f.startsWith("ref_") && f.endsWith(".json")).sort().map((f) => ({ path: join(dir, f), sector: sectorBy[f.replace(".json", "")] || null }));
  } else {
    const dir = workDir ? join(workDir, "tiingo", "daily") : join(ROOT, "quant/data/market/golden-preview/daily");
    files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort().map((f) => ({ path: join(dir, f), sector: sectorBy[f.replace(".json", "")] || null }));
  }
  if (limit > 0) { const step = Math.max(1, Math.floor(files.length / limit)); files = files.filter((_, i) => i % step === 0).slice(0, limit); }
  /* Ueberlebenden-Kontrolle: privates Delisting-Wochenbuendel (nur im CI-Runner). Format wie build-signal-backtest.mjs:
     { version, asOf, listings: [{ id, ticker, w0, c: [Wochenschluss je Freitag ab w0, null = kein Handel] }] }. */
  let delistedMeta = null;
  if (delistedFile) {
    if (mode !== "weekly") delistedMeta = { file: "runner-privat", used: false, reason: "Buendel enthaelt Wochenreihen; nur --mode weekly" };
    else if (!existsSync(delistedFile)) delistedMeta = { file: "runner-privat", used: false, reason: "DATEI_FEHLT" };
    else {
      const b = readJson(delistedFile); let added = 0;
      for (const l of b.listings || []) {
        if (!l || !l.w0 || !Array.isArray(l.c)) continue;
        const t0w = Date.parse(l.w0 + "T00:00:00Z"), points = [];
        l.c.forEach((c, i) => { if (c > 0) points.push([new Date(t0w + i * 7 * 864e5).toISOString().slice(0, 10), c]); });
        if (points.length) { files.push({ inline: { symbol: "DL:" + (l.id || l.ticker), points }, sector: null }); added++; }
      }
      delistedMeta = { file: "runner-privat", used: true, version: b.version || null, asOf: b.asOf || null, listings: (b.listings || []).length, series: added };
    }
  }
  const t0 = Date.now(), hashAtStart = engineHash();
  /* --from-records DATEI: Simulation ueberspringen und eine mit --records gesicherte Rohstichprobe neu auswerten
     (nur Inferenz; fuer Sensitivitaeten wie Zeitblock-Laenge, ohne die Engines erneut zu rechnen). */
  const fromRecords = arg("from-records", null);
  let dump = null;
  if (fromRecords) {
    dump = JSON.parse(gunzipSync(readFileSync(fromRecords)).toString("utf8"));
    if (dump.mode !== mode) throw new Error("--from-records: Modus " + dump.mode + " passt nicht zu --mode " + mode);
    files = new Array(dump.files).fill(null); delistedMeta = dump.delistedMeta || delistedMeta;
  }
  /* Worker-Threads mit dynamischer Warteschlange (groesste Dateien zuerst), Ergebnis unabhaengig von der Verteilung:
     Records werden danach deterministisch nach Titel und Datum sortiert. */
  const queue = dump ? [] : files.map((f, i) => ({ f, i, size: f.path ? statSync(f.path).size : (f.inline.points.length * 20) })).sort((a, b) => b.size - a.size || a.i - b.i).map((x) => x.f);
  let done = 0, qi = 0;
  const results = dump ? [dump.result] : await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, files.length)) }, () => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { mode, prof, workDir } });
    w.on("message", (m) => {
      if (m.progress) { done++; if (done % 250 === 0) process.stderr.write(`  ${done}/${files.length} (${Math.round((Date.now() - t0) / 1000)} s)\n`); }
      if (m.next) { if (qi < queue.length) w.postMessage({ file: queue[qi++] }); else w.postMessage({ finish: true }); }
      if (m.done) resolve(m.done);
    });
    w.on("error", reject);
    w.on("exit", (code) => { if (code !== 0) reject(new Error("worker exit " + code)); });
  })));
  const simulationSec = dump ? dump.simulationSec : Math.round((Date.now() - t0) / 1000);
  const recordsOut = arg("records", null);
  if (recordsOut && !dump) {
    const merged = { recs: results.flatMap((r) => r.recs), fib: results.flatMap((r) => r.fib), ew: results.flatMap((r) => r.ew), skipped: results.reduce((a, r) => a + r.skipped, 0), errors: results.flatMap((r) => r.errors) };
    writeFileSync(recordsOut, gzipSync(Buffer.from(JSON.stringify({ schemaVersion: "vu-ti-evidence-records-2", mode, files: files.length, simulationSec, delistedMeta, engineHash: hashAtStart, scenarioVersion: require(join(ROOT, "quant/engines/technical/ti/scenario.js")).ENGINE_VERSION, result: merged }))));
  }
  const dev = process.argv.includes("--dev");
  /* --dev: Entwicklungsmodus. TEST-Zeitraum wird VERWORFEN, bevor irgendeine Kennzahl entsteht —
     Methodik-Iterationen sehen nur TRAIN/VALIDATION (Schutz vor Ueberanpassung an den Test). */
  const bySymDate = (a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const allRecs = results.flatMap((r) => r.recs).sort(bySymDate);
  const fib = results.flatMap((r) => r.fib).sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : a.d < b.d ? -1 : a.d > b.d ? 1 : a.r - b.r));
  const allEw = results.flatMap((r) => r.ew).sort((a, b) => bySymDate(a, b) || (a.setup < b.setup ? -1 : a.setup > b.setup ? 1 : 0));
  const recs = dev ? allRecs.filter((r) => period(r.date) !== "TEST") : allRecs;
  const errors = results.flatMap((r) => r.errors), skipped = results.reduce((a, r) => a + r.skipped, 0);
  const withScenario = recs.filter((r) => r.scenario);
  const tf = mode === "weekly" ? "1W" : "1D";
  const tBoot = Date.now();
  const holdout = dev ? "VALIDATION" : "TEST";
  const tables = {
    byPeriod: summarize(recs, (r) => period(r.date), "byPeriod"),
    setups: summarize(recs, (r) => r.scenario.key, "setups"),
    byTemplate: summarize(recs, (r) => r.scenario.template + "|" + r.scenario.direction, "byTemplate"),
    byTemplateTest: summarize(recs.filter((r) => period(r.date) === holdout), (r) => r.scenario.template + "|" + r.scenario.direction, "byTemplateTest"),
    byConfidence: summarize(recs, (r) => r.confidence, "byConfidence"),
    byAgreement: summarize(recs, (r) => (Math.abs(r.agreement) >= 0.5 ? "HIGH" : Math.abs(r.agreement) >= 0.25 ? "MODERATE" : "LOW"), "byAgreement"),
    byMarketRegime: summarize(recs, (r) => r.market + "|" + r.scenario.direction, "byMarketRegime"),
    byVolatility: summarize(recs, (r) => r.volRegime, "byVolatility"),
    bySector: summarize(recs, (r) => r.sector || "UNKNOWN", "bySector"),
    byYear: summarize(recs, (r) => r.date.slice(0, 4), "byYear"),
    byElliott: summarize(recs, (r) => r.elliottRole + "|" + r.elliott, "byElliott"),
    byElliottClarity: summarize(recs, (r) => r.elliottClarity || "NONE", "byElliottClarity"),
    byElliottShaped: summarize(recs, (r) => (r.scenario.elliottShaped ? "ELLIOTT_ENTRY" : "OTHER_ENTRY") + "|" + r.scenario.direction, "byElliottShaped"),
    byAlignment: summarize(recs, (r) => r.alignment, "byAlignment")
  };
  /* Kennzeichnung (vorab festgelegt laut BACKTEST_METHODOLOGY §3/§6): Vergleich gegen die Baseline gleicher Geometrie im
     TEST-Zeitraum ist die vorab registrierte Hauptgroesse; Setup-Zellen sind die vorab definierte Produkt-Nachschlagegroesse
     (gepoolt ueber alle Zeitraeume, nicht Holdout); TRAIN/VALIDATION beschreiben die Entwicklungsdaten; alles andere ist explorativ. */
  annotate("byPeriod", tables.byPeriod, (k) => (k === holdout ? "PREREGISTERED" : "DESCRIPTIVE"));
  annotate("setups", tables.setups, "PREREGISTERED_PRODUCT_LOOKUP");
  for (const name of ["byTemplate", "byTemplateTest", "byConfidence", "byAgreement", "byMarketRegime", "byVolatility", "bySector", "byYear", "byElliott", "byElliottClarity", "byElliottShaped", "byAlignment"]) annotate(name, tables[name], "EXPLORATORY");
  const condLift = conditionalLift(recs);
  annotate("conditionalLift", [].concat(...Object.entries(condLift).map(([f, v]) => [[f + "|supports", v.supports], [f + "|opposes", v.opposes]])), "EXPLORATORY");
  const dirAll = directionAblation(recs, "all"), dirHold = directionAblation(recs.filter((r) => period(r.date) === holdout), "holdout");
  annotate("directionAblation.holdout", dirHold, "EXPLORATORY", "pVs50");
  const elliottRes = elliottStudy(dev ? allEw.filter((r) => period(r.date) !== "TEST") : allEw);
  const fibRes = fibStudy(fib);
  const overall = agg(withScenario, "overall");
  overall.registration = "DESCRIPTIVE";
  /* Gepoolte BH-Familie ueber ALLE explorativen Lift-Vergleiche (strenger als je Tabelle). */
  const pooled = [];
  REG.forEach((t) => { if (t.registration === "EXPLORATORY" && t.pField === "pLift") t.list.forEach(([k, v]) => { if (v) pooled.push([t.table + "|" + k, v]); }); });
  const qPooled = VS.bhAdjust(pooled.map(([, v]) => v.pLift));
  pooled.forEach(([, v], i) => { v.qBHPooled = qPooled[i]; });
  const bootSec = Math.round((Date.now() - tBoot) / 1000);
  /* Survivorship-Sensitivitaet: nur mit Delisting-Buendel */
  const survSens = delistedMeta && delistedMeta.used ? {
    survivorsOnly: { overall: agg(withScenario.filter((r) => !r.delisted), "surv|overall"), byPeriod: summarize(recs.filter((r) => !r.delisted), (r) => period(r.date), "surv|byPeriod") },
    delistedOnly: { overall: agg(withScenario.filter((r) => r.delisted), "dl|overall"), byPeriod: summarize(recs.filter((r) => r.delisted), (r) => period(r.date), "dl|byPeriod") },
    note: "Hauptergebnis enthaelt die delisteten Listings; Faelle, deren Reihe vor Ziel/Invalidation/Zeitablauf endet, sind OPEN/NO_DATA und fallen heraus (Zensierung, offen ausgewiesen)."
  } : null;
  const report = {
    schemaVersion: "vu-ti-evidence-1.0.0", generatedAt: new Date().toISOString(), mode, timeframe: tf,
    engine: { bundle: TI.BUNDLE_VERSION, outcomes: Out.VERSION, scenario: dump ? dump.scenarioVersion : require(join(ROOT, "quant/engines/technical/ti/scenario.js")).ENGINE_VERSION, methodology: METHODOLOGY,
              files: dump ? dump.engineHash : hashAtStart,
              note: "Messabgleich 03.10.2026: Produktmethodik (PRODUCT_METHODOLOGY, Elliott-Engine 3.x, Konfluenzgewicht 0) statt Engine-Voreinstellung (2.x); ohne Persistenz-Replay (jeder Erkennungszeitpunkt zustandslos)." },
    universe: { files: files.length, skippedTooShort: skipped, errors: errors.length, symbolsWithEvents: new Set(recs.map((r) => r.symbol)).size,
                source: mode === "weekly" ? "discover-series-long (Wochenschluss, split-bereinigt)" : (workDir ? "kanonische Tageshistorie (work-dir)" : "golden-preview (5 Titel)"),
                survivorship: delistedMeta && delistedMeta.used ? "INCLUDES_DELISTED — " + delistedMeta.series + " delistete Listings aus dem privaten Buendel (Abdeckung laut Buendel, nicht vor 2015)"
                  : mode === "weekly" || !workDir ? "SURVIVORS_ONLY — nur heute gelistete Titel; Ergebnisse koennen nach oben verzerrt sein" : "SURVIVORS_ONLY (ohne delisted bundle)",
                delisted: delistedMeta, delistedRecords: recs.filter((r) => r.delisted).length,
                dateRange: [recs.reduce((a, r) => (a && a < r.date ? a : r.date), null), recs.reduce((a, r) => (a && a > r.date ? a : r.date), null)] },
    rules: { profile: prof, splits: SPLITS, entry: "Limit an der nahen Zonenkante, gueltig " + prof.entryWindow + " Bars; Ziel 1 = Zonen-Untergrenze; Invalidation per Schlusskurs; gleiche Bar → Invalidation; Kosten 10 bp je Seite",
             nonOverlapping: true, baseline: "gleiche Geometrie, sofortiger Einstieg an 3 Zufallsbars desselben Titels" },
    inference: {
      method: "TWO_WAY_CLUSTER_BOOTSTRAP", B: BOOT.B, timeBlock: BOOT.timeBlock, seed: "FNV-1a(Tabelle|Zeile)",
      schemes: { SYMBOL: "Titel mit Zuruecklegen", TIME: "Kalenderquartale (Signaldatum) mit Zuruecklegen", TWO_WAY: "Cameron-Gelbach-Miller: se² = se²_Titel + se²_Quartal − se²_Zelle, Intervall ± 1,96 se",
                 iidCell: "Zellen (Titel × Quartal) — nur Hilfsgroesse", pigeonhole: "Titel und Quartale gleichzeitig (konservative Sensitivitaet, nicht massgeblich)" },
      reported: "breitestes Intervall aus SYMBOL, TIME, TWO_WAY (Feld ciCluster.*.by); t1Ci/liftCiLow/liftCiHigh/confirmCi/ci tragen dieses Intervall, *Wilson/*Normal die frueheren Werte",
      pValues: "zweiseitig, Normalnaeherung mit der Bootstrap-Standardabweichung des massgeblichen Schemas (H0: Lift = 0; Richtung: Quote = 50 %; Fibonacci: Verhaeltnis = 1)",
      multipleTesting: "Benjamini-Hochberg (FDR 5 %) je Tabelle (Feld qBH, significantBH); zusaetzlich gepoolt ueber alle explorativen Lift-Vergleiche (qBHPooled)",
      registration: { PREREGISTERED: "Lift gegen Baseline gleicher Geometrie im " + holdout + "-Zeitraum (Hauptgroesse, vor dem ersten TEST-Lauf festgelegt); Kalibrierungs-Gate",
                      PREREGISTERED_PRODUCT_LOOKUP: "Setup-Zellen (Template × Richtung × Agreement), vorab als Produkt-Nachschlagegroesse definiert; gepoolt ueber alle Zeitraeume (kein Holdout)",
                      DESCRIPTIVE: "Gesamt und TRAIN/VALIDATION (Entwicklungsdaten)", EXPLORATORY: "alle Segmenttabellen, bedingte Lifts, Richtungs-Ablation, Elliott- und Fibonacci-Studie" },
      overlap: "Je Titel nicht ueberlappend (busyUntil). Querschnitts-Ueberlappung (gleiche Woche/Marktphase ueber viele Titel) ueber die Quartals-Cluster; Elliott-Studie ueberlappt auch je Titel (alle Erkennungen) — ueber Titel-Cluster erfasst.",
      tables: REG.map((t) => ({ table: t.table, rows: t.rows, registration: t.registration, significantBH: t.significantBH })),
      bootstrapSec: bootSec
    },
    counts: { events: recs.length, withScenario: withScenario.length, byOutcome: withScenario.reduce((a, r) => { a[r.outcome] = (a[r.outcome] || 0) + 1; return a; }, {}) },
    overall,
    ...tables,
    conditionalLift: condLift,
    directionAblation: { horizonBars: prof.fwd, all: dirAll, holdout: dirHold },
    calibration: Object.assign(calibration(recs, holdout), { registration: "PREREGISTERED" }), devMode: dev,
    fibonacci: fibRes,
    elliott: elliottRes,
    survivorshipSensitivity: survSens,
    runtimeSec: Math.round((Date.now() - t0) / 1000) + (dump ? dump.simulationSec : 0), simulationSec, fromRecords: !!dump, workers: dump ? null : workers,
    errorsSample: errors.slice(0, 10)
  };
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, (dev ? "dev-" : "") + "evidence-" + tf + (workDir ? "-universe" : mode === "daily" ? "-golden" : "") + ".json");
  writeFileSync(file, JSON.stringify(report, null, 1));
  /* Fruehere Faelle je Titel (Historical Replay im Produkt): die letzten 12 Signale mit Ausgang. */
  if (!dev) {
    const bySym = {};
    for (const r of allRecs) {
      if (!r.scenario || r.delisted) continue;   // delistete Reihen sind runner-privat
      (bySym[r.symbol] = bySym[r.symbol] || []).push({ date: r.date, template: r.scenario.template, direction: r.scenario.direction, key: r.scenario.key, outcome: r.outcome, barsToT1: r.barsToT1 });
    }
    for (const k of Object.keys(bySym)) bySym[k] = bySym[k].slice(-12);
    writeFileSync(join(outDir, "cases-" + tf + (workDir ? "-universe" : mode === "daily" ? "-golden" : "") + ".json.gz"), gzipSync(Buffer.from(JSON.stringify({ schemaVersion: "vu-ti-cases-1.0.0", generatedAt: report.generatedAt, timeframe: tf, symbols: bySym })), { level: 9, mtime: 0 }));
  }
  const brief = (a) => a && { n: a.n, t1HitRate: a.t1HitRate, t1Ci: a.t1Ci, baselineRate: a.baselineRate, lift: a.lift, liftCi: [a.liftCiLow, a.liftCiHigh], liftCiNormal: [a.liftCiLowNormal, a.liftCiHighNormal], by: a.ciCluster && a.ciCluster.lift.by, qBH: a.qBH };
  console.log(JSON.stringify({ file, events: recs.length, withScenario: withScenario.length, overall: brief(report.overall), test: brief(report.byPeriod[holdout]),
    calibration: { passed: report.calibration.passed, skill: report.calibration.brierSkill }, runtimeSec: report.runtimeSec, bootstrapSec: bootSec }, null, 1));
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
