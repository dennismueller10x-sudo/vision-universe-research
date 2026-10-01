#!/usr/bin/env node
/* =========================================================================
   SIGNAL BACKTEST v2 - historische Evidenz je Radar-Signal (Wochenraster).

   Erkennung   splitbereinigter Wochenschluss (discover-series-long), wie
               die technische Definition es verlangt
   Ergebnis    Gesamtrendite, wenn die Pipeline die kanonische Tageshistorie
               bereitstellt (--work-dir; weekly-total-return-1.0.0), sonst
               Kursrendite - eine Basis fuer die ganze Studie, im Artefakt
               benannt. Rohkurse verlassen den Lauf nie.
   Vergleich   Base Rate derselben Woche (Anteil im Plus und Median aller
               Titel, passiv, ohne Kosten) und SPY ueber dasselbe Fenster
   Kosten      BASE je Runde auf das Signal; LOW/HIGH als Sensitivitaet
   Abhaengigk. Faelle derselben Periode sind nicht unabhaengig: Quartale
               als Cluster, cluster-robuste Intervalle, effektive Fallzahl
   Robustheit  Lernen/Pruefen/Testen, Walk-Forward, Nachbarparameter,
               Einstiegsverzug 0/1/2 Wochen
   Marktphasen werden NICHT aufgeteilt: die Regime-Historie der
               Market-Regime-Engine ist nicht zertifiziert (gateStatus
               MARKET_REGIME_TRANSITIONS_GATE = PENDING_HISTORY).

   Schreibt quant/data/product/signal-backtest-v1.json (Aggregate).
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { weekKey, weeklyFromDaily, WEEKLY_TOTAL_RETURN_VERSION } from "./lib/weekly-total-return.mjs";
import { fromBars } from "./lib/daily-prices.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SB = require(join(ROOT, "quant/engines/signal-backtest.js"));
const OUT = join(ROOT, "quant/data/product/signal-backtest-v1.json");
const LONG = join(ROOT, "quant/data/market/discover-series-long");
const argv = process.argv.slice(2);
const wi = argv.indexOf("--work-dir"), WORK = wi >= 0 ? argv[wi + 1] : null;
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";

/* 1. Wochenraster (Erkennung, splitbereinigt). */
const raw = [], keys = new Set();
for (const f of readdirSync(LONG).filter((f) => f.endsWith(".json") && f !== "index.json").sort()) {
  const j = JSON.parse(readFileSync(join(LONG, f), "utf8"));
  if (j.priceSeriesType !== "SPLIT_ADJUSTED" || !Array.isArray(j.points)) throw Error("UNEXPECTED_SERIES " + f);
  const pts = j.points.map(([d, v]) => [weekKey(d), v]);
  for (const [k] of pts) keys.add(k);
  raw.push({ securityId: j.securityId, ticker: j.ticker, pts });
}
const WEEKS = [...keys].sort(), W = WEEKS.length, IDX = new Map(WEEKS.map((k, i) => [k, i]));
let titles = raw.map((r) => {
  const c = new Float64Array(W).fill(NaN);
  for (const [k, v] of r.pts) c[IDX.get(k)] = v;
  let first = 0; while (first < W && !(c[first] > 0)) first++;
  return { securityId: r.securityId, ticker: r.ticker, c, first, out: c };
});
raw.length = 0;
const asOf = WEEKS[W - 1];

/* 2. Ergebnisreihe: Gesamtrendite aus der kanonischen Historie, wenn sie
   fuer fast alle Titel vorliegt. Titel ohne sie fallen in diesem Modus
   heraus (gezaehlt) - es wird nie gemischt. */
