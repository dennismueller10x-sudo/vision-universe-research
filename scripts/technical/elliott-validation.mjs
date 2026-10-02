#!/usr/bin/env node
/* =========================================================================
   VU Technical Intelligence — ELLIOTT VALIDATION STUDY (Master Mission II)

   Frage: Liefert das Elliott-Label Information UEBER normale Marktstruktur
   hinaus — und wird es frueh genug erkannt, um prospektiv nuetzlich zu sein?

   Einheit der Analyse: das GENERISCHE SWING-RUECKLAUF-EREIGNIS.
     Auf der Analyseskala, die die Elliott-Engine an Bar t verwendet, ist
     L = (a → b) das juengste bestaetigte Leg mit Richtung d. Das Ereignis
     feuert an der ersten Bar t, an der der Schlusskurs L um mindestens
     38,2 % und weniger als 88,6 % zurueckgelaufen ist (weder b ueberschritten
     noch a gebrochen). Jedes bestaetigte Leg erzeugt hoechstens ein Ereignis.
     Das ist der strukturelle Kontrollrahmen OHNE Elliott (Benchmark B/C/D).

   Elliott-Label desselben Zeitpunkts (Engine an Bar t, nur Bars <= t):
     CONT  Engine fuehrt L als Welle, deren laufende Gegenbewegung korrektiv
           ist (W2, W4, B, X …) und erwartet danach die Fortsetzung in d.
     REV   Engine fuehrt L als letzte Welle eines Musters (bzw. erwartet
           nach der laufenden Welle eine Bewegung gegen d).
     NONE  Engine zaehlt L nicht als unmittelbar vorangehende Welle.

   Ergebnis (kausal ab t+1, Horizont 52 Wochen):
     SUCCESS  Kurs ueberschreitet b (Ende von L) bevor ein Schlusskurs a bricht
     EXT      Kurs erreicht a + 1,618·|L|·d vor einem Schluss jenseits a
     (gleiche Bar: konservativ Misserfolg; Wochenschluss-Reihen haben H=L=C)

   Benchmark-Leiter
     A  Zufallszeitpunkt (±3 Jahre um t, gleicher Titel) mit identischen
        prozentualen Abstaenden; A-T zusaetzlich gleicher Trendkontext
     B  alle generischen Swing-Ruecklaeufe (zufaelliger bestaetigter Swing)
     C  generische Ruecklaeufe im Trend (Trendkontext = d)
     D  geschichtete Kontrolle (Richtung, Trend, Momentum, Volatilitaet,
        Regime, Zeitblock, Leggroesse, Ruecklauftiefe) ohne Elliott-Label
     M  volles Nicht-Elliott-Modell (logistische Regression) vs. + Elliott,
        walk-forward ueber Zeitbloecke, Cluster-Bootstrap nach Titel

   Zusaetzlich: Erkennungsverzug, Count-Stabilitaet (Replay jeder Bar),
   Count-Quality-Abstention, Fibonacci-/Unterstuetzungs-Konfluenz,
   Parameter-Sensitivitaet (--scale-mult), Cross-Market (--market multi).

   Symbol-Partition (vorab definiert, PREREGISTRATION.md):
     CONFIRMATORY = fnv1a(ticker) mod 10 < 3, sonst EXPLORATORY.

   Aufruf
     node scripts/technical/elliott-validation.mjs --sample exploratory --workers 4
     node scripts/technical/elliott-validation.mjs --sample confirmatory --workers 4
     node scripts/technical/elliott-validation.mjs --market multi
     node scripts/technical/elliott-validation.mjs --sample exploratory --limit 800 --scale-mult 0.8
   ========================================================================= */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { ROOT, readJson, weeklySeriesFromPoints } from "./lib/ti-data.mjs";

const require = createRequire(import.meta.url);
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
const Hash = require(join(ROOT, "quant/engines/hash.js"));
const Stats = require(join(ROOT, "scripts/technical/lib/validation-stats.cjs"));

