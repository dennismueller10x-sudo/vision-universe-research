/* =========================================================================
   ELLIOTT-KORPUS LAYOUT C1 / C3 (Mission III §23–§25, §75–§82)

   Ziel: realitaetsnaehere Pruefsituation als Layout A/B, ohne die Annahmen
   der Engine nachzubauen (Red-Team H2). Gemeinsames Muster-Skelett (Grammatik
   aus Korpus v2: Grad 0 + Grad −1), aber andere Einbettung:

   * KONTEXT: 2–5 zufaellige Schwuenge (Drift-Regime bull/bear/seitwaerts,
     optional eine kleinere konkurrierende Struktur), danach eine unterteilte
     Bewegung IN den Ursprung (0,6–1,5 × Welle 1). Der Ursprung ist damit ein
     echtes Extrem (EWP: Wellen beginnen an Extremen) — anders als Layout B,
     wo der Zufallspfad den Ursprung oft unterschritt (Fehler-Taxonomie
     HOLDOUT-2: 65 % der groben Gradfehler).
   * POSITION: Vorlauf 25–110 Wochen, Muster nicht mittig.
   * BESTAETIGUNG: unterteilt (Impuls nach Korrektur, Zigzag/Flat nach Motiv).
   * RAUSCHEN (nicht Brown'sche Bruecke — die Pivots liegen dadurch NICHT exakt
     auf dem Skelett): mean-revertierender Log-Rauschprozess (OU, θ = 0,2) mit
       C1: GARCH(1,1)-Volatilitaet, Student-t(4)-Innovationen, AR(1)-Korrelation,
           einzelne Schock-Bars (kehren zurueck) und seltene Spruenge (bleiben);
       C3: ECHTE Wochenrenditen (trendbereinigt) eines realen Titels als
           Innovationen — Volatilitaets-Cluster, Schiefe, Woelbung aus dem Markt.
     Zielstaerke je Stufe (Std. der woechentlichen Log-Rendite des Rauschens):
       none 0 · low 1 % · medium 2,5 % · high 4,5 %
   * AUSWERTUNG in fuenf Stufen: P60/P75/P90 (im Muster, laufend), C_EARLY
     (30–50 % der Bestaetigung), C_LATE (70–100 %).

   Skelett und Kontext haengen NICHT von der Rauschstufe ab (eigener Zufalls-
   strom je Rauschen), die Stufe aendert nichts vor dem Schnittpunkt.
   Splits: Seeds 0–9 DEVELOPMENT, 10–19 VALIDATION, 60–79 HOLDOUT-3 (gesperrt
   bis zur Vorab-Registrierung, ELLIOTT_HOLDOUT3_PREREG.md).
   ========================================================================= */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rng, CLASSES, SUBSHAPE, walk, build } from "./elliott-corpus.mjs";

export const STAGES = ["P60", "P75", "P90", "C_EARLY", "C_LATE"];
export const NOISE_C = { none: 0, low: 0.01, medium: 0.025, high: 0.045 };
export const SPLITS_C = { DEVELOPMENT: [0, 9], VALIDATION: [10, 19], HOLDOUT3: [60, 79] };
export function seedsOfC(split) { const [a, b] = SPLITS_C[split]; const o = []; for (let s = a; s <= b; s++) o.push(s); return o; }

