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

   Aufruf
     node scripts/technical/ti-evidence.mjs --mode weekly [--limit N] [--workers 4]
     node scripts/technical/ti-evidence.mjs --mode daily [--work-dir DIR]
   ========================================================================= */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { ROOT, readJson, weeklySeriesFromPoints, dailySeriesFromPayload } from "./lib/ti-data.mjs";

const require = createRequire(import.meta.url);
const TI = require(join(ROOT, "quant/engines/technical/ti/engine.js"));
const Out = require(join(ROOT, "quant/engines/technical/ti/outcomes.js"));
const Hash = require(join(ROOT, "quant/engines/hash.js"));

const SPLITS = { trainEnd: "2013-01-01", testStart: "2019-01-01" };
const PROFILES = {
  weekly: { setupScale: "scale-2", entryWindow: 8, horizon: 26, fwd: 13, baselineDraws: 3, minBars: 160 },
  daily: { setupScale: "scale-2", entryWindow: 20, horizon: 126, fwd: 63, baselineDraws: 3, minBars: 520 }
};

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
  for (const t of events) {
    if (t <= busyUntil) continue;
    let res;
    try { res = TI.analyzeAt(P, t, { skipHigher: series.timeframe !== "1D" }); } catch (e) { continue; }
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
    try { E = TI.engines(require(join(ROOT, "quant/engines/technical/ti/context.js")).at(P.main, t), {}).elliott; } catch (e) { continue; }
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
    if (r > 0 && r < 1.5) fib.push(Math.round(r * 1000) / 1000);
  }
  return { recs, fib, ew };
}

if (!isMainThread) {
  const { files, mode, prof, workDir } = workerData;
  const spyRaw = existsSync(join(ROOT, "quant/data/market/multi-asset/series/SPY.json")) ? readJson(join(ROOT, "quant/data/market/multi-asset/series/SPY.json")).points : null;
  const spy = spyRaw ? { dates: spyRaw.map((p) => p[0]), close: spyRaw.map((p) => p[1]) } : null;
  const out = { recs: [], fib: [], ew: [], skipped: 0, errors: [] };
  for (const f of files) {
    try {
      let series, meta;
      if (mode === "weekly") { const j = readJson(f.path); series = weeklySeriesFromPoints(j.points || [], j.ticker); meta = { symbol: j.ticker, sector: f.sector }; }
      else { const j = readJson(f.path); series = dailySeriesFromPayload(j, j.ticker); meta = { symbol: j.ticker, sector: f.sector }; }
      const r = processSeries(series, meta, prof, spy);
      if (r.skipped) { out.skipped++; continue; }
      out.recs.push(...r.recs); out.fib.push(...r.fib); out.ew.push(...r.ew);
    } catch (e) { out.errors.push(String(f.path).split("/").pop() + ": " + e.message); }
    parentPort.postMessage({ progress: 1 });
  }
  parentPort.postMessage({ done: out });
}

// ===================================================================== Main
function summarize(recs, keyFn) {
  const groups = {};
  for (const r of recs) { if (!r.scenario) continue; const k = keyFn(r); if (k === null) continue; (groups[k] = groups[k] || []).push(r); }
  const out = {};
  for (const [k, arr] of Object.entries(groups)) out[k] = Out.aggregate(arr);
  return out;
}
function period(d) { return d < SPLITS.trainEnd ? "TRAIN" : d < SPLITS.testStart ? "VALIDATION" : "TEST"; }

