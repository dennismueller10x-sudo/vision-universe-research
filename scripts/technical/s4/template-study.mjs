#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE TECHNICAL — scripts/technical/s4/template-study.mjs
   S4: HISTORISCHE TESTS DER STRATEGIE-VORLAGEN (Forschung, nicht zertifiziert)

   Keine zweite Backtest-Engine. Wiederverwendet werden:
     Population     scripts/quant/research/research-population.cjs (Profil PRODUCT_DEFAULT:
                    konditionale Ueberlebenden-Kohorte, Wochenschluesse split-bereinigt, Frame-Regel V10)
     Ausfuehrung    quant/engines/research-studies.cjs#runEventStudy (Einstieg am naechsten beobachteten
                    Wochenschluss NACH dem Signal, Kosten je Seite, SPY-Benchmark, Zensierung, PIT-Pruefungen)
     Inferenz       research-studies.cjs#inference (zweifach geclustert: Woche x Emittent)
     Mehrfachtests  research-validation.cjs#holm
     Walk-Forward   research-validation.cjs#buildWalkForward + #aggregateOos (feste Regel, kein Fitten)
     Marktphasen    research-studies.cjs#classifyRegimes + #analyzeRegimes (SPY, PIT)
     Benchmark      quant/engines/weekly-benchmark.cjs (SPY, verifizierter Kursrendite-Vertrag)
   Neu ist nur die Uebersetzung der Vorlagen in WOCHEN-NAEHERUNGEN (RULES, vor dem ersten Lauf eingefroren)
   und die Ereignisbildung (Wechsel "nicht erfuellt" -> "erfuellt").

   Grenzen (im Ergebnis als limitations): nur Schlusskurse je Woche (keine Hoch/Tief/Volumen -> Formationen,
   Ausbruch, Dreiecke, Flaggen, Kontraktion, ADX nicht testbar), Ueberlebenden-Kohorte (keine Delistings,
   keine historische Indexmitgliedschaft), Kursrendite (keine Dividenden), Kosten 5+5 bp (Sensitivitaet 30+30).

   Schreibt nur --out (JSON). Verweigert Ziele unter generierten Datenordnern.
     node scripts/technical/s4/template-study.mjs --out FILE [--as-of 2026-10-23] [--limit N]
   ========================================================================= */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const P = require(join(ROOT, "scripts/quant/research/research-population.cjs"));
const S = require(join(ROOT, "quant/engines/research-studies.cjs"));
const V = require(join(ROOT, "quant/engines/research-validation.cjs"));
const B = require(join(ROOT, "quant/engines/weekly-benchmark.cjs"));

export const STUDY_VERSION = "technical-s4-template-study-1.0.0";
export const REGISTERED_AT = "2026-10-30T21:30:00Z";
export const HORIZONS = [4, 13, 26, 52];
export const COSTS = { BASE: { feeBps: 5, slippageBps: 5 }, HIGH: { feeBps: 15, slippageBps: 15 } };
export const SPLIT_DATE = "2016-01-01";
const DAY_END = "T23:59:59.999Z";
const MAX_BARS_PER_RUN = 1800000;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");

/* ---------------------------------------------------------------------------
   Wochen-Naeherungen der Vorlagen (technical/engine/templates.js). Eingefroren: Aenderungen nur mit neuer
   STUDY_VERSION. Tageslinien -> Wochenlinien gleicher Kalenderspanne (SMA 50/150/200 Tage ~ 10/30/40 Wochen),
   52-Wochen-Hoch/-Tief aus Wochenschluessen (statt Tageshoch/-tief), RS = 26-Wochen-Rendite.
   ------------------------------------------------------------------------- */