const H = 52, START = 156, MIN_BARS = 260, EV_SCALES = ["scale-2", "scale-3", "scale-4"];
const FOLDS = [["F1", "0000", "2005-01-01"], ["F2", "2005-01-01", "2011-01-01"], ["F3", "2011-01-01", "2017-01-01"], ["F4", "2017-01-01", "2022-01-01"], ["F5", "2022-01-01", "9999"]];
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 ? process.argv[i + 1] : def; }
export function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
/** Emittenten-Wurzel (Review-Fix 6): Vorzugs-/Unterklassen desselben Emittenten landen in derselben Partition. */
export function issuerRoot(ticker) { return String(ticker).split(/[_.-]/)[0]; }
export function partitionOf(ticker) { return fnv1a(issuerRoot(ticker)) % 10 < 3 ? "CONFIRMATORY" : "EXPLORATORY"; }
function foldOf(date) { for (const [id, a, b] of FOLDS) if (date >= a && date < b) return id; return "F5"; }
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);

// ===================================================================== Worker
function spyRegime(spy, date) {
  if (!spy) return "UNKNOWN";
  let lo = 0, hi = spy.dates.length - 1, b = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (spy.dates[m] <= date) { b = m; lo = m + 1; } else hi = m - 1; }
  if (b < 130) return "UNKNOWN";
  const r = spy.close[b] / spy.close[b - 126] - 1;
  return r > 0.05 ? "RISK_ON" : r < -0.05 ? "RISK_OFF" : "NEUTRAL";
}

/** Ergebnis ab t+1: ueber `target` (in Richtung d) bevor ein Schluss jenseits `stop`. */
function race(s, t, d, target, stop, horizon) {
  const end = Math.min(s.length - 1, t + horizon);
  let mfe = 0, mae = 0;
  const px = s.close[t];
  for (let k = t + 1; k <= end; k++) {
    const fav = d > 0 ? s.high[k] : s.low[k], adv = d > 0 ? s.low[k] : s.high[k];
    mfe = Math.max(mfe, d * (fav - px)); mae = Math.max(mae, d * (px - adv));
    const stopped = d > 0 ? s.close[k] < stop : s.close[k] > stop;
    const hit = d > 0 ? fav >= target : fav <= target;
    if (stopped) return { res: 0, bars: k - t, mfe, mae };        // gleiche Bar: konservativ Misserfolg
    if (hit) return { res: 1, bars: k - t, mfe, mae };
  }
  return { res: t + horizon <= s.length - 1 ? null : undefined, bars: null, mfe, mae };   // null = Timeout, undefined = offen
}

function primaryInfo(E) {
  const p = E && E.primary;
  if (!p) return null;
  const anchors = p.waves.filter((w) => w.status === "CONFIRMED").map((w) => w.toIndex).join(",");
  return { key: p.pattern + "|" + (p.waves[0] ? p.waves[0].fromIndex : -1) + "|" + p.direction, pattern: p.pattern, complete: p.complete,
           dw: p.complete ? 0 : p.currentWave.wave, anchors, nextMove: p.nextMove, inv: p.invalidation ? p.invalidation.price : null, invDir: p.invalidation ? p.invalidation.direction : null };
}

