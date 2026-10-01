#!/usr/bin/env node
/* =========================================================================
   SIGNAL BACKTEST - historische Evidenz je Radar-Signal (Wochenraster).

   Liest:
     quant/data/market/discover-series-long/<securityId>.json   Wochenschluss, splitbereinigt
     quant/data/market/multi-asset/series/SPY.json               SPY taeglich, splitbereinigt
   Schreibt:
     quant/data/product/signal-backtest-v1.json

   Jede Regel kommt aus quant/engines/signal-backtest.js (versioniert, vor
   dem Lauf festgelegt). Dieses Skript rechnet nur, prueft PIT und
   Look-ahead an echten Faellen und vergibt die Vertrauensstufe nach der
   festen Regel der Engine. Es optimiert nichts.
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SB = require(join(ROOT, "quant/engines/signal-backtest.js"));
const OUT = join(ROOT, "quant/data/product/signal-backtest-v1.json");
const LONG = join(ROOT, "quant/data/market/discover-series-long");

const t0 = Date.now();
const DAY = 86400000;
/* Wochenschluss -> Freitag derselben Kalenderwoche (Feiertage verschieben
   den letzten Handelstag, nicht die Woche). */
function weekKey(date) {
  const d = new Date(date + "T00:00:00Z"), dow = d.getUTCDay();
  return new Date(d.getTime() + ((5 - dow + 7) % 7 - (dow === 6 ? 7 : 0)) * DAY).toISOString().slice(0, 10);
}

/* 1. Wochenraster ueber alle Titel. */
const files = readdirSync(LONG).filter((f) => f.endsWith(".json") && f !== "index.json").sort();
const raw = [];
const keys = new Set();
for (const f of files) {
  const j = JSON.parse(readFileSync(join(LONG, f), "utf8"));
  if (j.priceSeriesType !== "SPLIT_ADJUSTED" || !Array.isArray(j.points)) throw Error("UNEXPECTED_SERIES " + f);
  const pts = j.points.map(([d, v]) => [weekKey(d), v]);
  for (const [k] of pts) keys.add(k);
  raw.push({ securityId: j.securityId, ticker: j.ticker, to: j.to, pts });
}
const WEEKS = [...keys].sort();
const W = WEEKS.length, IDX = new Map(WEEKS.map((k, i) => [k, i]));
const titles = raw.map((r) => {
  const c = new Float64Array(W).fill(NaN);
  for (const [k, v] of r.pts) c[IDX.get(k)] = v;
  let first = 0; while (first < W && !(c[first] > 0)) first++;
  return { securityId: r.securityId, ticker: r.ticker, to: r.to, c, first };
});
raw.length = 0;
const asOf = WEEKS[W - 1];
console.log("titles", titles.length, "weeks", W, WEEKS[0], "→", asOf, ((Date.now() - t0) / 1000).toFixed(1) + "s");

/* 2. SPY auf dasselbe Raster: letzter Tagesschluss der Woche. */
const spyDaily = JSON.parse(readFileSync(join(ROOT, "quant/data/market/multi-asset/series/SPY.json"), "utf8"));
if (!/split-bereinigt/.test(spyDaily.seriesTitle || "")) throw Error("SPY_SERIES_NOT_SPLIT_ADJUSTED");
const spy = new Float64Array(W).fill(NaN);
for (const [d, v] of spyDaily.points) { const i = IDX.get(weekKey(d)); if (i !== undefined && v > 0) spy[i] = v; }

/* 3. Marktphase je Woche aus SPY. */
const regime = WEEKS.map((_, i) => {
  const r = SB.retOver(spy, i, SB.REGIME.weeks);
  return r === null ? null : r > SB.REGIME.band ? "UP" : r < -SB.REGIME.band ? "DOWN" : "SIDEWAYS";
});

/* 4. Marktbasis: fuer jede Signalwoche w der Median aller Titel mit
   Einstieg w+1 ueber h Wochen (dieselbe Reibung). */