export const RULES = Object.freeze([
  { id: "establishedUptrend", template: "establishedUptrend", needsRank: true,
    plain: "Schluss > SMA30W und > SMA40W; SMA30W > SMA40W; SMA40W > SMA40W vor 4 Wochen; SMA10W > SMA30W und > SMA40W; Schluss > SMA10W; Schluss >= 1,3 x 52W-Tief (Schluss); Schluss >= 0,75 x 52W-Hoch (Schluss); RS-Rang (26W-Rendite, Kohorte derselben Woche) >= 70",
    deviations: ["Wochen- statt Tageslinien", "52W-Hoch/-Tief aus Wochenschluessen statt Tageshoch/-tief", "RS-Rang innerhalb der Studienkohorte statt des aktuellen Universums", "SMA-40W-Anstieg ueber 4 Wochen statt SMA 200 ueber 21 Tage"] },
  { id: "uptrendBasic", template: "uptrendBasic", needsRank: false,
    plain: "Schluss > SMA10W; Schluss > SMA40W; SMA10W > SMA40W; Schluss >= 0,75 x 52W-Hoch (Schluss); 26W-Rendite > 26W-Rendite SPY",
    deviations: ["Wochen- statt Tageslinien", "52W-Hoch aus Wochenschluessen", "RS ueber 26 Wochen statt 126 Handelstage"] },
  { id: "aboveSma200", template: "aboveSma200", needsRank: false, plain: "Schluss > SMA40W", deviations: ["40-Wochen- statt 200-Tage-Linie"] },
  { id: "high52", template: "high52", needsRank: false, plain: "Schluss > hoechster Schluss der 51 Vorwochen (neues 52-Wochen-Schlusshoch)", deviations: ["Schluss statt Tageshoch"] },
  { id: "high200w", template: "high200w", needsRank: false, plain: "Schluss > hoechster Schluss der 199 Vorwochen (neues 200-Wochen-Schlusshoch)", deviations: ["Schluss statt Wochenhoch"] }
]);
/* Nicht testbar mit Wochenschluessen (brauchen Hoch/Tief/Volumen oder Tagesformationen). */
export const NOT_TESTABLE = Object.freeze({
  trend: "ADX 14 braucht Hoch und Tief", triangleOpen: "Formationen brauchen Tages-OHLC", triangleOpenUptrend: "Formationen brauchen Tages-OHLC",
  triangleBreakoutUp: "Formationen brauchen Tages-OHLC", triangles: "Formationen brauchen Tages-OHLC", bullflag: "Formationen brauchen Tages-OHLC",
  contraction: "Volatilitaetskontraktion braucht Hoch/Tief", breakout: "Ausbrueche ueber Widerstand/Range brauchen Tages-OHLC"
});

function sma(c, n) { const out = new Array(c.length).fill(NaN); let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) out[i] = s / n; } return out; }
function rollExt(c, n, fn) { const out = new Array(c.length).fill(NaN); for (let i = n - 1; i < c.length; i++) { let v = c[i - n + 1]; for (let k = i - n + 2; k <= i; k++) v = fn(v, c[k]); out[i] = v; } return out; }

/**
 * Wochenlinien einer Reihe; jede an Index i nur aus Schluessen bis i (kausal). `contiguous[i]`: Woche i folgt im
 * Kalender direkt auf i-1 (sonst kein Signal an i, wie weekly-evidence.mjs).
 */
