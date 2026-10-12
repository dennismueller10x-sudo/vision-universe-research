#!/usr/bin/env node
/* =========================================================================
   DISCOVER – EMERGING LEADERS (Tageslauf)

   Wendet die Engine quant/engines/emerging-leaders.js (emerging-leaders-1.0.0)
   auf den heutigen Stand an: Merkmale, Querschnitt, objektiver Zustand,
   Modellwert und Begruendung je Titel - fuer US-Stammaktien mit
   Tageskerzen samt Volumen. Den Evidenzstatus liest der Lauf aus der
   historischen Studie (quant/data/product/emerging-leaders-v1/study.json);
   ohne Studie ist er EXPERIMENTAL.

   SIGNALHISTORIE OHNE GEDAECHTNIS

   Seit wann ein Titel in seinem Zustand ist und was er davor war, rechnet
   der Lauf jedes Mal neu aus den Kursreihen der letzten SESSIONS Handelstage
   (je Tag ein vollstaendiger Querschnitt). Keine Verlaufsdatei, die nur der
   gestrige Lauf kennt: das Artefakt entsteht allein aus seinen Eingaben und
   ist reproduzierbar (Erzeuger-Regel, core/registry/domains.json).

   KEIN INTRADAY

   Zustaende brauchen Tagesschluss und Tagesvolumen (Ausbruch mit Volumen,
   Akkumulationstage). Die 5-Minuten-Kurse tragen kein Volumen je Titel; eine
   Intraday-Fassung waere eine andere Definition. Der Lauf gilt deshalb je
   Handelstag und nennt seinen Stichtag.

   EUROPA

   Fuer Europa liegen keine Tagesreihen mit Volumen vor. Der Bereich nennt
   das ausdruecklich (europe.status NOT_COVERED), statt Titel ohne Grundlage
   einzustufen.

   Ausgabe: discover/data/emerging-leaders/US_REAL.json (oder --out).
   Keine Kursniveaus (Weitergabe-Regel), nur Raenge, Renditen, Zustaende.

   node scripts/discover/build-emerging-leaders.mjs --work-dir <kanonische Historie>
   node scripts/discover/build-emerging-leaders.mjs --fixture --out <datei>   (Golden Preview, Test)
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { uniqueBars, benchmarkFromBars, engineSeries, commonEquityIds, loadFundamentals, fundamentalsAt, leadershipScore } from "../quant/lib/emerging-leaders-inputs.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EL = require(join(ROOT, "quant/engines/emerging-leaders.js"));
const SC = require(join(ROOT, "quant/engines/survivorship-control.js"));
const PREREG = JSON.parse(readFileSync(join(ROOT, "quant/methodology/emerging-leaders-v1.json"), "utf8"));

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const FIXTURE = argv.includes("--fixture");
const WORK = arg("--work-dir");
const OUT = arg("--out", join(ROOT, "discover/data/emerging-leaders/US_REAL.json"));
const STUDY = arg("--study", join(ROOT, "quant/data/product/emerging-leaders-v1/study.json"));
export const SESSIONS = 25;           /* Signalhistorie: so viele Handelstage */
const PRIOR_LAG = 63;                 /* rsImprove / Emerging: Querschnitt t-63 */
const MAX_LIST = 400;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r = (v, k = 4) => (isNum(v) ? Math.round(v * 10 ** k) / 10 ** k : null);
const log = (m) => console.log(`[emerging-leaders] ${m}`);

/* ------------------------------------------------------------ Eingaben */
function inputs() {
  if (FIXTURE) {
    const dir = join(ROOT, "quant/data/market/golden-preview/daily");
    const spy = JSON.parse(readFileSync(join(ROOT, "quant/data/market/multi-asset/series/SPY.json"), "utf8"));
    return {
      spyBars: spy.points.map((p) => ({ date: p[0], close: p[1], splitFactor: 1 })),
      files: readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f)),
      common: null
    };
  }
  if (!WORK || !existsSync(join(WORK, "tiingo", "daily"))) throw new Error("--work-dir mit tiingo/daily fehlt (oder --fixture)");
  const dir = join(WORK, "tiingo", "daily");
  const spyFile = join(dir, "ref_SPY.json");
  if (!existsSync(spyFile)) throw new Error("SPY fehlt in der Arbeitsablage");
  return { spyBars: JSON.parse(readFileSync(spyFile, "utf8")).bars, files: readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "ref_SPY.json").map((f) => join(dir, f)), common: commonEquityIds() };
}