function directionAblation(recs) {
  /* Wie oft trifft das Vorzeichen jeder Familie (allein) das Vorzeichen der Rendite nach h Bars? */
  const fams = ["TREND", "MOMENTUM", "STRUCTURE", "HIGHER_TIMEFRAME", "VOLUME", "PATTERN", "ELLIOTT", "WYCKOFF"];
  const out = {};
  const evalFn = (name, dirOf) => {
    let n = 0, k = 0, sumRet = 0;
    for (const r of recs) {
      if (r.fwd === null || r.fwd === undefined) continue;
      const d = dirOf(r); if (!d) continue;
      n++; if (Math.sign(r.fwd) === d) k++; sumRet += d * r.fwd;
    }
    out[name] = { n, hitRate: n ? Math.round(k / n * 1e4) / 1e4 : null, ci: Out.wilson(k, n), meanSignedReturn: n ? Math.round(sumRet / n * 1e4) / 1e4 : null };
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
    out[f] = { supports: Out.aggregate(sup), opposes: Out.aggregate(opp) };
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

function elliottStudy(rows) {
  /* Pro Setup-Typ: Bestaetigung der Lehrbuch-Erwartung vor Regelbruch, Extensionen, Dauer — gegen Baseline gleicher Abstaende. */
  const group = (arr) => {
    const n = arr.length, k = arr.filter((r) => r.confirmed).length, inv = arr.filter((r) => r.invalidated).length;
    const bn = arr.reduce((a, r) => a + r.baselineN, 0), bk = arr.reduce((a, r) => a + r.baselineHits, 0);
    const p = n ? k / n : null, pb = bn ? bk / bn : null, se = n && bn ? Math.sqrt(p * (1 - p) / n + pb * (1 - pb) / bn) : null;
    const ratios = arr[0] ? arr[0].extRatios : [];
    return { n, symbols: new Set(arr.map((r) => r.symbol)).size, confirmRate: p === null ? null : Math.round(p * 1e4) / 1e4, confirmCi: Out.wilson(k, n), invalidationRate: n ? Math.round(inv / n * 1e4) / 1e4 : null,
             baselineRate: pb === null ? null : Math.round(pb * 1e4) / 1e4, lift: p !== null && pb !== null ? Math.round((p - pb) * 1e4) / 1e4 : null, liftCiLow: se ? Math.round((p - pb - 1.96 * se) * 1e4) / 1e4 : null,
             medianBarsToConfirm: Out.median(arr.map((r) => r.barsToConfirm)), p25BarsToConfirm: Out.quantile(arr.map((r) => r.barsToConfirm), 0.25), p75BarsToConfirm: Out.quantile(arr.map((r) => r.barsToConfirm), 0.75),
             extensionReached: Object.fromEntries(ratios.map((x, q) => [x, n ? Math.round(arr.filter((r) => r.ext[q] !== null).length / n * 1e4) / 1e4 : null])),
             medianBarsToExtension: Object.fromEntries(ratios.map((x, q) => [x, Out.median(arr.map((r) => r.ext[q]))])) };
  };
  const by = (keyFn) => { const g = {}; rows.forEach((r) => { const k = keyFn(r); (g[k] = g[k] || []).push(r); }); return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, group(v)])); };
  return {
    note: "Erste Erkennung je Zaehlung; Bestaetigung = Kurs erreicht das Lehrbuch-Bestaetigungsniveau (z. B. W1-Ende fuer W3) vor einem Schluss jenseits der harten Invalidation.",
    bySetup: by((r) => r.setup), bySetupDirection: by((r) => r.setup + "|" + r.direction), bySetupClarity: by((r) => r.setup + "|" + r.clarity),
    bySubdivision: by((r) => r.setup + "|" + (r.subdivision >= 0.75 ? "SUBDIVISION_CONSISTENT" : r.subdivision <= 0.35 ? "SUBDIVISION_CONFLICT" : "SUBDIVISION_UNRESOLVED")),
    byHigherDegree: by((r) => r.setup + "|" + (r.higherDegree >= 0.8 ? "HIGHER_CONSISTENT" : r.higherDegree <= 0.4 ? "HIGHER_CONFLICT" : "HIGHER_NEUTRAL")),
    byPeriod: by((r) => r.setup + "|" + period(r.date))
  };
}

function fibStudy(values) {
  /* Dichte der Retracement-Tiefen: Haeufung an 38,2/50/61,8 % gegenueber den Nachbarbaendern? */
  const bw = 0.02, levels = [0.382, 0.5, 0.618, 0.786];
  const count = (lo, hi) => values.filter((v) => v >= lo && v < hi).length;
  const out = { n: values.length, bandWidth: bw, levels: {} };
  for (const L of levels) {
    const at = count(L - bw / 2, L + bw / 2), left = count(L - 1.5 * bw, L - bw / 2), right = count(L + bw / 2, L + 1.5 * bw);
    const neigh = (left + right) / 2;
    out.levels[L] = { atLevel: at, neighbourMean: neigh, ratio: neigh ? Math.round(at / neigh * 1000) / 1000 : null,
                      note: "Verhaeltnis ~1 = keine Haeufung; > 1 = mehr Wendepunkte genau am Niveau als knapp daneben" };
  }
  const hist = []; for (let x = 0; x < 1.2; x += 0.05) hist.push({ from: Math.round(x * 100) / 100, share: values.length ? Math.round(count(x, x + 0.05) / values.length * 1e4) / 1e4 : 0 });
  out.histogram = hist;
  out.median = Out.median(values);
  return out;
}