const F = SB.frictionFactor();
const H = SB.HORIZONS;
const baseMedian = H.map(() => new Float64Array(W).fill(NaN));
const basePooled = H.map(() => []);
const baseDd = [];
for (let w = 0; w < W - 1; w++) {
  const e = w + 1;
  H.forEach((h, hi) => {
    if (e + h.weeks >= W) return;
    const vals = [];
    for (let t = 0; t < titles.length; t++) {
      const T = titles[t];
      if (w - T.first < SB.WARMUP_WEEKS) continue;
      const a = T.c[e], b = T.c[e + h.weeks];
      if (a > 0 && b > 0) {
        const r = (b / a) * F - 1; vals.push(r);
        if ((w + t) % 4 === 0) basePooled[hi].push(r);
      }
    }
    if (vals.length >= 30) baseMedian[hi][w] = SB.median(vals);
  });
}
/* typischer Rueckgang der Basis (6 Monate), Stichprobe jede 26. Woche je Titel */
const basePath = Array.from({ length: 53 }, () => []);
for (let t = 0; t < titles.length; t++) {
  const T = titles[t];
  for (let w = T.first + SB.WARMUP_WEEKS + (t % 26); w + 1 + 52 < W; w += 26) {
    const o = SB.outcome(T.c, w + 1, 26); if (o) baseDd.push(o.maxDrawdown);
    if ((w + t) % 52 < 26 && T.c[w + 1] > 0) for (let k = 0; k <= 52; k++) { const v = T.c[w + 1 + k]; if (v > 0) basePath[k].push(v / T.c[w + 1] - 1); }
  }
}
console.log("base done", ((Date.now() - t0) / 1000).toFixed(1) + "s");

/* Survivorship gemessen: wie viele Reihen enden deutlich vor dem Stichtag? */
const endedEarly = titles.filter((T) => { let last = W - 1; while (last >= 0 && !(T.c[last] > 0)) last--; return last < W - 27; }).length;

const sign = (x) => (x === null || !Number.isFinite(x) ? null : Math.abs(x) < 0.0025 ? 0 : x > 0 ? 1 : -1);
const yearOf = (w) => WEEKS[w].slice(0, 4);
const OOS_SPLIT = { trainBefore: "2010-01-01", testFrom: "2018-01-01" };

function eventsFor(rule, params) {
  const out = [];
  for (let t = 0; t < titles.length; t++) {
    const T = titles[t];
    for (const w of SB.detectEvents(T.c, rule, params)) if (w - T.first >= SB.WARMUP_WEEKS && w + 1 < W) out.push({ t, w });
  }
  return out;
}
function excessM6(list) { return list.map((ev) => ev.ex6).filter((v) => v !== null); }

