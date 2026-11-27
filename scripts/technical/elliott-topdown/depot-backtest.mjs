#!/usr/bin/env node
/* =========================================================================
   Elliott-Depot-Rückwärtstest (Forschung, nicht zertifiziert; Owner 27.11.2026). Schreibt nur mit --out.

   Frage: Bringt ein Depot aus den Setups der Methode (Elliott von oben + Setup-Score) mehr als der Index?
   Universum: heutige Mitglieder von S&P 500 und Nasdaq-100 (quant/data/market/index-membership). ACHTUNG Überlebende-Verzerrung:
   heutige Mitglieder sind die Gewinner der Vergangenheit. Fairer Vergleich ist deshalb „Gleichgewicht derselben Aktien“
   (dieselbe Verzerrung), SPY/QQQ stehen nur zur Einordnung daneben.

   Ablauf (kausal): an jedem Signaltag (alle --step Wochen) rechnet die Engine je Aktie nur mit Kursen bis zu diesem Tag
   (analyzeTopDown asOfIndex), dazu der Setup-Score (setup-score.js; Relative Stärke = Perzentil der 26-Wochen-Rendite im
   Querschnitt aller Titel). Gekauft wird zum Wochenschluss der FOLGEWOCHE, verkauft zum Wochenschluss, an dem eine Ausstiegsregel
   greift. Kosten je Kauf und Verkauf --cost (Anteil). Höchstens --max Positionen, gleich gewichtet beim Kauf, freies Geld unverzinst.
   Kurse: Wochenschluss, nur Kurs (ohne Dividenden) – für Depot und Vergleiche gleich.

   Strategien:
     A  Setup stark (mit Elliott):    Kauf bei STRONG_UP; Verkauf, wenn der Score an einem Signaltag unter 65 fällt, nach 52 Wochen.
     B  wie A, dazu Elliott-Ziel und -Absicherung: Verkauf am ersten Kursziel (nahe Kante der ersten Aufwärts-Zone) oder unter der
        Ungültig-Marke.
     C  Zone (HKCM-Stil): Score ≥ 65 aufwärts und der nächste Schritt ist ein Rücksetzer: Kaufauftrag an der nahen Kante der
        Rücksetzer-Zone, gültig bis zum nächsten Signaltag; Absicherung 1 % unter der äußeren Kante, Ziel = Zone des Folgeschritts.
     M  Nur Momentum (ohne Elliott): Score aus Relativer Stärke, Trend und Momentum allein, sonst wie A. Zeigt, was Elliott beiträgt.
   Vergleich: SPY, QQQ, Gleichgewicht aller Universumsaktien (monatlich neu gewichtet).

   Aufruf: node scripts/technical/elliott-topdown/depot-backtest.mjs --out DIR [--from 2005-01-01] [--step 4] [--max 20]
           [--cost 0.001] [--engine PFAD] [--workers 4] [--index SP500,NDX] [--pit CSV ticker,start_date,end_date]
   ========================================================================= */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const req = createRequire(import.meta.url);
const D = join(ROOT, "quant/data/market/discover-series-long");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };

