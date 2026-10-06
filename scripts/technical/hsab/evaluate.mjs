#!/usr/bin/env node
/* =========================================================================
   VU HISTORICAL STRUCTURAL ACCURACY BENCHMARK (Mission VIII) — Stage 2
   OUTCOMES, KONTROLLEN, ATTRIBUTION, ABDECKUNG

   Liest die versiegelten Stage-1-Records (Manifest-Hashes werden geprueft)
   und erst danach die Kurse NACH dem jeweiligen Anzeigezeitpunkt.

   Ereignisbegriff (vorab registriert, HISTORICAL_ACCURACY_PREREGISTRATION.md)
     • Analysezeitpunkte: Bestaetigung eines Pivots der Setup-Skala (dp = 1).
     • Ein EREIGNIS entsteht, wenn das Produkt an einem Analysezeitpunkt ein
       gerichtetes Hauptszenario mit Ziel 1 und Invalidation zeigt UND fuer
       diesen Titel kein frueheres Ereignis mehr offen ist. Bis zu dessen
       Aufloesung (Ziel 1, Invalidation, Zeitablauf) zaehlen weitere
       Analysezeitpunkte nur als LEBENSZYKLUS (Umdeutung ja/nein), nicht als
       neue Prognose. Das Ergebnis gilt immer den beim Anzeigen eingefrorenen
       Niveaus.
     • Umdeutung (RELABEL) vor Aufloesung: Das Produkt zeigt spaeter keine
       oder eine andere Richtung (DIR_CHANGE) bzw. Invalidation oder Ziel 1
       um mehr als 1 ATR verschoben (LEVEL_SHIFT).

   Kontrollen fuer die Hauptgroesse (gleiche Geometrie in ATR-Einheiten)
     B  derselbe Titel, zufaellige andere Zeit (ganze Historie)
     C  derselbe Titel, zufaellige Zeit im Fenster ±104 Wochen / ±504 Tage
     D  dasselbe Datum, zufaellige andere Titel derselben Kohorte    ← Hauptvergleich
     E  wie D, aber nur Titel mit gleichem einfachem Trend (SMA-40w/200d) und
        gleichem ATR%-Tercil am Datum (struktur-gematcht, ohne VU-Methode)
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { ROOT, readJson } from "../lib/ti-data.mjs";
import { loadPanel, eligible, PROFILE } from "./lib/panel.mjs";

const require = createRequire(import.meta.url);
const SO = require("./lib/structural-outcomes.cjs");
const VS = require(join(ROOT, "scripts/technical/lib/validation-stats.cjs"));
const Out = require(join(ROOT, "quant/engines/technical/ti/outcomes.js"));
const Hash = require(join(ROOT, "quant/engines/hash.js"));

export const EVAL_VERSION = "hsab-evaluate-1.0.0";
const HERE = dirname(fileURLToPath(import.meta.url));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const symHash = (s) => parseInt(sha("hsab|" + s).slice(0, 8), 16);
function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const VF = { dir: 0, tpl: 1, inv: 2, t1: 3, t2: 4, e: 5, o: 6, a: 7 };

/* ----------------------------------------------------------------- Records */
export function readRecords(dir, verify = true) {
  const man = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const recs = [];
  for (const sh of man.shards) {
    const buf = readFileSync(join(dir, sh.file));
    if (verify && sha(buf) !== sh.sha256) throw new Error("Siegel verletzt: " + sh.file);
    const txt = gunzipSync(buf).toString("utf8");
    for (const line of txt.split("\n")) if (line) recs.push(JSON.parse(line));
  }
  return { man, recs };
}

/* ------------------------------------------------------- Szenario-Zugriffe */
function scenOf(r, variant) {
  if (variant === "FULL") return r.P && (r.P.dir === 1 || r.P.dir === -1) ? r.P : null;
  const v = r.V && r.V[variant]; if (!v || !(v[VF.dir] === 1 || v[VF.dir] === -1)) return null;
  return { dir: v[VF.dir], tpl: v[VF.tpl], inv: v[VF.inv], t1: v[VF.t1], t2: v[VF.t2], e: v[VF.e], conf: null };
}
const near = (z, d) => (z ? (d > 0 ? z[0] : z[1]) : null);
/* Anzeigeschritt des Produkts (scenario.js priceStep) relativ zur ATR: wie grob die eingefrorenen Niveaus gerundet sind (Review H1). */
const priceStep = (p) => (p < 1 ? 0.01 : p < 10 ? 0.05 : p < 50 ? 0.1 : p < 200 ? 0.5 : p < 1000 ? 1 : 5);
const roundStepAtr = (r) => (r && r.atr > 0 ? priceStep(r.px) / r.atr : null);

/* ------------------------------------------------------------ Kontrollen */
/**
 * Kontrollfabrik. Jede Ziehung: dieselbe Geometrie in ATR-Einheiten (ag) an einer anderen Reihe/Zeit,
 * ausgewertet mit derselben Outcome-Funktion und DERSELBEN Zensur-Regel wie Ereignisse (voller Horizont noetig, Red Team #5).
 * Rueckgabe [Treffer, Ziehungen, Summe R].
 * mode: { closeTarget, mid } fuer die Regel-Sensitivitaeten (Red Team #1).
 */
function makeControls(panel, prof, pool, win, dpByKey) {
  /* Fenster der Phase (Review M10): B/C ziehen nur Zeitpunkte, deren Ergebnisfenster ganz in der Phase liegt. */
  const inPhase = (e, u) => (!win.from || e.dates[u] >= win.from) && (!win.to || (u + prof.H < e.length && e.dates[u + prof.H] <= win.to));
  const { list, byKey } = panel;
  /* Terzile ATR% je Datum (ueber die zulaessigen Titel des Pools) — einmal je Schluessel gecacht. */
  const tercCache = new Map();
  const candidates = (key) => {
    let c = tercCache.get(key); if (c) return c;
    const a = byKey.get(key) || [], items = [];
    for (let q = 0; q < a.length; q += 2) { const e = list[a[q]], i = a[q + 1]; if (pool.has(e.symbol) && eligible(e, i, prof.minBars) && i + prof.H <= e.length - 1) items.push([a[q], i, e.atrPct[i], e.trend[i]]); }
    const v = items.map((x) => x[2]).sort((x, y) => x - y), t1 = v[Math.floor(v.length / 3)], t2 = v[Math.floor((2 * v.length) / 3)];
    items.forEach((x) => { x.push(x[2] <= t1 ? 0 : x[2] <= t2 ? 1 : 2); });
    c = { items, t1, t2 }; tercCache.set(key, c); return c;
  };
  const evalAt = (e, i, ag, mode) => {
    if (i + prof.H > e.length - 1) return null;
    const g = SO.applyAtrGeometry(ag, e.close[i], e.atr[i]); if (!g) return null;
    const o = SO.primaryOutcome(e, i, g, prof.H, e.atr[i], mode);
    return SO.RESOLVED.has(o.outcome) ? [o.success ? 1 : 0, SO.rMultiple(e, i, g, o)] : null;
  };
  function draw(n, pick, mode) { let h = 0, d = 0, R = 0; for (let k = 0; k < n * 6 && d < n; k++) { const x = pick(); if (!x) continue; const v = evalAt(x[0], x[1], x[2], mode); if (v === null) continue; d++; h += v[0]; R += isNum(v[1]) ? v[1] : 0; } return [h, d, R]; }
  const fromList = (c, e, ag, n, rand, mode) => (c.length < 2 ? [0, 0, 0] : draw(n, () => { const x = c[Math.floor(rand() * c.length)]; return list[x[0]] === e ? null : [list[x[0]], x[1], ag]; }, mode));
  const peCache = new Map();
  /* Ausfuehrungsebene (Red Team #2): Einstiegszone, Ziel und Invalidation relativ zum Schluss in ATR-Einheiten uebertragen und mit denselben Regeln simulieren. */
  const execAt = (e, i, eg) => {
    if (i + prof.H + eg.window > e.length - 1) return null;
    const px = e.close[i], a = e.atr[i], L = (k) => px + k * a;
    const g = { dir: eg.dir, entryLow: L(eg.eLo), entryHigh: L(eg.eHi), invalidation: L(eg.inv), t1Low: L(eg.t1Lo), t1High: L(eg.t1Hi) };
    if (!(g.invalidation > 0 && g.entryLow > 0)) return null;
    const sim = Out.simulate(e, i, g, { entryWindow: eg.window, horizon: prof.H });
    return ["TARGET1", "INVALIDATED", "TIMEOUT"].includes(sim.outcome) ? [1, sim.outcome === "TARGET1" ? 1 : 0] : sim.outcome === "NO_ENTRY" ? [0, 0] : null;
  };
  return {
    candidates,
    B: (e, t, ag, n, rand, mode) => draw(n, () => { const u = prof.minBars - 1 + Math.floor(rand() * (e.length - prof.minBars)); return Math.abs(u - t) >= prof.H && eligible(e, u, prof.minBars) && inPhase(e, u) ? [e, u, ag] : null; }, mode),
    C: (e, t, ag, n, rand, mode) => draw(n, () => { const lo = Math.max(prof.minBars - 1, t - prof.nearWin), hi = Math.min(e.length - 1, t + prof.nearWin); const u = lo + Math.floor(rand() * (hi - lo + 1)); return Math.abs(u - t) >= prof.H && eligible(e, u, prof.minBars) && inPhase(e, u) ? [e, u, ag] : null; }, mode),
    /* P (Review M14): gleiches Datum, andere Titel, die an diesem Datum EBENFALLS einen Pivot der Setup-Skala bestaetigen (Timing-gematcht). */
    P: (e, t, ag, n, rand, mode) => fromList(dpByKey.get(e.keys[t]) || [], e, ag, n, rand, mode),
    /* P∩E (Red Team #4): Timing-gematcht UND gleicher einfacher Trend (Naeherung an die Swing-Richtung des bestaetigten Pivots). */
    PE: (e, t, ag, n, rand, mode) => { const k = e.keys[t] + "|" + e.trend[t]; let c = peCache.get(k);
      if (!c) { c = (dpByKey.get(e.keys[t]) || []).filter((x) => list[x[0]].trend[x[1]] === e.trend[t]); peCache.set(k, c); } return fromList(c, e, ag, n, rand, mode); },
    D: (e, t, ag, n, rand, mode) => fromList(candidates(e.keys[t]).items, e, ag, n, rand, mode),
    E: (e, t, ag, n, rand, mode) => { const C = candidates(e.keys[t]); const terc = e.atrPct[t] <= C.t1 ? 0 : e.atrPct[t] <= C.t2 ? 1 : 2, tr = e.trend[t];
      const ck = tr + "|" + terc; C.cells = C.cells || {}; const c = C.cells[ck] || (C.cells[ck] = C.items.filter((x) => x[3] === tr && x[4] === terc));
      return fromList(c, e, ag, n, rand, mode); },
    /* Ausfuehrung: [gefuellte Ziehungen, Ziel 1 unter gefuellten] */
    Dexec: (e, t, eg, n, rand) => { const c = candidates(e.keys[t]).items; if (c.length < 2) return [0, 0]; let f = 0, h = 0, d = 0;
      for (let k = 0; k < n * 6 && d < n; k++) { const x = c[Math.floor(rand() * c.length)]; if (list[x[0]] === e) continue; const v = execAt(list[x[0]], x[1], eg); if (!v) continue; d++; f += v[0]; h += v[1]; } return [f, h]; }
  };
}