/* PIT-Nachweis an echten Faellen: dasselbe Signal muss auch dann feuern,
   wenn die Reihe nach w abgeschnitten oder die Zukunft verfaelscht ist. */
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
  let lookaheadViolations = 0;
  const per = H.map(() => ({ rets: [], ex: [], exSpy: [], dd: [], mae: [], mfe: [] }));
  const touch = { UP: 0, DOWN: 0, NONE: 0, wUp: [], wDown: [] };
  const opp = { rets: [], weeks: [], byOpposite: 0 };
  const pathStep = Math.max(1, Math.ceil(events.length / 40000));
  const path = Array.from({ length: 53 }, () => []), ddPath = Array.from({ length: 53 }, () => []);
  const regimes = { UP: [], DOWN: [], SIDEWAYS: [] };
  const years = new Map();
  let closedHorizon = 0, completeAll = 0;
  const titleSet = new Set(), titleSetM6 = new Set();
  events.forEach((ev, k) => {
    const T = titles[ev.t], e = ev.w + 1;
    if (e <= ev.w) lookaheadViolations++;
    titleSet.add(ev.t);
    ev.ex6 = null;
    let all = true;
    H.forEach((h, hi) => {
      const o = SB.outcome(T.c, e, h.weeks);
      if (!o) { all = false; return; }
      const P = per[hi];
      P.rets.push(o.ret); P.dd.push(o.maxDrawdown); P.mae.push(o.mae); P.mfe.push(o.mfe);
      const bm = baseMedian[hi][ev.w];
      if (Number.isFinite(bm)) { P.ex.push(o.ret - bm); if (h.id === "m6") ev.ex6 = o.ret - bm; }
      if (spy[e] > 0 && spy[e + h.weeks] > 0) P.exSpy.push(o.ret - ((spy[e + h.weeks] / spy[e]) * F - 1));
      if (h.id === "m6") {
        titleSetM6.add(ev.t);
        const rg = regime[ev.w]; if (rg) regimes[rg].push({ r: o.ret, x: ev.ex6 });
        const y = yearOf(ev.w); if (!years.has(y)) years.set(y, { r: [], x: [] });
        years.get(y).r.push(o.ret); if (ev.ex6 !== null) years.get(y).x.push(ev.ex6);
      }
    });
    if (e + 52 < W) { closedHorizon++; if (all) completeAll++; }
    const ft = SB.firstTouch(T.c, e, 52);
    if (ft) { touch[ft.first]++; if (ft.first === "UP") touch.wUp.push(ft.weeks); if (ft.first === "DOWN") touch.wDown.push(ft.weeks); }
    const ox = SB.oppositeExit(T.c, e, rule, 52);
    if (ox) { opp.rets.push(ox.ret); opp.weeks.push(ox.weeks); if (ox.exit === "OPPOSITE_SIGNAL") opp.byOpposite++; }
    if (k % pathStep === 0 && e + 52 < W && T.c[e] > 0) {
      let peak = T.c[e];
      for (let j = 0; j <= 52; j++) {
        const v = T.c[e + j]; if (!(v > 0)) continue;
        path[j].push(v / T.c[e] - 1); if (v > peak) peak = v; ddPath[j].push(v / peak - 1);
      }
    }
  });

  const horizons = {};
  H.forEach((h, hi) => {
    const P = per[hi], s = SB.summarize(P.rets);
    const base = SB.summarize(basePooled[hi]);
    const mfe = SB.median(P.mfe), mae = SB.median(P.mae);
    horizons[h.id] = {
      weeks: h.weeks, label: h.label, ...s,
      base: { n: base.n, positiveShare: base.positiveShare, median: base.median, sampling: "jede 4. Woche je Titel" },
      vsMarket: { n: P.ex.length, medianExcess: SB.round(SB.median(P.ex)), shareAboveMarket: P.ex.length ? SB.round(P.ex.filter((x) => x > 0).length / P.ex.length) : null },
      vsSpy: { n: P.exSpy.length, medianExcess: SB.round(SB.median(P.exSpy)), shareAboveSpy: P.exSpy.length ? SB.round(P.exSpy.filter((x) => x > 0).length / P.exSpy.length) : null },
      maxDrawdown: { median: SB.round(SB.median(P.dd)), p10: SB.round(SB.quantile(Float64Array.from(P.dd).sort(), 0.1)) },
      adverse: { median: SB.round(mae) }, favorable: { median: SB.round(mfe) },
      chanceRisk: mae < 0 && mfe !== null ? SB.round(mfe / -mae, 2) : null
    };
  });

  /* Out-of-Sample: feste Zeitabschnitte, gereinigt um laufende Ergebnisse. */
  const m6 = events.filter((ev) => ev.ex6 !== null);
  const iTrainEnd = WEEKS.findIndex((d) => d >= OOS_SPLIT.trainBefore), iTest = WEEKS.findIndex((d) => d >= OOS_SPLIT.testFrom);
  const part = (lo, hi) => m6.filter((ev) => ev.w >= lo && ev.w + 26 < hi);
  const seg = (list, from, to) => ({ from, to, n: list.length, medianExcess: SB.round(SB.median(excessM6(list))) });
  const oos = {
    statistic: "Median der 6-Monats-Rendite über dem Marktmedian derselben Woche",
    train: seg(part(0, iTrainEnd), WEEKS[0], OOS_SPLIT.trainBefore),
    validation: seg(part(iTrainEnd, iTest), OOS_SPLIT.trainBefore, OOS_SPLIT.testFrom),
    test: seg(m6.filter((ev) => ev.w >= iTest), OOS_SPLIT.testFrom, asOf)
  };
  const oosPass = oos.test.n >= 100 && oos.train.n >= 100 && sign(oos.train.medianExcess) === sign(oos.test.medianExcess) && sign(oos.train.medianExcess) === sign(oos.validation.medianExcess);

  /* Walk-forward: fuenf zeitliche Bloecke, Training nur aus der Vergangenheit. */
  const sorted = m6.slice().sort((a, b) => a.w - b.w), size = Math.floor(sorted.length / 5), folds = [];
  for (let k = 1; k < 5 && size > 0; k++) {
    const test = sorted.slice(k * size, k === 4 ? sorted.length : (k + 1) * size), start = test[0].w;
    const train = sorted.slice(0, k * size).filter((ev) => ev.w + 26 < start);
    const tr = SB.median(excessM6(train)), te = SB.median(excessM6(test));
    folds.push({ fold: k, from: WEEKS[start], trainN: train.length, testN: test.length, trainMedianExcess: SB.round(tr), testMedianExcess: SB.round(te), agree: sign(tr) === sign(te) });
  }
  const agreeShare = folds.length ? folds.filter((f) => f.agree).length / folds.length : 0;

  /* Parameter-Stabilitaet: dieselbe Regel mit Nachbarparametern. */
  const neighbours = rule.neighbours.map((p) => {
    const evs = eventsFor(rule, p), xs = [];
    for (const ev of evs) { const o = SB.outcome(titles[ev.t].c, ev.w + 1, 26), bm = baseMedian[2][ev.w]; if (o && Number.isFinite(bm)) xs.push(o.ret - bm); }
    return { params: p, n: xs.length, medianExcessM6: SB.round(SB.median(xs)) };
  });
  const mainEx = horizons.m6.vsMarket.medianExcess;
  const stable = neighbours.every((nb) => sign(nb.medianExcessM6) === sign(mainEx));

  const regimeOut = {};
  for (const [k, list] of Object.entries(regimes)) {
    const r = list.map((x) => x.r), x = list.map((y) => y.x).filter((v) => v !== null);
    regimeOut[k] = { n: list.length, positiveShare: r.length ? SB.round(r.filter((v) => v > 0).length / r.length) : null, median: SB.round(SB.median(r)), medianExcess: SB.round(SB.median(x)) };
  }
  const regimePass = Object.values(regimeOut).every((r) => r.n >= 30);

  const sample = { n: horizons.m6.n, titles: titleSetM6.size };
  const completeness = closedHorizon ? completeAll / closedHorizon : 0;
  const checks = {
    pit: pit.mismatches === 0 && pit.checked > 0 ? { state: "PASS", value: pit.checked + " Fälle mit abgeschnittener und verfälschter Zukunft geprüft, 0 Abweichungen" } : { state: "FAIL", reason: "PIT_MISMATCH", value: pit },
    lookahead: lookaheadViolations === 0 ? { state: "PASS", value: "Einstieg strikt nach der Signalwoche (Schluss der Folgewoche)" } : { state: "FAIL", reason: "ENTRY_NOT_AFTER_SIGNAL", value: lookaheadViolations },
    sample: { state: SB.sampleLevel(sample.n, sample.titles) === "NOT_READY" ? "FAIL" : "PASS", value: sample.n + " Fälle mit 6-Monats-Ergebnis aus " + sample.titles + " Titeln", level: SB.sampleLevel(sample.n, sample.titles) },
    oos: { state: oosPass ? "PASS" : "FAIL", reason: oosPass ? null : "OOS_DIRECTION_NOT_CONFIRMED", value: oos },
    walkForward: { state: agreeShare >= 0.75 ? "PASS" : "FAIL", reason: agreeShare >= 0.75 ? null : "FOLDS_DISAGREE", value: Math.round(agreeShare * folds.length) + " von " + folds.length + " Folds in derselben Richtung" },
    /* Eine Kontrolle verlangt delistete Titel im Universum. Ein paar frueh
       endende Reihen sind noch keine. */
    survivorship: { state: "FAIL", reason: "TODAYS_UNIVERSE_ONLY",
      value: endedEarly + " von " + titles.length + " Reihen enden vor dem Stichtag; delistete Titel fehlen, Ergebnisse eher zu günstig" },
    returnBasis: { state: "FAIL", reason: "TOTAL_RETURN_SERIES_NOT_PUBLISHED", value: "Kursrendite ohne Dividenden" },
    costs: { state: "PASS", value: SB.FRICTIONS.roundTripBps + " bps je Runde" },
    slippage: { state: "PASS", value: SB.FRICTIONS.slippageBps + " bps je Runde" },
    benchmark: { state: "PASS", value: "Marktmedian derselben Woche und SPY-Kurs über dasselbe Fenster" },
    regimeDiversity: { state: regimePass ? "PASS" : "FAIL", reason: regimePass ? null : "REGIME_UNDERSAMPLED", value: Object.entries(regimeOut).map(([k, r]) => k + " " + r.n).join(", ") },
    parameterStability: { state: stable ? "PASS" : "FAIL", reason: stable ? null : "NEIGHBOURS_DISAGREE", value: neighbours.map((nb) => nb.params.weeks + " Wochen: " + (nb.medianExcessM6 === null ? "–" : (nb.medianExcessM6 * 100).toFixed(1).replace(".", ",") + " %")).join("; ") },
    completeness: { state: completeness >= 0.95 ? "PASS" : "FAIL", reason: completeness >= 0.95 ? null : "OUTCOMES_INCOMPLETE", value: SB.round(completeness, 3) + " der abgeschlossenen Fälle mit allen vier Zeiträumen" }
  };
  const trust = SB.trustState(checks, sample);
  const caveats = SB.trustReasons(checks).map((r) => r.label);
  const m = horizons.m6;
  const pathOut = { weeks: [], median: [], p25: [], p75: [], baseMedian: [], drawdownMedian: [] };
  for (let j = 0; j <= 52; j++) {
    const s = Float64Array.from(path[j]).sort(), d = Float64Array.from(ddPath[j]).sort(), b = Float64Array.from(basePath[j]).sort();
    pathOut.weeks.push(j); pathOut.median.push(SB.round(SB.quantile(s, 0.5))); pathOut.p25.push(SB.round(SB.quantile(s, 0.25))); pathOut.p75.push(SB.round(SB.quantile(s, 0.75)));
    pathOut.baseMedian.push(SB.round(SB.quantile(b, 0.5))); pathOut.drawdownMedian.push(SB.round(SB.quantile(d, 0.5)));
  }
  pathOut.sampled = { events: path[0].length, step: pathStep };
  const firstW = events.length ? Math.min(...events.map((e) => e.w)) : null, lastW = events.length ? Math.max(...events.map((e) => e.w)) : null;
  const n6 = opp.rets.length;
  return {
    id: rule.id, version: rule.version, family: rule.family, plain: rule.plain, dailyDefinition: rule.dailyDefinition, params: rule.params, opposite: rule.opposite,
    returnType: SB.RETURN_TYPE, grain: "WEEKLY", semantics: { version: SB.SEMANTICS.version, entry: "NEXT_CLOSE", exit: "TIME_EXIT", cooldownWeeks: SB.COOLDOWN_WEEKS, frictionsBps: SB.FRICTIONS.roundTripBps + SB.FRICTIONS.slippageBps },
    occurrences: events.length, titles: titleSet.size, firstEvent: firstW !== null ? WEEKS[firstW] : null, lastEvent: lastW !== null ? WEEKS[lastW] : null,
    horizons,
    timeToOutcome: { threshold: SB.TOUCH_THRESHOLD, n: touch.UP + touch.DOWN + touch.NONE, upFirstShare: SB.round(touch.UP / Math.max(1, touch.UP + touch.DOWN + touch.NONE)),
      downFirstShare: SB.round(touch.DOWN / Math.max(1, touch.UP + touch.DOWN + touch.NONE)), noneShare: SB.round(touch.NONE / Math.max(1, touch.UP + touch.DOWN + touch.NONE)),
      medianWeeksUp: SB.median(touch.wUp), medianWeeksDown: SB.median(touch.wDown) },
    oppositeExit: rule.opposite ? { n: n6, median: SB.round(SB.median(opp.rets)), positiveShare: n6 ? SB.round(opp.rets.filter((v) => v > 0).length / n6) : null,
      medianHoldingWeeks: SB.median(opp.weeks), shareEndedByOpposite: n6 ? SB.round(opp.byOpposite / n6) : null, maxWeeks: 52 } : { state: "NOT_DEFINED_BY_CONTRACT", reason: "NO_OPPOSITE_SIGNAL" },
    distribution: { horizon: "m6", events: SB.histogram(per[2].rets), base: SB.histogram(basePooled[2]) },
    path: pathOut,
    rolling: [...years.entries()].sort().map(([y, v]) => ({ year: y, n: v.r.length, median: SB.round(SB.median(v.r)), positiveShare: SB.round(v.r.filter((x) => x > 0).length / v.r.length), medianExcess: SB.round(SB.median(v.x)) })),
    regimes: regimeOut, oos, walkForward: { folds, agreeShare: SB.round(agreeShare) }, parameterStability: { main: { params: rule.params, medianExcessM6: mainEx }, neighbours },
    checks, sample, trust, trustLabel: SB.TRUST_LABEL[trust], trustReasons: SB.trustReasons(checks),
    display: { allowed: SB.displayAllowed(trust), sentence: SB.observedSentence(m.n), caveats },
    card: { n: m.n, positiveShare: m.positiveShare, median: m.median, typicalDrawdown: m.maxDrawdown.median, chanceRisk: m.chanceRisk, medianExcess: m.vsMarket.medianExcess, trust, horizon: "m6" }
  };
}

