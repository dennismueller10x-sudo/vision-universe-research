#!/usr/bin/env node
/* =========================================================================
   EMERGING LEADERS – historische Point-in-Time-Studie (emerging-leaders-1.0.0)

   Fragt, was quant/methodology/emerging-leaders-v1.json vorab festlegt:
   Haben Titel, die an einem Monatsende die Merkmale beginnender
   Marktfuehrerschaft zeigten, danach gegen SPY besser abgeschnitten als
   einfache Momentum-, RS-, Leadership- und Zufalls-Baselines?

   QUELLEN (alle runner-privat, nur Aggregate verlassen den Lauf)
     --work-dir DIR/tiingo/daily/<securityId>.json   heute gelistete Titel + SPY
     R2 tiingo-delisted   beendete Listings ab 2015       (Universum MAIN, 2016-2026)
     R2 tiingo-holdout    volles Universum 2007-2015       (Universum EARLY, 2008-2015)
     quant/data/sec/consumer   PIT-Jahreswerte, nur heute gelistete Titel

   ABLAUF
     1. Je Listing einmal: Split-Bereinigung (return-series.js#splitFactors),
        Merkmale an jedem Monatsende (Engine, Look-ahead-Waechter),
        Zulaessigkeit am Tag t, Ergebnisse t+1 -> t+1+h. Gespeichert werden
        nur kompakte Beobachtungen, keine Reihe.
     2. Doppelhistorien (Kuerzelwechsel) verwerfen.
     3. Lauf 1 nur auf DEVELOPMENT: Gruppenkorrelation -> Zusammenlegung,
        Gruppen-IC -> M3-Gewichte. Eingefroren.
     4. Lauf 2 ueber alle Stichtage: Portfolios, IC, Fama-MacBeth, Zustaende.
     5. Modellwahl NUR aus VALIDATION (selectionRule), eingefroren; danach
        das Gate ueber beide Holdouts (validationGate).

   AUSGABE  quant/data/product/emerging-leaders-v1/study.json (oder --out)

   --synthetic N   lokale Probe ohne Daten: N kuenstliche Titel je Universum.
                   Das Ergebnis traegt status SYNTHETIC und ist nie ein Befund.
   ========================================================================= */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { uniqueBars, benchmarkFromBars, engineSeries, commonEquityIds, loadFundamentals, fundamentalsAt, leadershipScore } from "./lib/emerging-leaders-inputs.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EL = require(join(ROOT, "quant/engines/emerging-leaders.js"));