/* ------------------------------------------------- Pool-Basisraten je Datum */
function poolRates(panel, prof, pool) {
  /* Je Titel/Bar: Barriere ±2 ATR (long) und Rendite nach fwd; je Datum Mittel ueber den Pool → Drift-/Regime-Kontrolle fuer Richtungsmasse. */
  const { list, byKey } = panel, K = 2;
  for (const e of list) {
    e.bUp = new Float32Array(e.length).fill(NaN); e.bDn = new Float32Array(e.length).fill(NaN); e.fw = new Float32Array(e.length).fill(NaN);
    for (let i = 0; i < e.length; i++) {
      if (!eligible(e, i, prof.minBars)) continue;
      const u = SO.barrier(e, i, 1, e.atr[i], K, prof.H), dn = SO.barrier(e, i, -1, e.atr[i], K, prof.H), f = SO.forward(e, i, prof.fwd);
      if (u !== null) e.bUp[i] = u; if (dn !== null) e.bDn[i] = dn; if (f !== null) e.fw[i] = f;
    }
  }
  const rates = new Map();
  for (const [key, a] of byKey) {
    let su = 0, nu = 0, sd = 0, nd = 0, sf = 0, nf = 0;
    for (let q = 0; q < a.length; q += 2) { const e = list[a[q]], i = a[q + 1]; if (!pool.has(e.symbol)) continue;
      if (!Number.isNaN(e.bUp[i])) { su += e.bUp[i] === 1 ? 1 : 0; nu++; } if (!Number.isNaN(e.bDn[i])) { sd += e.bDn[i] === 1 ? 1 : 0; nd++; } if (!Number.isNaN(e.fw[i])) { sf += e.fw[i]; nf++; } }
    rates.set(key, { up: nu ? su / nu : null, dn: nd ? sd / nd : null, fwd: nf ? sf / nf : null, n: nu });
  }
  return rates;
}

/* -------------------------------------------------------------- Ereignisse */
function buildEvents(recs, e, prof, variant, opts) {
  const ev = [];
  let act = null;
  for (let k = 0; k < recs.length; k++) {
    const r = recs[k];
    if (act && r.i <= act.end) {
      /* Lebenszyklus: nur bis zur Aufloesung; per Bar (pb) oder je Analysezeitpunkt */
      if (r.i > act.t && r.i < act.end && !act.relabel) {   /* Review H2: die Aufloesungsbar selbst ist keine Umdeutung VOR der Aufloesung */
        const s = scenOf(r, variant);
        if (!s || s.dir !== act.dir) act.relabel = { type: "DIR_CHANGE", bars: r.i - act.t, to: s ? s.dir : 0, pb: r.pb ? 1 : 0 };
        else if (!act.shift && ((isNum(s.inv) && Math.abs(s.inv - act.inv) > act.atr) || (s.t1 && Math.abs(near(s.t1, s.dir) - act.t1n) > act.atr))) act.shift = { bars: r.i - act.t };
      }
      continue;
    }
    if (!r.dp) continue;
    if (opts.from && r.d < opts.from) continue; if (opts.to && r.d > opts.to) continue;
    const s = scenOf(r, variant);
    if (!s || !s.t1 || !isNum(s.inv)) continue;
    if (!eligible(e, r.i, prof.minBars)) continue;
    const g = SO.geometry(s); if (!g) continue;
    /* Review M6 / Red Team #5: EINE Zensur-Regel fuer alle Kohorten und fuer Kontrollen — nur Zeitpunkte mit vollstaendig
       beobachtbarem Horizont. Sonst zaehlten am Reihenende (Datenende, Delisting) nur schnelle Aufloesungen.
       Sensitivitaet: diese Faelle mit ihrem tatsaechlichen Ausgang, Unaufgeloeste als Misserfolg. */
    if (r.i + prof.H > e.length - 1) { ev.push({ r, s, g, o: { outcome: "INCOMPLETE_HORIZON", real: SO.primaryOutcome(e, r.i, g, prof.H, r.atr) }, excluded: "INCOMPLETE_HORIZON" }); continue; }
    const o = SO.primaryOutcome(e, r.i, g, prof.H, r.atr);
    if (o.outcome === "TRIVIAL_TARGET" || o.outcome === "ALREADY_INVALID") { ev.push({ r, s, g, o, excluded: o.outcome }); continue; }
    act = { r, s, g, o, t: r.i, dir: s.dir, inv: s.inv, t1n: near(s.t1, s.dir), atr: r.atr, end: o.outcome === "CENSORED" ? Infinity : r.i + o.bars, relabel: null, shift: null };
    ev.push(act);
  }
  return ev.filter((x) => !x.excluded).concat(ev.filter((x) => x.excluded).map((x) => ({ ...x, excludedOnly: true })));
}

/* ------------------------------------------------------------------ Statistik */
let BOOT_B = 1000;
let BLOCK = "HALF";   /* Red Team #8 / Review M11: Halbjahresbloecke (laenger als der Wochenhorizont von 26 Wochen) */
const tb = (d) => VS.timeBlockOf(d, BLOCK);
/** Erfolgsquote, Kontrollquote, Lift mit Zweiweg-Cluster-Bootstrap. rows: { s, d, y (0/1), ch, cd } */
function liftStat(rows, label) {
  if (!rows.length) return { n: 0 };
  const bs = VS.twoWayBoot(rows, (x) => x.s, (x) => tb(x.d), (x) => [x.y, 1, x.ch || 0, x.cd || 0],
    { rate: (v) => (v[1] ? v[0] / v[1] : null), base: (v) => (v[3] ? v[2] / v[3] : null), lift: (v) => (v[1] && v[3] ? v[0] / v[1] - v[2] / v[3] : null) }, { B: BOOT_B, seed: VS.seedOf(label) });
  const S = bs.stats;
  return { n: rows.length, symbols: bs.symbols, quarters: bs.timeBlocks, rate: S.rate.est, rateCi: [S.rate.lo, S.rate.hi], base: S.base.est, baseDraws: rows.reduce((a, x) => a + (x.cd || 0), 0),
           lift: S.lift.est, liftCi: [S.lift.lo, S.lift.hi], p: S.lift.p, ciBy: S.lift.by };
}
function rateStat(rows, label, nullValue) {
  if (!rows.length) return { n: 0 };
  const bs = VS.twoWayBoot(rows, (x) => x.s, (x) => tb(x.d), (x) => [x.y, 1], { rate: (v) => (v[1] ? v[0] / v[1] : null) }, { B: BOOT_B, seed: VS.seedOf(label), nullValue: { rate: nullValue === undefined ? 0 : nullValue } });
  const S = bs.stats.rate; return { n: rows.length, rate: S.est, ci: [S.lo, S.hi], p: S.p, ciBy: S.by };
}
/** Mittelwert einer kontinuierlichen Groesse (z. B. Barriere-Lift je Punkt) mit Cluster-KI. */
function meanStat(rows, label) {
  if (!rows.length) return { n: 0 };
  const bs = VS.twoWayBoot(rows, (x) => x.s, (x) => tb(x.d), (x) => [x.y, 1], { mean: (v) => (v[1] ? v[0] / v[1] : null) }, { B: BOOT_B, seed: VS.seedOf(label) });
  const S = bs.stats.mean; return { n: rows.length, mean: S.est, ci: [S.lo, S.hi], p: S.p, ciBy: S.by };
}
/** Differenz zweier Erfolgsquoten auf GLEICHEN Zeilen (gepaart). rows: { s, d, a, b } */
function pairedDiff(rows, label) {
  if (!rows.length) return { n: 0 };
  const bs = VS.twoWayBoot(rows, (x) => x.s, (x) => tb(x.d), (x) => [x.a, x.b, 1], { diff: (v) => (v[2] ? (v[0] - v[1]) / v[2] : null), a: (v) => (v[2] ? v[0] / v[2] : null), b: (v) => (v[2] ? v[1] / v[2] : null) }, { B: BOOT_B, seed: VS.seedOf(label) });
  const S = bs.stats; return { n: rows.length, a: S.a.est, b: S.b.est, diff: S.diff.est, ci: [S.diff.lo, S.diff.hi], p: S.diff.p, ciBy: S.diff.by };
}