let returnType = "SPLIT_ADJUSTED_PRICE", trCoverage = null, spyTR = null;
if (WORK) {
  let have = 0;
  for (const T of titles) {
    const f = join(WORK, "tiingo", "daily", T.securityId + ".json");
    if (!existsSync(f)) { T.tr = null; continue; }
    try { const d = fromBars(JSON.parse(readFileSync(f, "utf8"))); T.tr = d.totalReturn ? weeklyFromDaily(d.dates, d.tr, IDX, W) : null; } catch { T.tr = null; }
    if (T.tr) have++;
  }
  trCoverage = { titles: titles.length, withTotalReturn: have, share: SB.round(have / titles.length, 3) };
  const spyFile = existsSync(join(WORK, "tiingo", "daily", "ref_SPY.json")) ? join(WORK, "tiingo", "daily", "ref_SPY.json") : null;
  if (spyFile) { const d = fromBars(JSON.parse(readFileSync(spyFile, "utf8"))); if (d.totalReturn) spyTR = weeklyFromDaily(d.dates, d.tr, IDX, W); }
  if (have / titles.length >= 0.95 && spyTR) {
    returnType = "TOTAL_RETURN";
    titles = titles.filter((T) => T.tr);
    for (const T of titles) T.out = T.tr;
  }
}
console.log("titles", titles.length, "weeks", W, WEEKS[0], "→", asOf, "returnType", returnType, secs());

/* 3. SPY (Vergleich): Gesamtrendite im TR-Modus, sonst Kurs. */
let spy = spyTR;
if (returnType !== "TOTAL_RETURN") {
  const s = JSON.parse(readFileSync(join(ROOT, "quant/data/market/multi-asset/series/SPY.json"), "utf8"));
  if (!/split-bereinigt/.test(s.seriesTitle || "")) throw Error("SPY_SERIES_NOT_SPLIT_ADJUSTED");
  spy = new Float64Array(W).fill(NaN);
  for (const [d, v] of s.points) { const i = IDX.get(weekKey(d)); if (i !== undefined && v > 0) spy[i] = v; }
}

/* 4. Base Rate je Woche und Horizont: alle Titel, Einstieg w+1, passiv. */
const H = SB.HORIZONS, F = SB.frictionFactor();
const baseMedian = H.map(() => new Float64Array(W).fill(NaN));
const basePos = H.map(() => new Float64Array(W).fill(NaN));
const basePooled = H.map(() => []);
for (let w = 0; w < W - 1; w++) {
  const e = w + 1;
  H.forEach((h, hi) => {
    if (e + h.weeks >= W) return;
    const vals = [];
    for (let t = 0; t < titles.length; t++) {
      const T = titles[t];
      if (w - T.first < SB.WARMUP_WEEKS) continue;
      const a = T.out[e], b = T.out[e + h.weeks];
      if (a > 0 && b > 0) { const r = b / a - 1; vals.push(r); if ((w + t) % 4 === 0) basePooled[hi].push(r); }
    }
    if (vals.length >= 30) { baseMedian[hi][w] = SB.median(vals); basePos[hi][w] = vals.filter((x) => x > 0).length / vals.length; }
  });
}
const basePath = Array.from({ length: 53 }, () => []);
for (let t = 0; t < titles.length; t++) {
  const T = titles[t];
  for (let w = T.first + SB.WARMUP_WEEKS + (t % 52); w + 1 + 52 < W; w += 52) {
    if (!(T.out[w + 1] > 0)) continue;
    for (let k = 0; k <= 52; k++) { const v = T.out[w + 1 + k]; if (v > 0) basePath[k].push(v / T.out[w + 1] - 1); }
  }
}
console.log("base done", secs());

const endedEarly = titles.filter((T) => { let last = W - 1; while (last >= 0 && !(T.c[last] > 0)) last--; return last < W - 27; }).length;
const sign = (x) => (x === null || !Number.isFinite(x) ? null : Math.abs(x) < 0.0025 ? 0 : x > 0 ? 1 : -1);
const quarterOf = (w) => WEEKS[w].slice(0, 4) + "Q" + (Math.floor((Number(WEEKS[w].slice(5, 7)) - 1) / 3) + 1);
const OOS_SPLIT = { trainBefore: "2010-01-01", testFrom: "2018-01-01" };
const costF = (bps) => 1 - bps / 10000;