/* --------------------------------------------------------------- Skelett */
function skeleton(cls, seed) {
  const C = CLASSES[cls];
  for (let attempt = 0; attempt < 20; attempt++) {
    const R = rng("vu-elliott-c|skel|" + cls + "|" + seed + "|" + attempt);
    const dir = R.next() < 0.5 ? 1 : -1;
    const g = Math.exp(R.u(Math.log(0.10), Math.log(0.40))), P0 = 100;
    const unitLen = g * P0, unitBars = R.u(6, 16);
    const shapeW = C.shape(R);
    const w1Len = shapeW[0].len * unitLen, w1Bars = Math.max(6, shapeW[0].bars * unitBars);
    /* Kontext: Regime, zufaellige Schwuenge, danach Bewegung in den Ursprung */
    const regime = R.pick(["bull", "bear", "side"]);
    const nSw = 2 + Math.floor(R.next() * 4), lead = Math.round(R.u(25, 110));
    const swings = [];
    for (let k = 0; k < nSw; k++) swings.push({ len: R.u(0.3, 1.2) * unitLen, bars: R.u(0.5, 1.4) * unitBars, sub: R.pick(["ZIGZAG", "IMPULSE", "FLAT"]) });
    const into = { len: R.u(0.6, 1.5) * w1Len, bars: R.u(0.6, 1.5) * w1Bars, sub: C.motive ? R.pick(["ZIGZAG", "FLAT"]) : "IMPULSE" };
    const competing = R.next() < 0.5;
    /* Konkurrierende kleinere Struktur: ein Kontextschwung wird durch ein ganzes kleineres Muster ersetzt */
    const compCls = competing ? R.pick(["ZIGZAG", "IMPULSE", "FLAT_REGULAR", "TRIANGLE_CONTRACTING"]) : null;
    /* Kontext rueckwaerts vom Ursprung aufbauen: Ursprung bei Y0, die Bewegung "into" endet dort in Richtung −dir */
    const pts = [];                       // absolute Knoten (x, y) des Kontexts in Vorwaertsrichtung
    let y = 0;                             // relativ, Ursprung = 0
    const segs = [];                       // rueckwaerts: [into, swings…]
    segs.push({ dirSeg: -dir, len: into.len, bars: into.bars, sub: into.sub });
    let sdir = dir;                        // davor laeuft der Schwung entgegengesetzt
    for (let k = 0; k < nSw; k++) {
      const bias = regime === "side" ? 1 : ((regime === "bull") === (sdir > 0) ? 1.3 : 0.7);
      segs.push({ dirSeg: sdir, len: swings[k].len * bias, bars: swings[k].bars, sub: swings[k].sub, comp: competing && k === 1 ? compCls : null });
      sdir = -sdir;
    }
    segs.reverse();
    /* Startniveau: Summe der Segmente rueckwaerts */
    let yStart = 0; for (const s of segs) yStart -= s.dirSeg * s.len;
    /* Preisniveau so waehlen, dass alles positiv bleibt */
    const tgtRel = walk(shapeW, dir);
    let lo = 0, run = yStart; for (const s of segs) { run += s.dirSeg * s.len; lo = Math.min(lo, run, yStart); }
    lo = Math.min(lo, ...tgtRel.map((p) => p[1] * unitLen));
    const base = P0 + Math.max(0, -lo + 0.35 * P0);
    const all = [[0, base + yStart]]; let x = lead * 0.0, yy = base + yStart;
    /* Vorlauf ruhig */
    all.push([Math.max(4, lead - segs.reduce((a, s) => a + Math.max(4, s.bars), 0)), yy]);
    x = all[all.length - 1][0];
    const ctxTop = [];
    for (const s of segs) {
      ctxTop.push(Math.round(x));
      let sw;
      if (s.comp) sw = CLASSES[s.comp].shape(R);
      else sw = SUBSHAPE[s.sub] ? SUBSHAPE[s.sub](R) : null;
      const B = Math.max(4, s.bars);
      if (sw) {
        const rel = walk(sw, 1), net = rel[rel.length - 1][1], span = rel[rel.length - 1][0];
        /* skaliert so, dass das Teilmuster genau die Nettobewegung s.dirSeg·s.len macht */
        for (let q = 1; q < rel.length; q++) all.push([x + (rel[q][0] / span) * B, yy + s.dirSeg * (rel[q][1] / net) * s.len]);
      } else all.push([x + B, yy + s.dirSeg * s.len]);
      x += B; yy += s.dirSeg * s.len;
      all[all.length - 1] = [x, yy];
    }
    const origin = [x, yy];
    /* Muster (Grad 0 + Grad −1) */
    const tgt = build(R, shapeW, origin[0], origin[1], dir, unitLen, unitBars, 1);
    const tEnd = tgt.top[tgt.top.length - 1], tPrev = tgt.top[tgt.top.length - 2];
    const lastDir = Math.sign(tEnd[1] - tPrev[1]);
    const net = Math.abs(tEnd[1] - tgt.top[0][1]) || unitLen, tBars = tEnd[0] - tgt.top[0][0];
    const range = Math.max(...tgt.top.map((p) => p[1])) - Math.min(...tgt.top.map((p) => p[1]));
    let confLen;
    if (!C.motive || C.negativeOf) {
      confLen = C.negativeOf ? R.u(0.4, 0.7) * net : Math.abs(tEnd[1] - tgt.top[0][1]) + R.u(0.15, 0.4) * Math.max(range, unitLen);
      if (!C.negativeOf && Math.sign(tgt.top[0][1] - tEnd[1]) !== -lastDir) confLen = R.u(0.6, 0.9) * range;
    } else confLen = R.u(0.4, 0.7) * net;
    const confBars = Math.max(6, Math.round(R.u(0.35, 0.7) * tBars));
    const cw = (!C.motive || C.negativeOf) ? SUBSHAPE.IMPULSE(R) : (R.next() < 0.7 ? SUBSHAPE.ZIGZAG(R) : SUBSHAPE.FLAT(R));
    const crel = walk(cw, 1), cnet = crel[crel.length - 1][1], cspan = crel[crel.length - 1][0];
    const conf = build(R, cw, tEnd[0], tEnd[1], -lastDir, confLen / Math.abs(cnet), confBars / cspan, 0);
    const confPts = conf.all.slice(1).map(([a, b]) => [a, Math.max(1, b)]);
    const tail = [[confPts[confPts.length - 1][0] + Math.round(R.u(4, 20)), confPts[confPts.length - 1][1] * R.u(0.97, 1.03)]];
    /* Knoten auf ganze Wochen, streng monoton */
    const knots = all.concat(tgt.all.slice(1), confPts, tail);
    let lastX = -1;
    const K = knots.map(([a, b]) => { let xi = Math.round(a); if (xi <= lastX) xi = lastX + 1; lastX = xi; return [xi, Math.max(1, b)]; });
    const n = K[K.length - 1][0] + 1;
    const sk = new Array(n);
    for (let s = 0; s < K.length - 1; s++) { const [i0, v0] = K[s], [i1, v1] = K[s + 1]; for (let q = 0; q <= i1 - i0; q++) sk[i0 + q] = v0 + (v1 - v0) * q / (i1 - i0); }
    const map = (P) => P.map(([a, b]) => { let best = 0, d = Infinity; K.forEach((k, j) => { const dd = Math.abs(k[0] - Math.round(a)) + Math.abs(k[1] - b) * 1e-6; if (dd < d) { d = dd; best = j; } }); return K[best][0]; });
    const topIdx = map(tgt.top), subIdx = map(tgt.sub), confIdx = map(confPts);
    /* Pruefung: Ursprung ist Extrem ueber die Dauer von Welle 1 (Skelett) */
    const t0 = topIdx[0], d1 = topIdx[1] - topIdx[0];
    let ok = true; for (let i = Math.max(0, t0 - d1); i < t0; i++) if (dir * (sk[i] - sk[t0]) < -1e-9) ok = false;
    if (sk.some((v) => !(v > 0))) ok = false;
    if (!ok) continue;
    return { C, dir, g, sk, n, topIdx, subIdx, confIdx, contextTopIdx: ctxTop.concat([t0]), shapeW, regime, competing: compCls, attempt };
  }
  throw new Error("Skelett nicht erzeugbar " + cls + " " + seed);
}