/* ======================================================================= MAIN */
export async function evaluate(o) {
  const protoPath = o.protocol || join(HERE, "protocol.json");
  const protocol = JSON.parse(readFileSync(protoPath, "utf8"));
  BOOT_B = o.boot || protocol.bootstrap.B;
  const phase = protocol.phases[o.phase]; if (!phase) throw new Error("Unbekannte Phase " + o.phase);
  /* Siegel-Regeln: VAL erst nach DEV-Freeze, HOLDOUT nur mit Praeregistrierungs-Hash und nur einmal. */
  /* Review H3: versiegelte Phasen nur mit dem Protokoll des Repositorys (kein --protocol-Umweg). */
  if (phase.requires && join(protoPath) !== join(HERE, "protocol.json")) throw new Error("VALIDATION/HOLDOUT versiegelt: nur das Repository-Protokoll ist zulaessig");
  if (phase.requires === "DEV_FROZEN" && protocol.status !== "DEV_FROZEN" && protocol.status !== "PREREGISTERED") throw new Error("VALIDATION versiegelt: protocol.status muss DEV_FROZEN sein");
  if (phase.requires === "PREREGISTERED") {
    if (protocol.status !== "PREREGISTERED") throw new Error("HOLDOUT versiegelt: protocol.status muss PREREGISTERED sein");
    const pre = readFileSync(join(ROOT, protocol.preregistration.file));
    if (sha(pre) !== o.openHoldout) throw new Error("HOLDOUT versiegelt: --open-holdout muss den SHA-256 der Praeregistrierung tragen (" + sha(pre).slice(0, 12) + "…)");
    if (!protocol.preregistration.sha256 || protocol.preregistration.sha256 !== sha(pre)) throw new Error("HOLDOUT versiegelt: protocol.preregistration.sha256 passt nicht zur Praeregistrierung");
  }
  const { man, recs: all } = readRecords(o.records);
  /* Review H3: Holdout nur mit den eingefrorenen Engine-Dateien (Hashes aus der Praeregistrierung). */
  if (phase.requires === "PREREGISTERED") {
    const fz = protocol.freeze && protocol.freeze.engineFiles; if (!fz) throw new Error("HOLDOUT versiegelt: protocol.freeze.engineFiles fehlt");
    const diff = Object.keys(fz).filter((f) => man.engine.files[f] !== fz[f]); if (diff.length) throw new Error("HOLDOUT versiegelt: Engine-Dateien weichen vom Freeze ab: " + diff.join(", "));
  }
  const cohorts = new Set(phase.cohorts), inBucket = (s) => !phase.bucket || symHash(s) % phase.bucket[1] === phase.bucket[0];
  const recs = all.filter((r) => cohorts.has(r.c) && inBucket(r.s));
  const symbols = Array.from(new Set(recs.map((r) => r.s))).sort();
  /* Union-Pool (Red Team #5): Kontrollen aus Ueberlebenden UND Delisteten als Sensitivitaet — Panel dann ohne Titelfilter. */
  const panel = loadPanel({ weeklyDir: o.weeklyDir, delisted: o.delisted, workDir: o.workDir, only: phase.unionPool ? null : new Set(symbols) });
  const tf = recs.length ? recs[0].tf : "1W", prof = { ...PROFILE[tf] };
  const pool = new Set(symbols);
  /* Review M13: das Kurspanel muss die Daten sein, die Stage 1 gesehen hat (Datum und Schluss je Record). */
  let mism = 0, checked = 0;
  for (const r of recs) { const pi = panel.bySym.get(r.s); if (pi === undefined) continue; const e = panel.list[pi]; checked++; if (e.dates[r.i] !== r.d || r4(e.close[r.i]) !== r.px) mism++; }
  if (checked && mism / checked > 0.001) throw new Error(`Kurspanel passt nicht zu Stage 1: ${mism}/${checked} Records`);
  const dpByKey = new Map();
  for (const r of recs) { if (!r.dp) continue; const pi = panel.bySym.get(r.s); if (pi === undefined) continue; const e = panel.list[pi]; if (!eligible(e, r.i, prof.minBars)) continue;
    const k = e.keys[r.i]; let a = dpByKey.get(k); if (!a) dpByKey.set(k, (a = [])); a.push([pi, r.i]); }
  /* Review M7: Zufallsstrom je (Variante, Titel, Ereignis, Kontrolle) — unabhaengig von der Variantenliste. */
  const rng = (...k) => Hash.mulberry32(Hash.seedFromString("hsab-controls|" + o.phase + "|" + k.join("|")));
  const rates = poolRates(panel, prof, pool);
  const tax = existsSync(join(ROOT, "quant/data/product/sic-peer-taxonomy-v1.json")) ? readJson(join(ROOT, "quant/data/product/sic-peer-taxonomy-v1.json")) : null;
  const sectorBy = {}; if (tax) { const ci = tax.rowColumns.indexOf("securityId"), di = tax.rowColumns.indexOf("sicDivision"); tax.rows.forEach((r) => { sectorBy[r[ci]] = r[di]; }); }
  const spyRaw = existsSync(join(ROOT, "quant/data/market/multi-asset/series/SPY.json")) ? readJson(join(ROOT, "quant/data/market/multi-asset/series/SPY.json")).points : null;
  const regimeAt = (date) => { if (!spyRaw) return "UNKNOWN"; let lo = 0, hi = spyRaw.length - 1, b = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (spyRaw[m][0] <= date) { b = m; lo = m + 1; } else hi = m - 1; }
    if (b < 130) return "UNKNOWN"; const x = spyRaw[b][1] / spyRaw[b - 126][1] - 1; return x > 0.05 ? "RISK_ON" : x < -0.05 ? "RISK_OFF" : "NEUTRAL"; };
  const win = { from: phase.from || null, to: phase.to || null };
  const inWin = (d) => (!win.from || d >= win.from) && (!win.to || d <= win.to);
  const C = makeControls(panel, prof, pool, win, dpByKey);
  const Cu = phase.unionPool ? makeControls(panel, prof, new Set(panel.list.map((x) => x.symbol)), win, dpByKey) : null;

  /* Records je Titel (sortiert) */
  const bySym = new Map();
  for (const r of recs) { let a = bySym.get(r.s); if (!a) bySym.set(r.s, (a = [])); a.push(r); }
  for (const a of bySym.values()) a.sort((x, y) => x.i - y.i);

  const variants = protocol.variants.filter((v) => v === "FULL" || recs.some((r) => r.V && r.V[v]));
  const EV = {}; variants.forEach((v) => { EV[v] = []; });
  const points = [];   // Analysezeitpunkte fuer Richtungs-/Abdeckungsstudien
  const nCtl = protocol.controls;
  for (const [s, rs] of bySym) {
    const pi = panel.bySym.get(s); if (pi === undefined) continue;
    const e = panel.list[pi];
    for (const v of variants) {
      const evs = buildEvents(rs, e, prof, v, win);
      for (const x of evs) {
        const out = { s, d: x.r.d, i: x.r.i, dir: x.s.dir, tpl: x.s.tpl, o: x.o, excluded: x.excludedOnly ? x.o.outcome : null, relabel: x.relabel || null, shift: x.shift || null, r: v === "FULL" ? x.r : null };
        if (!out.excluded && SO.RESOLVED.has(x.o.outcome)) {
          const ag = SO.atrGeometry(x.g, e.close[x.r.i], e.atr[x.r.i]);
          out.ag = ag;
          if (ag) {
            const ti = x.r.i, R = (k) => rng(v, s, ti, k);
            out.cD = C.D(e, ti, ag, nCtl.D, R("D"));
            if (v === "FULL") {
              out.cB = C.B(e, ti, ag, nCtl.B, R("B")); out.cC = C.C(e, ti, ag, nCtl.C, R("C"));
              out.cE = C.E(e, ti, ag, nCtl.E, R("E")); out.cP = C.P(e, ti, ag, nCtl.D, R("P")); out.cPE = C.PE(e, ti, ag, nCtl.D, R("PE"));
              if (Cu) out.cDu = Cu.D(e, ti, ag, nCtl.D, R("Du"));
              out.R = SO.rMultiple(e, ti, x.g, x.o);
              /* Gegenrichtung (Red Team #4/#8): gleicher Titel, gleiche Zeit, gleiche Abstaende, gespiegelte Richtung */
              const c0 = e.close[ti], a0 = e.atr[ti], gOpp = { dir: -x.g.dir, inv: c0 + x.g.dir * ag.kI * a0, t1Lo: c0 - x.g.dir * ag.kT * a0, t1Hi: c0 - x.g.dir * ag.kT * a0, t2Lo: null, t2Hi: null, conf: null };
              const oOpp = gOpp.inv > 0 && gOpp.t1Lo > 0 ? SO.primaryOutcome(e, ti, gOpp, prof.H, a0) : null;
              out.opp = oOpp && SO.RESOLVED.has(oOpp.outcome) ? { y: oOpp.success ? 1 : 0, R: SO.rMultiple(e, ti, gOpp, oOpp) } : null;
              /* Regel-Sensitivitaeten mit eigener Kontrolle D: Zonenmitte als Ziel; Ziel nur per Schluss */
              const mid = (x.s.t1[0] + x.s.t1[1]) / 2, gMid = { ...x.g, t1Lo: mid, t1Hi: mid }, oMid = SO.primaryOutcome(e, ti, gMid, prof.H, x.r.atr);
              if (SO.RESOLVED.has(oMid.outcome)) { const agM = SO.atrGeometry(gMid, c0, a0); out.mid = { y: oMid.success ? 1 : 0, c: agM ? C.D(e, ti, agM, nCtl.D, R("Dmid")) : [0, 0, 0] }; }
              const oCl = SO.primaryOutcome(e, ti, x.g, prof.H, x.r.atr, { closeTarget: true });
              if (SO.RESOLVED.has(oCl.outcome)) out.closeT = { y: oCl.success ? 1 : 0, c: C.D(e, ti, ag, nCtl.D, R("Dcl"), { closeTarget: true }) };
            }
          }
          if (v === "FULL") {
            /* Alternative (Primaer + Alternative), Ausfuehrungsebene (alte Regeln), Barriere */
            const A = x.r.A && (x.r.A.dir === 1 || x.r.A.dir === -1) ? SO.geometry(x.r.A) : null;
            out.alt = A ? SO.primaryOutcome(e, x.r.i, A, prof.H, x.r.atr).outcome : null;
            const sim = Out.simulate(e, x.r.i, { dir: x.s.dir, entryLow: x.s.e ? x.s.e[0] : e.close[x.r.i], entryHigh: x.s.e ? x.s.e[1] : e.close[x.r.i], invalidation: x.s.inv, t1Low: x.s.t1[0], t1High: x.s.t1[1] },
              { entryWindow: tf === "1W" ? 8 : 20, horizon: prof.H });
            out.exec = { outcome: sim.outcome, ret: sim.returnPct };
            /* Ausfuehrung gegen gematchte Kontrolle D (Red Team #2): gleiche Zonen/Ziele/Grenze in ATR-Einheiten relativ zum Schluss */
            if (x.s.e) { const c0 = e.close[x.r.i], a0 = e.atr[x.r.i], k = (lv) => (lv - c0) / a0;
              const eg = { dir: x.s.dir, eLo: k(x.s.e[0]), eHi: k(x.s.e[1]), inv: k(x.s.inv), t1Lo: k(x.s.t1[0]), t1Hi: k(x.s.t1[1]), window: tf === "1W" ? 8 : 20 };
              out.execD = C.Dexec(e, x.r.i, eg, nCtl.D, rng(v, s, x.r.i, "Dexec")); }
            out.barrier = SO.barrier(e, x.r.i, x.s.dir, e.atr[x.r.i], 2, prof.H);
            const pr = rates.get(e.keys[x.r.i]); out.barrierBase = pr ? (x.s.dir > 0 ? pr.up : pr.dn) : null;
          }
        }
        EV[v].push(out);
      }
    }
    /* Analysezeitpunkte (dp) fuer Richtungsmodelle und Abdeckung */
    for (const r of rs) {
      if (!r.dp || !inWin(r.d)) continue;
      const i = r.i, pr = rates.get(e.keys[i]);
      if (!eligible(e, i, prof.minBars)) continue;
      const dirs = {};
      variants.forEach((v) => { const sc = scenOf(r, v); dirs[v] = sc ? sc.dir : 0; });
      dirs.ALWAYS_LONG = 1; dirs.MA_TREND = e.trend[i];
      const yi = i - prof.year; dirs.MOM52 = yi >= 0 ? Math.sign(e.close[i] / e.close[yi] - 1) : 0;
      let mx = -Infinity, mn = Infinity; for (let j = Math.max(0, i - prof.year); j < i; j++) { mx = Math.max(mx, e.close[j]); mn = Math.min(mn, e.close[j]); }
      dirs.BREAKOUT = e.close[i] >= mx ? 1 : e.close[i] <= mn ? -1 : 0;
      let pmn = Infinity, pmx = -Infinity; for (let j = Math.max(0, i - prof.pull); j < i; j++) { pmn = Math.min(pmn, e.close[j]); pmx = Math.max(pmx, e.close[j]); }
      dirs.PULLBACK = e.trend[i] > 0 && e.close[i] < pmn ? 1 : e.trend[i] < 0 && e.close[i] > pmx ? -1 : 0;
      const P0 = scenOf(r, "FULL"), scorable = !!(P0 && P0.t1 && isNum(P0.inv) && !(P0.dir > 0 ? e.close[i] >= P0.t1[0] || e.close[i] < P0.inv : e.close[i] <= P0.t1[1] || e.close[i] > P0.inv));
      points.push({ s, d: r.d, key: e.keys[i], r, dirs, scorable, bUp: e.bUp[i], bDn: e.bDn[i], fw: e.fw[i], poolUp: pr ? pr.up : null, poolDn: pr ? pr.dn : null, poolFwd: pr ? pr.fwd : null });
    }
  }

  /* ============================================================= Tabellen */
  const T = {};
  const resolved = (x) => !x.excluded && SO.RESOLVED.has(x.o.outcome);
  /* Review M5: nur Ereignisse mit mindestens einer aufgeloesten Kontrollziehung (sonst Quote und Basis auf verschiedenen Mengen). */
  const rowsD = (arr, ctl = "cD") => arr.filter((x) => resolved(x) && x[ctl] && x[ctl][1] > 0).map((x) => ({ s: x.s, d: x.d, y: x.o.success ? 1 : 0, ch: x[ctl][0], cd: x[ctl][1] }));
  const full = EV.FULL;
  const fr = full.filter(resolved);
  const nPoints = points.length;
  const dist = (arr) => arr.reduce((m, x) => { const k = x.excluded || x.o.outcome; m[k] = (m[k] || 0) + 1; return m; }, {});

  /* ---- 1. Hauptgroesse und Kontrollen ---- */
  T.primary = {
    definition: "PRIMARY SCENARIO STRUCTURAL SUCCESS (PSS): Ziel 1 beruehrt vor Schluss jenseits der Invalidation, innerhalb H Bars ab Anzeige; AMBIGUOUS_SAME_BAR/TIMEOUT = kein Erfolg; CENSORED/TRIVIAL/ALREADY_INVALID nicht gewertet.",
    horizonBars: prof.H, outcomeDistribution: dist(full), analysisPoints: nPoints,
    eventsResolved: fr.length, coverageOfPoints: r4(points.filter((p) => p.dirs.FULL !== 0).length / Math.max(1, nPoints)),
    vsD: liftStat(rowsD(fr), "pss|D"), vsE: liftStat(rowsD(fr, "cE"), "pss|E"), vsB: liftStat(rowsD(fr, "cB"), "pss|B"), vsC: liftStat(rowsD(fr, "cC"), "pss|C"),
    vsP_timingMatched: liftStat(rowsD(fr, "cP"), "pss|P"),
    vsPE_timingTrendMatched: liftStat(rowsD(fr, "cPE"), "pss|PE"),
    vsD_unionPool: Cu ? liftStat(rowsD(fr, "cDu"), "pss|Du") : null,
    vsD_blockQuarter: (() => { BLOCK = "QUARTER"; const x = liftStat(rowsD(fr), "pss|D|q"); BLOCK = "HALF"; return x; })(),
    vsD_blockYear: (() => { BLOCK = "YEAR"; const x = liftStat(rowsD(fr), "pss|D|year"); BLOCK = "HALF"; return x; })(),
    /* Richtungswert (Red Team #4/#8): gleiche Zeit, gleiche Abstaende, Gegenrichtung — Differenz > 0 heisst: die VU-Richtung traegt Information */
    vsOppositeDirection: pairedDiff(fr.filter((x) => x.opp).map((x) => ({ s: x.s, d: x.d, a: x.o.success ? 1 : 0, b: x.opp.y })), "pss|opp"),
    expectedR: { event: meanStat(fr.filter((x) => isNum(x.R)).map((x) => ({ s: x.s, d: x.d, y: x.R })), "R|ev"),
                 liftVsD: meanStat(fr.filter((x) => isNum(x.R) && x.cD && x.cD[1]).map((x) => ({ s: x.s, d: x.d, y: x.R - x.cD[2] / x.cD[1] })), "R|D"),
                 liftVsOpposite: meanStat(fr.filter((x) => isNum(x.R) && x.opp && isNum(x.opp.R)).map((x) => ({ s: x.s, d: x.d, y: x.R - x.opp.R })), "R|opp") },
    entryBasedVsD: (() => { const rr = fr.filter((x) => x.exec && x.execD && x.execD[0] > 0 && ["TARGET1", "INVALIDATED", "TIMEOUT"].includes(x.exec.outcome));
      return { ...liftStat(rr.map((x) => ({ s: x.s, d: x.d, y: x.exec.outcome === "TARGET1" ? 1 : 0, ch: x.execD[1], cd: x.execD[0] })), "exec|D"), note: "Ziel 1 unter gefuellten Einstiegen (Ebene B) gegen gematchte Kontrolle D mit denselben Zonen in ATR-Einheiten" }; })(),
    ruleZoneMid: liftStat(fr.filter((x) => x.mid && x.mid.c[1] > 0).map((x) => ({ s: x.s, d: x.d, y: x.mid.y, ch: x.mid.c[0], cd: x.mid.c[1] })), "pss|mid"),
    ruleCloseTarget: liftStat(fr.filter((x) => x.closeT && x.closeT.c[1] > 0).map((x) => ({ s: x.s, d: x.d, y: x.closeT.y, ch: x.closeT.c[0], cd: x.closeT.c[1] })), "pss|close"),
    martingale: r4(VS.mean(fr.filter((x) => x.ag).map((x) => x.ag.kI / (x.ag.kI + x.ag.kT)))),
    medianBars: VS.median(fr.filter((x) => x.o.success).map((x) => x.o.bars)),
    sensitivity: {
      ambiguousAsSuccess: rateStat(fr.map((x) => ({ s: x.s, d: x.d, y: x.o.success || x.o.outcome === "AMBIGUOUS_SAME_BAR" ? 1 : 0 })), "pss|amb"),
      /* Review H1: Anzeigerundung in split-bereinigten Kursen; ohne Faelle mit grobem Rundungsschritt (> 0,25 ATR). */
      excludingCoarseRounding: liftStat(rowsD(fr.filter((x) => roundStepAtr(x.r) <= 0.25)), "pss|round"),
      excludingPerBarSymbols: liftStat(rowsD(fr.filter((x) => !x.r.pb)), "pss|nopb"),
      /* Kundensicht (Red Team #1): angezeigte Szenarien mit bereits erreichtem Ziel zaehlen als Misserfolg */
      customerViewTrivialAsFailure: rateStat(full.filter((x) => resolved(x) || x.excluded === "TRIVIAL_TARGET").map((x) => ({ s: x.s, d: x.d, y: !x.excluded && x.o.success ? 1 : 0 })), "pss|trivfail"),
      incompleteHorizonIncluded: rateStat(full.filter((x) => resolved(x) || x.excluded === "INCOMPLETE_HORIZON").map((x) => ({ s: x.s, d: x.d, y: (x.excluded ? x.o.real && x.o.real.success : x.o.success) ? 1 : 0 })), "pss|incomplete"),
      disjointFromDailyDevSymbols: phase.devSampleSize ? (() => { const rank = new Map(symbols.slice().sort((a, b) => symHash("sample|" + a) - symHash("sample|" + b)).map((x, k) => [x, k]));
        return liftStat(rowsD(fr.filter((x) => rank.get(x.s) >= phase.devSampleSize)), "pss|disjoint"); })() : null,
      censoredAsFailure: rateStat(full.filter((x) => !x.excluded && (resolved(x) || x.o.outcome === "CENSORED")).map((x) => ({ s: x.s, d: x.d, y: x.o.success ? 1 : 0 })), "pss|cens")
    }
  };
  /* ---- 2. Sekundaere Outcomes ---- */
  const t2rows = fr.filter((x) => x.o.t2 !== null && x.o.t2 !== undefined);
  T.secondary = {
    target2: rateStat(t2rows.map((x) => ({ s: x.s, d: x.d, y: x.o.t2 ? 1 : 0 })), "t2"),
    invalidationFirst: rateStat(fr.map((x) => ({ s: x.s, d: x.d, y: x.o.outcome === "INVALIDATED" || x.o.outcome === "AMBIGUOUS_SAME_BAR" ? 1 : 0 })), "invfirst"),
    timeout: rateStat(fr.map((x) => ({ s: x.s, d: x.d, y: x.o.outcome === "TIMEOUT" ? 1 : 0 })), "timeout"),
    confirmation: rateStat(fr.filter((x) => x.o.confirmed !== null).map((x) => ({ s: x.s, d: x.d, y: x.o.confirmed ? 1 : 0 })), "confirm"),
    primaryOrAlternative: (() => { const rr = fr.filter((x) => x.alt !== undefined); const y = rr.map((x) => ({ s: x.s, d: x.d, y: x.o.success || x.alt === "TARGET1" ? 1 : 0 }));
      return { ...rateStat(y, "union"), neitherResolvedShare: r4(rr.filter((x) => !x.o.success && x.alt !== "TARGET1").length / Math.max(1, rr.length)), altSuccessAlone: r4(rr.filter((x) => x.alt === "TARGET1").length / Math.max(1, rr.length)),
               note: "Hauptszenario ODER Alternative (Gegenrichtung) — keine Treffsicherheit: deckt nahezu jede gerichtete Bewegung ab." }; })(),
    relabelBeforeResolution: (() => { const pb = fr.filter((x) => x.r && x.r.pb), dp = fr;
      return { dpBased: rateStat(dp.map((x) => ({ s: x.s, d: x.d, y: x.relabel ? 1 : 0 })), "relabel|dp"), perBarSample: rateStat(pb.map((x) => ({ s: x.s, d: x.d, y: x.relabel ? 1 : 0 })), "relabel|pb"),
               levelShiftPerBar: rateStat(pb.map((x) => ({ s: x.s, d: x.d, y: x.shift ? 1 : 0 })), "shift|pb"),
               medianBarsToRelabel: VS.median(pb.filter((x) => x.relabel).map((x) => x.relabel.bars)),
               successIfRelabelled: rateStat(pb.filter((x) => x.relabel).map((x) => ({ s: x.s, d: x.d, y: x.o.success ? 1 : 0 })), "succ|rel"),
               successIfStable: rateStat(pb.filter((x) => !x.relabel).map((x) => ({ s: x.s, d: x.d, y: x.o.success ? 1 : 0 })), "succ|stable") }; })(),
    execution: (() => { const ex = fr.filter((x) => x.exec); const filled = ex.filter((x) => ["TARGET1", "INVALIDATED", "TIMEOUT"].includes(x.exec.outcome));
      return { fillRate: r4(filled.length / Math.max(1, ex.length)), t1AmongFilled: rateStat(filled.map((x) => ({ s: x.s, d: x.d, y: x.exec.outcome === "TARGET1" ? 1 : 0 })), "exec"),
               meanReturnAfterCosts: r4(VS.mean(filled.map((x) => x.exec.ret))), note: "Ebene B (Ausfuehrung, Regeln wie ti-evidence): nur berichtet, keine Hauptgroesse." }; })(),
    mfeMaeAtr: { medianMfe: VS.median(fr.map((x) => x.o.mfeAtr)), medianMae: VS.median(fr.map((x) => x.o.maeAtr)) }
  };
  /* ---- 2b. Kundensicht im Kalenderraster (Red Team #3): jede Monatsend-Bar mit gezeigtem Szenario, ohne Deduplikation ---- */
  {
    const gridRecs = []; let gridPoints = 0;
    for (const [s0, rs] of bySym) { const pi = panel.bySym.get(s0); if (pi === undefined) continue; const e = panel.list[pi];
      for (const r of rs) { if (!r.g || !inWin(r.d) || !eligible(e, r.i, prof.minBars) || r.i + prof.H > e.length - 1) continue; gridPoints++;
        const sc = scenOf(r, "FULL"); if (!sc || !sc.t1 || !isNum(sc.inv)) continue; const g = SO.geometry(sc), o2 = SO.primaryOutcome(e, r.i, g, prof.H, r.atr);
        if (!SO.RESOLVED.has(o2.outcome)) { gridRecs.push({ s: s0, d: r.d, excluded: o2.outcome }); continue; }
        const ag = SO.atrGeometry(g, e.close[r.i], e.atr[r.i]); const cd = ag ? C.D(e, r.i, ag, nCtl.D, rng("GRID", s0, r.i)) : [0, 0, 0];
        const c0 = e.close[r.i], a0 = e.atr[r.i], gOpp = ag ? { dir: -g.dir, inv: c0 + g.dir * ag.kI * a0, t1Lo: c0 - g.dir * ag.kT * a0, t1Hi: c0 - g.dir * ag.kT * a0, t2Lo: null, t2Hi: null, conf: null } : null;
        const oo = gOpp && gOpp.inv > 0 && gOpp.t1Lo > 0 ? SO.primaryOutcome(e, r.i, gOpp, prof.H, a0) : null;
        gridRecs.push({ s: s0, d: r.d, y: o2.success ? 1 : 0, ch: cd[0], cd: cd[1], opp: oo && SO.RESOLVED.has(oo.outcome) ? (oo.success ? 1 : 0) : null }); } }
    const ok = gridRecs.filter((x) => !x.excluded);
    T.customerGridView = gridPoints ? { gridPoints, scenarioShown: r4(gridRecs.length / gridPoints), trivialOrInvalidAtDisplay: r4(gridRecs.filter((x) => x.excluded === "TRIVIAL_TARGET" || x.excluded === "ALREADY_INVALID").length / Math.max(1, gridRecs.length)),
      vsD: liftStat(ok.filter((x) => x.cd > 0), "grid|D"), vsOppositeDirection: pairedDiff(ok.filter((x) => x.opp !== null).map((x) => ({ s: x.s, d: x.d, a: x.y, b: x.opp })), "grid|opp"),
      note: "Monatsend-Raster, ueberlappende Beobachtungen (Cluster-Bootstrap); misst die Sicht eines Kunden, der VU an einem beliebigen Tag oeffnet" } : null;
  }
  /* ---- 3. Richtung, Barriere, einfache Modelle (Analysezeitpunkte, gepaart) ---- */
  const models = ["FULL", ...variants.filter((v) => v !== "FULL"), "ALWAYS_LONG", "MA_TREND", "MOM52", "BREAKOUT", "PULLBACK"];
  const barrierRows = (m) => points.filter((p) => p.dirs[m] && !Number.isNaN(p.dirs[m] > 0 ? p.bUp : p.bDn) && isNum(p.dirs[m] > 0 ? p.poolUp : p.poolDn))
    .map((p) => { const b = p.dirs[m] > 0 ? p.bUp : p.bDn, base = p.dirs[m] > 0 ? p.poolUp : p.poolDn; return { s: p.s, d: p.d, y: (b === 1 ? 1 : 0), yl: (b === 1 ? 1 : 0) - base }; });
  T.directional = {};
  for (const m of models) {
    const br = barrierRows(m);
    const fwdRows = points.filter((p) => p.dirs[m] && !Number.isNaN(p.fw) && isNum(p.poolFwd));
    T.directional[m] = { coverage: r4(points.filter((p) => p.dirs[m]).length / Math.max(1, nPoints)), longShare: r4(points.filter((p) => p.dirs[m] > 0).length / Math.max(1, points.filter((p) => p.dirs[m]).length)),
      barrier2Atr: rateStat(br, "bar|" + m), barrierLiftVsSameDate: meanStat(br.map((x) => ({ s: x.s, d: x.d, y: x.yl })), "barlift|" + m),
      fwdSignHit: rateStat(fwdRows.map((p) => ({ s: p.s, d: p.d, y: Math.sign(p.fw) === p.dirs[m] ? 1 : 0 })), "fwd|" + m, 0.5),
      fwdMarketAdjustedHit: rateStat(fwdRows.map((p) => ({ s: p.s, d: p.d, y: p.dirs[m] * (p.fw - p.poolFwd) > 0 ? 1 : 0 })), "fwdadj|" + m, 0.5),
      meanSignedExcessReturn: meanStat(fwdRows.map((p) => ({ s: p.s, d: p.d, y: p.dirs[m] * (p.fw - p.poolFwd) })), "fwdexc|" + m) };
  }
  /* Gepaarte Vergleiche FULL vs. einfache Modelle: dort, wo beide eine Richtung haben und sie sich UNTERSCHEIDEN — wer hat recht (Barriere)? */
  T.disagreement = {};
  for (const m of models.filter((x) => x !== "FULL")) {
    const rows = points.filter((p) => p.dirs.FULL && p.dirs[m] && p.dirs.FULL !== p.dirs[m]).map((p) => { const bf = p.dirs.FULL > 0 ? p.bUp : p.bDn, bm = p.dirs[m] > 0 ? p.bUp : p.bDn; return Number.isNaN(bf) || Number.isNaN(bm) ? null : { s: p.s, d: p.d, a: bf === 1 ? 1 : 0, b: bm === 1 ? 1 : 0 }; }).filter(Boolean);
    const agree = points.filter((p) => p.dirs.FULL && p.dirs[m]).length;
    T.disagreement[m] = { disagreeShareOfJoint: r4(rows.length / Math.max(1, agree)), ...pairedDiff(rows, "dis|" + m) };
  }
  /* ---- 4. Abdeckung–Genauigkeit ---- */
  const cut = protocol.selectivity.agreementCutoffs || null;
  const absAg = (x) => Math.abs(x.r.ag);
  const tiers = [["ALL_SPOKEN", () => true], ["NOT_MIXED", (x) => !x.r.mx], ["CLARITY_NOT_AMBIGUOUS", (x) => x.r.cl !== "AMBIGUOUS"], ["CLARITY_CLEAR", (x) => x.r.cl === "CLEAR"]];
  if (cut) Object.entries(cut).forEach(([k, c]) => tiers.push(["AGREEMENT_" + k, (x) => absAg(x) >= c]));
  if (cut && cut.TOP25) tiers.push(["CLEAR_AND_AGREEMENT_TOP25", (x) => x.r.cl === "CLEAR" && absAg(x) >= cut.TOP25]);
  tiers.push(["ELLIOTT_SPEAKS", (x) => x.r.ew && x.r.ew.p && !x.r.ew.ab]);
  const pointTier = (p, f) => p.dirs.FULL !== 0 && f({ r: p.r });
  T.coverageAccuracy = tiers.map(([name, f]) => {
    const ev = fr.filter((x) => f(x)), cov = points.filter((p) => pointTier(p, f)).length / Math.max(1, nPoints);
    const rel = ev.filter((x) => x.r.pb);
    const covS = points.filter((p) => pointTier(p, f) && p.scorable).length / Math.max(1, nPoints);
    return { tier: name, events: ev.length, coverage: r4(cov), coverageScorable: r4(covS), ...liftStat(rowsD(ev), "cov|" + name), relabelRatePerBar: rel.length ? r4(rel.filter((x) => x.relabel).length / rel.length) : null, relabelN: rel.length };
  });
  T.coverageAccuracy.unshift({ tier: "ALL_ANALYSIS_POINTS", events: null, coverage: 1, note: "Nenner: alle zulaessigen Analysezeitpunkte; ohne Szenario = Enthaltung" });
  if (!cut) T.agreementQuantilesForFreeze = { TOP50: r4(VS.quantile(fr.map(absAg), 0.5)), TOP25: r4(VS.quantile(fr.map(absAg), 0.75)), TOP10: r4(VS.quantile(fr.map(absAg), 0.9)) };
  /* ---- 5. Enthaltung ---- */
  const cf = (p, m) => { const b = p.dirs[m] > 0 ? p.bUp : p.bDn, base = p.dirs[m] > 0 ? p.poolUp : p.poolDn; return !p.dirs[m] || Number.isNaN(b) || !isNum(base) ? null : { s: p.s, d: p.d, y: (b === 1 ? 1 : 0) - base, h: b === 1 ? 1 : 0 }; };
  const spoken = points.filter((p) => p.dirs.FULL !== 0), abst = points.filter((p) => p.dirs.FULL === 0);
  T.abstention = { abstentionShare: r4(abst.length / Math.max(1, nPoints)), byReason: abst.reduce((m, p) => { const k = p.r.stale ? "STALE" : p.r.P && p.r.P.tpl === "RANGE" ? "RANGE_NEUTRAL" : p.r.o === "NEUTRAL" ? "NEUTRAL_NO_RANGE" : "NO_GEOMETRY"; m[k] = (m[k] || 0) + 1; return m; }, {}) };
  for (const m of ["TREND_ONLY", "MA_TREND", "MOM52"]) {
    if (!points.some((p) => p.dirs[m] !== undefined)) continue;
    const a = spoken.map((p) => cf(p, m)).filter(Boolean), b = abst.map((p) => cf(p, m)).filter(Boolean);
    T.abstention["counterfactual_" + m] = { whereVUSpeaks: meanStat(a, "abs|s|" + m), whereVUAbstains: meanStat(b, "abs|a|" + m),
      hitWhereSpeaks: r4(VS.mean(a.map((x) => x.h))), hitWhereAbstains: r4(VS.mean(b.map((x) => x.h))) };
  }
  /* ---- 6. Strukturklarheit ---- */
  T.structureClarity = {};
  for (const lv of ["CLEAR", "MODERATE", "AMBIGUOUS"]) {
    const ev = fr.filter((x) => x.r.cl === lv), pb = ev.filter((x) => x.r.pb);
    T.structureClarity[lv] = { ...liftStat(rowsD(ev), "cl|" + lv), invalidationFirst: r4(ev.filter((x) => x.o.outcome === "INVALIDATED" || x.o.outcome === "AMBIGUOUS_SAME_BAR").length / Math.max(1, ev.length)),
      relabelPerBar: pb.length ? r4(pb.filter((x) => x.relabel).length / pb.length) : null, relabelN: pb.length, medianBarsToRelabel: VS.median(pb.filter((x) => x.relabel).map((x) => x.relabel.bars)),
      timeoutShare: r4(ev.filter((x) => x.o.outcome === "TIMEOUT").length / Math.max(1, ev.length)) };
  }
  /* ---- 7. Attribution: Ablation (eigene Ereignisse je Variante) ---- */
  T.ablation = {};
  for (const v of variants) { const ev = EV[v].filter(resolved); T.ablation[v] = { events: ev.length, coverage: r4(points.filter((p) => p.dirs[v]).length / Math.max(1, nPoints)), ...liftStat(rowsD(ev), "abl|" + v) }; }
  /* Gepaarte Ablation (Review M7): an denselben FULL-Ereignissen das Szenario der Variante zum selben Zeitpunkt.
     Differenz der kontrollbereinigten Erfolge (Erfolg − Kontrollquote D), Cluster-KI. Gleiche Szenarien → Differenz 0. */
  T.ablationPaired = {};
  for (const v of variants.filter((x) => x !== "FULL")) {
    const rows = []; let same = 0, withSc = 0;
    for (const x of fr) {
      if (!x.cD || !x.cD[1]) continue;
      const sv = scenOf(x.r, v); if (!sv || !sv.t1 || !isNum(sv.inv)) continue; withSc++;
      const e = panel.list[panel.bySym.get(x.s)], gv = SO.geometry(sv), ov = SO.primaryOutcome(e, x.i, gv, prof.H, x.r.atr);
      if (!SO.RESOLVED.has(ov.outcome)) continue;
      const fs = x.r.P; if (fs && sv.dir === fs.dir && sv.inv === fs.inv && JSON.stringify(sv.t1) === JSON.stringify(fs.t1)) same++;
      const agv = SO.atrGeometry(gv, e.close[x.i], e.atr[x.i]); const cv = agv ? C.D(e, x.i, agv, nCtl.D, rng(v, x.s, x.i, "pairD")) : [0, 0]; if (!cv[1]) continue;
      rows.push({ s: x.s, d: x.d, a: (x.o.success ? 1 : 0) - x.cD[0] / x.cD[1], b: (ov.success ? 1 : 0) - cv[0] / cv[1] });
    }
    T.ablationPaired[v] = { eventsWithVariantScenario: r4(withSc / Math.max(1, fr.length)), identicalScenarioShare: r4(same / Math.max(1, withSc)), ...pairedDiff(rows, "pair|" + v),
                           note: "diff = (Erfolg − Kontrolle) FULL minus (Erfolg − Kontrolle) Variante an denselben Zeitpunkten; > 0: die Familie hilft" };
  }
  /* Bedingte Lifts: Familie stuetzt / neutral / widerspricht das Hauptszenario */
  T.familyCondition = {};
  for (const f of ["TREND", "MOMENTUM", "STRUCTURE", "HIGHER_TIMEFRAME", "VOLUME", "PATTERN", "ELLIOTT", "WYCKOFF"]) {
    const g = { SUPPORTS: [], NEUTRAL: [], CONTRADICTS: [], UNAVAILABLE: [] };
    fr.forEach((x) => { const v = x.r.v ? x.r.v[f] : undefined; const k = v === undefined ? "UNAVAILABLE" : v * x.dir > 0.1 ? "SUPPORTS" : v * x.dir < -0.1 ? "CONTRADICTS" : "NEUTRAL"; g[k].push(x); });
    T.familyCondition[f] = Object.fromEntries(Object.entries(g).map(([k, ev]) => [k, ev.length >= protocol.minN.segment ? liftStat(rowsD(ev), "fam|" + f + "|" + k) : { n: ev.length, suppressed: "n < " + protocol.minN.segment }]));
  }
  /* Redundanz: Korrelation der Familienstimmen ueber alle Analysezeitpunkte */
  const fams = ["TREND", "MOMENTUM", "STRUCTURE", "HIGHER_TIMEFRAME", "VOLUME", "PATTERN", "ELLIOTT"].filter((f) => points.filter((p) => p.r.v && p.r.v[f] !== undefined).length > nPoints * 0.05);
  const corr = {};
  for (const a of fams) { corr[a] = {}; for (const b of fams) { const xs = [], ys = []; points.forEach((p) => { const va = p.r.v && p.r.v[a], vb = p.r.v && p.r.v[b]; if (isNum(va) && isNum(vb)) { xs.push(va); ys.push(vb); } }); corr[a][b] = r4(pearson(xs, ys)); } }
  T.redundancy = { families: fams, correlation: corr, effectiveIndependentFamilies: r4(effectiveN(fams.map((a) => fams.map((b) => corr[a][b] || 0)))) };
  /* Konfluenz-Anzahl und Konflikt */
  T.confluenceCount = {};
  const supN = (x) => (x.r.sup || []).length, oppN = (x) => (x.r.opp || []).length;
  for (const k of [1, 2, 3, 4]) { const ev = fr.filter((x) => (k < 4 ? supN(x) === k : supN(x) >= 4)); T.confluenceCount["supporting_" + (k < 4 ? k : "4plus")] = ev.length >= protocol.minN.segment ? liftStat(rowsD(ev), "cc|" + k) : { n: ev.length, suppressed: true }; }
  T.conflict = { noConflict: liftStat(rowsD(fr.filter((x) => oppN(x) === 0)), "conf|0"), anyConflict: liftStat(rowsD(fr.filter((x) => oppN(x) > 0)), "conf|1"), mixedOutlook: liftStat(rowsD(fr.filter((x) => x.r.mx)), "conf|mx") };
  /* ---- 8. Elliott ---- */
  const ew = (x) => x.r.ew || {};
  const eGroup = (x) => !ew(x).p ? "NO_COUNT" : ew(x).ab ? "ABSTAINS" : Math.sign(ew(x).d) === x.dir ? "SPEAKS_ALIGNED" : Math.sign(ew(x).d) === -x.dir ? "SPEAKS_CONFLICT" : "SPEAKS_NEUTRAL";
  const eHyp = (x) => !ew(x).p ? "NO_COUNT" : Math.sign(ew(x).d) === x.dir ? "HYPOTHESIS_ALIGNED" : Math.sign(ew(x).d) === -x.dir ? "HYPOTHESIS_CONFLICT" : "HYPOTHESIS_NEUTRAL";
  T.elliott = { asFilter: {}, hypothesis: {}, motiveVsCorrective: {}, shapedScenario: {}, applicability: {} };
  const grp = (fn, tab, pre) => { const g = {}; fr.forEach((x) => { const k = fn(x); (g[k] = g[k] || []).push(x); }); Object.entries(g).forEach(([k, ev]) => { tab[k] = ev.length >= protocol.minN.segment ? liftStat(rowsD(ev), pre + k) : { n: ev.length, suppressed: true, rate: r4(VS.mean(ev.map((x) => (x.o.success ? 1 : 0)))) }; }); };
  grp(eGroup, T.elliott.asFilter, "ef|"); grp(eHyp, T.elliott.hypothesis, "eh|"); grp((x) => (!ew(x).p ? "NO_COUNT" : ew(x).motive ? "MOTIVE" : "CORRECTIVE"), T.elliott.motiveVsCorrective, "em|");
  grp((x) => (x.r.P && x.r.P.es ? "ELLIOTT_SHAPED" : "NOT_SHAPED"), T.elliott.shapedScenario, "es|"); grp((x) => ew(x).app || "NONE", T.elliott.applicability, "ea|");
  T.elliott.higherDegree = {}; grp((x) => (!ew(x).p || !isNum(ew(x).hd) ? "NONE" : ew(x).hd >= 0.75 ? "HD_HIGH" : ew(x).hd >= 0.5 ? "HD_MID" : "HD_LOW"), T.elliott.higherDegree, "ehd|");
  T.elliott.prospectiveConsistency = elliottPSC(bySym, panel, prof, C, protocol, inWin, rng);
  T.elliott.speakShareOfPoints = r4(points.filter((p) => p.r.ew && p.r.ew.p && !p.r.ew.ab).length / Math.max(1, nPoints));
  /* ---- 9. Segmente ---- */
  const seg = (name, fn) => { const g = {}; fr.forEach((x) => { const k = fn(x); if (k === null || k === undefined) return; (g[k] = g[k] || []).push(x); });
    T.segments[name] = Object.fromEntries(Object.entries(g).sort().map(([k, ev]) => [k, ev.length >= protocol.minN.segment ? liftStat(rowsD(ev), "seg|" + name + "|" + k) : { n: ev.length, suppressed: "n < " + protocol.minN.segment }])); };
  T.segments = {};
  seg("direction", (x) => (x.dir > 0 ? "BULLISH" : "BEARISH")); seg("template", (x) => x.tpl); seg("directionTemplate", (x) => (x.dir > 0 ? "BULL" : "BEAR") + "·" + x.tpl);
  seg("volatilityRegime", (x) => x.r.vr); seg("marketRegime", (x) => regimeAt(x.d)); seg("marketRegimeDirection", (x) => regimeAt(x.d) + "·" + (x.dir > 0 ? "BULL" : "BEAR"));
  seg("year", (x) => x.d.slice(0, 4)); seg("era", (x) => (x.d < "2013-01-01" ? "A_<2013" : x.d < "2019-01-01" ? "B_2013-2018" : "C_>=2019"));
  seg("sector", (x) => sectorBy[x.s.replace(/^D:/, "")] || "UNKNOWN"); seg("trendPhase", (x) => x.r.tp); seg("scenarioStatusAtDisplay", (x) => x.r.P && x.r.P.st);
  const bpy = tf === "1W" ? 52 : 252;
  seg("historyLength", (x) => (x.r.n < 5 * bpy ? "<5y" : x.r.n < 10 * bpy ? "5-10y" : x.r.n < 20 * bpy ? "10-20y" : ">=20y"));
  seg("roundingStepAtr", (x) => { const v = roundStepAtr(x.r); return v === null ? null : v <= 0.1 ? "<=0.1" : v <= 0.25 ? "0.1-0.25" : ">0.25"; });
  seg("patternActive", (x) => ((x.r.pat || []).length ? (x.r.pat[0][0] || "PATTERN") : "NONE"));
  seg("wyckoff", (x) => (x.r.wy ? x.r.wy[0] : "NONE"));
  seg("fibClusters", (x) => (x.r.fibN >= 3 ? "3+" : String(x.r.fibN)));
  seg("supportDistanceAtr", (x) => (!x.r.sr || !isNum(x.r.sr[0]) ? "NONE" : x.r.sr[0] < 1 ? "<1" : x.r.sr[0] < 3 ? "1-3" : ">=3"));
  seg("rewardRisk", (x) => (!x.r.P || !isNum(x.r.P.rr) ? null : x.r.P.rr < 1 ? "<1" : x.r.P.rr < 2 ? "1-2" : x.r.P.rr < 3 ? "2-3" : ">=3"));
  seg("targetDistanceAtr", (x) => (!x.ag ? null : x.ag.kT < 2 ? "<2" : x.ag.kT < 4 ? "2-4" : x.ag.kT < 6 ? "4-6" : ">=6"));
  seg("invalidationDistanceAtr", (x) => (!x.ag ? null : x.ag.kI < 1 ? "<1" : x.ag.kI < 2 ? "1-2" : x.ag.kI < 3 ? "2-3" : ">=3"));
  seg("volumeStatus", (x) => (x.r.vol ? x.r.vol[0] : null)); seg("avwapMajorLow", (x) => (x.r.vol && x.r.vol[2] !== null ? (x.r.vol[2] ? "ABOVE" : "BELOW") : null));
  seg("liquidity", (x) => { const e = panel.list[panel.bySym.get(x.s)]; if (!e || !e.dollarVol) return null; const v = e.dollarVol[x.i]; return !isNum(v) ? null : v < 1e6 ? "<1M" : v < 1e7 ? "1-10M" : "≥10M"; });
  /* Stabilitaet ex ante: wie lange zeigt das Produkt diese Richtung schon (Analysezeitpunkte davor)? */
  seg("directionAgeAtDisplay", (x) => { const rs = bySym.get(x.s); let k = rs.findIndex((r) => r.i === x.i), age = 0; for (let j = k - 1; j >= 0; j--) { const sc = scenOf(rs[j], "FULL"); if (!sc || sc.dir !== x.dir) break; age = x.i - rs[j].i; } return age === 0 ? "NEW" : age <= (tf === "1W" ? 8 : 40) ? "SHORT" : "LONG"; });
  /* Mehrfachtests (Review M12): Benjamini-Hochberg je Segmenttabelle (explorativ) */
  for (const tab of Object.values(T.segments)) { const ks = Object.keys(tab), q = VS.bhAdjust(ks.map((k) => (tab[k] && isNum(tab[k].p) ? tab[k].p : null))); ks.forEach((k, j) => { if (tab[k] && isNum(q[j])) { tab[k].qBH = r4(q[j]); tab[k].registration = "EXPLORATORY"; } }); }
  /* ---- 10. Konzentration ---- */
  const per = {}; fr.forEach((x) => { per[x.s] = (per[x.s] || 0) + 1; });
  const cnts = Object.values(per).sort((a, b) => b - a), tot = cnts.reduce((a, b) => a + b, 0);
  T.concentration = { symbolsWithEvents: cnts.length, eventsPerSymbolMedian: VS.median(cnts), eventsPerSymbolMax: cnts[0] || 0, top10Share: r4(cnts.slice(0, 10).reduce((a, b) => a + b, 0) / Math.max(1, tot)),
                      hhi: r4(cnts.reduce((a, c) => a + (c / tot) ** 2, 0)), top10: Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 10) };
  /* ---- 11. Kontrollqualitaet ---- */
  T.controlCoverage = { D: r4(fr.filter((x) => x.cD && x.cD[1] > 0).length / Math.max(1, fr.length)), E: r4(fr.filter((x) => x.cE && x.cE[1] > 0).length / Math.max(1, fr.length)),
                        meanDrawsD: r4(VS.mean(fr.filter((x) => x.cD).map((x) => x.cD[1]))), meanDrawsE: r4(VS.mean(fr.filter((x) => x.cE).map((x) => x.cE[1]))) };

  const universe = { cohorts: Array.from(cohorts), symbolsInPhase: symbols.length, symbolsWithPanel: panel.list.length, symbolsWithPoints: new Set(points.map((p) => p.s)).size,
    firstPoint: points.length ? points.reduce((a, p) => (p.d < a ? p.d : a), "9999") : null, lastPoint: points.length ? points.reduce((a, p) => (p.d > a ? p.d : a), "0000") : null,
    pointsByYear: points.reduce((m, p) => { const y = p.d.slice(0, 4); m[y] = (m[y] || 0) + 1; return m; }, {}),
    symbolsByYear: (() => { const m = {}; points.forEach((p) => { const y = p.d.slice(0, 4); (m[y] = m[y] || new Set()).add(p.s); }); return Object.fromEntries(Object.entries(m).sort().map(([k, v]) => [k, v.size])); })() };
  return { schemaVersion: "hsab-evidence-1.0.0", evalVersion: EVAL_VERSION, outcomesVersion: SO.VERSION, phase: o.phase, phaseDef: phase, protocolStatus: protocol.status,
           protocolSha256: sha(readFileSync(o.protocol || join(HERE, "protocol.json"))), replay: { sealHash: man.sealHash, commit: man.commit, engine: man.engine, replayVersion: man.replayVersion, persistenceCheck: man.persistenceCheck ? { ...man.persistenceCheck, rows: undefined } : null },
           generatedAt: new Date().toISOString(), timeframe: tf, horizonBars: prof.H, bootstrap: { B: BOOT_B, timeBlock: "QUARTER", method: "TWO_WAY_CLUSTER_BOOTSTRAP (widest of SYMBOL/TIME/TWO_WAY)" },
           universe, tables: T };
}