function eventsFor(rule, params) {
  const out = [];
  for (let t = 0; t < titles.length; t++) {
    const T = titles[t];
    for (const w of SB.detectEvents(T.c, rule, params)) if (w - T.first >= SB.WARMUP_WEEKS && w + 1 < W) out.push({ t, w });
  }
  return out;
}
/* Ergebnis eines Ereignisses mit Einstiegsverzug d (Wochen) ueber h Wochen, netto BASE. */
function netRet(T, w, d, h) {
  const e = w + d, x = T.out[e], y = T.out[e + h];
  return e + h < W && x > 0 && y > 0 ? (y / x) * F - 1 : null;
}
function pitProof(rule, events) {
  let checked = 0, mismatches = 0;
  const step = Math.max(1, Math.floor(events.length / 300));
  for (let k = 0; k < events.length; k += step) {
    const { t, w } = events[k], c = titles[t].c;
    const cut = c.slice(0, w + 1), forged = Float64Array.from(c);
    for (let j = w + 1; j < forged.length; j++) forged[j] = c[w] * (j % 2 ? 3 : 0.2);
    checked++;
    if (!rule.detect(cut, w, rule.params) || !rule.detect(forged, w, rule.params)) mismatches++;
  }
  return { checked, mismatches };
}

function study(rule) {
  const events = eventsFor(rule);
  const pit = pitProof(rule, events);
  const per = H.map(() => ({ rets: [], gross: [], ex: [], exSpy: [], dd: [], mae: [], mfe: [], hit: [], cl: [] }));
  const touch = { UP: 0, DOWN: 0, NONE: 0, wUp: [], wDown: [] }, opp = { rets: [], weeks: [], byOpposite: 0 };
  const pathStep = Math.max(1, Math.ceil(events.length / 40000));
  const path = Array.from({ length: 53 }, () => []), ddPath = Array.from({ length: 53 }, () => []);
  const years = new Map(), titleSetM6 = new Set(), weekSet = new Set(), quarterSet = new Set();
  let lookaheadViolations = 0, closedHorizon = 0, completeAll = 0;
  for (const [k, ev] of events.entries()) {
    const T = titles[ev.t], e = ev.w + 1;
    if (e <= ev.w) lookaheadViolations++;
    ev.ex6 = null; ev.d6 = null;
    let all = true;
    H.forEach((h, hi) => {
      const o = SB.outcome(T.out, e, h.weeks);
      if (!o) { all = false; return; }
      const P = per[hi];
      P.rets.push(o.ret); P.gross.push(o.grossRet); P.dd.push(o.maxDrawdown); P.mae.push(o.mae); P.mfe.push(o.mfe);
      const bm = baseMedian[hi][ev.w], bp = basePos[hi][ev.w];
      if (Number.isFinite(bm)) { P.ex.push(o.ret - bm); if (h.id === "m6") ev.ex6 = o.ret - bm; }
      if (Number.isFinite(bp)) { const d = (o.ret > 0 ? 1 : 0) - bp; P.hit.push(d); P.cl.push(quarterOf(ev.w)); if (h.id === "m6") ev.d6 = d; }
      if (spy[e] > 0 && spy[e + h.weeks] > 0) P.exSpy.push(o.ret - (spy[e + h.weeks] / spy[e] - 1));
      if (h.id === "m6") {
        titleSetM6.add(ev.t); weekSet.add(ev.w); quarterSet.add(quarterOf(ev.w));
        const y = WEEKS[ev.w].slice(0, 4); if (!years.has(y)) years.set(y, { r: [], x: [] });
        years.get(y).r.push(o.ret); if (ev.ex6 !== null) years.get(y).x.push(ev.ex6);
      }
    });
    if (e + 52 < W) { closedHorizon++; if (all) completeAll++; }
    const ft = SB.firstTouch(T.out, e, 52);
    if (ft) { touch[ft.first]++; if (ft.first === "UP") touch.wUp.push(ft.weeks); if (ft.first === "DOWN") touch.wDown.push(ft.weeks); }
    const ox = SB.oppositeExit(T.c, e, rule, 52);
    if (ox) { const x = T.out[e], y = T.out[e + ox.weeks]; if (x > 0 && y > 0) { opp.rets.push((y / x) * F - 1); opp.weeks.push(ox.weeks); if (ox.exit === "OPPOSITE_SIGNAL") opp.byOpposite++; } }
    if (k % pathStep === 0 && e + 52 < W && T.out[e] > 0) {
      let peak = T.out[e];
      for (let j = 0; j <= 52; j++) { const v = T.out[e + j]; if (!(v > 0)) continue; path[j].push(v / T.out[e] - 1); if (v > peak) peak = v; ddPath[j].push(v / peak - 1); }
    }
  }

  const horizons = {};
  H.forEach((h, hi) => {
    const P = per[hi], s = SB.summarize(P.rets), base = SB.summarize(basePooled[hi]);
    const mfe = SB.median(P.mfe), mae = SB.median(P.mae);
    const cm = SB.clusterMean(P.hit, P.cl);
    horizons[h.id] = { weeks: h.weeks, label: h.label, ...s,
      base: { n: base.n, positiveShare: base.positiveShare, median: base.median, sampling: "jede 4. Woche je Titel" },
      baseRate: cm ? { matchedPositiveShare: SB.round(s.positiveShare - cm.mean), deltaPositiveShare: cm.mean, ci: cm.ci, clusters: cm.clusters, effectiveN: cm.effectiveN, designEffect: cm.designEffect,
        plain: "Anteil im Plus minus Anteil im Plus aller Titel in derselben Woche (gleicher Horizont), Quartale als Cluster" } : null,
      vsMarket: { n: P.ex.length, medianExcess: SB.round(SB.median(P.ex)), shareAboveMarket: P.ex.length ? SB.round(P.ex.filter((x) => x > 0).length / P.ex.length) : null },
      vsSpy: { n: P.exSpy.length, medianExcess: SB.round(SB.median(P.exSpy)), shareAboveSpy: P.exSpy.length ? SB.round(P.exSpy.filter((x) => x > 0).length / P.exSpy.length) : null },
      maxDrawdown: { median: SB.round(SB.median(P.dd)), p10: SB.round(SB.quantile(Float64Array.from(P.dd).sort(), 0.1)) },
      adverse: { median: SB.round(mae) }, favorable: { median: SB.round(mfe) }, chanceRisk: mae < 0 && mfe !== null ? SB.round(mfe / -mae, 2) : null,
      costSensitivity: Object.fromEntries(Object.entries(SB.COST_SCENARIOS).map(([id, bps]) => [id, { bps, median: SB.round(SB.median(P.gross.map((g) => (1 + g) * costF(bps) - 1))), positiveShare: P.gross.length ? SB.round(P.gross.filter((g) => (1 + g) * costF(bps) - 1 > 0).length / P.gross.length) : null }])) };
  });

  /* Lernen / Pruefen / Testen auf der Base-Rate-Differenz und dem Median-Abstand. */
  const m6 = events.filter((ev) => ev.ex6 !== null);
  const iTrainEnd = WEEKS.findIndex((d) => d >= OOS_SPLIT.trainBefore), iTest = WEEKS.findIndex((d) => d >= OOS_SPLIT.testFrom);
  const part = (lo, hi) => m6.filter((ev) => ev.w >= lo && ev.w + 26 < hi);
  const seg = (list, from, to) => {
    const cm = SB.clusterMean(list.filter((x) => x.d6 !== null).map((x) => x.d6), list.filter((x) => x.d6 !== null).map((x) => quarterOf(x.w)));
    return { from, to, n: list.length, medianExcess: SB.round(SB.median(list.map((x) => x.ex6))), deltaPositiveShare: cm ? cm.mean : null, ci: cm ? cm.ci : null };
  };
  const oos = { statistic: "Median-Abstand zum Marktmedian derselben Woche; daneben Anteil im Plus minus Base Rate (cluster-robust)",
    train: seg(part(0, iTrainEnd), WEEKS[0], OOS_SPLIT.trainBefore), validation: seg(part(iTrainEnd, iTest), OOS_SPLIT.trainBefore, OOS_SPLIT.testFrom), test: seg(m6.filter((ev) => ev.w >= iTest), OOS_SPLIT.testFrom, asOf) };
  const oosPass = oos.test.n >= 100 && oos.train.n >= 100 && sign(oos.train.medianExcess) === sign(oos.test.medianExcess) && sign(oos.train.medianExcess) === sign(oos.validation.medianExcess);
  /* Ein Vorteil, der nur im Lernzeitraum sichtbar ist, zaehlt nicht: im
     Testzeitraum muss das cluster-robuste Intervall der Base-Rate-Differenz
     die Null ausschliessen. */
  const edgeOutOfSample = !!(oos.test.ci && (oos.test.ci[0] > 0 || oos.test.ci[1] < 0) && sign(oos.test.deltaPositiveShare) === sign(oos.train.deltaPositiveShare));

  const sorted = m6.slice().sort((a, b) => a.w - b.w), size = Math.floor(sorted.length / 5), folds = [];
  for (let k = 1; k < 5 && size > 0; k++) {
    const test = sorted.slice(k * size, k === 4 ? sorted.length : (k + 1) * size), start = test[0].w;
    const train = sorted.slice(0, k * size).filter((ev) => ev.w + 26 < start);
    const tr = SB.median(train.map((x) => x.ex6)), te = SB.median(test.map((x) => x.ex6));
    folds.push({ fold: k, from: WEEKS[start], trainN: train.length, testN: test.length, trainMedianExcess: SB.round(tr), testMedianExcess: SB.round(te), agree: sign(tr) === sign(te) });
  }
  const agreeShare = folds.length ? folds.filter((f) => f.agree).length / folds.length : 0;

  /* Parameter-Stabilitaet: Nachbarparameter der Regel und Einstiegsverzug. */
  const neighbours = rule.neighbours.map((p) => {
    const xs = [];
    for (const ev of eventsFor(rule, p)) { const r = netRet(titles[ev.t], ev.w, 1, 26), bm = baseMedian[2][ev.w]; if (r !== null && Number.isFinite(bm)) xs.push(r - bm); }
    return { params: p, n: xs.length, medianExcessM6: SB.round(SB.median(xs)) };
  });
  const entryDelay = [0, 1, 2].map((d) => {
    const xs = [];
    for (const ev of events) { const r = netRet(titles[ev.t], ev.w, d, 26), bm = baseMedian[2][ev.w]; if (r !== null && Number.isFinite(bm)) xs.push(r - bm); }
    return { delayWeeks: d, n: xs.length, medianExcessM6: SB.round(SB.median(xs)) };
  });
  const mainEx = horizons.m6.vsMarket.medianExcess;
  const holdSigns = ["m3", "m6", "m12"].map((k) => sign(horizons[k].vsMarket.medianExcess));
  const stable = neighbours.every((nb) => sign(nb.medianExcessM6) === sign(mainEx)) && entryDelay.every((d) => sign(d.medianExcessM6) === sign(mainEx)) && holdSigns.every((s) => s === sign(mainEx));

  const sample = { n: horizons.m6.n, titles: titleSetM6.size };
  const ind = horizons.m6.baseRate;
  const independencePass = !!ind && ind.clusters >= 40 && SB.clusterMean(per[2].hit, per[2].cl).maxClusterShare <= 0.1;
  const completeness = closedHorizon ? completeAll / closedHorizon : 0;
  const checks = {
    pit: pit.mismatches === 0 && pit.checked > 0 ? { state: "PASS", value: pit.checked + " Fälle mit abgeschnittener und verfälschter Zukunft geprüft, 0 Abweichungen" } : { state: "FAIL", reason: "PIT_MISMATCH", value: pit },
    lookahead: lookaheadViolations === 0 ? { state: "PASS", value: "Einstieg strikt nach der Signalwoche (Schluss der Folgewoche)" } : { state: "FAIL", reason: "ENTRY_NOT_AFTER_SIGNAL", value: lookaheadViolations },
    sample: { state: SB.sampleLevel(sample.n, sample.titles) === "NOT_READY" ? "FAIL" : "PASS", value: sample.n + " Fälle mit 6-Monats-Ergebnis aus " + sample.titles + " Titeln", level: SB.sampleLevel(sample.n, sample.titles) },
    oos: { state: oosPass ? "PASS" : "FAIL", reason: oosPass ? null : "OOS_DIRECTION_NOT_CONFIRMED", value: oos },
    walkForward: { state: agreeShare >= 0.75 ? "PASS" : "FAIL", reason: agreeShare >= 0.75 ? null : "FOLDS_DISAGREE", value: Math.round(agreeShare * folds.length) + " von " + folds.length + " Folds in derselben Richtung" },
    survivorship: { state: "FAIL", reason: "TODAYS_UNIVERSE_ONLY", value: "Nur heute gelistete Titel; " + endedEarly + " Reihen enden früher. Delistete Titel mit sauberer Identität und Historie: 0" },
    returnBasis: returnType === "TOTAL_RETURN" ? { state: "PASS", value: "Gesamtrendite (" + WEEKLY_TOTAL_RETURN_VERSION + ")" } : { state: "FAIL", reason: "TOTAL_RETURN_SERIES_NOT_PUBLISHED", value: "Kursrendite ohne Dividenden" },
    costs: { state: "PASS", value: "BASE " + SB.COST_SCENARIOS.BASE + " bps je Runde; LOW " + SB.COST_SCENARIOS.LOW + ", HIGH " + SB.COST_SCENARIOS.HIGH + " gemessen" },
    slippage: { state: "PASS", value: SB.FRICTIONS.slippageBps + " bps je Runde (in BASE enthalten)" },
    benchmark: { state: "PASS", value: "Base Rate derselben Woche und SPY über dasselbe Fenster, beide passiv" },
    regimeDiversity: { state: "FAIL", reason: "REGIME_HISTORY_NOT_CERTIFIED", value: "Die Regime-Historie der Market-Regime-Engine ist nicht zertifiziert; keine eigene Ersatz-Einteilung" },
    independence: { state: independencePass ? "PASS" : "FAIL", reason: independencePass ? null : "CLUSTERED_SAMPLE",
      value: ind ? weekSet.size + " Wochen, " + ind.clusters + " Quartale, effektiv ≈ " + (ind.effectiveN ?? "–") + " unabhängige Fälle" : "–" },
    parameterStability: { state: stable ? "PASS" : "FAIL", reason: stable ? null : "NEIGHBOURS_DISAGREE",
      value: neighbours.map((nb) => nb.params.weeks + " Wochen").concat(entryDelay.map((d) => "Verzug " + d.delayWeeks)).join(", ") + ": gleiche Richtung " + (stable ? "ja" : "nein") },
    completeness: { state: completeness >= 0.95 ? "PASS" : "FAIL", reason: completeness >= 0.95 ? null : "OUTCOMES_INCOMPLETE", value: SB.round(completeness, 3) + " der abgeschlossenen Fälle mit allen vier Zeiträumen" }
  };
  const trust = SB.trustState(checks, sample);
  const pathOut = { weeks: [], median: [], p25: [], p75: [], baseMedian: [], drawdownMedian: [] };
  for (let j = 0; j <= 52; j++) {
    const s = Float64Array.from(path[j]).sort(), d = Float64Array.from(ddPath[j]).sort(), b = Float64Array.from(basePath[j]).sort();
    pathOut.weeks.push(j); pathOut.median.push(SB.round(SB.quantile(s, 0.5))); pathOut.p25.push(SB.round(SB.quantile(s, 0.25))); pathOut.p75.push(SB.round(SB.quantile(s, 0.75)));
    pathOut.baseMedian.push(SB.round(SB.quantile(b, 0.5))); pathOut.drawdownMedian.push(SB.round(SB.quantile(d, 0.5)));
  }
  pathOut.sampled = { events: path[0].length, step: pathStep };
  const firstW = events.length ? Math.min(...events.map((e) => e.w)) : null, lastW = events.length ? Math.max(...events.map((e) => e.w)) : null;
  const n6 = opp.rets.length, m = horizons.m6;
  return {
    id: rule.id, version: rule.version, family: rule.family, plain: rule.plain, dailyDefinition: rule.dailyDefinition, params: rule.params, opposite: rule.opposite,
    returnType, grain: "WEEKLY", semantics: { version: SB.SEMANTICS.version, entry: "NEXT_CLOSE", exit: "TIME_EXIT", cooldownWeeks: SB.COOLDOWN_WEEKS, frictionsBps: SB.COST_SCENARIOS.BASE },
    occurrences: events.length, titles: new Set(events.map((e) => e.t)).size, firstEvent: firstW !== null ? WEEKS[firstW] : null, lastEvent: lastW !== null ? WEEKS[lastW] : null,
    independence: { uniqueTitles: titleSetM6.size, uniquePeriods: weekSet.size, independentClusters: quarterSet.size, clusterUnit: "Quartal", effectiveN: ind ? ind.effectiveN : null, designEffect: ind ? ind.designEffect : null },
    horizons,
    edgeOutOfSample,
    timeToOutcome: { threshold: SB.TOUCH_THRESHOLD, n: touch.UP + touch.DOWN + touch.NONE, upFirstShare: SB.round(touch.UP / Math.max(1, touch.UP + touch.DOWN + touch.NONE)),
      downFirstShare: SB.round(touch.DOWN / Math.max(1, touch.UP + touch.DOWN + touch.NONE)), noneShare: SB.round(touch.NONE / Math.max(1, touch.UP + touch.DOWN + touch.NONE)),
      medianWeeksUp: SB.median(touch.wUp), medianWeeksDown: SB.median(touch.wDown) },
    oppositeExit: rule.opposite ? { n: n6, median: SB.round(SB.median(opp.rets)), positiveShare: n6 ? SB.round(opp.rets.filter((v) => v > 0).length / n6) : null,
      medianHoldingWeeks: SB.median(opp.weeks), shareEndedByOpposite: n6 ? SB.round(opp.byOpposite / n6) : null, maxWeeks: 52 } : { state: "NOT_DEFINED_BY_CONTRACT", reason: "NO_OPPOSITE_SIGNAL" },
    distribution: { horizon: "m6", events: SB.histogram(per[2].rets), base: SB.histogram(basePooled[2]) },
    path: pathOut,
    rolling: [...years.entries()].sort().map(([y, v]) => ({ year: y, n: v.r.length, median: SB.round(SB.median(v.r)), positiveShare: SB.round(v.r.filter((x) => x > 0).length / v.r.length), medianExcess: SB.round(SB.median(v.x)) })),
    oos, walkForward: { folds, agreeShare: SB.round(agreeShare) }, parameterStability: { main: { params: rule.params, medianExcessM6: mainEx }, neighbours, entryDelay, holdingSigns: holdSigns },
    checks, sample, trust, trustLabel: SB.TRUST_LABEL[trust], trustReasons: SB.trustReasons(checks),
    display: { allowed: SB.displayAllowed(trust), sentence: SB.observedSentence(m.n), caveats: SB.trustReasons(checks).map((r) => r.label) },
    card: { n: m.n, positiveShare: m.positiveShare, median: m.median, typicalDrawdown: m.maxDrawdown.median, chanceRisk: m.chanceRisk, medianExcess: m.vsMarket.medianExcess,
      basePositiveShare: m.baseRate ? m.baseRate.matchedPositiveShare : null, deltaPositiveShare: m.baseRate ? m.baseRate.deltaPositiveShare : null, deltaCi: m.baseRate ? m.baseRate.ci : null,
      effectiveN: m.baseRate ? m.baseRate.effectiveN : null, trust, horizon: "m6", returnType }
  };
}