function processSymbol(series, meta, opt, spy) {
  const n = series.length;
  if (n < MIN_BARS) return { skipped: "TOO_SHORT" };
  const prof = Ctx.PROFILES["1W"];
  const scales = prof.pivotScales.map((sc) => Object.assign({}, sc, { kAtr: sc.kAtr * opt.scaleMult, minPct: sc.minPct * opt.scaleMult }));
  const P = Ctx.prepare(series, { pivotScales: scales });
  const cols = P.features.columns, rand = Hash.mulberry32(Hash.seedFromString("ev-val|" + meta.symbol));
  const firstDate = series.timestamps[0];
  const seen = new Set(), seenExtreme = new Set(), events = [], latency = [];
  const st = { bars: 0, available: 0, statusCount: {}, scaleSwitches: 0, trans: { SAME: 0, PROGRESS: 0, RELABEL: 0, RESET: 0, LOST: 0, FOUND: 0 }, runLengths: [], abstain: 0, cq: [] };
  let prev = null, prevScale = null, run = 0, stableBars = 0, prevState = null;
  const engineCfg = opt.legacy ? { scaleSelection: "LEGACY", nestedHigherDegree: false } : {};
  for (let t = START; t < n; t++) {
    const E = EV2.analyzeElliottV2({ series, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: 52, methodology: { engine: engineCfg }, previous: opt.sticky ? prevState : null });
    prevState = E.primary ? { key: E.primary.persistenceKey, scaleId: E.degrees.analysis } : null;
    st.bars++; st.statusCount[E.status] = (st.statusCount[E.status] || 0) + 1;
    const scale = E.degrees.analysis;
    if (prevScale && scale !== prevScale) st.scaleSwitches++;
    prevScale = scale;
    const cur = primaryInfo(E);
    if (cur) { st.available++; if (E.applicability && E.applicability.abstain) st.abstain++; if (E.primary.countQuality && isNum(E.primary.countQuality.score)) st.cq.push(E.primary.countQuality.score); }
    /* ---- Uebergaenge (Stabilitaet) */
    if (prev && cur) {
      let kind;
      if (cur.key === prev.key && cur.dw === prev.dw && cur.anchors === prev.anchors && cur.complete === prev.complete) kind = "SAME";
      else if (cur.key === prev.key) kind = "PROGRESS";
      else {
        /* War die Vorlesart abgeschlossen oder an ihrer harten Grenze gebrochen? Dann ist eine neue Lesart normal. */
        const brokeInv = isNum(prev.inv) && (prev.invDir === "below" ? series.close[t] < prev.inv : series.close[t] > prev.inv);
        kind = prev.complete || brokeInv ? "RESET" : "RELABEL";
      }
      st.trans[kind]++;
      if (kind === "SAME" || kind === "PROGRESS") { run++; stableBars++; } else { st.runLengths.push(run); run = 1; stableBars = 0; }
    } else if (prev && !cur) { st.trans.LOST++; st.runLengths.push(run); run = 0; stableBars = 0; }
    else if (!prev && cur) { st.trans.FOUND++; run = 1; stableBars = 0; }
    prev = cur;

    /* ---- Generische Ereignisse — UNABHAENGIG von der Engine (Review-Fix 3): auf jeder Skala 2–4 das juengste
       bestaetigte Leg L=(a→b); Ereignis an der ersten Bar mit Ruecklauf ≥ 38,2 %. Ein Ereignis je Preisextrem b
       (die Skala, auf der es zuerst feuert); volle 52 Bars Zukunft erforderlich (Review-Fix 7). */
    for (const scale of EV_SCALES) {
    if (t + H > n - 1) break;
    const view = EV2.pivotView(series, P.pivots, scale, t);
    if (!view || view.confirmed.length < 3) continue;
    const c = view.confirmed, a = c[c.length - 2], b = c[c.length - 1];
    const id = scale + "|" + b.pivotIndex;
    if (seen.has(id)) continue;
    const d = b.pivotPrice > a.pivotPrice ? 1 : -1, L = Math.abs(b.pivotPrice - a.pivotPrice);
    const px = series.close[t], r = d * (b.pivotPrice - px) / L;
    if (!(r >= 0.382)) continue;
    seen.add(id);
    if (r >= 0.886) continue;                            // zu tief: kein Ruecklauf-Ereignis mehr (aber Leg verbraucht)
    if (seenExtreme.has(b.side + "@" + b.pivotIndex)) continue;
    seenExtreme.add(b.side + "@" + b.pivotIndex);
    const atr = isNum(cols.atr[t]) && cols.atr[t] > 0 ? cols.atr[t] : px * 0.03;
    /* Elliott-Label der Engine an Bar t: zaehlt die Hauptzaehlung genau dieses Leg als juengste Welle? */
    let lab = "NONE", role = null;
    const p = E.primary;
    if (p) {
      const j = p.waves.findIndex((w) => w.fromIndex === a.pivotIndex && w.toIndex === b.pivotIndex);
      const isLast = j >= 0 && ((p.complete && j === p.waves.length - 1) || (!p.complete && j === p.waves.length - 2));
      if (isLast) { lab = p.nextMove === (d > 0 ? "UP" : "DOWN") ? "CONT" : "REV"; role = p.pattern + ":" + p.waves[j].label + (p.complete ? ":END" : ""); }
    }
    /* Features */
    const trend = EV2.trendDirection(series, t, 52) * d;
    const mom = isNum(cols.momentum3M[t]) ? Math.sign(cols.momentum3M[t]) * d : 0;
    const volP = isNum(cols.atrPctPercentile[t]) ? cols.atrPctPercentile[t] / 100 : null;   // Spalte ist 0–100
    const fibConf = fibConfluence(P.pivots, scale, t, a, px, atr);
    const support = supportNear(P.pivots, t, a, px, atr);
    const out1 = race(series, t, d, b.pivotPrice, a.pivotPrice, H);
    const out2 = race(series, t, d, a.pivotPrice + d * 1.618 * L, a.pivotPrice, H);
    if (out1.res === undefined) continue;                 // (durch t + H <= n − 1 ausgeschlossen)
    /* Benchmark A (Zufallszeitpunkt ±3 Jahre, gleiche %-Abstaende) und A-T (zusaetzlich gleicher Trendkontext) */
    const up = d * (b.pivotPrice - px) / px, dn = d * (px - a.pivotPrice) / px;
    const bA = [], bAT = [];
    for (let q = 0; q < 6 && (bA.length < 3 || bAT.length < 3); q++) {
      for (let tries = 0; tries < 8; tries++) {
        const lo = Math.max(START, t - 156), hi = Math.min(n - 1 - H, t + 156);
        const u = lo + Math.floor(rand() * Math.max(1, hi - lo));
        const bp = series.close[u];
        const o = race(series, u, d, bp * (1 + d * up), bp * (1 - d * dn), H);
        if (o.res === null || o.res === undefined) continue;
        if (bA.length < 3) bA.push(o.res);
        if (bAT.length < 3 && EV2.trendDirection(series, u, 52) * d === trend) bAT.push(o.res);
        break;
      }
    }
    /* Erkennungsverzug: Ende der Gegenbewegung (naechster Pivot nach b auf derselben Skala) */
    const sc = P.pivots.scales[scale].pivots, nxt = sc.find((q) => q.pivotIndex > b.pivotIndex && q.side !== b.side);
    let lat = null;
    if (nxt) {
      const fine = P.pivots.scales[P.pivots.scaleIds[0]].pivots;
      let earliest = null;
      for (const q of fine) if (Math.abs(q.pivotIndex - nxt.pivotIndex) <= 1 && q.side === nxt.side && (earliest === null || q.confirmedIndex < earliest)) earliest = q.confirmedIndex;
      const cpx = series.close[nxt.confirmedIndex];
      lat = { endIdx: nxt.pivotIndex, engine: nxt.confirmedIndex - nxt.pivotIndex, earliest: isNum(earliest) ? earliest - nxt.pivotIndex : null,
              progress: r4(d * (cpx - nxt.pivotPrice) / Math.max(1e-9, d * (b.pivotPrice - nxt.pivotPrice))), beyondAtEngine: d * (cpx - b.pivotPrice) > 0,
              beyondOriginAtEngine: d * (cpx - a.pivotPrice) <= 0,
              eventBeforeEnd: t <= nxt.pivotIndex };
      /* Bestaetigte Variante (Einstieg erst bei Engine-Bestaetigung der Gegenbewegung): gleiche Zielmarke b */
      /* Review-Fix 1: bestaetigter Einstieg nur, wenn der Kurs dann noch ZWISCHEN a und b liegt (sonst kein Trade) */
      if (nxt.confirmedIndex + H <= n - 1 && !lat.beyondAtEngine && !lat.beyondOriginAtEngine) {
        const oc = race(series, nxt.confirmedIndex, d, b.pivotPrice, a.pivotPrice, H);
        lat.confirmedEntryRes = oc.res === undefined ? null : oc.res;
        lat.confirmedEntryRisk = r4(d * (cpx - a.pivotPrice) / cpx); lat.confirmedEntryReward = r4(d * (b.pivotPrice - cpx) / cpx);
        /* Zufallszeitpunkt-Benchmark fuer die bestaetigte Variante (gleiche %-Abstaende, ±3 Jahre) */
        const cbA = [];
        for (let tries = 0; tries < 12 && cbA.length < 3; tries++) {
          const lo = Math.max(START, t - 156), hi = Math.min(n - 1 - H, t + 156), u = lo + Math.floor(rand() * Math.max(1, hi - lo)), bp = series.close[u];
          const o = race(series, u, d, bp * (1 + d * lat.confirmedEntryReward), bp * (1 - d * lat.confirmedEntryRisk), H);
          if (o.res === 0 || o.res === 1) cbA.push(o.res);
        }
        lat.cbA = cbA;
      }
    }
    const date = series.timestamps[t];
    events.push({
      sym: meta.symbol, issuer: issuerRoot(meta.symbol), date, fold: foldOf(date), d, scale, r: r4(r), legAtr: r4(L / atr), legBars: b.pivotIndex - a.pivotIndex, legPct: r4(L / a.pivotPrice),
      trend, mom, momZ: r4(isNum(cols.momentum3MZ[t]) ? cols.momentum3MZ[t] * d : null), volP: r4(volP), regime: spyRegime(spy, date),
      sector: meta.sector, index: meta.index, price: r4(px), ageY: r4((t) / 52), exchange: meta.exchange,
      fibConf, support, lab, role, cq: p && p.countQuality ? p.countQuality.score : null, cqLevel: p && p.countQuality ? p.countQuality.level : null,
      clarity: E.clarity === undefined ? null : r4(E.clarity), appl: E.applicability ? E.applicability.score : null, applLevel: E.applicability ? E.applicability.level : null,
      hd: p ? p.rankComponents.higherDegree : null, sub: p ? p.rankComponents.subdivision : null, guide: p ? p.rankComponents.guidelines : null,
      pattern: p ? p.pattern : null, status: E.status, stableBars,
      y: out1.res, bars: out1.bars, mfeL: r4(out1.mfe / L), maeL: r4(out1.mae / L), y2: out2.res,
      bA, bAT, up: r4(up), dn: r4(dn), lat
    });
    if (lat) latency.push({ lab, ...lat });
    }
  }
  if (run) st.runLengths.push(run);
  return { events, stats: st, latency, firstDate };
}