/* ---------------------------------------------------------- Arbeiter: Signale je Aktie */
if (!isMainThread) {
  const { files, engine, cuts } = workerData;
  const TD = req(engine), SS = req(join(ROOT, "quant/engines/technical/elliott/setup-score.js"));
  const out = {};
  for (const f of files) {
    let j; try { j = JSON.parse(readFileSync(join(D, f), "utf8")); } catch { continue; }
    const pts = j.points || [], c = pts.map((p) => p[1]), t = pts.map((p) => p[0]), idx = new Map(t.map((d, i) => [d, i]));
    const sig = {};
    for (const d of cuts) {
      const a = idx.get(d); if (a === undefined || a < 104) continue;
      let r; try { r = TD.analyzeTopDown({ close: c, times: t, asOfIndex: a }); } catch { continue; }
      if (!r || r.status !== "OK" || !r.path || !r.path.length) { sig[d] = { plan: null }; continue; }
      const P = r.path, plan = SS.planDir(P), inv = r.primary.invalidation;
      const up1 = P.find((s) => s.direction === "UP" && !s.exhausted), z1 = up1 && up1.zone.tiers.find((z) => !z.passed);
      const s0 = P[0], s1 = P[1];
      let zone = null;
      if (s0 && s0.direction === "DOWN" && s1 && s1.direction === "UP") {
        const zb = s0.zone.tiers.find((z) => z.tier === "BASE"), ze = s0.zone.tiers.find((z) => z.tier === "EXTENDED") || zb, zt = s1.zone.tiers[0];
        if (zb && zt) zone = { near: zb.high, stop: ze.low * 0.99, tgt: zt.low };
      }
      sig[d] = { plan, tgt: z1 ? z1.low : null, inv: inv && inv.direction === "below" ? inv.price : null, zone };
    }
    out[f] = sig;
  }
  parentPort.postMessage(out);
  process.exit(0);
}

/* ---------------------------------------------------------- Hauptprozess */
const OUT = arg("out", null); if (!OUT) { console.error("--out fehlt"); process.exit(2); }
const FROM = arg("from", "2005-01-01"), STEP = Number(arg("step", 4)), MAX = Number(arg("max", 20)), COST = Number(arg("cost", 0.001));
const ENGINE = arg("engine", join(ROOT, "quant/engines/technical/elliott/elliott-topdown.js")), WORKERS = Number(arg("workers", 4));
const INDEX = arg("index", "SP500,NDX").split(",");
const TD = req(ENGINE), SS = req(join(ROOT, "quant/engines/technical/elliott/setup-score.js"));

/* Universum */
const members = new Set();
for (const id of INDEX) { const f = join(ROOT, "quant/data/market/index-membership", id + ".json"); if (existsSync(f)) JSON.parse(readFileSync(f, "utf8")).members.forEach((m) => members.add(m.symbol)); }
/* --pit DATEI (CSV ticker,start_date,end_date): Mitgliedschaft zum jeweiligen Zeitpunkt statt heutiger Mitglieder. Aktien ohne
   Kursreihe (meist übernommen oder insolvent) fehlen; ihr Anteil steht im Ergebnis. */
const PIT = arg("pit", null), pitIv = {};
let pitStats = null;
if (PIT) {
  const lines = readFileSync(PIT, "utf8").trim().split(/\r?\n/).slice(1);
  let n = 0, withData = 0;
  for (const ln of lines) {
    const [tk, a, b] = ln.split(","); const end = b || "9999-12-31"; if (end < FROM) continue;
    n++; const fn = ["ref_" + tk.replace(".", "-") + ".json", "ref_" + tk.replace(".", "") + ".json"].find((x) => existsSync(join(D, x)));
    if (!fn) continue; withData++; (pitIv[fn] = pitIv[fn] || []).push([a, end]);
  }
  pitStats = { intervalle: n, mitKursreihe: withData };
}
const uniFiles = PIT ? Object.keys(pitIv) : [...members].map((s) => "ref_" + s + ".json").filter((f) => existsSync(join(D, f)));
const isMember = (f, k) => !PIT || (pitIv[f] || []).some(([a, b]) => k >= weekKey(a) && k <= b);

/* Wochenkalender aus SPY (letzter Handelstag je Woche, Freitag-Woche) und Vergleichsreihen */
function weekly(points) {
  const out = []; let key = null;
  for (const [d, v] of points) { const k = weekKey(d); if (k === key) out[out.length - 1] = [d, v]; else { out.push([d, v]); key = k; } }
  return out;
}
function weekKey(d) { const t = Date.parse(d + "T00:00:00Z"), day = (new Date(t).getUTCDay() + 2) % 7; return new Date(t - day * 864e5).toISOString().slice(0, 10); }   // Woche Samstag–Freitag
const ser = (s) => JSON.parse(readFileSync(join(ROOT, "quant/data/market/multi-asset/series", s + ".json"), "utf8")).points;
const SPYw = weekly(ser("SPY")), QQQw = weekly(ser("QQQ"));
const cal = SPYw.map((p) => weekKey(p[0])).filter((k) => k >= weekKey(FROM));
const spyBy = new Map(SPYw.map((p) => [weekKey(p[0]), p[1]])), qqqBy = new Map(QQQw.map((p) => [weekKey(p[0]), p[1]]));

