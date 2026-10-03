#!/usr/bin/env node
/* Daten fuer die interne Elliott-Werkbank (Mission IV §6–§13, §63–§67, §76–§80) — Referenzsatz fuer ECHTE Expertenannotation.
   Ausgabe (quant/research/elliott-workbench/):
     cases-blind.json   NUR Kurse bis zum Stichtag + unkritische Metadaten (Fall-Code, Art, Zeitebene, Stichtag). Keine Engine-Ausgabe,
                        keine Engine-Qualitaet, kein spaeterer Verlauf, keine Zaehlungs-Historie, kein Symbol, keine Schicht.
                        Manifest mit SHA-256-Commitment der versiegelten Datei.
     cases-sealed.json  Symbol, Schichten (Strata), Engine 3.x/2.2 am Stichtag, Zaehlungs-Historie, 52-Wochen-Ergebnis nach dem Stichtag.
                        Die Seite laedt sie erst, nachdem die annotierende Person fuer DIESEN Fall abgegeben hat.
   Fallarten
     REFERENCE      150 echte Wochencharts (US-Stammaktien). Stichprobe deterministisch per Hash (FNV-1a), unabhaengig vom spaeteren
                    Verlauf: Stichtag per Hash im Fenster 2012–2024; geschichtet nur mit Informationen BIS zum Stichtag
                    (Regime, Volatilitaet, Groessen-Proxy, Sektor, Engine-Strukturhinweis). HOLDOUT-Emittenten (ew3Split) ausgeschlossen.
                    ≈30 Faelle sind als EXPERT_HOLDOUT versiegelt (nicht fuer Entwicklung verwenden).
     PRACTITIONER   veroeffentlichte, datierte Zaehlungen (ungeprueft) — Blindrekonstruktion
     SYNTHETIC      Korpusfaelle mit bekannter Struktur (zum Einueben; Wahrheit erst nach Abgabe)
   Tagesreihen: quant/data/market/discover-series reicht nur ~1 Jahr (max. 270 Bars, 2025–2026) → kein Stichtag 2012–2024 und kein
   52-Wochen-Ergebnis moeglich; daher KEINE Tages-Teilmenge im Referenzsatz (im Manifest begruendet).
   Keine Annotation wird erzeugt. Kein Sprachmodell und keine Engine handelt als Experte.
   Aufruf: node scripts/technical/elliott-workbench-data.mjs   (≈ 5–7 min, 4 Worker; WB_SCREEN_CACHE=<datei> und WB_SELECT_ONLY=1 nur fuer Entwicklung) */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { createRequire } from "node:module";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { ROOT, readJson } from "./lib/ti-data.mjs";
/* elliott-stability.mjs startet selbst Worker-Code, wenn es in einem Worker importiert wird → nur im Hauptprozess laden */
const { ew3Split, fnv1a } = isMainThread ? await import("./elliott-stability.mjs") : {};

const require = createRequire(import.meta.url);
const WINDOW = 520;                       // Bars bis zum Stichtag, die Mensch UND Engine sehen (Woche: 10 Jahre)
const MIN_HISTORY = 260;                  // mindestens 5 Jahre Wochenhistorie vor dem Stichtag
const OUTCOME_BARS = 52;                  // 52 Wochen nach dem Stichtag (nur versiegelt)
const CUT_FROM = "2012-01-01", CUT_TO = "2024-09-30";
const N_REFERENCE = 150, N_EXPERT_HOLDOUT = 30;
const OUT = join(ROOT, "quant/research/elliott-workbench");
const r4 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : v === undefined ? null : v);