const SC = require(join(ROOT, "quant/engines/survivorship-control.js"));
const PREREG_TEXT = readFileSync(join(ROOT, "quant/methodology/emerging-leaders-v1.json"), "utf8");
const PREREG = JSON.parse(PREREG_TEXT);

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WORK = arg("--work-dir");
const OUT = arg("--out", join(ROOT, "quant/data/product/emerging-leaders-v1/study.json"));
const SYNTH = arg("--synthetic") ? Number(arg("--synthetic")) : 0;
const LIMIT = arg("--limit") ? Number(arg("--limit")) : 0;
const CONCURRENCY = Number(arg("--concurrency", "16"));
const NO_R2 = argv.includes("--no-r2");
const t0 = Date.now();
const log = (m) => console.log(`[emerging-leaders +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);

/* ----------------------------------------------------------- Vorgaben */
const H = PREREG.observationGrid.horizonsTradingDays;           /* [21,63,126,252] */
const H_PRIMARY = PREREG.observationGrid.primaryHorizon;        /* 63 */
const MIN_HIST = PREREG.observationGrid.minimumHistoryBars;
const MIN_RAW_CLOSE = PREREG.universe.minRawClose;
const MIN_DV = PREREG.universe.minAvgDollarVolume20d;
const COSTS = PREREG.outcome.costsBpsRoundTrip;
const WIN_LO = -0.95, WIN_HI = 5;                               /* outcome.winsorize */
const PERIODS = Object.fromEntries(["DEVELOPMENT", "VALIDATION", "HOLDOUT_RECENT", "HOLDOUT_EARLY"].map((p) => [p, PREREG.periods[p]]));
const PURGED = new Set(["DEVELOPMENT", "VALIDATION", "HOLDOUT_EARLY"]);
const UNIVERSES = { MAIN: { from: PERIODS.DEVELOPMENT.from, to: PERIODS.HOLDOUT_RECENT.to }, EARLY: { from: PERIODS.HOLDOUT_EARLY.from, to: PERIODS.HOLDOUT_EARLY.to } };
const MIN_NAMES = 20;                                           /* portfolio.selection */
const MODELS = ["M1_TECH_EQUAL", "M2_TECH_FUND_EQUAL", "M3_DEV_IC_WEIGHTED", "M4_EMERGING_TECH"];
const BASELINES = ["MOM_12_1", "RS_6M", "LEADERSHIP_VU", "TREND_TEMPLATE"];
const SELECTORS = [...MODELS, ...BASELINES, "UNIVERSE"];
const RANDOM_REPS = 200, RANDOM_SEED = 20261012;
const STATE_H = [21, 63, 126];
const nwLag = (h) => Math.ceil(h / 21) - 1;

function periodOf(date) {
  for (const [p, w] of Object.entries(PERIODS)) if (date >= w.from && date <= w.to) return p;
  return null;
}
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/* ----------------------------------------------------- Beobachtungen */
/* Spalten einer Beobachtung (Float32, kompakt). Alles, was der Querschnitt
   und die Auswertung brauchen - kein Kurs verlaesst den Lauf. */
const FCOLS = ["close", "rs_5", "rs_20", "rs_60", "rs_120", "rel252", "inflect", "trendStart", "sma20over50", "udv50", "accDays", "relVol",
  "volRatio", "bbwPct", "rangeRatio", "nearPivot", "mom12_1", "ret252", "high252", "low252", "high60", "sma50", "sma150", "sma200",
  "sma200Rising", "sma50over200Days60", "slope50", "bkDays", "bkPivot", "dollarVolume20", "lead",
  "revenueAccel", "revenueGrowthYoy", "netMarginChange", "fcfMargin"];
const OCOLS = H.flatMap((h) => ["ex" + h, "dl" + h, "mae" + h]);
const COLS = [...FCOLS, ...OCOLS];
const C = Object.fromEntries(COLS.map((c, j) => [c, j]));
const NC = COLS.length;
const CHUNK = 1 << 15;
const store = { chunks: [], n: 0, listing: [], date: [] };
function pushObs(values, listingIdx, dateIdx) {
  const o = store.n++;
  if ((o & (CHUNK - 1)) === 0) store.chunks.push(new Float32Array(CHUNK * NC).fill(NaN));
  const ch = store.chunks[o >> 15], base = (o & (CHUNK - 1)) * NC;
  for (let j = 0; j < NC; j++) ch[base + j] = values[j];
  store.listing.push(listingIdx); store.date.push(dateIdx);
}
const get = (o, c) => store.chunks[o >> 15][(o & (CHUNK - 1)) * NC + c];

/* ----------------------------------------------------- SPY / Kalender */
let CAL = [], SPY = null, CAL_IDX = new Map(), MONTH_END = new Set(), SPY_SMA200 = null;
function setCalendar(dates, close) {
  CAL = dates; SPY = close; CAL_IDX = new Map(dates.map((d, i) => [d, i]));
  MONTH_END = new Set();
  for (let i = 0; i + 1 < dates.length; i++) if (dates[i].slice(0, 7) !== dates[i + 1].slice(0, 7)) MONTH_END.add(dates[i]);
  SPY_SMA200 = new Float64Array(close.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < close.length; i++) { s += close[i]; if (i >= 200) s -= close[i - 200]; if (i >= 199) SPY_SMA200[i] = s / 200; }
}
/* ------------------------------------------------------- ein Listing */
const LISTINGS = [];      /* {key, source, universe, ended, lastKey, keys:Float64Array|null, obs, dup} */
function keyHash(date, close, volume) {
  const s = date + "|" + close + "|" + volume;
  let a = 0x811c9dc5, b = 0x12345678;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b ^ c, 2246822519) >>> 0; }
  return (a & 0x1fffff) * 4294967296 + b;    /* 53 Bit, exakt in Float64 */
}

/**
 * L: {key, source ACTIVE|DELISTED|HOLDOUT, universe MAIN|EARLY, ended, bars (roh), fund}
 * keepKeys: Kerzen-Schluessel fuer den Doppelhistorien-Abgleich behalten.
 */
function processListing(L, keepKeys) {
  const bars = uniqueBars(L.bars);
  const n = bars.length;
  const idx = LISTINGS.length;
  const meta = { key: L.key, source: L.source, universe: L.universe, ended: !!L.ended, obs: 0, dup: false,
                 lastKey: n ? keyHash(bars[n - 1].date, bars[n - 1].close, bars[n - 1].volume) : null, keys: null,
                 first: n ? bars[0].date : null, last: n ? bars[n - 1].date : null };
  LISTINGS.push(meta);
  if (keepKeys && n) { const k = new Float64Array(n); for (let i = 0; i < n; i++) k[i] = keyHash(bars[i].date, bars[i].close, bars[i].volume); k.sort(); meta.keys = k; }
  if (n < MIN_HIST + 2) return meta;
  const s = engineSeries(bars, CAL_IDX, SPY);
  const dates = s.dates;
  const U = UNIVERSES[L.universe];
  const vals = new Array(NC);
  for (let i = MIN_HIST; i < n; i++) {
    const d = dates[i];
    if (d < U.from || d > U.to || !MONTH_END.has(d)) continue;
    const ft = EL.seriesFeatures(s, i, { minHistory: MIN_HIST });
    if (!ft) continue;
    if (!(ft.rawClose >= MIN_RAW_CLOSE && ft.dollarVolume20 >= MIN_DV)) continue;
    const lead = leadershipScore(ft);
    const fu = fundamentalsAt(L.fund, d);
    const pos = CAL_IDX.get(d);
    vals.fill(NaN);
    for (const c of FCOLS) {
      const v = c === "sma200Rising" ? (ft.sma200Rising ? 1 : 0) : c === "bkDays" ? (ft.breakout ? ft.breakout.daysAgo : NaN)
        : c === "bkPivot" ? (ft.breakout ? ft.breakout.pivot : NaN) : c === "lead" ? lead : c in fu ? fu[c] : ft[c];
      vals[C[c]] = isNum(v) ? v : NaN;
    }
    /* Ergebnisse: Eintritt Schluss t+1 (SPY-Kalender), Ausstieg Schluss t+1+h */
    const entryDate = CAL[pos + 1];
    const e = i + 1;
    const ePos = e < n ? CAL_IDX.get(dates[e]) : undefined;
    if (entryDate && e < n && ePos !== undefined && days(entryDate, dates[e]) <= 5 && days(entryDate, dates[e]) >= 0) {
      /* SPY tritt am selben Tag ein wie der Titel (Review 1, Befund 5) */
      const entry = s.close[e], spyEntry = SPY[ePos];
      let j = e, low = entry;
      for (const h of H) {
        const xp = ePos + h;
        if (xp >= CAL.length) continue;
        const exitDate = CAL[xp];
        while (j + 1 < n && dates[j + 1] <= exitDate) { j++; if (s.close[j] < low) low = s.close[j]; }
        let delisted = 0;
        if (dates[n - 1] < exitDate) {
          if (!L.ended) continue;                 /* Datenende, kein Delisting: nicht verfuegbar */
          delisted = 1;
        }
        const rS = s.close[j] / entry - 1, rB = SPY[xp] / spyEntry - 1;
        if (!isNum(rS) || !isNum(rB)) continue;
        vals[C["ex" + h]] = rS - rB;
        vals[C["dl" + h]] = delisted;
        vals[C["mae" + h]] = low / entry - 1;
      }
    } else if (L.ended && i === n - 1 && entryDate) {
      /* Letzte Kerze am Stichtag, danach beendet: kein Eintritt moeglich.
         Primaer: Wert bleibt als Barmittel (0 %), Sensitivitaet -100 %. */
      for (const h of H) {
        const xp = pos + 1 + h;
        if (xp >= CAL.length) continue;
        vals[C["ex" + h]] = 0 - (SPY[xp] / SPY[pos + 1] - 1);
        vals[C["dl" + h]] = 1;
        vals[C["mae" + h]] = 0;
      }
    }
    pushObs(vals, idx, pos);
    meta.obs++;
  }
  return meta;
}

/* Doppelhistorien: die letzte Kerze eines beendeten Listings steckt in einer
   anderen Reihe -> die Firma lebt unter anderem Kuerzel weiter. */
function markDuplicates(activeLastKeyHits) {
  const withKeys = LISTINGS.filter((l) => l.keys);
  const has = (arr, x) => { let lo = 0, hi = arr.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] === x) return true; if (arr[m] < x) lo = m + 1; else hi = m - 1; } return false; };
  let dups = 0;
  for (const l of LISTINGS) {
    if (!l.ended || l.lastKey === null) continue;
    let hit = activeLastKeyHits.has(l.lastKey);
    if (!hit) for (const o of withKeys) { if (o === l || o.universe !== l.universe || !(o.last > l.last) || o.first > l.last) continue; if (has(o.keys, l.lastKey)) { hit = true; break; } }
    if (hit) { l.dup = true; dups++; }
  }
  for (const l of LISTINGS) l.keys = null;
  return dups;
}

/* ------------------------------------------------------------ Quellen */
let activeEnded = 0;
async function* activeSource(fundByTicker, endedLastKeys, hits) {
  const dir = join(WORK, "tiingo", "daily");
  const common = commonEquityIds();
  let files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (LIMIT) files = files.slice(0, LIMIT);
  for (const file of files) {
    const id = file.slice(0, -5);
    if (id === "ref_SPY" || !common.has(id)) continue;
    let p; try { p = JSON.parse(readFileSync(join(dir, file), "utf8")); } catch { continue; }
    /* Nur das juengste Listing einer Reihe (Luecke > 365 Tage = neues Listing). */
    const seg = SC.currentListingSegment(uniqueBars(p.bars));
    const lastDate = seg.bars.length ? seg.bars[seg.bars.length - 1].date : null;
    /* Doppelhistorie nur, wenn die heutige Reihe nach dieser Kerze weiterlaeuft
       (sonst ist es dasselbe beendete Listing, Review 1, Befund 1). */
    if (endedLastKeys.size) for (const b of seg.bars) {
      const k = keyHash(b.date, b.close, b.volume);
      if (endedLastKeys.has(k) && days(b.date, lastDate) > 30) hits.add(k);
    }
    /* Reihe endet mehr als 30 Tage vor dem Kalenderende: beendet (Delisting-Regel). */
    const stale = !lastDate || days(lastDate, CAL[CAL.length - 1]) > 30;
    if (stale) activeEnded++;
    yield { key: id, ticker: p.ticker, source: "ACTIVE", universe: "MAIN", ended: stale, bars: seg.bars, fund: fundByTicker.get(p.ticker) || null };
  }
}

async function r2Stores() {
  const need = ["VU_HISTORY_S3_ENDPOINT", "VU_HISTORY_S3_BUCKET", "VU_HISTORY_S3_ACCESS_KEY_ID", "VU_HISTORY_S3_SECRET_ACCESS_KEY"];
  if (NO_R2 || need.some((k) => !process.env[k])) return { available: false, reason: "R2_UNAVAILABLE" };
  const Store = require(join(ROOT, "quant/engines/history-store.js"));
  const Guard = require(join(ROOT, "quant/engines/zero-cost-guard.js"));
  const { createS3DriverFromEnv } = await import(join(ROOT, "scripts/market/storage/s3-driver.mjs"));
  const driver = createS3DriverFromEnv(process.env);
  const budget = Guard.createBudget({ classAOperations: 10, classBOperations: 60000 });
  const main = Store.createHistoryStore({ driver, provider: "tiingo", market: "US", budget });
  const delisted = Store.createHistoryStore({ driver, provider: "tiingo-delisted", market: "US", budget });
  const holdout = Store.createHistoryStore({ driver, provider: "tiingo-holdout", market: "US", budget });
  const u = [await main.readUsage(), await delisted.readUsage(), await holdout.readUsage()];
  const usage = Guard.applyUsage(u[0], { classAOperations: u[1].classAOperations + u[2].classAOperations, classBOperations: u[1].classBOperations + u[2].classBOperations });
  const verdict = Guard.evaluate({ usage, estimate: Guard.estimateOperations({ kind: "SURVIVORSHIP_READ", objectReads: 40000, indexWrites: 2 }), operation: "EMERGING_LEADERS_STUDY_READ" });
  log("Zero-Cost-Guard: " + verdict.verdict);
  if (verdict.verdict !== Guard.ALLOWED) return { available: false, reason: "ZERO_COST_GUARD_" + verdict.verdict };
  return { available: true, driver, budget, Guard, delisted, holdout };
}

async function manifestOf(r2, st) {
  r2.budget.consumeClassB(1, "GET manifest");
  const buf = await r2.driver.get(st.seriesPrefix + "_validation/manifest.json.gz");
  return buf ? JSON.parse(zlib.gunzipSync(buf).toString("utf8")) : null;
}

/** Listings eines privaten Namensraums; asOf entscheidet, was "beendet" heisst. */
async function namespaceListings(r2, st, { universe, source, asOf: asOfIn, onlyEnded, lagDays = 20 }) {
  let asOf = asOfIn;
  const manifest = await manifestOf(r2, st);
  if (!manifest) return { available: false, reason: "MANIFEST_MISSING" };
  if (!asOf) asOf = (manifest.updatedAt || new Date().toISOString()).slice(0, 10);
  const counts = { entries: 0, skippedClass: 0, notUsable: {}, ended: 0, survivors: 0 };
  const todo = [];
  for (const [id, e] of Object.entries(manifest.entries || {})) {
    if (id.startsWith("BENCH:")) continue;
    counts.entries++;
    if (e.status === "SKIPPED_CLASS" || e.included === false) { counts.skippedClass++; continue; }
    const cl = SC.classifyFetchedListing(e, { asOf, activeLagDays: lagDays });
    if (cl && cl.cls !== "A" && cl.cls !== "B") { counts.notUsable[cl.cls] = (counts.notUsable[cl.cls] || 0) + 1; continue; }
    if (!cl && !(e.status === "OK" || e.status === "PARTIAL")) continue;
    if (!cl && onlyEnded) continue;                                     /* aktive Titel kommen aus der Arbeitsablage */
    if (cl) counts.ended++; else counts.survivors++;
    const p = String(id).split(":");
    todo.push({ id, ticker: p[2], start: p[3], ended: !!cl });
  }
  const list = LIMIT ? todo.slice(0, LIMIT) : todo;
  return { available: true, asOf, manifestUpdatedAt: manifest.updatedAt || null, counts, list, failed: 0, missing: 0,
    async *iterate() {
      /* Parallel lesen, der Reihe nach rechnen. */
      let next = 0;
      const inflight = new Map();
      const start = () => {
        if (next >= list.length) return;
        const k = next++, t = list[k];
        inflight.set(k, st.getSeries(`${t.ticker}@${t.start}`).then((s) => ({ t, s, err: null }), (err) => ({ t, s: null, err })));
      };
      for (let c = 0; c < CONCURRENCY; c++) start();
      for (let k = 0; k < list.length; k++) {
        const { t, s, err } = await inflight.get(k);
        inflight.delete(k);
        start();
        if (err) { this.failed++; if (this.failed <= 3) log(`${source}: Lesefehler ${String(err.message || err).slice(0, 80)}`); continue; }
        if (!s || !Array.isArray(s.bars)) { this.missing++; continue; }
        yield { key: source + ":" + t.id, ticker: t.ticker, source, universe, ended: t.ended, bars: s.bars, fund: null };
        if ((k + 1) % 1000 === 0) log(`${source}: ${k + 1}/${list.length} gelesen`);
      }
    } };
}

/* ------------------------------------------------------- Synthetik */
function synthetic(N) {
  const rnd = EL.stats.rng(7);
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const dates = [];
  for (let t = Date.parse("2006-01-02T00:00:00Z"); t <= Date.parse("2026-10-09T00:00:00Z"); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) dates.push(d.toISOString().slice(0, 10)); }
  const spy = new Float64Array(dates.length); spy[0] = 100;
  for (let i = 1; i < dates.length; i++) spy[i] = spy[i - 1] * (1 + 0.0003 + 0.01 * gauss());
  const titles = [];
  for (const universe of ["MAIN", "EARLY"]) {
    for (let k = 0; k < N; k++) {
      const from = universe === "MAIN" ? "2014-06-02" : "2006-01-02", to = universe === "MAIN" ? "2026-10-09" : "2015-12-31";
      const ended = rnd() < 0.15;
      const end = ended ? dates[Math.floor(dates.indexOf(from) + 600 + rnd() * (dates.indexOf(to) - dates.indexOf(from) - 600))] : to;
      const bars = []; let p = 10 + 90 * rnd(), drift = 0;
      for (let i = dates.indexOf(from); i < dates.length && dates[i] <= end; i++) {
        if (rnd() < 0.004) drift = (rnd() - 0.4) * 0.004;
        const r = drift + 0.018 * gauss(); p *= Math.exp(r);
        const v = Math.round(5e5 * (1 + (r > 0 ? 0.3 : 0)) * Math.exp(0.4 * gauss()));
        bars.push({ date: dates[i], open: p, high: p * (1 + 0.01 * rnd()), low: p * (1 - 0.01 * rnd()), close: p, volume: v, splitFactor: 1 });
      }
      titles.push({ key: `SYN:${universe}:${k}`, ticker: "S" + k, source: universe === "EARLY" ? "HOLDOUT" : ended ? "DELISTED" : "ACTIVE", universe, ended, bars,
        fund: k % 2 ? { annual: { revenue: [[2014, "FY", "2014-12-31", 100, "2015-02-20"], [2015, "FY", "2015-12-31", 110 + k % 7, "2016-02-20"], [2016, "FY", "2016-12-31", 125 + k % 11, "2017-02-20"]],
          net_income: [[2015, "FY", "2015-12-31", 5, "2016-02-20"], [2016, "FY", "2016-12-31", 7, "2017-02-20"]], free_cash_flow: [[2016, "FY", "2016-12-31", 6, "2017-02-20"]] } } : null });
    }
  }
  return { dates, spy, titles };
}

/* ======================================================== Querschnitt */
function rowsOf(obsIdx, prior) {
  return obsIdx.map((o) => {
    const f = {};
    for (const c of FCOLS) f[c] = get(o, C[c]);
    f.sma200Rising = f.sma200Rising === 1;
    f.breakout = isNum(f.bkDays) ? { daysAgo: f.bkDays, pivot: f.bkPivot } : null;
    const fund = [f.revenueAccel, f.revenueGrowthYoy, f.netMarginChange, f.fcfMargin].some(isNum)
      ? { revenueAccel: f.revenueAccel, revenueGrowthYoy: f.revenueGrowthYoy, netMarginChange: f.netMarginChange, fcfMargin: f.fcfMargin } : null;
    const lid = store.listing[o];
    return { o, lid, f, fund, prior: prior ? prior.get(lid) || null : null, leadershipScore: f.lead };
  });
}

function scoreOf(r, sel) {
  if (MODELS.includes(sel)) return r.models[sel];
  if (sel === "MOM_12_1") return r.baselines.MOM_12_1;
  if (sel === "RS_6M") return r.baselines.RS_6M;
  if (sel === "LEADERSHIP_VU") return r.baselines.LEADERSHIP_VU;
  return NaN;
}
/** Auswahl eines Stichtags: oberstes Dezil (>= 20 Titel) bzw. alle Trend-Template-Treffer / alle Titel. */
function selectTop(rows, sel) {
  if (sel === "UNIVERSE") return rows;
  if (sel === "TREND_TEMPLATE") { const t = rows.filter((r) => r.baselines.TREND_TEMPLATE === 1); return t.length >= MIN_NAMES ? t : null; }
  const c = rows.filter((r) => isNum(scoreOf(r, sel)));
  const k = Math.ceil(c.length / 10);
  if (k < MIN_NAMES) return null;
  c.sort((a, b) => scoreOf(b, sel) - scoreOf(a, sel) || (LISTINGS[a.lid].key < LISTINGS[b.lid].key ? -1 : 1));
  return c.slice(0, k);
}

const wins = (x) => Math.min(WIN_HI, Math.max(WIN_LO, x));
function exitOk(period, dateIdx, h) {
  const xp = dateIdx + 1 + h;
  if (xp >= CAL.length) return false;
  return !PURGED.has(period) || CAL[xp] <= PERIODS[period].to;
}
const spyRet = (dateIdx, h) => SPY[dateIdx + 1 + h] / SPY[dateIdx + 1] - 1;

/* Dates nach Universum, aufsteigend */
function datesByUniverse() {
  const by = { MAIN: new Map(), EARLY: new Map() };
  for (let o = 0; o < store.n; o++) {
    const l = LISTINGS[store.listing[o]];
    if (l.dup) continue;
    const m = by[l.universe], d = store.date[o];
    (m.get(d) || m.set(d, []).get(d)).push(o);
  }
  return Object.fromEntries(Object.entries(by).map(([u, m]) => [u, [...m.keys()].sort((a, b) => a - b).map((d) => ({ dateIdx: d, date: CAL[d], obs: m.get(d) }))]));
}

/** Ein Durchlauf ueber alle Stichtage eines Universums mit Prior-Raengen (drei Monatsenden zuvor). */
function* crossSections(dates, opts, onlyPeriod) {
  const history = [];
  for (const D of dates) {
    const prior = history.length >= 3 ? history[history.length - 3] : null;
    const rows = rowsOf(D.obs, prior);
    EL.crossSection(rows, opts);
    const map = new Map(rows.map((r) => [r.lid, { pRS_60: r.p.pRS_60, pRS_120: r.p.pRS_120 }]));
    history.push(map); if (history.length > 4) history.shift();
    const period = periodOf(D.date);
    if (onlyPeriod && period !== onlyPeriod) continue;
    yield { D, rows, period };
  }
}

/* ======================================================== Hauptlauf */
async function main() {
  const sources = { active: null, delisted: null, holdout: null };
  let status = "COMPLETE";
  const limitations = [];

  if (SYNTH) {
    const s = synthetic(SYNTH);
    setCalendar(s.dates, s.spy);
    for (const t of s.titles) processListing(t, t.universe === "EARLY" || t.ended);
    status = "SYNTHETIC";
    sources.active = { listings: s.titles.length };
    markDuplicates(new Set());
  } else {
    if (!WORK || !existsSync(join(WORK, "tiingo", "daily"))) throw new Error("--work-dir mit tiingo/daily fehlt (oder --synthetic N)");
    const spyFile = join(WORK, "tiingo", "daily", "ref_SPY.json");
    if (!existsSync(spyFile)) throw new Error("SPY fehlt in der Arbeitsablage");
    const spy = benchmarkFromBars(JSON.parse(readFileSync(spyFile, "utf8")).bars);
    setCalendar(spy.dates, spy.close);
    log(`SPY ${spy.dates[0]} .. ${spy.dates[spy.dates.length - 1]}, ${MONTH_END.size} Monatsenden`);

    const r2 = await r2Stores().catch((e) => ({ available: false, reason: "R2_ERROR: " + String(e.message || e).slice(0, 120) }));
    /* 1. Delistete Listings (MAIN, ab 2016) */
    if (r2.available) {
      /* "beendet" relativ zum Abrufstand des Manifests (asOf null) */
      const dl2 = await namespaceListings(r2, r2.delisted, { universe: "MAIN", source: "DELISTED", asOf: null, onlyEnded: true });
      if (dl2.available) {
        const asOf = dl2.asOf;
        let used = 0;
        for await (const L of dl2.iterate()) { const m = processListing(L, true); if (m.obs) used++; }
        sources.delisted = { available: true, asOf, manifestUpdatedAt: dl2.manifestUpdatedAt, counts: dl2.counts, listingsRead: dl2.list.length, readFailures: dl2.failed, seriesMissing: dl2.missing, listingsWithObservations: used };
        if (dl2.failed) { status = "INCOMPLETE"; limitations.push(dl2.failed + " delistete Reihen nicht lesbar."); }
        if (asOf < PERIODS.HOLDOUT_RECENT.to) limitations.push("Delisting-Manifest vom " + asOf + ": spaeter beendete Listings erscheinen nur, wenn ihre Reihe in der Arbeitsablage liegt (dort als beendet behandelt, sobald sie > 30 Tage vor Datenende endet).");
        log(`DELISTED: ${dl2.list.length} Listings gelesen, ${used} mit Beobachtungen`);
      } else { sources.delisted = { available: false, reason: dl2.reason }; }
      /* 2. Holdout-Universum 2007-2015 (EARLY) */
      const ho = await namespaceListings(r2, r2.holdout, { universe: "EARLY", source: "HOLDOUT", asOf: PERIODS.HOLDOUT_EARLY.to, onlyEnded: false, lagDays: 4 });
      if (ho.available) {
        let used = 0;
        for await (const L of ho.iterate()) { const m = processListing(L, true); if (m.obs) used++; }
        sources.holdout = { available: true, manifestUpdatedAt: ho.manifestUpdatedAt, counts: ho.counts, listingsRead: ho.list.length, readFailures: ho.failed, seriesMissing: ho.missing, listingsWithObservations: used };
        if (ho.failed) { status = "INCOMPLETE"; limitations.push(ho.failed + " Holdout-Reihen nicht lesbar."); }
        log(`HOLDOUT: ${ho.list.length} Listings gelesen, ${used} mit Beobachtungen`);
      } else { sources.holdout = { available: false, reason: ho.reason }; }
      const sp = r2.budget.spent;
      sources.r2Operations = { classA: sp.classA, classB: sp.classB };
    } else {
      sources.delisted = { available: false, reason: r2.reason };
      sources.holdout = { available: false, reason: r2.reason };
    }
    if (!sources.delisted.available) { status = "INCOMPLETE"; limitations.push("Keine delisteten Listings: Ergebnis 2016-2026 nur aus Ueberlebenden (Survivorship-Bias nach oben)."); }
    if (!sources.holdout.available) limitations.push("Holdout 2008-2015 nicht verfuegbar.");

    /* 3. Heute gelistete Titel */
    const endedLastKeys = new Set(LISTINGS.filter((l) => l.ended && l.universe === "MAIN").map((l) => l.lastKey));
    const hits = new Set();
    const dir = join(WORK, "tiingo", "daily");
    const tickers = new Set();
    for (const f of readdirSync(dir)) { if (!f.endsWith(".json")) continue; try { const t = JSON.parse(readFileSync(join(dir, f), "utf8")).ticker; if (t) tickers.add(t); } catch { /* unlesbar */ } }
    const fundByTicker = loadFundamentals(tickers);
    log(`Fundamentaldaten fuer ${fundByTicker.size} heutige Titel`);
    let n = 0, used = 0;
    for await (const L of activeSource(fundByTicker, endedLastKeys, hits)) { const m = processListing(L, false); n++; if (m.obs) used++; if (n % 1000 === 0) log(`ACTIVE ${n}`); }
    sources.active = { available: true, listings: n, listingsWithObservations: used, withFundamentals: fundByTicker.size };
    const dups = markDuplicates(hits);
    sources.tickerChangeDuplicatesDropped = dups;
    log(`ACTIVE ${n} Listings (${used} mit Beobachtungen); Doppelhistorien verworfen: ${dups}`);
  }
  log(`Beobachtungen: ${store.n}`);

  const byU = datesByUniverse();

  /* ---------- Lauf 1: DEVELOPMENT - Korrelation und M3-Gewichte ---------- */
  const G = Object.keys(EL.GROUPS);
  const groupIcDev = (opts) => {
    const ic = Object.fromEntries(G.map((g) => [g, []]));
    const corr = {};
    for (const { D, rows } of crossSections(byU.MAIN, opts, "DEVELOPMENT")) {
      const okH = exitOk("DEVELOPMENT", D.dateIdx, H_PRIMARY);
      const y = rows.map((r) => (okH ? get(r.o, C["ex" + H_PRIMARY]) : NaN));
      for (const g of G) { const v = EL.stats.spearman(rows.map((r) => r.groups[g]), y); if (isNum(v)) ic[g].push(v); }
      for (let a = 0; a < G.length; a++) for (let b = a + 1; b < G.length; b++) {
        const v = EL.stats.spearman(rows.map((r) => r.groups[G[a]]), rows.map((r) => r.groups[G[b]]));
        if (isNum(v)) (corr[G[a] + G[b]] || (corr[G[a] + G[b]] = [])).push(v);
      }
    }
    return { ic: Object.fromEntries(G.map((g) => [g, EL.stats.neweyWestT(ic[g], nwLag(H_PRIMARY))])),
             corr: Object.fromEntries(Object.entries(corr).map(([k, v]) => [k, EL.stats.mean(v)])) };
  };
  const pass1 = groupIcDev({});
  const merge = [];
  const mergedGroups = new Set();
  for (const [pair, rho] of Object.entries(pass1.corr).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) {
    const [a, b] = pair.split("");
    if (a !== "E" && b !== "E" && Math.abs(rho) > 0.7 && !mergedGroups.has(a) && !mergedGroups.has(b)) { merge.push([a, b]); mergedGroups.add(a); mergedGroups.add(b); }
  }
  const pass1b = merge.length ? groupIcDev({ merge }) : pass1;
  const weights = {};
  for (const g of G) { const m = pass1b.ic[g] && pass1b.ic[g].mean; weights[g] = isNum(m) && m > 0 ? m : 0; }
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0);
  const frozenDev = Object.freeze({ merge, weights: wSum > 0 ? Object.fromEntries(G.map((g) => [g, weights[g] / wSum])) : null,
    groupCorrelationDev: pass1.corr, groupIcDev: pass1b.ic });
  log(`DEV: Zusammenlegung ${JSON.stringify(merge)}, M3-Gewichte ${JSON.stringify(frozenDev.weights)}`);

  /* ---------- Lauf 2: alle Stichtage ---------- */
  const P = Object.keys(PERIODS);
  const mk = () => ({ dates: [], vsMedian: [], dm: [], dmExcl: [], dmM100: [], spread: [], ic: [], pooled: [], mae: 0, maeN: 0, hits: 0, n: 0, dl: 0, names: 0, regime: [], breadth: [] });
  const acc = Object.fromEntries(P.map((p) => [p, Object.fromEntries(SELECTORS.map((s) => [s, Object.fromEntries(H.map((h) => [h, mk()]))]))]));
  const rand = Object.fromEntries(P.map((p) => [p, Object.fromEntries(H.map((h) => [h, { sums: new Float64Array(RANDOM_REPS), n: 0 }]))]));
  const fm = Object.fromEntries(P.map((p) => [p, Object.fromEntries(MODELS.map((m) => [m, []]))]));
  const overlap = Object.fromEntries(P.map((p) => [p, Object.fromEntries(MODELS.map((m) => [m, { MOM_12_1: [], RS_6M: [], LEADERSHIP_VU: [] }]))]));
  const turnover = Object.fromEntries(SELECTORS.filter((s) => s !== "UNIVERSE").map((s) => [s, []]));
  const groupIc = Object.fromEntries(P.map((p) => [p, Object.fromEntries(G.map((g) => [g, []]))]));
  const sizeSplit = Object.fromEntries(P.map((p) => [p, Object.fromEntries(MODELS.map((m) => [m, [[], [], []]]))]));
  const ST = EL.STATES;
  const stAcc = Object.fromEntries(P.map((p) => [p, Object.fromEntries(ST.map((s) => [s, { count: 0, perDate: [], ...Object.fromEntries(STATE_H.map((h) => [h, { dm: [], pooled: [], hits: 0, n: 0 }])) }]))]));
  const stDiff = Object.fromEntries(P.map((p) => [p, {}]));
  const trans = Object.fromEntries(P.map((p) => [p, ST.map(() => ST.map(() => 0))]));
  const dateCount = Object.fromEntries(P.map((p) => [p, { dates: 0, names: 0, emerging: 0, withFund: 0, breadth: [] }]));
  const rng = EL.stats.rng(RANDOM_SEED);
  const breadthDev = [];

  for (const u of ["MAIN", "EARLY"]) {
    let prevTop = {}, prevState = new Map();
    for (const { D, rows, period } of crossSections(byU[u], { merge: frozenDev.merge, weights: frozenDev.weights })) {
      const above = rows.filter((r) => r.f.close > r.f.sma50).length / rows.length;
      const regime = SPY[D.dateIdx] > SPY_SMA200[D.dateIdx] ? "RISK_ON" : "RISK_OFF";
      const tops = {};
      for (const sel of SELECTORS) tops[sel] = selectTop(rows, sel);
      /* Umschlag und Zustandsuebergaenge laufen ueber alle Stichtage */
      for (const sel of Object.keys(turnover)) {
        if (tops[sel] && prevTop[sel]) { const prev = new Set(prevTop[sel].map((r) => r.lid)); turnover[sel].push(tops[sel].filter((r) => !prev.has(r.lid)).length / tops[sel].length); }
      }
      prevTop = tops;
      const stateNow = new Map(rows.map((r) => [r.lid, ST.indexOf(r.state)]));
      if (period) for (const [lid, s] of stateNow) { const p0 = prevState.get(lid); if (p0 !== undefined) trans[period][p0][s]++; }
      prevState = stateNow;
      if (!period) continue;
      if (period === "DEVELOPMENT") breadthDev.push(above);
      const dc = dateCount[period];
      dc.dates++; dc.names += rows.length; dc.emerging += rows.filter((r) => r.emerging).length; dc.withFund += rows.filter((r) => isNum(r.groups.E)).length; dc.breadth.push(above);

      for (const h of H) {
        if (!exitOk(period, D.dateIdx, h)) continue;
        const rB = spyRet(D.dateIdx, h);
        const exOf = (r) => get(r.o, C["ex" + h]);
        /* Begrenzung auf die Einzelrendite des Titels (outcome.winsorize), nicht auf die Ueberrendite */
        const wx = (x) => wins(x + rB) - rB;
        const uni = rows.map(exOf).filter(isNum);
        const uniMean = EL.stats.mean(uni.map(wx)), uniMedian = EL.stats.median(uni);
        for (const sel of SELECTORS) {
          const top = tops[sel];
          if (!top) continue;
          const a = acc[period][sel][h];
          const avail = top.filter((r) => isNum(exOf(r)));
          if (avail.length < Math.min(MIN_NAMES, top.length) / 2) continue;
          const xs = [], xsExcl = [], xsM100 = [], raw = [];
          for (const r of avail) {
            const x = exOf(r), dl = get(r.o, C["dl" + h]) === 1;
            xs.push(wx(x)); raw.push(x); if (!dl) xsExcl.push(wx(x)); xsM100.push(dl ? -1 - rB : wx(x));
            a.pooled.push(x); a.n++; if (x > 0) a.hits++; if (dl) a.dl++;
            const mae = get(r.o, C["mae" + h]); if (isNum(mae)) { a.mae += mae; a.maeN++; }
          }
          a.dates.push(D.date); a.dm.push(EL.stats.mean(xs)); a.dmExcl.push(EL.stats.mean(xsExcl)); a.dmM100.push(EL.stats.mean(xsM100));
          a.vsMedian.push(EL.stats.median(raw) - uniMedian);
          a.spread.push(EL.stats.mean(xs) - uniMean); a.names += top.length; a.regime.push(regime); a.breadth.push(above);
          if (sel !== "UNIVERSE" && sel !== "TREND_TEMPLATE") { const ic = EL.stats.spearman(rows.map((r) => scoreOf(r, sel)), rows.map(exOf)); if (isNum(ic)) a.ic.push(ic); }
        }
        /* Zufall: so viele Titel wie ein Dezil des Stichtags (mindestens 20) */
        /* ohne Zuruecklegen (partieller Fisher-Yates), k = Dezil der Titel mit Ergebnis */
        const pool = rows.filter((r) => isNum(exOf(r))).map((r) => wx(exOf(r)));
        const k = Math.ceil(pool.length / 10);
        if (k >= MIN_NAMES) {
          const R = rand[period][h];
          for (let rep = 0; rep < RANDOM_REPS; rep++) {
            let s = 0;
            for (let j = 0; j < k; j++) { const z = j + Math.floor(rng() * (pool.length - j)); const t = pool[z]; pool[z] = pool[j]; pool[j] = t; s += t; }
            R.sums[rep] += s / k;
          }
          R.n++;
        }
        /* Zustaende */
        if (STATE_H.includes(h)) {
          const means = {};
          for (const s of ST) {
            const xs = rows.filter((r) => r.state === s).map(exOf).filter(isNum);
            const A2 = stAcc[period][s][h];
            for (const x of xs) { A2.pooled.push(x); A2.n++; if (x > 0) A2.hits++; }
            if (xs.length >= 5) { means[s] = EL.stats.mean(xs.map(wins)); A2.dm.push(means[s]); }
          }
          for (let q = 1; q < ST.length; q++) {
            const key = ST[q] + "_vs_" + ST[q - 1], key0 = ST[q] + "_vs_S0_NONE";
            const d1 = stDiff[period];
            if (isNum(means[ST[q]]) && isNum(means[ST[q - 1]])) ((d1[key] || (d1[key] = {}))[h] || (d1[key][h] = [])).push(means[ST[q]] - means[ST[q - 1]]);
            if (q > 1 && isNum(means[ST[q]]) && isNum(means.S0_NONE)) ((d1[key0] || (d1[key0] = {}))[h] || (d1[key0][h] = [])).push(means[ST[q]] - means.S0_NONE);
          }
        }
        if (h === H_PRIMARY) {
          const y = EL.pctRanks(rows.map(exOf));
          const pm = EL.pctRanks(rows.map((r) => r.baselines.MOM_12_1)), pl = EL.pctRanks(rows.map((r) => r.baselines.LEADERSHIP_VU));
          for (const m of MODELS) {
            const beta = EL.stats.ols(y, [EL.pctRanks(rows.map((r) => r.models[m])), pm, pl]);
            if (beta) fm[period][m].push(beta[0]);
            const top = tops[m];
            if (top) {
              const ids = new Set(top.map((r) => r.lid));
              for (const b of ["MOM_12_1", "RS_6M", "LEADERSHIP_VU"]) if (tops[b]) { const bs = new Set(tops[b].map((r) => r.lid)); overlap[period][m][b].push([...ids].filter((x) => bs.has(x)).length / ids.size); }
            }
            /* Groesse: Dollarumsatz-Terzile des Stichtags, Dezil je Terzil gegen das Terzil */
            const dv = EL.pctRanks(rows.map((r) => r.f.dollarVolume20));
            for (let t = 0; t < 3; t++) {
              const sub = rows.filter((r, j) => dv[j] >= t / 3 && (t === 2 ? dv[j] <= 1 : dv[j] < (t + 1) / 3));
              const sTop = selectTop(sub, m);
              if (!sTop) continue;
              const xs = sTop.map(exOf).filter(isNum).map(wins), us = sub.map(exOf).filter(isNum).map(wins);
              if (xs.length) sizeSplit[period][m][t].push(EL.stats.mean(xs) - EL.stats.mean(us));
            }
          }
          for (const g of G) { const v = EL.stats.spearman(rows.map((r) => r.groups[g]), rows.map(exOf)); if (isNum(v)) groupIc[period][g].push(v); }
        }
      }
      for (const s of ST) { const n = rows.filter((r) => r.state === s).length; stAcc[period][s].count += n; stAcc[period][s].perDate.push(n); }
    }
  }
  log("Auswertung gerechnet");

  /* ---------- Zusammenfassung ---------- */
  const q = (xs, p) => { const a = xs.filter(isNum).sort((x, y) => x - y); if (!a.length) return null; const k = (a.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); return a[lo] + (a[hi] - a[lo]) * (k - lo); };
  const nw = (xs, h) => { const r = EL.stats.neweyWestT(xs, nwLag(h)); return { mean: r4(r.mean), t: isNum(r.t) ? Math.round(r.t * 100) / 100 : null, dates: r.n }; };
  function summary(a, h) {
    if (!a.dates.length) return { dates: 0 };
    const g = EL.stats.neweyWestT(a.dm, nwLag(h));
    return {
      dates: a.dates.length, avgNames: Math.round(a.names / a.dates.length), observations: a.n,
      meanExcessGross: r4(g.mean), tNW: isNum(g.t) ? Math.round(g.t * 100) / 100 : null,
      meanExcessNet: { LOW: r4(g.mean - COSTS.LOW / 1e4), BASE: r4(g.mean - COSTS.BASE / 1e4), HIGH: r4(g.mean - COSTS.HIGH / 1e4) },
      tNWNetBase: isNum(g.se) ? Math.round(((g.mean - COSTS.BASE / 1e4) / g.se) * 100) / 100 : null,
      medianExcess: r4(EL.stats.median(a.pooled)), hitRate: a.n ? r4(a.hits / a.n) : null, meanMAE: a.maeN ? r4(a.mae / a.maeN) : null,
      spreadVsUniverse: nw(a.spread, h), medianVsUniverseMedian: nw(a.vsMedian, h), ic: a.ic.length ? nw(a.ic, h) : null,
      delisting: { share: a.n ? r4(a.dl / a.n) : null, excludedMean: r4(EL.stats.mean(a.dmExcl)), minus100Mean: r4(EL.stats.mean(a.dmM100)) },
      worstDate: r4(Math.min(...a.dm)), shareOfPositiveDates: r4(a.dm.filter((x) => x > 0).length / a.dm.length)
    };
  }
  const results = Object.fromEntries(P.map((p) => [p, Object.fromEntries(SELECTORS.map((s) => [s, Object.fromEntries(H.map((h) => [h, summary(acc[p][s][h], h)]))]))]));
  const random = Object.fromEntries(P.map((p) => [p, Object.fromEntries(H.map((h) => { const R = rand[p][h]; if (!R.n) return [h, null]; const m = Array.from(R.sums, (x) => x / R.n);
    return [h, { reps: RANDOM_REPS, seed: RANDOM_SEED, dates: R.n, mean: r4(EL.stats.mean(m)), p025: r4(q(m, 0.025)), p975: r4(q(m, 0.975)) }]; }))]));
  const famaMacBeth = Object.fromEntries(P.map((p) => [p, Object.fromEntries(MODELS.map((m) => [m, nw(fm[p][m], H_PRIMARY)]))]));
  const overlapOut = Object.fromEntries(P.map((p) => [p, Object.fromEntries(MODELS.map((m) => [m, Object.fromEntries(Object.entries(overlap[p][m]).map(([b, xs]) => [b, r4(EL.stats.mean(xs))]))]))]));
  const groupIcOut = Object.fromEntries(P.map((p) => [p, Object.fromEntries(G.map((g) => [g, nw(groupIc[p][g], H_PRIMARY)]))]));
  const turnoverOut = Object.fromEntries(Object.entries(turnover).map(([s, xs]) => [s, r4(EL.stats.mean(xs))]));
  const breadthCut = [q(breadthDev, 1 / 3), q(breadthDev, 2 / 3)];
  function splits(p, m) {
    const a = acc[p][m][H_PRIMARY];
    const part = (pred) => { const xs = a.spread.filter((_, j) => pred(j)); return nw(xs, H_PRIMARY); };
    return {
      regime: { RISK_ON: part((j) => a.regime[j] === "RISK_ON"), RISK_OFF: part((j) => a.regime[j] === "RISK_OFF") },
      breadth: breadthCut[0] === null ? null : { LOW: part((j) => a.breadth[j] < breadthCut[0]), MID: part((j) => a.breadth[j] >= breadthCut[0] && a.breadth[j] < breadthCut[1]), HIGH: part((j) => a.breadth[j] >= breadthCut[1]) },
      size: { SMALL: nw(sizeSplit[p][m][0], H_PRIMARY), MID: nw(sizeSplit[p][m][1], H_PRIMARY), LARGE: nw(sizeSplit[p][m][2], H_PRIMARY) },
      measure: "Topdezil minus Universum desselben Stichtags (Groesse: minus Terzil), h=63, brutto"
    };
  }
  const states = Object.fromEntries(P.map((p) => [p, {
    perState: Object.fromEntries(ST.map((s) => { const A2 = stAcc[p][s]; return [s, { observations: A2.count, avgPerDate: r4(EL.stats.mean(A2.perDate)),
      ...Object.fromEntries(STATE_H.map((h) => [h, { dates: A2[h].dm.length, meanExcess: nw(A2[h].dm, h), medianExcess: r4(EL.stats.median(A2[h].pooled)), hitRate: A2[h].n ? r4(A2[h].hits / A2[h].n) : null }])) }]; })),
    separation: Object.fromEntries(Object.entries(stDiff[p]).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([h, xs]) => [h, nw(xs, Number(h))]))])),
    persistence: Object.fromEntries(ST.map((s, i) => { const row = trans[p][i], tot = row.reduce((a, b) => a + b, 0); return [s, tot ? r4(row[i] / tot) : null]; })),
    transitions: { order: ST, counts: trans[p] }
  }]));

  /* ---------- Modellwahl: nur VALIDATION ---------- */
  const valOnly = Object.freeze(JSON.parse(JSON.stringify({ results: results.VALIDATION })));
  function select(v) {
    const cand = MODELS.map((m) => ({ model: m, net: v.results[m][H_PRIMARY].meanExcessNet ? v.results[m][H_PRIMARY].meanExcessNet.BASE : null, icT: v.results[m][H_PRIMARY].ic ? v.results[m][H_PRIMARY].ic.t : null }));
    const ok = cand.filter((c) => isNum(c.net) && isNum(c.icT) && c.icT >= 2);
    ok.sort((a, b) => b.net - a.net);
    return { candidates: cand, chosen: ok.length ? ok[0].model : null, rule: PREREG.selectionRule.criterion };
  }
  const selection = Object.freeze(select(valOnly));
  const selectionHash = createHash("sha256").update(JSON.stringify(selection)).digest("hex");
  log(`Modellwahl (VALIDATION): ${selection.chosen || "keines"}`);

  /* ---------- Gate ueber die Holdouts ---------- */
  function holdoutCheck(p) {
    const m = selection.chosen;
    const r = results[p][m] && results[p][m][H_PRIMARY];
    if (!r || !r.dates) return { available: false };
    const net = r.meanExcessNet.BASE, t = r.tNWNetBase, fmT = famaMacBeth[p][m].t;
    const rsNet = results[p].RS_6M[H_PRIMARY].meanExcessNet?.BASE, momNet = results[p].MOM_12_1[H_PRIMARY].meanExcessNet?.BASE;
    const pass = net > 0 && t >= 2 && isNum(rsNet) && net > rsNet && isNum(momNet) && net > momNet && fmT >= 2;
    return { available: true, netBase: net, tNetBase: t, rsNet, momNet, famaMacBethT: fmT, pass, positive: net > 0 };
  }
  let gate;
  if (status !== "COMPLETE") gate = { evidenceStatus: "EXPERIMENTAL", reason: status === "SYNTHETIC" ? "SYNTHETIC_RUN" : "STUDY_INCOMPLETE" };
  else if (!selection.chosen) gate = { evidenceStatus: "EXPERIMENTAL", reason: "NO_MODEL_QUALIFIED_ON_VALIDATION" };
  else {
    const hr = holdoutCheck("HOLDOUT_RECENT"), he = holdoutCheck("HOLDOUT_EARLY");
    const av = [hr, he].filter((x) => x.available);
    const passes = av.filter((x) => x.pass).length;
    const ev = av.length && passes === av.length ? "VALIDATED" : passes === 1 && av.every((x) => x.positive) ? "PARTIAL" : "EXPERIMENTAL";
    gate = { evidenceStatus: ev, HOLDOUT_RECENT: hr, HOLDOUT_EARLY: he, holdoutsAvailable: av.length,
      reason: ev === "VALIDATED" ? "ALL_AVAILABLE_HOLDOUTS_PASS" : ev === "PARTIAL" ? "ONE_HOLDOUT_PASSES" : "HOLDOUT_CONDITIONS_NOT_MET" };
  }
  log(`Evidenzstatus: ${gate.evidenceStatus} (${gate.reason})`);

  limitations.push(
    "Renditebasis: split-bereinigte Kursrendite ohne Dividenden fuer Titel und SPY.",
    "Keine Point-in-Time-Sektorzuordnung: keine Sektor-Auswertung.",
    "Groesse ueber Dollarumsatz genaehert (keine historische Marktkapitalisierung).",
    "Fundamentaldaten (Gruppe E) nur fuer heute gelistete Titel; Jahreswerte mit spaeter Sichtbarkeit. Weil nur Ueberlebende Gruppe E tragen, haengt die Topdezil-Auswahl von M2/M3 teilweise am spaeteren Ueberleben: M2/M3 sind fuer 2016-2026 nach oben verzerrt und nur zusammen mit M1/M4 zu lesen.",
    "Der maximale Rueckgang im Fenster ist durch die Maximum Adverse Excursion (tiefster Schluss gegen Einstieg) ersetzt; ein Rueckgang von einem Zwischenhoch wird nicht berichtet.",
    "Alt-Listings spaeter neu vergebener Kuerzel (Klasse D) sind nicht abrufbar und fehlen.",
    "Europa: keine Tagesreihen mit Volumen - nicht Teil der Studie.",
    "Beobachtungen ueberlappen bei h > 21 (monatliches Raster); Standardfehler nach Newey-West.");

  const coverage = Object.fromEntries(P.map((p) => { const d = dateCount[p]; return [p, { dates: d.dates, avgEligible: d.dates ? Math.round(d.names / d.dates) : 0,
    avgEmerging: d.dates ? Math.round(d.emerging / d.dates) : 0, fundamentalShare: d.names ? r4(d.withFund / d.names) : null, avgBreadth: r4(EL.stats.mean(d.breadth)) }]; }));

  /* Fingerabdruck des rechnenden Codes (Review 1, Befund 4) und Laufprotokoll:
     jede Holdout-Auswertung einer Methodikversion bleibt im Artefakt
     sichtbar, auch wenn ein spaeterer Lauf (etwa nach einer Fehlerkorrektur)
     sie ersetzt. Was nach dem ersten Holdout-Blick geaendert wurde, steht
     damit offen da. */
  const sha = (rel) => createHash("sha256").update(readFileSync(join(ROOT, rel))).digest("hex");
  const CODE = ["quant/engines/emerging-leaders.js", "scripts/quant/build-emerging-leaders-study.mjs", "scripts/quant/lib/emerging-leaders-inputs.mjs"];
  const codeSha256 = Object.fromEntries(CODE.map((f) => [f, sha(f)]));
  let gitSha = null; try { gitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim(); } catch { /* ohne Git */ }
  let previous = null; try { previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null; } catch { previous = null; }
  const runs = (previous && previous.methodologyVersion === PREREG.methodologyVersion && Array.isArray(previous.runs) ? previous.runs : []).slice(-20);
  runs.push({ at: new Date().toISOString(), status, gitSha, codeSha256, evidenceStatus: gate.evidenceStatus, selected: selection.chosen,
    holdoutEvaluated: status === "COMPLETE" });
  const holdoutEvaluations = runs.filter((x) => x.holdoutEvaluated).length;
  if (holdoutEvaluations > 1) limitations.push("Holdout dieser Methodikversion wurde " + holdoutEvaluations + "-mal ausgewertet (siehe runs); Aenderungen zwischen den Laeufen sind ueber codeSha256/gitSha nachvollziehbar.");
  const out = {
    schemaVersion: "emerging-leaders-study-1.0.0", codeSha256, gitSha, runs, holdoutEvaluations,
    methodologyVersion: PREREG.methodologyVersion, engineVersion: EL.VERSION,
    methodologySha256: createHash("sha256").update(PREREG_TEXT).digest("hex"),
    generatedAt: new Date().toISOString(), status,
    evidenceStatus: gate.evidenceStatus,
    label: gate.evidenceStatus === "VALIDATED" ? "Historisch validiert (Point-in-Time, beide Holdouts)" : gate.evidenceStatus === "PARTIAL" ? "Teilweise belegt - nicht in allen Holdouts" : "Experimentell - keine belastbare Ueberlegenheit nachgewiesen",
    aggregatesOnly: true, noProbabilities: true,
    dataSources: sources, coverage,
    calendar: { from: CAL[0], to: CAL[CAL.length - 1], monthEnds: MONTH_END.size, observations: store.n, listings: LISTINGS.length, listingsUsed: LISTINGS.filter((l) => l.obs && !l.dup).length },
    development: { merge: frozenDev.merge, m3Weights: frozenDev.weights ? Object.fromEntries(Object.entries(frozenDev.weights).map(([k, v]) => [k, r4(v)])) : null,
      groupCorrelation: Object.fromEntries(Object.entries(frozenDev.groupCorrelationDev).map(([k, v]) => [k, r4(v)])), breadthTerciles: breadthCut.map(r4) },
    groupIc: groupIcOut, results, random, famaMacBeth, overlap: overlapOut, turnover: turnoverOut,
    splits: Object.fromEntries(P.map((p) => [p, Object.fromEntries((selection.chosen ? [selection.chosen, "M1_TECH_EQUAL"] : ["M1_TECH_EQUAL"]).filter((v, i, a) => a.indexOf(v) === i).map((m) => [m, splits(p, m)]))])),
    states, selection: { ...selection, sha256: selectionHash, basedOn: "VALIDATION" }, gate, limitations,
    notes: {
      holdoutUse: "Die Holdouts werden im selben Lauf gerechnet, die Modellwahl liest aber nur die eingefrorene VALIDATION-Kopie; Holdout-Zahlen der nicht gewaehlten Modelle sind beschreibend.",
      metrics: "meanExcess*: Mittel der Stichtags-Portfolios (Einzelwerte auf [-95 %, +500 %] begrenzt); medianExcess, hitRate: ueber alle Titelbeobachtungen; t nach Newey-West mit Lag ceil(h/21)-1."
    }
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  log(`geschrieben ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