function names() {
  const m = new Map();
  try {
    for (const e of JSON.parse(readFileSync(join(ROOT, "discover/data/search/US_REAL.json"), "utf8")).entries || []) if (e.s) m.set(e.s, e.n || null);
  } catch { /* ohne Namen: Kuerzel */ }
  return m;
}
function detailSymbols() {
  try { return new Set(JSON.parse(readFileSync(join(ROOT, "discover/data/stock-index/US_REAL.json"), "utf8")).symbols || []); } catch { return new Set(); }
}

function studyStatus() {
  if (!existsSync(STUDY)) return { evidenceStatus: "EXPERIMENTAL", reason: "STUDY_NOT_RUN", label: "Experimentell – historische Prüfung steht noch aus", model: "M1_TECH_EQUAL" };
  const s = JSON.parse(readFileSync(STUDY, "utf8"));
  /* Nur eine vollstaendige Studie derselben Methodik und Engine bestimmt Modell
     und Gewichte; sonst M1 ohne Zusammenlegung, Status EXPERIMENTAL. */
  const usable = s.status === "COMPLETE" && s.methodologyVersion === PREREG.methodologyVersion && s.engineVersion === EL.VERSION;
  if (!usable) return { evidenceStatus: "EXPERIMENTAL", reason: "STUDY_NOT_USABLE_" + (s.status || "UNKNOWN"), label: "Experimentell – historische Prüfung unvollständig", model: "M1_TECH_EQUAL", modelChosenOnValidation: false, merge: [], m3Weights: null, studyStatus: s.status || null, studyGeneratedAt: s.generatedAt || null };
  const model = s.selection && s.selection.chosen ? s.selection.chosen : "M1_TECH_EQUAL";
  const pick = (p, m) => { const x = s.results && s.results[p] && s.results[p][m] && s.results[p][m][63]; return x && x.dates ? { netBase: x.meanExcessNet.BASE, t: x.tNWNetBase, dates: x.dates, spreadVsUniverse: x.spreadVsUniverse.mean } : null; };
  const label = s.evidenceStatus === "VALIDATED" ? (s.label || "Historisch validiert (Point-in-Time)")
    : s.evidenceStatus === "PARTIAL" ? "Teilweise belegt – nicht in allen Prüfzeiträumen"
    : "Experimentell – keine belastbare Überlegenheit nachgewiesen";
  return {
    evidenceStatus: s.evidenceStatus === "VALIDATED" || s.evidenceStatus === "PARTIAL" ? s.evidenceStatus : "EXPERIMENTAL",
    reason: s.gate ? s.gate.reason : null, label, model, modelChosenOnValidation: !!(s.selection && s.selection.chosen),
    studyGeneratedAt: s.generatedAt || null, studyStatus: s.status || null,
    holdout: { HOLDOUT_RECENT: { model: pick("HOLDOUT_RECENT", model), RS_6M: pick("HOLDOUT_RECENT", "RS_6M"), MOM_12_1: pick("HOLDOUT_RECENT", "MOM_12_1") },
               HOLDOUT_EARLY: { model: pick("HOLDOUT_EARLY", model), RS_6M: pick("HOLDOUT_EARLY", "RS_6M"), MOM_12_1: pick("HOLDOUT_EARLY", "MOM_12_1") } },
    m3Weights: s.development ? s.development.m3Weights : null, merge: s.development ? s.development.merge : []
  };
}