/** Fibonacci-Konfluenz am Einstiegspreis: Retracements (38,2/50/61,8 %) der drei vorigen bestaetigten Legs
    (Analyseskala und eine Skala feiner, ohne L selbst), die innerhalb 0,5 ATR liegen. */
function fibConfluence(pivots, scale, t, a, px, atr) {
  const ids = pivots.scaleIds, ix = ids.indexOf(scale), use = [scale, ix > 0 ? ids[ix - 1] : null].filter(Boolean);
  let n = 0;
  for (const id of use) {
    const pv = pivots.scales[id].pivots.filter((q) => q.confirmedIndex <= t && q.pivotIndex <= a.pivotIndex);
    for (let k = Math.max(1, pv.length - 3); k < pv.length; k++) {
      const A = pv[k - 1].pivotPrice, B = pv[k].pivotPrice;
      for (const f of [0.382, 0.5, 0.618]) if (Math.abs(B - f * (B - A) - px) <= 0.5 * atr) n++;
    }
  }
  return n;
}
/** Unterstuetzung/Widerstand: ein frueherer bestaetigter Pivot (Skala 2+) innerhalb 0,5 ATR des Einstiegspreises. */
function supportNear(pivots, t, a, px, atr) {
  for (let s = 1; s < pivots.scaleIds.length; s++) {
    const pv = pivots.scales[pivots.scaleIds[s]].pivots;
    for (const q of pv) if (q.confirmedIndex <= t && q.pivotIndex < a.pivotIndex && Math.abs(q.pivotPrice - px) <= 0.5 * atr) return 1;
  }
  return 0;
}