/* Kurse je Aktie nach Wochenschlüssel; Relative Stärke (26 Wochen) im Querschnitt aller Titel */
const px = {}, R26 = new Map();
for (const f of readdirSync(D)) {
  if (!f.startsWith("ref_")) continue;
  let j; try { j = JSON.parse(readFileSync(join(D, f), "utf8")); } catch { continue; }
  const pts = j.points || []; if (pts.length < 30) continue;
  const m = new Map(); pts.forEach((p) => m.set(weekKey(p[0]), p[1]));
  if (uniFiles.includes(f)) px[f] = { m, pts, c: pts.map((p) => p[1]), wk: new Map(pts.map((p, i) => [weekKey(p[0]), i])) };
  for (let i = 26; i < pts.length; i++) { const k = weekKey(pts[i][0]); const v = pts[i][1] / pts[i - 26][1] - 1; if (!isFinite(v)) continue; if (!R26.has(k)) R26.set(k, []); R26.get(k).push(v); }
}
for (const [, a] of R26) a.sort((x, y) => x - y);
const rsPct = (k, v) => { const a = R26.get(k); if (!a || a.length < 50) return null; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo / a.length; };

/* Signaltage (Wochenschlüssel) → je Aktie das Datum ihres Wochenschlusses */
const sigKeys = cal.filter((_, i) => i % STEP === 0);
const cutDates = {};
for (const f of uniFiles) { const s = new Set(sigKeys); cutDates[f] = px[f].pts.filter((p) => s.has(weekKey(p[0]))).map((p) => p[0]); }

/* Signale parallel rechnen */
const chunks = Array.from({ length: WORKERS }, () => []); uniFiles.forEach((f, i) => chunks[i % WORKERS].push(f));
const t0 = Date.now();
const parts = await Promise.all(chunks.map((files) => new Promise((res, rej) => {
  const cuts = [...new Set(files.flatMap((f) => cutDates[f]))];
  const w = new Worker(fileURLToPath(import.meta.url), { workerData: { files, engine: ENGINE, cuts }, argv: [] });
  w.on("message", res); w.on("error", rej);
})));
const SIG = Object.assign({}, ...parts);
const sigN = Object.values(SIG).reduce((s, x) => s + Object.keys(x).length, 0), sigPlan = Object.values(SIG).reduce((s, x) => s + Object.values(x).filter((y) => y.plan).length, 0);
const sigSec = Math.round((Date.now() - t0) / 1000);

/* Score je Aktie und Signaltag (mit und ohne Elliott) */
function scoreAt(f, k, withElliott) {
  const P = px[f]; const pts = P.pts, a = P.wk.get(k);
  if (a === undefined || a < 104) return null;
  const c = P.c, pp = SS.priceParts(c, a); if (!pp) return null;
  const s = SIG[f] && SIG[f][pts[a][0]];
  const rs = rsPct(k, c[a] / c[a - 26] - 1);
  const sc = SS.score({ rs, trend: pp.trend, mom: pp.mom, elliott: withElliott ? (s ? s.plan : null) : null });
  return { sc, s };
}
const SC = {};   // SC[k][f] = { e: score mit Elliott, m: ohne, s: Signal }
for (const k of sigKeys) { SC[k] = {}; for (const f of uniFiles) { if (!isMember(f, k)) continue; const e = scoreAt(f, k, true); if (!e) continue; const m = scoreAt(f, k, false); SC[k][f] = { e: e.sc, m: m && m.sc, s: e.s }; } }