/* --------------------------------------------------------------- Lauf */
export function build() {
  const inp = inputs();
  const spy = benchmarkFromBars(inp.spyBars);
  const calIdx = new Map(spy.dates.map((d, i) => [d, i]));
  const last = spy.dates.length - 1;
  const days = [];                                        /* auszuwertende Tage: letzte SESSIONS und je t-63 */
  for (let k = last - SESSIONS + 1; k <= last; k++) { days.push(k); days.push(k - PRIOR_LAG); }
  const want = new Set(days.map((k) => spy.dates[k]));
  const evidence = studyStatus();
  const nameOf = names(), details = detailSymbols();

  const tickers = new Set();
  const raw = [];
  for (const file of inp.files) {
    const id = file.split("/").pop().slice(0, -5);
    if (inp.common && !inp.common.has(id)) continue;
    let p; try { p = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    if (!p.ticker) continue;
    raw.push({ id, file, ticker: p.ticker, exchange: p.exchange || null });     /* Schluessel: securityId (ADR-001) */
    tickers.add(p.ticker);
  }
  const fund = loadFundamentals(tickers);
  /* rows je Tag */
  const byDay = new Map([...want].map((d) => [d, []]));
  let read = 0, withVolume = 0;
  for (const t of raw) {
    const p = JSON.parse(readFileSync(t.file, "utf8"));
    const bars = SC.currentListingSegment(uniqueBars(p.bars)).bars;
    if (bars.length < PREREG.observationGrid.minimumHistoryBars + 2) continue;
    read++;
    if (bars.some((b) => b.volume > 0)) withVolume++;
    const s = engineSeries(bars, calIdx, spy.close);
    const idx = new Map(s.dates.map((d, i) => [d, i]));
    for (const d of want) {
      const i = idx.get(d);
      if (i === undefined) continue;
      const f = EL.seriesFeatures(s, i, { minHistory: PREREG.observationGrid.minimumHistoryBars });
      if (!f || !(f.rawClose >= PREREG.universe.minRawClose && f.dollarVolume20 >= PREREG.universe.minAvgDollarVolume20d)) continue;
      const fu = fundamentalsAt(fund.get(t.ticker), d);
      byDay.get(d).push({ id: t.id, ticker: t.ticker, exchange: t.exchange, f, fund: [fu.revenueAccel, fu.revenueGrowthYoy, fu.netMarginChange, fu.fcfMargin].some(isNum) ? fu : null,
        leadershipScore: leadershipScore(f) });
    }
  }
  log(`Titel gelesen ${read}, Tage ${want.size}`);

  /* Querschnitte: zuerst die Vor-Tage (nur Raenge), dann die SESSIONS Tage mit Prior */
  const opts = { merge: evidence.merge || [], weights: evidence.m3Weights || null };
  const priorOf = new Map();
  for (const k of days.filter((_, j) => j % 2 === 1)) {
    const d = spy.dates[k], rows = byDay.get(d) || [];
    if (rows.length) { EL.crossSection(rows, opts); priorOf.set(d, new Map(rows.map((x) => [x.id, { pRS_60: x.p.pRS_60, pRS_120: x.p.pRS_120 }]))); }
  }
  const timeline = new Map();          /* securityId -> [{date, state}] */
  const tickerOf = new Map(raw.map((t) => [t.id, t.ticker]));
  let today = null;
  for (let k = last - SESSIONS + 1; k <= last; k++) {
    const d = spy.dates[k], pd = spy.dates[k - PRIOR_LAG], prior = priorOf.get(pd) || null;
    const rows = (byDay.get(d) || []).map((x) => ({ ...x, prior: prior ? prior.get(x.id) || null : null }));
    if (!rows.length) continue;
    EL.crossSection(rows, opts);
    for (const x of rows) (timeline.get(x.id) || timeline.set(x.id, []).get(x.id)).push({ date: d, state: x.state });
    if (k === last) today = { date: d, rows };
  }
  if (!today) throw new Error("Kein Querschnitt am letzten Handelstag " + spy.dates[last]);

  /* Modellwert als Perzentil im heutigen Querschnitt */
  const model = evidence.model;
  const scores = EL.pctRanks(today.rows.map((x) => x.models[model]));
  today.rows.forEach((x, j) => { x.score = scores[j]; });
  const ranked = today.rows.filter((x) => isNum(x.score)).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  ranked.forEach((x, j) => { x.rank = j + 1; });

  const STATES = EL.STATES;
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const x of today.rows) counts[x.state]++;
  const transitions = [];
  function history(id) {
    const tl = timeline.get(id) || [];
    let since = tl.length ? tl[tl.length - 1].date : null, prev = null, j = tl.length - 1;
    while (j > 0 && tl[j - 1].state === tl[tl.length - 1].state) j--;
    if (tl.length) { since = tl[j].date; prev = j > 0 ? tl[j - 1].state : null; }
    const full = j === 0 && tl.length === SESSIONS;      /* ganzes Fenster im selben Zustand */
    let lastSignal = null, changes = 0;
    for (let q = 1; q < tl.length; q++) {
      if (tl[q].state === tl[q - 1].state) continue;
      changes++;
      if (isSignal(tl, q)) lastSignal = tl[q].date;
    }
    const cur = tl.length ? tl[tl.length - 1].state : null;
    return { since, sinceAtLeast: full, previous: prev, lastSignal, sessionsInState: tl.filter((z) => z.state === cur).length, sessionsObserved: tl.length, changes };
  }
  /* Ein Signal ist ein Aufstieg in einen hoeheren Zustand, der nicht nur die
     Rueckkehr zu einem Zustand der letzten zwei Sitzungen ist (Hin und Her).
     Abstiege sind keine neuen Signale. Die Zustandsdefinitionen selbst
     bleiben unveraendert (Vorregistrierung). */
  function isSignal(tl, q) {
    const to = STATES.indexOf(tl[q].state), from = STATES.indexOf(tl[q - 1].state);
    if (!(to > from) || tl[q].state === "S0_NONE") return false;
    for (let z = Math.max(0, q - 3); z < q - 1; z++) if (tl[z].state === tl[q].state) return false;
    return true;
  }
  const pick = today.rows.filter((x) => x.state !== "S0_NONE" || (isNum(x.score) && x.score >= 0.9));
  const list = pick.sort((a, b) => (b.score || 0) - (a.score || 0) || (a.id < b.id ? -1 : 1)).slice(0, MAX_LIST).map((x) => {
    const h = history(x.id), f = x.f;
    return {
      s: x.ticker, n: nameOf.get(x.ticker) || null, market: "US", exchange: x.exchange, state: x.state,
      since: h.since, sinceAtLeast: h.sinceAtLeast, previous: h.previous, lastSignal: h.lastSignal,
      stability: { sessionsInState: h.sessionsInState, sessionsObserved: h.sessionsObserved, changes: h.changes },
      score: r(x.score * 100, 1), rank: x.rank || null,
      emerging: x.emerging,
      rs: { p20: r(x.p.pRS_20, 0), p60: r(x.p.pRS_60, 0), p120: r(x.p.pRS_120, 0), improve: r(x.feat.rsImprove, 0), accel: r(x.feat.rsAccel, 0) },
      momentum: { ret21: r(f.ret21), rel63: r(f.rel63), ret252: r(f.ret252), aboveSma50: f.close > f.sma50, slope50: r(f.slope50) },
      volume: { relVol: r(f.relVol, 2), upDownRatio: isNum(f.udv50) ? r(Math.exp(f.udv50), 2) : null, accDays: isNum(f.accDays) ? f.accDays : null },
      compression: { volRatio: r(f.volRatio, 2), nearPivot: r(f.nearPivot) },
      groups: Object.fromEntries(Object.entries(x.groups).map(([g, v]) => [g, r(v * 100, 0)])),
      reasons: EL.reasons(x).map((z) => z.text),
      href: details.has(x.ticker) ? "#/s/US_REAL/" + encodeURIComponent(x.ticker) : null
    };
  });
  for (const [id, tl] of timeline) for (let q = 1; q < tl.length; q++) if (isSignal(tl, q)) transitions.push({ s: tickerOf.get(id), date: tl[q].date, from: tl[q - 1].state, to: tl[q].state });
  const recent = transitions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.s < b.s ? -1 : 1)).slice(0, 200);

  return {
    schemaVersion: "discover-emerging-leaders-1.0.0",
    engineVersion: EL.VERSION, methodologyVersion: PREREG.methodologyVersion,
    universeId: "US_REAL", market: "US", asOf: today.date, generatedAt: new Date().toISOString(),
    source: FIXTURE ? "GOLDEN_PREVIEW_FIXTURE" : "CANONICAL_DAILY_HISTORY",
    frequency: "DAILY_CLOSE", intraday: { available: false, reason: "Zustände brauchen Tagesschluss und Tagesvolumen; Intraday-Kurse tragen kein Volumen je Titel." },
    evidence,
    noProbabilities: true,
    disclaimer: "Objektive Kursmerkmale, keine Prognose, keine Wahrscheinlichkeit, kein Kursziel, keine Anlageempfehlung.",
    model: { id: model, chosenOnValidation: evidence.modelChosenOnValidation, scale: "Perzentil im heutigen Querschnitt (0–100)" },
    universe: { titlesRead: read, withVolume, eligibleToday: today.rows.length, filter: { minRawClose: PREREG.universe.minRawClose, minAvgDollarVolume20d: PREREG.universe.minAvgDollarVolume20d } },
    europe: { status: "NOT_COVERED", reason: "Für europäische Titel liegen keine Tagesreihen mit Volumen vor; ohne Volumen sind Akkumulation und Ausbruch nicht bestimmbar." },
    states: { order: STATES, counts, listed: Object.fromEntries(STATES.map((z) => [z, list.filter((x) => x.state === z).length])), listLimit: MAX_LIST, definitions: Object.fromEntries(STATES.map((s) => [s, PREREG.states[s]])) },
    history: { sessions: SESSIONS, from: spy.dates[last - SESSIONS + 1], to: today.date, dates: spy.dates.slice(last - SESSIONS + 1, last + 1), transitions: recent },
    count: list.length, stocks: list
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = build();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  log(`${out.count} Titel, Stichtag ${out.asOf}, Evidenz ${out.evidence.evidenceStatus} -> ${OUT}`);
}