function pearson(x, y) { const n = x.length; if (n < 3) return null; const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null; }
/** Effektive Zahl unabhaengiger Familien: (Σλ)² / Σλ² der Korrelationsmatrix (Spur = Zahl der Familien). */
function effectiveN(M) { const n = M.length; if (!n) return null; let tr = 0, fro = 0; for (let i = 0; i < n; i++) { tr += M[i][i]; for (let j = 0; j < n; j++) fro += M[i][j] * M[i][j]; } return fro > 0 ? (tr * tr) / fro : null; }

/**
 * Prospektive Strukturkonsistenz (Elliott, §55): je ERSTER Erkennung einer Zaehlung (Persistenzschluessel) mit Richtung dE:
 * CONFIRMED  Schluss +2 ATR in dE vor Schluss jenseits der Elliott-Invalidation (ohne Elliott-Grenze: −2 ATR)
 * INVALIDATED umgekehrt; UNRESOLVED bis H; RELABELLED_FIRST: im Per-Bar-Muster wechselt die Zaehlung vor Aufloesung.
 * Kontrolle: gleiche ATR-Geometrie an zufaelligen Titeln am selben Datum (wie D).
 */
function elliottPSC(bySym, panel, prof, C, protocol, inWin, rng) {
  const rows = { SPEAKS: [], ABSTAINS: [] }, relab = { SPEAKS: [0, 0], ABSTAINS: [0, 0] }, status = { SPEAKS: {}, ABSTAINS: {} };
  for (const [s, rs] of bySym) {
    const e = panel.list[panel.bySym.get(s)]; if (!e) continue;
    const seen = new Set();
    for (let k = 0; k < rs.length; k++) {
      const r = rs[k]; if (!r.dp || !inWin(r.d) || !r.ew || !r.ew.p || !r.ew.key) continue;
      if (seen.has(r.ew.key)) continue; seen.add(r.ew.key);
      const dE = Math.sign(r.ew.d); if (!dE) continue;
      const inv = isNum(r.ew.inv) && ((r.ew.invDir === "below") === (dE > 0)) ? r.ew.inv : r.px - dE * 2 * r.atr;
      const g = { dir: dE, inv, t1Lo: r.px + dE * 2 * r.atr, t1Hi: r.px + dE * 2 * r.atr, t2Lo: null, t2Hi: null, conf: null };
      const o = SO.primaryOutcome(e, r.i, g, prof.H, r.atr);
      const grp = r.ew.ab ? "ABSTAINS" : "SPEAKS";
      const st = o.outcome === "TARGET1" ? "CONFIRMED" : o.outcome === "INVALIDATED" || o.outcome === "AMBIGUOUS_SAME_BAR" ? "INVALIDATED" : o.outcome === "TIMEOUT" ? "UNRESOLVED" : o.outcome;
      status[grp][st] = (status[grp][st] || 0) + 1;
      if (!SO.RESOLVED.has(o.outcome)) continue;
      if (r.pb) { relab[grp][1]++; for (let j = k + 1; j < rs.length && rs[j].i <= r.i + o.bars; j++) if (!rs[j].ew || rs[j].ew.key !== r.ew.key) { relab[grp][0]++; break; } }
      const ag = SO.atrGeometry(g, r.px, r.atr), cd = ag ? C.D(e, r.i, ag, protocol.controls.D, rng("PSC", s, r.i)) : [0, 0];
      rows[grp].push({ s, d: r.d, y: o.success ? 1 : 0, ch: cd[0], cd: cd[1] });
    }
  }
  return { definition: "erste Erkennung je Elliott-Zaehlung; Bestaetigung = Schluss +2 ATR in Elliott-Richtung vor Schluss jenseits der Elliott-Grenze; Kontrolle D gleiche ATR-Geometrie",
           SPEAKS: { ...liftStat(rows.SPEAKS, "psc|s"), status: status.SPEAKS, relabelledFirstPerBar: relab.SPEAKS[1] ? r4(relab.SPEAKS[0] / relab.SPEAKS[1]) : null, relabelN: relab.SPEAKS[1] },
           ABSTAINS: { ...liftStat(rows.ABSTAINS, "psc|a"), status: status.ABSTAINS, relabelledFirstPerBar: relab.ABSTAINS[1] ? r4(relab.ABSTAINS[0] / relab.ABSTAINS[1]) : null, relabelN: relab.ABSTAINS[1] } };
}

async function main() {
  const o = { records: arg("records"), phase: arg("phase"), protocol: arg("protocol", null), weeklyDir: arg("weekly-dir", null), delisted: arg("delisted", null), workDir: arg("work-dir", null),
              openHoldout: arg("open-holdout", null), boot: arg("boot", null) ? +arg("boot") : null };
  const out = arg("out"); if (!out) throw new Error("--out fehlt");
  const t0 = Date.now();
  const res = await evaluate(o);
  res.seconds = Math.round((Date.now() - t0) / 1000);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(res, null, 1));
  const P = res.tables.primary;
  if (res.phaseDef && res.phaseDef.requires === "PREREGISTERED") { console.log(`[hsab-eval] ${o.phase}: geschrieben → ${out} (Ergebnis nicht im Log, Review H3)`); return; }
  console.log(`[hsab-eval] ${o.phase}: Ereignisse ${P.eventsResolved}, PSS ${P.vsD.rate} vs D ${P.vsD.base} (Lift ${P.vsD.lift}, KI ${JSON.stringify(P.vsD.liftCi)}), Abdeckung ${P.coverageOfPoints}, ${res.seconds} s → ${out}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