const rules = [];
for (const rule of SB.RULES) {
  const r = study(rule);
  rules.push(r);
  console.log(rule.id.padEnd(22), "occ", r.occurrences, "m6 n", r.sample.n, "pos", r.horizons.m6.positiveShare, "med", r.horizons.m6.median, "ex", r.horizons.m6.vsMarket.medianExcess,
    "trust", r.trust, "fails", r.trustReasons.map((x) => x.id).join(","), ((Date.now() - t0) / 1000).toFixed(1) + "s");
}

const out = {
  schemaVersion: SB.STUDY_SCHEMA, engineVersion: SB.VERSION, generatedAt: new Date().toISOString(), asOf,
  source: { series: "quant/data/market/discover-series-long", grain: "WEEKLY", priceSeriesType: "SPLIT_ADJUSTED", titles: titles.length, weeks: W, from: WEEKS[0], to: asOf,
    benchmark: "quant/data/market/multi-asset/series/SPY.json (split-bereinigt, Kurs)" },
  returnType: SB.RETURN_TYPE, requiredReturnType: SB.REQUIRED_RETURN_TYPE,
  returnTypeNote: "Kursrendite ohne Dividenden. Ein Backtest verlangt laut return-semantics-v1 die Gesamtrendite; deshalb bleibt die Vertrauensstufe höchstens eingeschränkt.",
  semantics: SB.SEMANTICS, regime: SB.REGIME, horizons: SB.HORIZONS, frictions: SB.FRICTIONS, cooldownWeeks: SB.COOLDOWN_WEEKS, warmupWeeks: SB.WARMUP_WEEKS,
  oosSplit: OOS_SPLIT, trustRule: SB.TRUST_RULE, trustChecks: SB.TRUST_CHECKS,
  survivorship: { state: endedEarly > 0 ? "PARTIAL" : "NOT_CONTROLLED", endedBeforeAsOf: endedEarly, titles: titles.length,
    plain: "Das Universum besteht aus heute gelisteten Aktien. Später delistete Titel fehlen; das macht Ergebnisse eher zu günstig. Der Vergleich mit dem Marktmedian derselben Woche trägt denselben Fehler und dämpft ihn im Abstand." },
  rules,
  withoutHistory: Object.entries(SB.WITHOUT_HISTORY).map(([eventType, reason]) => ({ eventType, reason, trust: "NOT_READY" })),
  noOptimization: "Alle Regeln und Parameter stehen vor dem Lauf fest. Nachbarparameter werden nur gemessen, nie ausgewählt."
};
const errors = SB.studyViolations(out);
if (errors.length) { console.error(errors); process.exit(1); }
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log("wrote", OUT, (JSON.stringify(out).length / 1024).toFixed(0) + " KB", ((Date.now() - t0) / 1000).toFixed(1) + "s");