if (!isMainThread) {
  const { files, opt } = workerData;
  const spyRaw = existsSync(join(ROOT, "quant/data/market/multi-asset/series/SPY.json")) ? readJson(join(ROOT, "quant/data/market/multi-asset/series/SPY.json")).points : null;
  const spy = spyRaw ? { dates: spyRaw.map((p) => p[0]), close: spyRaw.map((p) => p[1]) } : null;
  const out = { events: [], latency: [], stats: [], skipped: 0, errors: [] };
  for (const f of files) {
    try {
      const series = f.points ? weeklySeriesFromPoints(f.points, f.ticker) : (() => { const j = readJson(f.path); return weeklySeriesFromPoints(j.points || [], j.ticker); })();
      const r = processSymbol(series, f, opt, spy);
      if (r.skipped) { out.skipped++; parentPort.postMessage({ progress: 1 }); continue; }
      out.events.push(...r.events); out.latency.push(...r.latency); out.stats.push(Object.assign({ sym: f.symbol }, r.stats, { cq: undefined, cqMean: Stats.mean(r.stats.cq) }));
    } catch (e) { out.errors.push(f.symbol + ": " + e.message); }
    parentPort.postMessage({ progress: 1 });
  }
  parentPort.postMessage({ done: out });
}

// ===================================================================== Main
function loadUniverse(sample) {
  const dir = join(ROOT, "quant/data/market/discover-series-long");
  const tax = readJson(join(ROOT, "quant/data/product/sic-peer-taxonomy-v1.json"));
  const ci = tax.rowColumns.indexOf("securityId"), di = tax.rowColumns.indexOf("sicDivision");
  const sectorBy = {}; tax.rows.forEach((r) => { sectorBy[r[ci]] = r[di]; });
  const members = {};
  for (const ix of ["SP500", "NDX", "DJIA"]) {
    const j = readJson(join(ROOT, "quant/data/market/index-membership", ix + ".json"));
    (j.members || j.constituents || []).forEach((m) => { const tk = typeof m === "string" ? m : (m.ticker || m.symbol); if (tk) (members[tk] = members[tk] || []).push(ix); });
  }
  const master = readJson(join(ROOT, "quant/data/market/security-master/us-security-master.json"));
  const exch = {}, common = new Set(); master.rows.forEach((r) => { if (r.instrument_type === "EQUITY_COMMON") { common.add(r.ticker); if (!exch[r.ticker]) exch[r.ticker] = r.exchange; } });
  return readdirSync(dir).filter((f) => f.startsWith("ref_") && f.endsWith(".json")).sort().map((f) => {
    const sid = f.replace(".json", ""), ticker = sid.replace(/^ref_/, "");
    return { path: join(dir, f), symbol: ticker, ticker, sector: sectorBy[sid] || null, index: members[ticker] ? (members[ticker].includes("SP500") ? "SP500" : members[ticker][0]) : "NONE", exchange: exch[ticker] || "UNKNOWN", partition: partitionOf(ticker) };
  }).filter((f) => !/[_]/.test(f.ticker) && common.has(f.ticker))          // Review-Fix 5: nur Stammaktien
    .filter((f) => sample === "all" || f.partition === sample.toUpperCase());
}
function loadMulti() {
  const dir = join(ROOT, "quant/data/market/multi-asset/series");
  const want = ["SPY", "QQQ", "DIA", "IWM", "EEM", "FEZ", "URTH", "N225", "BTCUSD", "ETHUSD", "WTI", "BRENT", "NATGAS", "XAUUSD", "XAGUSD"];
  return want.filter((s) => existsSync(join(dir, s + ".json"))).map((s) => {
    const pts = readJson(join(dir, s + ".json")).points || [];
    /* Tagesschluss → Wochenschluss (letzter Handelstag je ISO-Woche, Freitag-Datum) */
    const wk = new Map();
    for (const [date, v] of pts) { if (!isNum(v) || v <= 0) continue; const dt = new Date(date + "T00:00:00Z"); const fri = new Date(dt.getTime() + ((5 - dt.getUTCDay() + 7) % 7) * 864e5); wk.set(fri.toISOString().slice(0, 10), v); }
    return { symbol: s, ticker: s, sector: "MULTI", index: "MULTI", exchange: "MULTI", points: [...wk.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) };
  });
}