/* ───────────────────────── Worker: Engine am Stichtag ───────────────────────── */
if (!isMainThread) {
  const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
  const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
  const EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
  const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
  const { reasonOf, transition } = await import("./lib/ti-product.mjs");
  const DEG = ["Grand Supercycle", "Supercycle", "Cycle", "Primary", "Intermediate", "Minor", "Minute", "Minuette", "Subminuette"];
  /* Engine kennt nur relative Grade ("Hauptgrad"). Fuer den Vergleich mit Frost & Prechter wird der Grad HEURISTISCH aus der mittleren
     Wellendauer abgeleitet (F&P nennen typische, nicht bindende Dauern). Gekennzeichnet als ENGINE_DEGREE_HEURISTIC. */
  function degreeOf(c, bpy) {
    if (!c || !c.degree || !c.waves.length) return null;
    const yrs = c.degree.spanBars / c.waves.length / bpy;
    return yrs >= 8 ? DEG[1] : yrs >= 1 ? DEG[2] : yrs >= 0.25 ? DEG[3] : yrs >= 6 / 52 ? DEG[4] : yrs >= 2 / 52 ? DEG[5] : yrs >= 2 / 252 ? DEG[6] : DEG[7];
  }
  const slim = (c, s, bpy) => {
    if (!c) return null;
    const z = c.projection && c.projection.zones ? c.projection.zones.filter((x) => x.phase === "CURRENT")[0] : null;
    return { pattern: c.pattern, name: c.patternName, family: c.family || null, complete: c.complete, wave: c.complete ? "COMPLETE" : c.currentWave.label,
      direction: c.currentWave ? c.currentWave.direction : null, next: c.nextMove, degreeHeuristic: degreeOf(c, bpy), spanBars: c.degree ? c.degree.spanBars : null,
      waves: c.waves.map((w) => ({ l: w.label, a: s.timestamps[w.fromIndex], b: s.timestamps[w.toIndex], pa: r4(w.fromPrice), pb: r4(w.toPrice), st: w.status === "DEVELOPING" ? 1 : 0,
        sub: w.subdivision && w.subdivision.waves ? { p: w.subdivision.pattern, w: w.subdivision.waves.map((x) => [x.toTime, x.toPrice, x.label]) } : w.subdivision ? { p: w.subdivision.pattern } : null })),
      inv: c.invalidation ? r4(c.invalidation.price) : null, invDir: c.invalidation ? c.invalidation.direction : null,
      targetZone: z ? [r4(Math.min(z.zoneLow, z.zoneHigh)), r4(Math.max(z.zoneLow, z.zoneHigh))] : null, quality: c.countQuality ? c.countQuality.level : null };
  };
  const build = (job) => Canonical.fromRows(job.points.map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null })),
    { instrumentId: job.instrumentId, exchange: "US", currency: "USD", timeframe: job.tf, priceSeriesType: "SPLIT_ADJUSTED", source: "weekly-close", meta: { closeOnly: true } });
  function screen(job) {
    const s = build(job), bpy = job.tf === "1W" ? 52 : 252, P = Ctx.prepare(s);
    const E = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: bpy });
    const p = E.primary;
    return { key: job.key, pattern: p ? p.pattern : null, abstain: !!(E.applicability && E.applicability.abstain), level: E.applicability ? E.applicability.level : null, amb: E.ambiguity ? E.ambiguity.kind : null };
  }
  function full(job) {
    const s = build(job), bpy = job.tf === "1W" ? 52 : 252, P = Ctx.prepare(s), n = s.length, hist = [];
    let prev = null, prevInfo = null;
    for (let t = Math.max(1, n - 27); t < n; t++) {
      const E = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: bpy, previous: prev });
      const p = E.primary;
      const info = p ? { key: p.persistenceKey, complete: p.complete, inv: p.invalidation ? p.invalidation.price : null, invDir: p.invalidation ? p.invalidation.direction : null, name: p.patternName, wave: p.complete ? "abgeschlossen" : p.currentWave.label,
                          span: [p.waves[0].fromIndex, p.waves[p.waves.length - 1].toIndex], waveStarts: p.waves.map((w) => w.fromIndex) } : null;
      if (t >= n - 26) { const tr = transition(prevInfo, info, s.close[t]); const why = reasonOf(prevInfo, info, tr, s.close[t], s.close[t - 1], P.features.columns.atr[t]); hist.push({ d: s.timestamps[t], c: r4(s.close[t]), to: info ? info.name + " · " + info.wave : null, tr, why, ab: !!(E.applicability && E.applicability.abstain) }); }
      prev = p ? { key: p.persistenceKey, pivots: p.persistencePivots } : null; prevInfo = info;
    }
    const E3 = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: bpy, previous: prev });
    const E2 = EV2.analyzeElliottV2({ series: s, features: P.features, pivots: P.pivots, barsPerYear: bpy });
    return { key: job.key, sealedEngine: {
      v3: { engine: E3.engineVersion, primary: slim(E3.primary, s, bpy), alternative: slim(E3.alternatives && E3.alternatives[0], s, bpy),
            higher: E3.higherDegree ? { pattern: E3.higherDegree.pattern, name: E3.higherDegree.patternName, current: E3.higherDegree.current.notation } : null,
            applicability: E3.applicability ? { level: E3.applicability.level, score: E3.applicability.score, abstain: !!E3.applicability.abstain, reasons: E3.applicability.reasons } : null,
            ambiguity: E3.ambiguity || null, atr: r4(E3.atr), clarityLevel: E3.clarityLevel || null, trace: E3.trace ? { chosen: E3.trace.chosen, rejectedTop: E3.trace.rejectedTop } : null,
            degreeMethod: "ENGINE_DEGREE_HEURISTIC: mittlere Wellendauer → F&P-Grad (≥8 J Supercycle, ≥1 J Cycle, ≥3 M Primary, ≥6 W Intermediate, ≥2 W Minor, sonst Minute/Minuette)" },
      v2: { engine: E2.engineVersion, primary: slim(E2.primary, s, bpy), applicability: E2.applicability ? E2.applicability.level : null },
      history: hist } };
  }
  parentPort.on("message", (msg) => {
    if (msg === null) return process.exit(0);
    try { parentPort.postMessage(msg.mode === "screen" ? screen(msg) : full(msg)); }
    catch (e) { parentPort.postMessage({ key: msg.key, error: String(e && e.message || e) }); }
  });
}