/* --------------------------------------------------------------- Rauschen */
function tdraw(R, nu) { let z = R.gauss(), c = 0; for (let k = 0; k < nu; k++) { const g = R.gauss(); c += g * g; } const v = z / Math.sqrt(c / nu) / Math.sqrt(nu / (nu - 2)); return Number.isFinite(v) ? v : 0; }
export function noiseC1(n, level, key) {
  const R = rng("vu-elliott-c1|noise|" + key), target = NOISE_C[level] || 0, out = new Array(n).fill(0);
  if (!target) return out;
  const alpha = R.u(0.06, 0.12), beta = R.u(0.80, 0.9 - alpha + 0.06), omega = Math.max(0.02, 1 - alpha - beta), phi = R.u(0, 0.25), theta = 0.2;
  let h = 1, e = 0, prevEps = 0, lvl = 0, jump = 0;
  for (let t = 0; t < n; t++) {
    h = omega + alpha * prevEps * prevEps + beta * h;
    h = Math.min(h, 25);                                    // Volatilitaet begrenzen (numerische Stabilitaet)
    const z = Math.max(-8, Math.min(8, tdraw(R, 4))), eps = Math.sqrt(h) * z;
    prevEps = eps; e = phi * e + Math.sqrt(1 - phi * phi) * eps;
    lvl = (1 - theta) * lvl + e * target;
    if (R.next() < 1 / 260) jump += (R.next() < 0.5 ? -1 : 1) * R.u(3, 6) * target;      // seltener bleibender Sprung (Gap)
    let v = lvl + jump;
    if (R.next() < 1 / 120) v += (R.next() < 0.5 ? -1 : 1) * R.u(3, 6) * target;        // einzelner Schock-Bar
    out[t] = v;
  }
  return out;
}
/* Echte Renditen (C3): Titel-Pool je Split, Bloecke trendbereinigter Wochenrenditen */
const HERE = dirname(fileURLToPath(import.meta.url));
const SERIES_DIR = join(HERE, "../data/market/discover-series-long");
let POOL = null;
function fnv1a(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function issuerRoot(t) { return String(t).replace(/^ref_/, "").replace(/\.json$/, "").split(/[.\-_]/)[0]; }
function realPool() {
  if (POOL) return POOL;
  POOL = { DEV: [], HOLD: [] };
  if (!existsSync(SERIES_DIR)) return POOL;
  const files = readdirSync(SERIES_DIR).filter((f) => f.startsWith("ref_")).sort();
  for (const f of files) {
    const m = fnv1a(issuerRoot(f) + "|ew3") % 10;
    const part = m <= 6 ? "DEV" : "HOLD";               // Rauschquelle: DEVELOPMENT/VALIDATION-Emittenten fuer Entwicklung, HOLDOUT-Emittenten fuer HOLDOUT-3
    if ((fnv1a(f + "|c3pool") % 12) !== 0) continue;     // Stichprobe (~1/12), Laufzeit
    POOL[part].push(f);
  }
  return POOL;
}
const RET_CACHE = {};
function realReturns(file) {
  if (RET_CACHE[file]) return RET_CACHE[file];
  let r = [];
  try {
    const j = JSON.parse(readFileSync(join(SERIES_DIR, file), "utf8")), c = (j.points || []).map((p) => p[1]).filter((v) => v > 0);
    for (let i = 1; i < c.length; i++) { const x = Math.log(c[i] / c[i - 1]); if (Number.isFinite(x) && Math.abs(x) < 0.7) r.push(x); }
    /* trendbereinigt: gleitender 26-Wochen-Mittelwert abgezogen */
    const m = r.map((_, i) => { let s = 0, k = 0; for (let q = Math.max(0, i - 25); q <= i; q++) { s += r[q]; k++; } return s / k; });
    r = r.map((x, i) => x - m[i]);
  } catch (e) { r = []; }
  return (RET_CACHE[file] = r);
}
function noiseC3(n, level, key, holdout) {
  const R = rng("vu-elliott-c3|noise|" + key), target = NOISE_C[level] || 0, out = new Array(n).fill(0);
  if (!target) return { out, source: null };
  const pool = realPool()[holdout ? "HOLD" : "DEV"];
  for (let tries = 0; tries < 50 && pool.length; tries++) {
    const f = pool[Math.floor(R.next() * pool.length)], r = realReturns(f);
    if (r.length < n + 10) continue;
    const s0 = Math.floor(R.next() * (r.length - n)), blk = r.slice(s0, s0 + n);
    const sd = Math.sqrt(blk.reduce((a, x) => a + x * x, 0) / blk.length) || 1;
    let lvl = 0; const theta = 0.2;
    for (let t = 0; t < n; t++) { lvl = (1 - theta) * lvl + blk[t] / sd * target; out[t] = lvl; }
    return { out, source: f.replace(/^ref_|\.json$/g, "") + "@" + s0 };
  }
  return { out: noiseC1(n, level, key), source: "fallback-C1" };
}

/**
 * Ein Fall Layout C1 oder C3.
 * @returns {{id, closes, dates, layout, mid, truth}}  truth wie Korpus v2 + stage, completedWaves, currentWave, cutAt, confIdx
 */
export function corpusCaseC(cls, seed, noise, opts = {}) {
  const layout = opts.layout || "C1", stage = opts.stage || "C_LATE";
  const S = skeleton(cls, seed);
  const key = cls + "|" + seed + "|" + noise;
  let nz, source = null;
  if (layout === "C3") { const o = noiseC3(S.n, noise, key, seed >= 60); nz = o.out; source = o.source; } else nz = noiseC1(S.n, noise, key);
  const closesFull = S.sk.map((v, i) => Math.max(0.5, v * Math.exp(nz[i])));
  /* Schnitt */
  const R = rng("vu-elliott-c|cut|" + cls + "|" + seed + "|" + stage);
  const T = S.topIdx, pe = T[T.length - 1], ce = S.confIdx[S.confIdx.length - 1];
  let cut;
  if (stage[0] === "P") { const f = +stage.slice(1) / 100; cut = Math.round(T[0] + f * (pe - T[0])); }
  else if (stage === "C_EARLY") cut = pe + Math.max(2, Math.round(R.u(0.3, 0.5) * (ce - pe)));
  else cut = pe + Math.max(2, Math.round(R.u(0.7, 1.0) * (ce - pe)));
  cut = Math.min(S.n - 1, cut);
  let mid = null, completed = T.length - 1, current = null;
  if (stage[0] === "P") {
    completed = 0; for (let k = 1; k < T.length; k++) if (T[k] < cut - 1) completed = k;
    current = completed + 1;
    if (completed >= 2 && current <= T.length - 1) mid = { completedWaves: completed, currentWave: current, pts: T.slice(0, completed + 1) };
  }
  const closes = closesFull.slice(0, cut + 1), dates = [];
  const t0 = Date.UTC(2001, 0, 5);
  for (let i = 0; i <= cut; i++) dates.push(new Date(t0 + i * 7 * 86400000).toISOString().slice(0, 10));
  return {
    id: cls + "|" + noise + "|" + seed + "|" + stage + "|" + layout, closes, dates, layout, mid, stage,
    truth: { cls, expect: S.C.expect, motive: S.C.motive, negativeOf: S.C.negativeOf || null, unsupported: false, dir: S.dir, topIdx: T, topPrice: T.map((i) => S.sk[i]), subIdx: S.subIdx,
             contextTopIdx: S.contextTopIdx, patternEnd: pe, confIdx: S.confIdx, cutAt: cut, stage, completedWaves: completed, currentWave: current, legs: S.shapeW.length, sizePct: S.g,
             regime: S.regime, competing: S.competing, noiseSource: source }
  };
}