/* ---------------------------------------------------------- Depot-Simulation */
const price = (f, k) => px[f].m.get(k);
function simulate(kind) {
  let cash = 1, pos = [], pend = [], curve = [], trades = [];
  const isSig = new Set(sigKeys);
  for (let w = 0; w < cal.length; w++) {
    const k = cal[w];
    /* 1. Ausführen: Käufe aus der Vorwoche (A, B, M) zum heutigen Schluss; Zonen-Aufträge (C) bei Erreichen */
    const value = () => cash + pos.reduce((s, p) => s + p.n * (price(p.f, k) ?? p.last), 0);
    if (kind !== "C") {
      for (const o of pend) {
        if (pos.length >= MAX || pos.some((p) => p.f === o.f)) continue;
        const pr = price(o.f, k); if (!pr) continue;
        const amt = Math.min(cash, value() / MAX); if (amt < 1e-6) continue;
        cash -= amt; pos.push({ f: o.f, n: (amt * (1 - COST)) / pr, in: pr, w0: w, last: pr, tgt: o.tgt, stop: o.stop });
      }
      pend = [];
    } else {
      pend = pend.filter((o) => o.until >= w);
      for (const o of pend.slice()) {
        if (pos.length >= MAX || pos.some((p) => p.f === o.f)) continue;
        const pr = price(o.f, k); if (!pr || pr > o.near) continue;
        if (pr <= o.stop) { pend.splice(pend.indexOf(o), 1); continue; }
        const amt = Math.min(cash, value() / MAX); if (amt < 1e-6) continue;
        cash -= amt; pos.push({ f: o.f, n: (amt * (1 - COST)) / pr, in: pr, w0: w, last: pr, tgt: o.tgt, stop: o.stop });
        pend.splice(pend.indexOf(o), 1);
      }
    }
    /* 2. Ausstieg */
    pos = pos.filter((p) => {
      const pr = price(p.f, k); if (pr) p.last = pr; else return true;
      let why = null;
      if ((kind === "B" || kind === "C") && p.tgt && pr >= p.tgt) why = "ziel";
      else if ((kind === "B" || kind === "C") && p.stop && pr <= p.stop) why = "absicherung";
      else if (w - p.w0 >= 52) why = "zeit";
      else if (isSig.has(k) && kind !== "C") { const x = SC[k][p.f], sc = x && (kind === "M" ? x.m : x.e); if (!sc || sc.v < 65) why = "score"; }
      if (!why) return true;
      cash += p.n * pr * (1 - COST); trades.push({ f: p.f, r: pr / p.in - 1, w: w - p.w0, why }); return false;
    });
    /* 3. Neue Signale */
    if (isSig.has(k)) {
      const cand = Object.entries(SC[k]).map(([f, x]) => ({ f, x })).filter(({ x }) => {
        const sc = kind === "M" ? x.m : x.e; if (!sc) return false;
        if (kind === "C") return sc.v >= 65 && x.s && x.s.zone && x.s.plan === "UP";
        return sc.level === "STRONG_UP";
      }).sort((a, b) => ((kind === "M" ? b.x.m.v : b.x.e.v) - (kind === "M" ? a.x.m.v : a.x.e.v)) || a.f.localeCompare(b.f));
      if (kind === "C") {
        const nextSig = sigKeys[sigKeys.indexOf(k) + 1]; const until = nextSig ? cal.indexOf(nextSig) : cal.length;
        pend = cand.map(({ f, x }) => ({ f, near: x.s.zone.near, stop: x.s.zone.stop, tgt: x.s.zone.tgt, until }));
      } else pend = cand.map(({ f, x }) => ({ f, tgt: kind === "B" && x.s ? x.s.tgt : null, stop: kind === "B" && x.s ? x.s.inv : null }));
    }
    curve.push([k, value()]);
  }
  return { curve, trades };
}
/* Gleichgewicht aller Universumsaktien, alle 4 Wochen neu gewichtet */
function equalWeight() {
  let v = 1, curve = [], held = null;
  for (let w = 0; w < cal.length; w++) {
    const k = cal[w];
    if (held) { const r = held.map((h) => { const p = price(h.f, k); return p > 0 ? p / h.p : 1; }); if (r.length) v = held.v * r.reduce((s, x) => s + x, 0) / r.length; }
    const now = uniFiles.filter((f) => price(f, k) > 0 && isMember(f, k));
    if ((!held || w % 4 === 0) && now.length) held = Object.assign(now.map((f) => ({ f, p: price(f, k) })), { v });
    curve.push([k, v]);
  }
  return { curve };
}
const bench = (by) => { const b0 = by.get(cal[0]); return { curve: cal.map((k) => [k, (by.get(k) ?? null) / b0]) }; };