export function linesOf(dates, close, calIndex) {
  const n = close.length, contiguous = new Array(n).fill(false);
  for (let i = 1; i < n; i++) contiguous[i] = calIndex.get(dates[i]) === calIndex.get(dates[i - 1]) + 1;
  const ret26 = close.map((c, i) => (i >= 26 ? c / close[i - 26] - 1 : NaN));
  return { s10: sma(close, 10), s30: sma(close, 30), s40: sma(close, 40), hi52: rollExt(close, 52, Math.max), lo52: rollExt(close, 52, Math.min),
    hiPrev51: close.map((_, i) => (i >= 51 ? Math.max(...close.slice(i - 51, i)) : NaN)), hiPrev199: close.map((_, i) => (i >= 199 ? Math.max(...close.slice(i - 199, i)) : NaN)),
    ret26, contiguous };
}
/** Zustand je Regel an Woche i: true/false oder null (nicht entscheidbar). `ctx.rank` (0..100), `ctx.spy26` je Datum. */
export function ruleState(id, L, close, i, ctx) {
  const c = close[i], v = (x) => isNum(x[i]);
  switch (id) {
    case "aboveSma200": return v(L.s40) ? c > L.s40[i] : null;
    case "high52": return v(L.hiPrev51) ? c > L.hiPrev51[i] : null;
    case "high200w": return v(L.hiPrev199) ? c > L.hiPrev199[i] : null;
    case "uptrendBasic": {
      const s = ctx.spy26;
      if (!(v(L.s10) && v(L.s40) && v(L.hi52) && v(L.ret26) && isNum(s))) return null;
      return c > L.s10[i] && c > L.s40[i] && L.s10[i] > L.s40[i] && c >= 0.75 * L.hi52[i] && L.ret26[i] > s;
    }
    case "establishedUptrend": {
      if (!(v(L.s10) && v(L.s30) && v(L.s40) && i >= 4 && isNum(L.s40[i - 4]) && v(L.hi52) && v(L.lo52) && isNum(ctx.rank))) return null;
      return c > L.s30[i] && c > L.s40[i] && L.s30[i] > L.s40[i] && L.s40[i] > L.s40[i - 4] && L.s10[i] > L.s30[i] && L.s10[i] > L.s40[i] &&
        c > L.s10[i] && c >= 1.3 * L.lo52[i] && c >= 0.75 * L.hi52[i] && ctx.rank >= 70;
    }
  }
  throw new Error("UNKNOWN_RULE:" + id);
}
/** Ereignisse: Woche i, an der die Regel von false (Woche i-1, im Kalender direkt davor) auf true wechselt. */
export function transitions(states, contiguous) {
  const out = [];
  for (let i = 1; i < states.length; i++) if (contiguous[i] && states[i] === true && states[i - 1] === false) out.push(i);
  return out;
}
/** Perzentil-Rang 0..100 (Mittelrang bei Gleichstand) in einer sortierten Liste. */
export function pctRank(sorted, v) {
  let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
  let e = lo; while (e < sorted.length && sorted[e] === v) e++;
  return sorted.length > 1 ? Math.round(1000 * (lo + (e - lo - 1) / 2) / (sorted.length - 1)) / 10 : null;
}
function pTwoSided(mean, se) { if (!isNum(mean) || !isNum(se) || se <= 0) return null; const z = Math.abs(mean / se); return Math.min(1, 2 * (1 - normCdf(z))); }
function normCdf(z) { const t = 1 / (1 + 0.2316419 * z), d = 0.3989422804014327 * Math.exp(-z * z / 2); return 1 - d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); }
const r4 = (x) => (isNum(x) ? Math.round(x * 1e4) / 1e4 : null);
function summary(events, field) {
  const st = S.inference(events, field), obs = events.filter((e) => e.state === "OBSERVED" && isNum(e[field]));
  return { n: st.n, mean: r4(st.mean), median: r4(st.median), interval95: st.interval95 ? st.interval95.map(r4) : null, standardError: r4(st.standardError),
    hitRate: obs.length ? r4(obs.filter((e) => e[field] > 0).length / obs.length) : null, timeClusters: st.timeClusters || 0, issuerClusters: st.issuerClusters || 0, state: st.state };
}