/* ───────────────────────── Hauptprozess ───────────────────────── */
async function runPool(jobs, label) {
  const N = Math.max(1, Math.min(4, cpus().length)), out = new Map(); let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(N, jobs.length) }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url));
    const feed = () => { if (next < jobs.length) w.postMessage(jobs[next++]); else { w.postMessage(null); } };
    w.on("message", (m) => { out.set(m.key, m); done++; if (done % 200 === 0) console.log(" ", label, done + "/" + jobs.length, Math.round((Date.now() - t0) / 1000) + "s"); feed(); });
    w.on("error", reject); w.on("exit", () => resolve());
    feed();
  })));
  return out;
}
function weekly(points) {   // nur echte, positive Schlusskurse
  return points.filter((p) => Array.isArray(p) && Number.isFinite(p[1]) && p[1] > 0);
}
function stats(pts) {       // Informationen BIS zum Stichtag (letzter Punkt = Stichtag)
  const n = pts.length, c = pts.map((p) => p[1]), last = c[n - 1];
  const r52 = c[n - 1] / c[n - 53] - 1;
  const sma40 = c.slice(n - 40).reduce((a, b) => a + b, 0) / 40;
  const lr = []; for (let i = n - 52; i < n; i++) lr.push(Math.log(c[i] / c[i - 1]));
  const m = lr.reduce((a, b) => a + b, 0) / lr.length, vol = Math.sqrt(lr.reduce((a, b) => a + (b - m) ** 2, 0) / (lr.length - 1)) * Math.sqrt(52);
  const regime = r52 > 0.10 && last > sma40 ? "BULL" : r52 < -0.10 && last < sma40 ? "BEAR" : "SIDEWAYS";
  return { r52: r4(r52), vol: r4(vol), regime, price: r4(last), aboveSma40: last > sma40 };
}
function outcome(after, cutClose, eng) {   // NUR versiegelt: Verlauf nach dem Stichtag
  if (!after.length) return { weeksAvailable: 0 };
  const c = after.map((p) => p[1]), hi = Math.max(...c), lo = Math.min(...c);
  const o = { weeksAvailable: after.length, end: after[after.length - 1][0], returnPct: r4(100 * (c[c.length - 1] / cutClose - 1)), maxUpPct: r4(100 * (hi / cutClose - 1)), maxDownPct: r4(100 * (lo / cutClose - 1)),
              high: r4(hi), low: r4(lo) };
  const p = eng && eng.v3 && eng.v3.primary;
  if (p && p.inv !== null) { const k = after.findIndex((x) => (p.invDir === "above" ? x[1] > p.inv : x[1] < p.inv)); o.engineInvalidationBreached = k >= 0; o.engineInvalidationBreachedAt = k >= 0 ? after[k][0] : null; }
  if (p && p.targetZone) { const k = after.findIndex((x, i) => i > 0 ? Math.min(after[i - 1][1], x[1]) <= p.targetZone[1] && Math.max(after[i - 1][1], x[1]) >= p.targetZone[0] : x[1] >= p.targetZone[0] && x[1] <= p.targetZone[1]); o.engineTargetTouched = k >= 0; o.engineTargetTouchedAt = k >= 0 ? after[k][0] : null; }
  return o;
}
/* Strukturschicht = Engine-Hauptmuster am Stichtag (nur Hinweis). UNCLEAR_ABSTAIN wird zuletzt aus den Faellen gefuellt, in denen
   die Engine keine Zaehlung hat oder sich enthaelt (Anwendbarkeit LOW) — sonst verdraengte die haeufige Enthaltung alle Musterschichten. */