async function run(files, opt, workers) {
  const t0 = Date.now();
  const chunks = Array.from({ length: Math.min(workers, files.length) }, () => []);
  files.forEach((f, i) => chunks[i % chunks.length].push(f));
  let done = 0;
  const results = await Promise.all(chunks.map((c) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { files: c, opt }, resourceLimits: { maxOldGenerationSizeMb: 3072 } });
    w.on("message", (m) => { if (m.progress) { done++; if (done % 200 === 0) process.stderr.write(`  ${done}/${files.length} (${Math.round((Date.now() - t0) / 1000)} s)\n`); } if (m.done) resolve(m.done); });
    w.on("error", reject);
  })));
  return { events: results.flatMap((r) => r.events), latency: results.flatMap((r) => r.latency), stats: results.flatMap((r) => r.stats),
           skipped: results.reduce((a, r) => a + r.skipped, 0), errors: results.flatMap((r) => r.errors), runtimeSec: Math.round((Date.now() - t0) / 1000) };
}

async function main() {
  const re = arg("reanalyze", null);
  if (re) {   /* Statistik aus gespeicherten Rohdaten neu rechnen (keine Engine-Laeufe) */
    const { readFileSync } = await import("node:fs"); const { gunzipSync } = await import("node:zlib");
    const raw = JSON.parse(gunzipSync(readFileSync(re)).toString());
    const report = Stats.analyze(raw.R, raw.meta);
    writeFileSync(re.replace(/raw-/, "report-").replace(/\.json\.gz$/, ".json"), JSON.stringify(report, null, 1));
    process.stderr.write("neu berechnet: " + re + "\n"); return;
  }
  const sample = arg("sample", "exploratory"), market = arg("market", "stocks"), workers = +arg("workers", "4"), limit = +arg("limit", "0");
  const opt = { scaleMult: +arg("scale-mult", "1"), legacy: process.argv.includes("--legacy"), sticky: process.argv.includes("--sticky") };
  let files = market === "multi" ? loadMulti() : loadUniverse(sample);
  if (limit > 0) { const step = Math.max(1, Math.floor(files.length / limit)); files = files.filter((_, i) => i % step === 0).slice(0, limit); }
  process.stderr.write(`Elliott-Validierung: ${files.length} Reihen (${market}/${sample}, scale-mult ${opt.scaleMult})\n`);
  const R = await run(files, opt, workers);
  const tag = (market === "multi" ? "multi" : sample) + (opt.legacy ? "-v21" : "-v22") + (opt.sticky ? "-sticky" : "") + (opt.scaleMult !== 1 ? "-x" + opt.scaleMult : "") + (limit ? "-n" + limit : "");
  const outDir = arg("out", join(ROOT, "quant/data/technical-intelligence/elliott-validation"));
  mkdirSync(outDir, { recursive: true });
  const meta = { files: files.length, sample, market, scaleMult: opt.scaleMult, engine: (opt.legacy ? "elliott-2.1 (LEGACY)" : EV2.ENGINE_VERSION) + (opt.sticky ? " + persistence" : ""), folds: FOLDS, horizon: H };
  writeFileSync(join(outDir, "raw-" + tag + ".json.gz"), gzipSync(JSON.stringify({ meta, R })));
  const report = Stats.analyze(R, meta);
  writeFileSync(join(outDir, "report-" + tag + ".json"), JSON.stringify(report, null, 1));
  process.stderr.write(`fertig: ${R.events.length} Ereignisse, ${R.runtimeSec} s → report-${tag}.json\n`);
}
if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
