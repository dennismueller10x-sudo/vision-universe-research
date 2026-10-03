/* Teil der reproduzierbaren Kalibrierung von Engine 3.1 (nur DEVELOPMENT, Korpus-Layout A und B; Remediation-Aenderung 1).
   Zwischenergebnisse in VU_CALIB_DIR (Standard: Temp-Verzeichnis). */
/* Gewichtskalibrierung (nur DEVELOPMENT): Kandidaten je Fall einmal berechnen, dann offline neu ranken. */
import { createRequire } from "node:module";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as pjoin } from "node:path";
import { tmpdir } from "node:os";
const ROOT = pjoin(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const require = createRequire(import.meta.url);
const M = await import(ROOT + "/quant/tests/elliott-corpus.mjs");
const { weeklySeriesFromPoints } = await import(ROOT + "/scripts/technical/lib/ti-data.mjs");
const Ctx = require(ROOT + "/quant/engines/technical/ti/context.js");
const EV3 = require(ROOT + "/quant/engines/technical/elliott/elliott-v3.js");
const SP = (process.env.VU_CALIB_DIR || tmpdir()) + "/";
const split = process.argv[2] || "DEVELOPMENT", cacheF = SP + "cands-" + split + ".json";
let data;
if (existsSync(cacheF) && !process.argv.includes("--fresh")) data = JSON.parse(readFileSync(cacheF, "utf8"));
else {
  data = [];
  const classes = Object.keys(M.CLASSES).filter((c) => !M.CLASSES[c].negativeOf && !M.CLASSES[c].unsupported);
  for (const cls of classes) for (const nz of ["none", "low", "medium", "high"]) for (const seed of M.seedsOf(split)) for (const cut of ["end", "mid"]) for (const layout of ["A", "B"]) {
    const cs = M.corpusCase(cls, seed, nz, { cut, layout });
    const s = weeklySeriesFromPoints(cs.dates.map((d, i) => [d, cs.closes[i]]), "SYN");
    const P = Ctx.prepare(s);
    const r = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52, debugAll: true });
    const T = cs.truth.topIdx, bars = T.slice(1).map((x, k) => x - T[k]).sort((a, b) => a - b), tol = Math.max(2, Math.round(0.2 * bars[Math.floor(bars.length / 2)]));
    const cands = (r.trace && r.trace.allCands || []).map((c) => {
      if (cs.mid) { const E = c.pts.slice(0, -1), Tm = cs.mid.pts; const ok = !c.complete && cs.truth.expect.includes(c.type) && c.pts.length - 1 === cs.mid.currentWave && E.every((x, k) => Math.abs(x - Tm[k]) <= tol); return { c: c.c, hit: ok ? 1 : 0 }; }
      const exact = c.complete && cs.truth.expect.includes(c.type) && c.pts.length === T.length && c.pts.every((x, k) => Math.abs(x - T[k]) <= tol);
      const nested = c.subs.some((w) => w.st === "CONFIRMED" && Math.abs(w.from - T[0]) <= tol && Math.abs(w.to - T[T.length - 1]) <= tol && cs.truth.expect.includes(w.p));
      return { c: c.c, hit: exact || nested ? 1 : 0, key: c.type + "|" + c.pts[0] + "|" + c.complete };
    });
    data.push({ cls, nz, cut, cands });
  }
  writeFileSync(cacheF, JSON.stringify(data));
}
const KEYS = ["guidelines", "subdivision", "separation", "anchor", "dominance", "similarity", "coverage", "prior", "higherDegree", "tail", "residual"];
function evalW(w, sub) {
  let hit = 0, n = 0, p3 = 0;
  for (const d of data) {
    if (sub && !sub(d)) continue;
    n++;
    let best = null, bs = -1, ranked = [];
    for (const c of d.cands) { let r = 0; for (const k of KEYS) r += (w[k] || 0) * (c.c[k] ?? 0.5); ranked.push([r, c]); }
    ranked.sort((a, b) => b[0] - a[0]);
    if (ranked.length && ranked[0][1].hit) hit++;
    if (ranked.slice(0, 3).some((x) => x[1].hit)) p3++;
  }
  return { hit, p3, n };
}
const pos = (d) => d.nz !== "high";
let w = Object.assign({}, EV3.DEFAULTS.weights); delete w.trendContext;
console.log("cases", data.length, "with truth among candidates:", data.filter((d) => d.cands.some((c) => c.hit)).length, "(none/low/med:", data.filter((d) => pos(d) && d.cands.some((c) => c.hit)).length, "of", data.filter(pos).length, ")");
console.log("default", JSON.stringify(evalW(w, pos)), "end", JSON.stringify(evalW(w, (d) => pos(d) && d.cut === "end")), "mid", JSON.stringify(evalW(w, (d) => pos(d) && d.cut === "mid")));
if (process.argv.includes("--search")) {
  const grid = [0, 0.03, 0.06, 0.1, 0.15, 0.2, 0.3, 0.45];
  let cur = evalW(w, pos).hit;
  for (let it = 0; it < 4; it++) {
    for (const k of KEYS) {
      let bestV = w[k], bestH = cur;
      for (const v of grid) { const ww = Object.assign({}, w, { [k]: v }); const h = evalW(ww, pos).hit; if (h > bestH) { bestH = h; bestV = v; } }
      w[k] = bestV; cur = bestH;
    }
    console.log("iter", it, cur, JSON.stringify(w), "end", evalW(w, (d) => pos(d) && d.cut === "end").hit, "mid", evalW(w, (d) => pos(d) && d.cut === "mid").hit);
  }
  /* Sensitivitaet: jede Komponente ±50 % */
  for (const k of KEYS) { const up = evalW(Object.assign({}, w, { [k]: w[k] * 1.5 }), pos).hit, dn = evalW(Object.assign({}, w, { [k]: w[k] * 0.5 }), pos).hit; console.log("  sens", k.padEnd(13), w[k], "x0.5 ->", dn, " x1.5 ->", up); }
  writeFileSync(SP + "weights-" + split + ".json", JSON.stringify(w));
}
if (process.argv.includes("--random")) {
  const SPW = SP + "weights-" + split + ".json";
  let best = existsSync(SPW) ? JSON.parse(readFileSync(SPW, "utf8")) : w, bh = evalW(best, pos).hit;
  let st = 12345; const rnd = () => { st = (st * 1103515245 + 12345) % 2147483648; return st / 2147483648; };
  for (let it = 0; it < +(process.env.RS || 1500); it++) {
    const ww = {}; for (const k of KEYS) ww[k] = Math.max(0, (best[k] || 0) * (0.5 + rnd()) + (rnd() < 0.15 ? rnd() * 0.15 : 0));
    const h = evalW(ww, pos).hit;
    if (h > bh) { bh = h; best = ww; console.log("rs", it, h, "end", evalW(ww, (d) => pos(d) && d.cut === "end").hit, "mid", evalW(ww, (d) => pos(d) && d.cut === "mid").hit); }
  }
  const s = Object.values(best).reduce((a, b) => a + b, 0); for (const k of KEYS) best[k] = +(best[k] / s).toFixed(3);
  console.log("best normalised", JSON.stringify(best), evalW(best, pos));
  writeFileSync(SPW, JSON.stringify(best));
}