export function run({ asOf = "2026-10-23", limit = null } = {}) {
  const t0 = Date.now();
  const pop = P.buildPopulation({ profile: "PRODUCT_DEFAULT" });
  const calendar = pop.calendar.filter((d) => d <= asOf), calIndex = new Map(calendar.map((d, k) => [d, k]));
  const bench = B.load(ROOT), spyBars = calendar.filter((d) => bench.byDate.has(d)).map((date) => ({ date, close: bench.byDate.get(date) }));
  const spyIdx = new Map(spyBars.map((b, k) => [b.date, k])), spy26 = new Map();
  spyBars.forEach((b, k) => { if (k >= 26 && calIndex.get(b.date) === calIndex.get(spyBars[k - 26].date) + 26) spy26.set(b.date, b.close / spyBars[k - 26].close - 1); });
  let ids = [...pop.listings.keys()].sort(); if (limit) ids = ids.slice(0, limit);

  /* 1. Linien je Titel, RS-Querschnitt je Woche (nur Titel mit Wert an diesem Datum, mindestens 100). */
  const series = ids.map((id) => {
    const doc = pop.listings.get(id), pts = doc.points.filter((p) => p[0] <= asOf && isNum(p[1]) && p[1] > 0);
    const dates = pts.map((p) => p[0]), close = pts.map((p) => p[1]);
    return { id, doc, dates, close, L: linesOf(dates, close, calIndex) };
  }).filter((s) => s.close.length >= 60);
  const byDate = new Map();
  for (const s of series) s.dates.forEach((d, i) => { const r = s.L.ret26[i]; if (isNum(r) && s.L.contiguous[i]) (byDate.get(d) || byDate.set(d, []).get(d)).push(r); });
  for (const [d, a] of byDate) a.sort((x, y) => x - y);
  const rankAt = (d, r) => { const a = byDate.get(d); return a && a.length >= 100 && isNum(r) ? pctRank(a, r) : null; };

  /* 2. Ereignisse je Regel. */
  const ledger = Object.fromEntries(RULES.map((r) => [r.id, []]));
  for (const s of series) for (const rule of RULES) {
    const st = s.close.map((_, i) => ruleState(rule.id, s.L, s.close, i, { rank: rule.needsRank ? rankAt(s.dates[i], s.L.ret26[i]) : null, spy26: spy26.get(s.dates[i]) }));
    for (const i of transitions(st, s.L.contiguous)) {
      const d = s.dates[i];
      ledger[rule.id].push({ eventId: rule.id + "|" + s.id + "|" + d, eventType: rule.id, listingId: s.doc.listingId, occurredAt: d + DAY_END, publishedAt: d + DAY_END, availableAt: d + DAY_END,
        sourceHash: sha(STUDY_VERSION + "|" + rule.id + "|" + s.doc.sourceBytesHash + "|" + d) });
    }
  }

  /* 3. Ausfuehrung ueber runEventStudy, Titel in Paketen unter dem Engine-Budget. */
  const listingOf = (s) => ({ listingId: s.doc.listingId, issuerId: s.id, identity: { mic: ({ NASDAQ: "XNAS", NYSE: "XNYS", AMEX: "XASE", "NYSE MKT": "XASE" })[String(s.doc.listingId).split(":")[1]] || null,
    instrumentClass: "COMMON_STOCK", primary: true, validFrom: s.doc.listingStart, availableAt: s.doc.masterGeneratedAt || (s.doc.asOf + "T00:00:00Z"), sourceHash: s.doc.identityHash },
    bars: s.dates.map((date, i) => ({ date, close: s.close[i] })) });
  const byListing = new Map(series.map((s) => [s.doc.listingId, s]));
  function study(ruleId, horizon, costs) {
    const evs = ledger[ruleId], wanted = [...new Set(evs.map((e) => e.listingId))].map((id) => byListing.get(id));
    const out = []; let pack = [], bars = 0;
    const flush = () => {
      if (!pack.length) return;
      const set = new Set(pack.map((s) => s.doc.listingId)), mine = evs.filter((e) => set.has(e.listingId));
      for (let k = 0; k < mine.length; k += 40000) {
        const res = S.runEventStudy({ asOf, sourceMode: "HISTORICAL_SIMULATION", cohortMode: "CONDITIONAL_CURRENT_CLASSIFICATION", executionClock: "OBSERVED_WEEKLY_DATES",
          returnBasis: "PRICE_RETURN", currency: "USD", registration: { id: "s4-" + ruleId, version: STUDY_VERSION, frozenAt: REGISTERED_AT, analysisMode: "EXPLORATORY" }, entryDelayBars: 1,
          costs: { basis: "PER_SIDE_NOTIONAL", ...costs }, expectedCalendar: calendar, benchmark: { currency: "USD", returnBasis: "PRICE_RETURN", bars: spyBars },
          horizonBars: horizon, listings: pack.map(listingOf), events: mine.slice(k, k + 40000) });
        out.push(...res.events);
      }
      pack = []; bars = 0;
    };
    for (const s of wanted) { if (bars + s.close.length > MAX_BARS_PER_RUN) flush(); pack.push(s); bars += s.close.length; }
    flush();
    return out;
  }

  /* 4. Auswertung: je Regel x Horizont; Holm ueber alle Paare (Ueberschuss ggue. SPY). */
  const cells = [];
  for (const rule of RULES) for (const h of HORIZONS) {
    const ev = study(rule.id, h, COSTS.BASE);
    const dev = ev.filter((e) => e.signalDate < SPLIT_DATE), test = ev.filter((e) => e.signalDate >= SPLIT_DATE);
    const ex = summary(ev, "benchmarkExcess");
    cells.push({ rule: rule.id, horizonWeeks: h, events: ev.length, states: ev.reduce((m, e) => (m[e.state] = (m[e.state] || 0) + 1, m), {}),
      net: summary(ev, "netReturn"), excessSpy: ex, pExcess: pTwoSided(ex.mean, ex.standardError),
      development: { until: SPLIT_DATE, excessSpy: summary(dev, "benchmarkExcess") }, test: { from: SPLIT_DATE, excessSpy: summary(test, "benchmarkExcess") },
      _events: h === 13 ? ev : null });
  }
  const pIdx = cells.map((c, k) => [k, c.pExcess]).filter(([, p]) => isNum(p)), adj = V.holm(pIdx.map(([, p]) => p));
  pIdx.forEach(([k], j) => { cells[k].pExcessHolm = r4(adj[j]); });
  for (const c of cells) {
    c.pExcess = r4(c.pExcess);
    const d = c.development.excessSpy.mean, t = c.test.excessSpy.mean;
    c.signConsistent = isNum(d) && isNum(t) ? Math.sign(d) === Math.sign(t) : null;
  }

  /* 5. Methoden auf dem Haupthorizont 13 Wochen: Kostensensitivitaet, Walk-Forward/OOS, Marktphasen. */
  const regimeBars = spyBars.map((b) => ({ ...b, availableAt: b.date + DAY_END, sourceHash: bench.provenance.sourceBytesHash }));
  const reg = S.classifyRegimes({ asOf, mode: "PIT_AVAILABLE", lookbackBars: 26, volatilityLookbackBars: 13, trendBand: 0, volatilityThreshold: 0.2, annualization: 52, bars: regimeBars });
  const regimes = reg.regimes.map((r) => ({ date: r.date, state: r.state + "/" + r.volatilityState, sourceHash: r.sourceHash, availableAt: r.availableAt }));
  const methods = {};
  for (const rule of RULES) {
    const c13 = cells.find((c) => c.rule === rule.id && c.horizonWeeks === 13), ev = c13._events, obs = ev.filter((e) => e.state === "OBSERVED" && isNum(e.benchmarkExcess));
    const high = study(rule.id, 13, COSTS.HIGH);
    /* Engine-Gruppierung auf der Nettorendite (analyzeRegimes); Ueberschuss je Phase mit derselben inference(). */
    const a = S.analyzeRegimes({ mode: "PIT_AVAILABLE", regimes, observations: ev.filter((e) => e.state === "OBSERVED" && isNum(e.netReturn)).map((e) => ({ ...e, decisionAt: e.signalDate + DAY_END })) });
    const stateOf = new Map(regimes.map((r) => [r.date, r.state]));
    /* Walk-Forward auf Wochenkohorten: je Signalwoche EIN Wert (mittlerer Ueberschuss der Signale dieser Woche). Das
       Purge-Budget der Engine (Faltungen x Ereignisse^2) laesst Einzelereignisse dieser Groesse nicht zu (wie im Runner). */
    const weeks = new Map();
    for (const e of ev) { const w = weeks.get(e.signalDate) || { obs: [], open: false, end: e.signalDate + DAY_END }; if (e.state === "OBSERVED" && isNum(e.benchmarkExcess)) w.obs.push(e.benchmarkExcess); else w.open = true;
      const end = (e.exitDate || e.expectedExitDate || e.signalDate) + DAY_END; if (end > w.end) w.end = end; weeks.set(e.signalDate, w); }
    const wfEvents = [...weeks].map(([d, w]) => { const k = calIndex.get(d);
      return { id: d, decisionAt: d + DAY_END, availableAt: d + DAY_END, informationStart: calendar[Math.max(0, k - 205)] + "T00:00:00Z", outcomeEnd: w.end, outcomeAvailableAt: !w.open && w.obs.length ? w.end : null }; });
    let wf;
    try {
      const cal = calendar.filter((d) => d >= "2000-01-01");
      const partition = V.buildWalkForward({ calendar: cal.map((d) => d + DAY_END), trainSize: 260, validationSize: 52, testSize: 104, mode: "ROLLING", embargoDays: 0, asOf: asOf + DAY_END, operationBudget: 100000000 },
        wfEvents.filter((x) => x.id >= "2000-01-01"));
      const values = new Map([...weeks].filter(([, w]) => !w.open && w.obs.length).map(([d, w]) => [d, w.obs.reduce((t, x) => t + x, 0) / w.obs.length]));
      const testIds = partition.folds.flatMap((f) => f.test).filter((id) => values.has(id));
      const oos = V.aggregateOos(partition, testIds.map((id) => ({ id, value: values.get(id) })));
      wf = { state: "EXECUTED", unit: "SIGNAL_WEEK_COHORT_MEAN_EXCESS_SPY", folds: partition.folds.length, weeks: oos.n, meanExcessSpy: r4(oos.mean),
        perFold: partition.folds.map((f) => { const v = f.test.filter((id) => values.has(id)).map((id) => values.get(id)); return { test: f.bounds.test.map((x) => x.slice(0, 10)), weeks: v.length, mean: r4(v.length ? v.reduce((t, x) => t + x, 0) / v.length : null), positiveWeeks: v.length ? r4(v.filter((x) => x > 0).length / v.length) : null }; }),
        use: "FIXED_RULE_NO_FITTING_PARTITION_MECHANICS" };
    } catch (e) { wf = { state: "NOT_RUN", reason: String(e.message || e).slice(0, 120) }; }
    methods[rule.id] = { horizonWeeks: 13,
      costSensitivity: { base: COSTS.BASE, high: COSTS.HIGH, netBase: c13.net, netHigh: summary(high, "netReturn"), excessSpyHigh: summary(high, "benchmarkExcess") },
      regimes: { definition: "SPY_WEEKLY_TREND_26_VOL_13", unmatched: a.unmatched.length,
        states: a.states.map((st) => ({ state: st.state, episodes: st.episodes, n: st.statistics.n, meanNet: r4(st.statistics.mean), net95: st.statistics.interval95 ? st.statistics.interval95.map(r4) : null,
          excessSpy: summary(obs.filter((e) => stateOf.get(e.signalDate) === st.state), "benchmarkExcess") })) },
      walkForward: wf };
  }
  cells.forEach((c) => delete c._events);

  return {
    schemaVersion: STUDY_VERSION, asOf, registeredAt: REGISTERED_AT, generatedAt: new Date().toISOString(), runtimeSec: Math.round((Date.now() - t0) / 1000),
    certification: "NOT_CERTIFIED", productionApproved: false, status: "RESEARCH_LIMITED",
    claims: { strategyEdge: "nicht nachgewiesen", returnsAdvertising: "unzulaessig", use: "Forschung; keine Produktaussage ohne Owner-Freigabe (STRATEGY_TEMPLATES_PLAN.md S4)" },
    population: { profile: "PRODUCT_DEFAULT", listings: series.length, calendarFrom: calendar[0], calendarTo: calendar.at(-1), populationHash: pop.populationHash || null },
    engine: { eventStudy: S.VERSION, validation: V.VERSION, population: "research-population", benchmark: bench.provenance },
    design: { horizonsWeeks: HORIZONS, entry: "naechster beobachteter Wochenschluss nach dem Signal (entryDelayBars 1)", costs: COSTS, returnBasis: "PRICE_RETURN",
      benchmark: "SPY (Kursrendite)", split: { development: "< " + SPLIT_DATE, test: ">= " + SPLIT_DATE }, multipleTesting: "Holm ueber alle Regel x Horizont (Ueberschuss ggue. SPY)",
      inference: "zweifach geclustert (Woche x Emittent), asymptotisch", rules: RULES, notTestable: NOT_TESTABLE },
    limitations: ["SURVIVOR_COHORT_NO_DELISTINGS", "NO_HISTORICAL_INDEX_MEMBERSHIP", "WEEKLY_CLOSES_ONLY_NO_OHLC_NO_VOLUME", "PRICE_RETURN_NO_DIVIDENDS",
      "WEEKLY_PROXIES_NOT_IDENTICAL_TO_DAILY_TEMPLATES", "OVERLAPPING_HORIZONS_DEPENDENT_EVENTS", "EXPLORATORY_RULES_KNOWN_BEFORE_REGISTRATION", "SINGLE_VERIFIED_BENCHMARK_SPY"],
    cells, methods,
    eventCounts: Object.fromEntries(RULES.map((r) => [r.id, ledger[r.id].length]))
  };
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const a = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const out = a("--out");
  if (!out) { console.error("--out FILE fehlt"); process.exit(2); }
  if (/(^|\/)(quant|discover|supertrader|social)\/data(\/|$)/.test(resolve(out))) { console.error("OUT_INSIDE_GENERATED_DATA"); process.exit(2); }
  const res = run({ asOf: a("--as-of") || undefined, limit: a("--limit") ? Number(a("--limit")) : null });
  writeFileSync(out, JSON.stringify(res, null, 1));
  console.log("S4 " + res.population.listings + " Titel, " + Object.entries(res.eventCounts).map(([k, v]) => k + " " + v).join(", ") + ", " + res.runtimeSec + " s -> " + out);
}