const STRUCT = (h) => !h || !h.pattern ? "UNCLEAR_ABSTAIN" : h.amb === "DEGREE" ? "AMBIGUITY_DEGREE"
  : /IMPULSE|DIAGONAL/.test(h.pattern) ? "IMPULSE" : h.pattern === "FLAT" ? "FLAT" : h.pattern === "ZIGZAG" ? "ZIGZAG" : h.pattern === "TRIANGLE" ? "TRIANGLE" : "COMBINATION_WXY";
const STRATA = ["TRIANGLE", "IMPULSE", "ZIGZAG", "FLAT", "COMBINATION_WXY", "AMBIGUITY_DEGREE", "UNCLEAR_ABSTAIN"];   // seltene zuerst

async function main() {
  const t0 = Date.now();
  /* 0. Stammdaten (nur Zugehoerigkeit/Sektor; keine Kurse nach dem Stichtag) */
  const master = readJson(join(ROOT, "quant/data/market/security-master/us-security-master.json"));
  const common = new Set(); master.rows.forEach((r) => { if (r.instrument_type === "EQUITY_COMMON") common.add(r.ticker); });
  const members = {}; for (const ix of ["DJIA", "NDX", "SP500"]) { const j = readJson(join(ROOT, "quant/data/market/index-membership", ix + ".json")); (j.members || []).forEach((m) => { (members[m.symbol] = members[m.symbol] || []).push(ix); }); }
  const sector = {}; try { readJson(join(ROOT, "quant/data/market/scale/universe-FULL_UNIVERSE.json")).securities.forEach((s) => { if (s.sector) sector[s.ticker] = s.sector; }); } catch { /* keine Sektoren */ }

  /* 1. Kandidatenpool: alle zulaessigen Emittenten, Stichtag per Hash (nie nach spaeterem Verlauf) */
  const dir = join(ROOT, "quant/data/market/discover-series-long");
  const tickers = readdirSync(dir).filter((f) => f.startsWith("ref_")).map((f) => f.replace(/^ref_|\.json$/g, ""))
    .filter((t) => !/_/.test(t) && common.has(t) && ew3Split(t) !== "HOLDOUT").sort();
  const pool = [], seenRoot = new Set(); let noWindow = 0;
  for (const t of tickers) {
    const root = t.split(/[_.-]/)[0]; if (seenRoot.has(root)) continue;
    const pts = weekly(readJson(join(dir, "ref_" + t + ".json")).points || []);
    const okIdx = []; for (let i = MIN_HISTORY; i + OUTCOME_BARS < pts.length; i++) if (pts[i][0] >= CUT_FROM && pts[i][0] <= CUT_TO) okIdx.push(i);
    if (!okIdx.length) { noWindow++; continue; }
    const cut = okIdx[fnv1a(t + "|ref-cut-v2") % okIdx.length];
    const before = pts.slice(0, cut + 1);
    const st = stats(before);
    const capProxy = members[t] ? "LARGE" : st.price >= 10 ? "MID" : "SMALL";
    pool.push({ t, split: ew3Split(t), cut, date: pts[cut][0], st, capProxy, index: members[t] || [], sector: sector[t] || "UNKNOWN", h: fnv1a(t + "|ref-sel-v2"), pts });
    seenRoot.add(root);
  }
  const volMedian = pool.map((p) => p.st.vol).sort((a, b) => a - b)[Math.floor(pool.length / 2)];
  pool.forEach((p) => { p.volBucket = p.st.vol >= volMedian ? "HIGH" : "LOW"; });
  console.log("Pool:", pool.length, "Emittenten (HOLDOUT ausgeschlossen; ohne Stichtagsfenster:", noWindow + ")", Math.round((Date.now() - t0) / 1000) + "s");

  /* 2. Engine nur als Strukturhinweis am Stichtag (Daten bis Stichtag) */
  const CACHE = process.env.WB_SCREEN_CACHE || null;   // nur Entwicklungs-Beschleuniger (Datei ausserhalb des Repos)
  let scr;
  if (CACHE && existsSync(CACHE)) scr = new Map(Object.entries(JSON.parse(readFileSync(CACHE, "utf8"))));
  else {
    scr = await runPool(pool.map((p) => ({ mode: "screen", key: p.t, tf: "1W", instrumentId: p.t, points: p.pts.slice(Math.max(0, p.cut + 1 - WINDOW), p.cut + 1) })), "screen");
    if (CACHE) writeFileSync(CACHE, JSON.stringify(Object.fromEntries(scr)));
  }
  pool.forEach((p) => { const h = scr.get(p.t); p.hint = h && !h.error ? h : null; p.pattStratum = STRUCT(p.hint); p.abstainHint = !p.hint || !p.hint.pattern || !!p.hint.abstain; });
  const poolStrata = pool.reduce((a, p) => { const k = p.pattStratum + (p.abstainHint ? "+abstain" : ""); a[k] = (a[k] || 0) + 1; return a; }, {});

  /* 3. Geschichtete Auswahl: Quote je Strukturschicht, innerhalb nach Regime×Vol×Groesse ausgeglichen; Reihenfolge nur per Hash */
  const sorted = pool.slice().sort((a, b) => a.h - b.h || (a.t < b.t ? -1 : 1));
  const quota = Math.ceil(N_REFERENCE / STRATA.length), chosen = [], cell = {}, sectorCount = {};
  const era = (d) => (d < "2016" ? "2012-15" : d < "2020" ? "2016-19" : "2020-24");
  const cellKey = (p) => p.st.regime + "|" + p.volBucket + "|" + p.capProxy + "|" + era(p.date) + "|" + (p.abstainHint ? "abst" : "cnt");
  const used = new Set();
  for (const S of STRATA) {
    let cand = sorted.filter((p) => !used.has(p.t) && (S === "UNCLEAR_ABSTAIN" ? p.abstainHint : p.pattStratum === S)), take = [];
    const prio = (p) => (cell[S + cellKey(p)] || 0) - (p.sector !== "UNKNOWN" && (sectorCount[p.sector] || 0) < 2 ? 0.5 : 0);
    while (take.length < quota && cand.length) {
      cand.sort((a, b) => (prio(a) - prio(b)) || (a.h - b.h));
      const p = cand.shift(); p.structure = S; used.add(p.t); take.push(p); cell[S + cellKey(p)] = (cell[S + cellKey(p)] || 0) + 1; sectorCount[p.sector] = (sectorCount[p.sector] || 0) + 1;
    }
    chosen.push(...take);
  }
  /* Auffuellen (falls Schichten zu klein) — weiter ausgeglichen nach Regime×Vol×Groesse */
  let rest = sorted.filter((p) => !used.has(p.t));
  while (chosen.length < N_REFERENCE && rest.length) {
    rest.sort((a, b) => ((cell["*" + cellKey(a)] || 0) - (cell["*" + cellKey(b)] || 0)) || (a.h - b.h));
    const p = rest.shift(); p.structure = p.abstainHint ? "UNCLEAR_ABSTAIN" : p.pattStratum; chosen.push(p); cell["*" + cellKey(p)] = (cell["*" + cellKey(p)] || 0) + 1;
  }
  /* Ueberschuss (7×22 > 150) deterministisch kuerzen: groesste Schicht zuerst, hoechster Hash zuerst */
  while (chosen.length > N_REFERENCE) {
    const cnt = {}; chosen.forEach((p) => { cnt[p.structure] = (cnt[p.structure] || 0) + 1; });
    const big = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || (a < b ? -1 : 1))[0];
    const victim = chosen.filter((p) => p.structure === big).sort((a, b) => b.h - a.h)[0];
    chosen.splice(chosen.indexOf(victim), 1);
  }
  /* Fall-Codes ohne Symbol; Reihenfolge per Hash */
  chosen.sort((a, b) => fnv1a(a.t + "|ref-order-v2") - fnv1a(b.t + "|ref-order-v2"));
  chosen.forEach((p, i) => { p.id = "REF-" + String(i + 1).padStart(3, "0"); });
  /* EXPERT_HOLDOUT: je Strukturschicht jeder 5. Fall in Hash-Reihenfolge (≈30), danach exakt auf 30 */
  const xh = new Set();
  for (const S of STRATA) chosen.filter((p) => p.structure === S).sort((a, b) => fnv1a(a.id + "|xh") - fnv1a(b.id + "|xh")).forEach((p, k) => { if (k % 5 === 4) xh.add(p.id); });
  const order = chosen.slice().sort((a, b) => fnv1a(a.id + "|xh") - fnv1a(b.id + "|xh"));
  for (const p of order) { if (xh.size >= N_EXPERT_HOLDOUT) break; xh.add(p.id); }
  while (xh.size > N_EXPERT_HOLDOUT) xh.delete([...xh].sort((a, b) => fnv1a(b + "|xh") - fnv1a(a + "|xh"))[0]);

  if (process.env.WB_SELECT_ONLY) { const c = (k) => chosen.reduce((a, p) => { const v = k(p); a[v] = (a[v] || 0) + 1; return a; }, {}); console.log(JSON.stringify({ poolStrata, s: c((p) => p.structure), a: c((p) => p.abstainHint), r: c((p) => p.st.regime), v: c((p) => p.volBucket), cap: c((p) => p.capProxy), sec: c((p) => p.sector), y: c((p) => p.date.slice(0, 4)), xh: xh.size, n: chosen.length })); return; }
  /* 4. Praktiker- und synthetische Faelle */
  const extra = [];
  const refs = readJson(join(ROOT, "quant/data/technical-intelligence/elliott-validation/practitioner/practitioner-refs.json"));
  const MAP = { SPX: "SPY", NDX: "QQQ", DJIA: "DIA", RUT: "IWM", BTCUSD: "BTCUSD", WTI: "WTI", N225: "N225", XAUUSD: "XAUUSD", EEM: "EEM" };
  for (const e of refs.entries) {
    if (e.timeframe === "intraday" || !MAP[e.instrument]) continue;
    const all = readJson(join(ROOT, "quant/data/market/multi-asset/series", MAP[e.instrument] + ".json")).points.filter((p) => p[1] > 0);
    const tf = e.timeframe === "weekly" ? "1W" : "1D";
    const toWeekly = (rows) => { const wk = new Map(); for (const [d, v] of rows) { const dt = new Date(d + "T00:00:00Z"); wk.set(new Date(dt.getTime() + ((5 - dt.getUTCDay() + 7) % 7) * 864e5).toISOString().slice(0, 10), [d, v]); } return [...wk.values()]; };
    const before = tf === "1W" ? toWeekly(all.filter((p) => p[0] <= e.publicationDate)) : all.filter((p) => p[0] <= e.publicationDate);
    const afterAll = all.filter((p) => p[0] > e.publicationDate), after = tf === "1W" ? toWeekly(afterAll).slice(0, OUTCOME_BARS) : afterAll.slice(0, 252);
    if (before.length < 300) continue;
    extra.push({ id: e.id, kind: "PRACTITIONER", tf, symbol: MAP[e.instrument] + " (" + e.instrument + ")", points: before.slice(-WINDOW), after,
      reference: { sourceType: "EXTERNAL_PRACTITIONER", verified: false, organization: e.organization, author: e.author, url: e.url, claim: e.currentWaveClaim, pattern: e.patternClaim, next: e.primaryDirectionNext, invalidation: e.invalidationLevel, target: e.targetZone, conflictGroup: e.conflictGroup } });
  }
  const { corpusCase, CLASSES } = await import("../../quant/tests/elliott-corpus.mjs");
  Object.keys(CLASSES).filter((c) => !CLASSES[c].negativeOf).forEach((cls, k) => {
    const cs = corpusCase(cls, 3, "low");
    extra.push({ id: "SYN-" + String(k + 1).padStart(2, "0"), kind: "SYNTHETIC", tf: "1W", symbol: "SYN", points: cs.dates.map((d, i) => [d, cs.closes[i]]).slice(-WINDOW), after: [],
      reference: { sourceType: "SYNTHETIC", truth: { pattern: cls, expect: cs.truth.expect, pivots: cs.truth.topIdx.map((i) => [cs.dates[i], r4(cs.closes[i])]) } } });
  });

  /* 5. Volle Engine-Ausgabe (versiegelt) */
  const jobs = chosen.map((p) => ({ mode: "full", key: p.id, tf: "1W", instrumentId: p.t, points: p.pts.slice(Math.max(0, p.cut + 1 - WINDOW), p.cut + 1) }))
    .concat(extra.map((x) => ({ mode: "full", key: x.id, tf: x.tf, instrumentId: x.symbol, points: x.points })));
  const fullRes = await runPool(jobs, "full");

  /* 6. Dateien */
  const blindCases = [], sealedCases = {};
  const blindOf = (id, kind, tf, points) => ({ id, kind, timeframe: tf, cutoff: points[points.length - 1][0], bars: points.length, chart: { d: points.map((p) => p[0]), c: points.map((p) => r4(p[1])) } });
  for (const p of chosen) {
    const pts = p.pts.slice(Math.max(0, p.cut + 1 - WINDOW), p.cut + 1), after = p.pts.slice(p.cut + 1, p.cut + 1 + OUTCOME_BARS);
    const fr = fullRes.get(p.id), eng = fr && !fr.error ? fr.sealedEngine : null;
    blindCases.push(blindOf(p.id, "REFERENCE", "1W", pts));
    sealedCases[p.id] = { symbol: p.t, kind: "REFERENCE", split: xh.has(p.id) ? "EXPERT_HOLDOUT" : p.split, issuerSplitEw3: p.split, sealedForDevelopment: xh.has(p.id),
      strata: { timeframe: "1W", capProxy: p.capProxy, indexMembership: p.index, sector: p.sector, regime: p.st.regime, volatility: p.volBucket, structureHint: p.structure },
      atCutoff: { engineAbstainHint: p.abstainHint, enginePatternStratum: p.pattStratum, trailing52wReturn: p.st.r52, realizedVol52w: p.st.vol, close: p.st.price, aboveSma40: p.st.aboveSma40, engineHint: p.hint },
      engine: eng, engineError: fr && fr.error || null, outcome52w: outcome(after, pts[pts.length - 1][1], eng), reference: null };
  }
  for (const x of extra) {
    const fr = fullRes.get(x.id), eng = fr && !fr.error ? fr.sealedEngine : null;
    blindCases.push(blindOf(x.id, x.kind, x.tf, x.points));
    sealedCases[x.id] = { symbol: x.symbol, kind: x.kind, split: x.kind, sealedForDevelopment: false, strata: { timeframe: x.tf }, engine: eng, engineError: fr && fr.error || null,
      outcome52w: x.kind === "SYNTHETIC" ? null : outcome(x.after, x.points[x.points.length - 1][1], eng), reference: x.reference };
  }
  const counts = (key) => chosen.reduce((a, p) => { const v = key(p); a[v] = (a[v] || 0) + 1; return a; }, {});
  const stratumCounts = { structureHint: counts((p) => p.structure), engineAbstainHint: counts((p) => (p.abstainHint ? "ABSTAIN" : "COUNT")), regime: counts((p) => p.st.regime), volatility: counts((p) => p.volBucket), capProxy: counts((p) => p.capProxy),
    sector: counts((p) => p.sector), cutoffYear: counts((p) => p.date.slice(0, 4)), issuerSplitEw3: counts((p) => p.split), expertHoldout: xh.size, timeframe: { "1W": chosen.length, "1D": 0 } };
  const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js")), EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
  const sealed = { schemaVersion: "vu-elliott-workbench-sealed-2.0.0", generatedAt: new Date().toISOString(), engines: { v3: EV3.ENGINE_VERSION, v2: EV2.ENGINE_VERSION },
    warning: "VERSIEGELT. Erst nach Abgabe der eigenen Annotation fuer den jeweiligen Fall ansehen. EXPERT_HOLDOUT-Faelle nicht fuer Entwicklung verwenden.",
    sampling: { method: "deterministic FNV-1a hash; cutoff by hash within " + CUT_FROM + "…" + CUT_TO + "; strata use only data up to cutoff; never selected by later outcome",
      poolSize: pool.length, poolStructureHints: poolStrata, volMedian: volMedian, strataCounts: stratumCounts,
      caveats: ["capProxy nutzt die HEUTIGE Indexzugehoerigkeit (2026) — Look-ahead in der Groessenschicht; Auswahl innerhalb der Schicht bleibt hashbasiert.",
                "Sektor nur fuer ~100 kuratierte Titel verfuegbar (sonst UNKNOWN).",
                "Stichtag verlangt ≥52 Wochen Daten danach (Ergebnis verfuegbar) — leichte Ueberlebensverzerrung (Datenverfuegbarkeit, nicht Kursverlauf).",
                "Engine-Strukturhinweis ist KEINE Wahrheit, nur Schichtungshilfe."] },
    cases: sealedCases };
  const sealedText = JSON.stringify(sealed);
  const sha = createHash("sha256").update(sealedText, "utf8").digest("hex");
  const blind = { schemaVersion: "vu-elliott-workbench-blind-2.0.0", generatedAt: sealed.generatedAt,
    protocol: "Blindprotokoll: nur Kurse bis zum Stichtag. Engine-Ausgabe, Engine-Qualitaet, spaeterer Verlauf, Zaehlungs-Historie, Symbol und Schichten liegen versiegelt in cases-sealed.json und werden erst nach Abgabe der eigenen Annotation fuer den jeweiligen Fall geladen.",
    status: "NOT EXPERT VALIDATED — es existieren keine echten Expertenannotationen, bis Menschen annotieren.",
    manifest: { sealedFile: "cases-sealed.json", sealedSha256: sha, sealedBytes: Buffer.byteLength(sealedText, "utf8"), commitment: "SHA-256 ueber die exakten Bytes von cases-sealed.json (UTF-8)",
      caseCount: blindCases.length, kinds: blindCases.reduce((a, c) => { a[c.kind] = (a[c.kind] || 0) + 1; return a; }, {}), windowBars: WINDOW,
      dailySubset: { included: false, reason: "discover-series enthaelt nur ~1 Jahr Tagesdaten (max. 270 Bars, 2025–2026): kein Stichtag 2012–2024 mit ≥250 Bars davor und 52 Wochen danach moeglich." },
      sampling: "deterministisch per Hash, unabhaengig vom spaeteren Verlauf; Schichtung nur versiegelt dokumentiert" },
    cases: blindCases };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "cases-sealed.json"), sealedText);
  writeFileSync(join(OUT, "cases-blind.json"), JSON.stringify(blind));
  /* Altes data.json enthielt Engine-Ausgabe neben den Kursen (nicht blind) — entfernen */
  if (existsSync(join(OUT, "data.json"))) unlinkSync(join(OUT, "data.json"));
  console.log("Werkbank 2.0:", blindCases.length, "Faelle", JSON.stringify(blind.manifest.kinds), "sha256", sha.slice(0, 16) + "…", Math.round((Date.now() - t0) / 1000) + "s");
  console.log(JSON.stringify(stratumCounts));
  const errs = [...fullRes.values()].filter((r) => r.error); if (errs.length) console.log("Engine-Fehler:", errs.length, errs.slice(0, 3));
}

if (isMainThread) await main();
