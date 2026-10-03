#!/usr/bin/env node
/* Rauschrealismus (Mission III §75–§80): Kennzahlen woechentlicher Log-Renditen echter Aktien vs. Korpus-Layouts.
   Kennzahlen je Reihe (Median ueber Reihen): Std, Ueberschuss-Woelbung, Autokorrelation r(1), Autokorrelation |r|(1) (Volatilitaets-
   Cluster), Anteil |r| > 3·Std (Spruenge), Swing-Dichte (bestaetigte Umkehrpunkte ≥ 1 ATR je 100 Wochen).
   Aufruf: node scripts/technical/elliott-noise-realism.mjs → quant/data/technical-intelligence/elliott-validation/noise-realism.json */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/ti-data.mjs";
import { CLASSES, corpusCase } from "../../quant/tests/elliott-corpus.mjs";
import { caseC } from "./elliott-corpus-eval.mjs";
const require = createRequire(import.meta.url);
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
function stats(c) {
  const r = []; for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
  const n = r.length, m = r.reduce((a, x) => a + x, 0) / n, sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / n);
  const k = r.reduce((a, x) => a + ((x - m) / sd) ** 4, 0) / n - 3;
  const ac = (v) => { const mm = v.reduce((a, x) => a + x, 0) / v.length; let num = 0, den = 0; for (let i = 0; i < v.length; i++) { den += (v[i] - mm) ** 2; if (i) num += (v[i] - mm) * (v[i - 1] - mm); } return num / den; };
  const atr = []; let s = 0; for (let i = 0; i < c.length; i++) { if (i) s += Math.abs(c[i] - c[i - 1]); atr.push(i >= 14 ? (s - (i > 14 ? 0 : 0)) / Math.min(i, 14) : null); }
  /* gleitende ATR(14) auf Schlusskursen */
  const a14 = c.map((_, i) => { if (i < 14) return Math.abs(c[Math.max(1, i)] - c[Math.max(0, i - 1)]) || c[i] * 0.02; let t = 0; for (let q = i - 13; q <= i; q++) t += Math.abs(c[q] - c[q - 1]); return t / 14; });
  const pool = EV3.buildPool(c, a14, c.length - 1, 1.0).pts.length;
  return { sd, kurt: k, ac1: ac(r), acAbs: ac(r.map(Math.abs)), jumps: r.filter((x) => Math.abs(x - m) > 3 * sd).length / n, swings100: 100 * pool / c.length };
}
const med = (a) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? +b[Math.floor(b.length / 2)].toFixed(4) : null; };
const agg = (list) => ({ n: list.length, sd: med(list.map((x) => x.sd)), excessKurtosis: med(list.map((x) => x.kurt)), ac1: med(list.map((x) => x.ac1)), ac1Abs: med(list.map((x) => x.acAbs)), jumpShare: med(list.map((x) => x.jumps)), swingsPer100: med(list.map((x) => x.swings100)) });
const out = { schemaVersion: "vu-elliott-noise-realism-1.0.0", generatedAt: new Date().toISOString(), real: null, layouts: {} };
/* echte Wochenreihen: letzte 300 Wochen, Stichprobe */
const dir = join(ROOT, "quant/data/market/discover-series-long"), real = [];
for (const f of readdirSync(dir).filter((x) => x.startsWith("ref_")).sort().filter((_, i) => i % 15 === 0)) {
  try { const c = JSON.parse(readFileSync(join(dir, f), "utf8")).points.map((p) => p[1]).filter((v) => v > 0); if (c.length >= 320) real.push(stats(c.slice(-300))); } catch (e) { /* ignorieren */ }
}
out.real = agg(real);
for (const L of ["A", "B", "C1", "C2", "C3"]) for (const nz of ["none", "low", "medium", "high"]) {
  const list = [];
  for (const cls of Object.keys(CLASSES)) for (let s = 0; s < 10; s++) {
    const cs = /^C/.test(L) ? caseC(L, cls, s, nz, "C_LATE") : corpusCase(cls, s, nz, { layout: L });
    if (cs && cs.closes.length > 40) list.push(stats(cs.closes));
  }
  out.layouts[L + "|" + nz] = agg(list);
}
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/noise-realism.json"), JSON.stringify(out, null, 1));
console.log("REAL", JSON.stringify(out.real));
for (const [k, v] of Object.entries(out.layouts)) console.log(k.padEnd(10), JSON.stringify(v));