const rules = [];
for (const rule of SB.RULES) {
  const r = study(rule);
  rules.push(r);
  const m = r.horizons.m6;
  console.log(rule.id.padEnd(22), "n", r.sample.n, "pos", m.positiveShare, "base", m.baseRate && m.baseRate.matchedPositiveShare, "Δ", m.baseRate && m.baseRate.deltaPositiveShare, "ci", JSON.stringify(m.baseRate && m.baseRate.ci),
    "effN", r.independence.effectiveN, "edgeOOS", r.edgeOutOfSample, "trust", r.trust, "fails", r.trustReasons.map((x) => x.id).join(","), secs());
}

const COLLECTING = {
  RISK_RISING: { source: "factor-evidence-history", unit: "Faktor-Snapshots" }, FACTOR_CHANGED: { source: "factor-evidence-history", unit: "Faktor-Snapshots" },
  SETUP_NEW: { source: "setup-observation-history", unit: "Setup-Stände" }, SETUP_CONFIRMED: { source: "setup-observation-history", unit: "Setup-Stände" }, SETUP_WEAKENED: { source: "setup-observation-history", unit: "Setup-Stände" },
  STRATEGY_MATCH_NEW: { source: "strategy-index-v1 historicalEvidence", unit: "Strategie-Stände" }, STRATEGY_MATCH_LOST: { source: "strategy-index-v1 historicalEvidence", unit: "Strategie-Stände" },
  PATTERN_MATCH_NEW: { source: "radar-history/pattern-holds", unit: "Muster-Stände" }
};
const out = {
  schemaVersion: SB.STUDY_SCHEMA, engineVersion: SB.VERSION, generatedAt: new Date().toISOString(), asOf,
  source: { detection: "quant/data/market/discover-series-long (Wochenschluss, splitbereinigt)", outcome: returnType === "TOTAL_RETURN" ? "kanonische Tageshistorie → " + WEEKLY_TOTAL_RETURN_VERSION + " (nur zur Laufzeit)" : "Wochenschluss, splitbereinigt",
    grain: "WEEKLY", titles: titles.length, weeks: W, from: WEEKS[0], to: asOf, totalReturnCoverage: trCoverage,
    benchmark: returnType === "TOTAL_RETURN" ? "SPY Gesamtrendite (kanonische Historie)" : "quant/data/market/multi-asset/series/SPY.json (split-bereinigt, Kurs)" },
  returnType, requiredReturnType: SB.REQUIRED_RETURN_TYPE,
  returnTypeNote: returnType === "TOTAL_RETURN" ? "Gesamtrendite inklusive Dividenden aus der bestätigten Tagesreihe." : "Kursrendite ohne Dividenden. Die Pipeline rechnet mit Gesamtrendite, sobald sie die kanonische Historie bereitstellt.",
  semantics: SB.SEMANTICS, horizons: SB.HORIZONS, frictions: SB.FRICTIONS, costScenarios: SB.COST_SCENARIOS, cooldownWeeks: SB.COOLDOWN_WEEKS, warmupWeeks: SB.WARMUP_WEEKS,
  oosSplit: OOS_SPLIT, trustRule: SB.TRUST_RULE, trustChecks: SB.TRUST_CHECKS,
  regime: { used: false, reason: "REGIME_HISTORY_NOT_CERTIFIED" },
  survivorship: { state: "NOT_CONTROLLED", endedBeforeAsOf: endedEarly, titles: titles.length,
    plain: "Das Universum besteht aus heute gelisteten Aktien. Später delistete Titel fehlen; das macht Ergebnisse eher zu günstig. Die Base Rate derselben Woche trägt denselben Fehler und dämpft ihn im Abstand." },
  rules,
  withoutHistory: Object.entries(SB.WITHOUT_HISTORY).map(([eventType, reason]) => ({ eventType, reason, trust: "NOT_READY", status: COLLECTING[eventType] ? "COLLECTING_HISTORY" : "WITHHELD", collecting: COLLECTING[eventType] || null })),
  noOptimization: "Alle Regeln und Parameter stehen vor dem Lauf fest. Nachbarparameter und Einstiegsverzug werden nur gemessen, nie ausgewählt."
};
const errors = SB.studyViolations(out);
if (errors.length) { console.error(errors); process.exit(1); }
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log("wrote", OUT, (JSON.stringify(out).length / 1024).toFixed(0) + " KB", secs());