function stats(curve, from, to) {
  const c = curve.filter(([k, v]) => k >= from && k <= to && v);
  if (c.length < 10) return null;
  const yrs = (Date.parse(c[c.length - 1][0]) - Date.parse(c[0][0])) / 3.156e10, tot = c[c.length - 1][1] / c[0][1];
  let peak = 0, dd = 0; const r = [];
  c.forEach(([, v], i) => { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); if (i) r.push(v / c[i - 1][1] - 1); });
  const m = r.reduce((s, x) => s + x, 0) / r.length, sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / r.length);
  const rd = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
  return { renditeProJahr: rd((tot ** (1 / yrs) - 1) * 100), gesamt: rd((tot - 1) * 100, 0), maxVerlust: rd(dd * 100), schwankungProJahr: rd(sd * Math.sqrt(52) * 100), sharpe0: rd((m / sd) * Math.sqrt(52), 2) };
}
const periods = [["gesamt", cal[0], cal[cal.length - 1]], ["bis 2014", cal[0], "2014-12-31"], ["2015–2019", "2015-01-01", "2019-12-31"], ["ab 2020", "2020-01-01", cal[cal.length - 1]]];
const runs = { "A Setup stark": simulate("A"), "B Setup stark + Elliott-Ziel/Absicherung": simulate("B"), "C Zone (HKCM-Stil)": simulate("C"), "M nur Momentum (ohne Elliott)": simulate("M"),
  "Vergleich: Gleichgewicht Universum": equalWeight(), "Vergleich: SPY": bench(spyBy), "Vergleich: QQQ": bench(qqqBy) };
const result = { schema: "vu-elliott-depot-backtest-1", label: "Forschung, nicht zertifiziert", engine: TD.VERSION, setupScore: SS.VERSION,
  params: { pit: PIT ? pitStats : null, from: FROM, stepWeeks: STEP, maxPositionen: MAX, kosten: COST, index: INDEX, aktien: uniFiles.length, signaltage: sigKeys.length, signalSekunden: sigSec, signale: sigN, signaleMitPlan: sigPlan },
  hinweis: "Universum = heutige Indexmitglieder (Überlebende-Verzerrung); fairer Vergleich ist das Gleichgewicht derselben Aktien. Nur Kurs, ohne Dividenden.",
  ergebnis: {} };
for (const [name, r] of Object.entries(runs)) {
  const e = { zeitraeume: Object.fromEntries(periods.map(([n, a, b]) => [n, stats(r.curve, a, b)])) };
  if (r.trades) { const T = r.trades; e.trades = T.length; e.gewinnQuote = T.length ? Math.round((T.filter((x) => x.r > 0).length / T.length) * 1000) / 10 : null; e.mittlereHaltedauerWochen = T.length ? Math.round(T.reduce((s, x) => s + x.w, 0) / T.length) : null;
    e.ausstieg = T.reduce((o, x) => ((o[x.why] = (o[x.why] || 0) + 1), o), {}); }
  result.ergebnis[name] = e;
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "depot.json"), JSON.stringify(result, null, 1));
writeFileSync(join(OUT, "kurven.json"), JSON.stringify(Object.fromEntries(Object.entries(runs).map(([n, r]) => [n, r.curve.filter((_, i) => i % 4 === 0)]))));
console.log(JSON.stringify(result, null, 1));