async function main() {
  const mode = arg("mode", "weekly"), limit = +arg("limit", "0"), workers = +arg("workers", "4"), workDir = arg("work-dir", null);
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
  const t0 = Date.now();
  const chunks = Array.from({ length: Math.min(workers, files.length) }, () => []);
  files.forEach((f, i) => chunks[i % chunks.length].push(f));
  let done = 0;
  const results = await Promise.all(chunks.map((c) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { files: c, mode, prof, workDir } });
    w.on("message", (m) => { if (m.progress) { done++; if (done % 250 === 0) process.stderr.write(`  ${done}/${files.length} (${Math.round((Date.now() - t0) / 1000)} s)\n`); } if (m.done) resolve(m.done); });
    w.on("error", reject);
  })));
  const dev = process.argv.includes("--dev");
  /* --dev: Entwicklungsmodus. TEST-Zeitraum wird VERWORFEN, bevor irgendeine Kennzahl entsteht —
     Methodik-Iterationen sehen nur TRAIN/VALIDATION (Schutz vor Ueberanpassung an den Test). */
  const allRecs = results.flatMap((r) => r.recs), fib = results.flatMap((r) => r.fib);
  const allEw = results.flatMap((r) => r.ew);
  const recs = dev ? allRecs.filter((r) => period(r.date) !== "TEST") : allRecs;
  const errors = results.flatMap((r) => r.errors), skipped = results.reduce((a, r) => a + r.skipped, 0);
  const withScenario = recs.filter((r) => r.scenario);
  const tf = mode === "weekly" ? "1W" : "1D";
  const report = {
    schemaVersion: "vu-ti-evidence-1.0.0", generatedAt: new Date().toISOString(), mode, timeframe: tf,
    engine: { bundle: TI.BUNDLE_VERSION, outcomes: Out.VERSION },
    universe: { files: files.length, skippedTooShort: skipped, errors: errors.length, symbolsWithEvents: new Set(recs.map((r) => r.symbol)).size,
                source: mode === "weekly" ? "discover-series-long (Wochenschluss, split-bereinigt)" : (workDir ? "kanonische Tageshistorie (work-dir)" : "golden-preview (5 Titel)"),
                survivorship: mode === "weekly" || !workDir ? "SURVIVORS_ONLY — nur heute gelistete Titel; Ergebnisse koennen nach oben verzerrt sein" : "SURVIVORS_ONLY (ohne delisted bundle)",
                dateRange: [recs.reduce((a, r) => (a && a < r.date ? a : r.date), null), recs.reduce((a, r) => (a && a > r.date ? a : r.date), null)] },
    rules: { profile: prof, splits: SPLITS, entry: "Limit an der nahen Zonenkante, gueltig " + prof.entryWindow + " Bars; Ziel 1 = Zonen-Untergrenze; Invalidation per Schlusskurs; gleiche Bar → Invalidation; Kosten 10 bp je Seite",
             nonOverlapping: true, baseline: "gleiche Geometrie, sofortiger Einstieg an 3 Zufallsbars desselben Titels" },
    counts: { events: recs.length, withScenario: withScenario.length, byOutcome: withScenario.reduce((a, r) => { a[r.outcome] = (a[r.outcome] || 0) + 1; return a; }, {}) },
    overall: Out.aggregate(withScenario),
    byPeriod: summarize(recs, (r) => period(r.date)),
    setups: summarize(recs, (r) => r.scenario.key),
    byTemplate: summarize(recs, (r) => r.scenario.template + "|" + r.scenario.direction),
    byConfidence: summarize(recs, (r) => r.confidence),
    byAgreement: summarize(recs, (r) => (Math.abs(r.agreement) >= 0.5 ? "HIGH" : Math.abs(r.agreement) >= 0.25 ? "MODERATE" : "LOW")),
    byMarketRegime: summarize(recs, (r) => r.market + "|" + r.scenario.direction),
    byVolatility: summarize(recs, (r) => r.volRegime),
    bySector: summarize(recs, (r) => r.sector || "UNKNOWN"),
    byYear: summarize(recs, (r) => r.date.slice(0, 4)),
    byElliott: summarize(recs, (r) => r.elliottRole + "|" + r.elliott),
    byElliottClarity: summarize(recs, (r) => r.elliottClarity || "NONE"),
    byElliottShaped: summarize(recs, (r) => (r.scenario.elliottShaped ? "ELLIOTT_ENTRY" : "OTHER_ENTRY") + "|" + r.scenario.direction),
    byAlignment: summarize(recs, (r) => r.alignment),
    conditionalLift: conditionalLift(recs),
    directionAblation: { horizonBars: prof.fwd, all: directionAblation(recs), holdout: directionAblation(recs.filter((r) => period(r.date) === (dev ? "VALIDATION" : "TEST"))) },
    calibration: calibration(recs, dev ? "VALIDATION" : "TEST"), devMode: dev,
    fibonacci: fibStudy(fib),
    elliott: elliottStudy(dev ? allEw.filter((r) => period(r.date) !== "TEST") : allEw),
    runtimeSec: Math.round((Date.now() - t0) / 1000),
    errorsSample: errors.slice(0, 10)
  };
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, (dev ? "dev-" : "") + "evidence-" + tf + (workDir ? "-universe" : mode === "daily" ? "-golden" : "") + ".json");
  writeFileSync(file, JSON.stringify(report, null, 1));
  const scratch = arg("records", null);
  if (scratch) writeFileSync(scratch, gzipSync(Buffer.from(JSON.stringify(recs))));
  console.log(JSON.stringify({ file, events: recs.length, withScenario: withScenario.length, overall: report.overall, calibration: { passed: report.calibration.passed, skill: report.calibration.brierSkill }, runtimeSec: report.runtimeSec }, null, 1));
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
