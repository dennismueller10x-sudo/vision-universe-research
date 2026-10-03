#!/usr/bin/env node
// Self-check for the independent Elliott corpus C2 (quant/tests/elliott-corpus-c2.mjs).
// Usage: node scripts/technical/elliott-corpus-c2-check.mjs
import { CLASSES_C2, STAGES_C2, caseC2 } from "../../quant/tests/elliott-corpus-c2.mjs";

const NOISES = ["none", "low", "medium", "high"];
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const POS_IMPULSE = new Set(["IMPULSE", "IMPULSE_EXT1", "IMPULSE_EXT3", "IMPULSE_EXT5", "IMPULSE_TRUNCATED"]);
const NEG_RULE = { NEG_W2_BEYOND_ORIGIN: "w2", NEG_W3_SHORTEST: "w3", NEG_W4_OVERLAP: "w4" };

const failures = [];
let checks = 0;
const fail = (id, msg) => { if (failures.length < 60) failures.push(`${id}: ${msg}`); };
const ok = (cond, id, msg) => { checks++; if (!cond) fail(id, msg); };

// Impulse hard rules evaluated on actual closes (intra-wave extremes included).
function impulseRules(closes, T, dir) {
  const y = (i) => dir * closes[i];
  const range = (a, b) => { let lo = Infinity, hi = -Infinity; for (let i = a; i <= b; i++) { lo = Math.min(lo, y(i)); hi = Math.max(hi, y(i)); } return [lo, hi]; };
  const [, w1hi] = range(T[0], T[1]);
  const [w2lo] = range(T[1], T[2]);
  const [w4lo] = range(T[3], T[4]);
  const L1 = y(T[1]) - y(T[0]), L3 = y(T[3]) - y(T[2]), L5 = y(T[5]) - y(T[4]);
  return {
    w2: w2lo > y(T[0]),
    w3: !(L3 < L1 && L3 < L5),
    w4: w4lo > w1hi,
  };
}

function originExtreme(closes, T, dir) {
  const o = T[0], d1 = T[1] - T[0];
  for (let i = Math.max(0, o - d1); i <= Math.min(closes.length - 1, o + d1); i++) if (i !== o && !(dir * closes[i] > dir * closes[o])) return false;
  return true;
}

const originTally = {}, extremeTally = {};
const fullByNoise = {}; // C_LATE series for stats
const noiseOnly = { low: [], medium: [], high: [] };

for (const cls of CLASSES_C2) {
  for (const seed of SEEDS) {
    const lates = {};
    for (const noise of NOISES) {
      const byStage = {};
      for (const stage of STAGES_C2) {
        const a = caseC2(cls, seed, noise, { stage });
        const b = caseC2(cls, seed, noise, { stage });
        const id = a.id;
        ok(JSON.stringify(a) === JSON.stringify(b), id, "not deterministic");
        ok(id === `${cls}|${noise}|${seed}|${stage}|C2` && a.layout === "C2", id, "bad id/layout");
        ok(a.closes.length >= 180 && a.closes.length <= 320, id, `length ${a.closes.length}`);
        ok(a.closes.every((c) => Number.isFinite(c) && c > 0), id, "non-positive close");
        ok(a.dates.length === a.closes.length && a.dates[0] === "2001-01-05", id, "dates");
        const t = a.truth;
        ok(t.cutAt === a.closes.length - 1, id, "cutAt");
        ok(t.topIdx.every((v, i) => i === 0 || v > t.topIdx[i - 1]), id, "topIdx not increasing");
        ok(t.patternEnd === t.topIdx[t.topIdx.length - 1], id, "patternEnd");
        ok(t.subIdx.every((s) => s > t.topIdx[0] && s < t.patternEnd && !t.topIdx.includes(s)), id, "subIdx");
        ok(t.confIdx.every((c, i) => c > (i ? t.confIdx[i - 1] : t.patternEnd)), id, "confIdx");
        ok(t.contextTopIdx.length >= 1 && t.contextTopIdx.every((c) => c < t.topIdx[0]), id, "contextTopIdx");
        ok(t.negativeOf === (cls.startsWith("NEG_") ? "IMPULSE" : null), id, "negativeOf");
        const nW = t.topIdx.length - 1;
        if (stage.startsWith("P")) {
          ok(t.cutAt > t.topIdx[0] && t.cutAt < t.patternEnd, id, "P cut outside pattern");
          ok(t.completedWaves === t.topIdx.slice(1).filter((x) => x <= t.cutAt).length && t.currentWave === t.completedWaves + 1, id, "wave progress");
        } else {
          ok(t.cutAt > t.patternEnd && t.cutAt <= t.confIdx[t.confIdx.length - 1], id, "C cut outside confirmation");
          ok(t.completedWaves === nW && t.currentWave === null, id, "C wave progress");
        }
        byStage[stage] = a;
      }
      // stages only truncate one series
      const late = byStage.C_LATE, full = late.closes;
      for (const stage of STAGES_C2) {
        const s = byStage[stage];
        const n = Math.min(s.closes.length, full.length);
        ok(s.closes.slice(0, n).every((v, i) => v === full[i]), s.id, "stage changed prefix");
        ok(JSON.stringify(s.truth.topIdx) === JSON.stringify(late.truth.topIdx), s.id, "stage changed truth");
      }
      lates[noise] = late;
      (fullByNoise[noise] ||= []).push(full);

      const t = late.truth, T = t.topIdx, id = late.id;
      const whole = caseC2(cls, seed, noise, { full: true }).closes;
      ok(whole.length >= 180 && whole.length <= 320 && full.every((v, i) => v === whole[i]), id, "full series mismatch");
      if (noise === "none") ok(originExtreme(full, T, t.dir), id, "origin not extreme over first-wave span");
      else { originTally[noise] = originTally[noise] || [0, 0]; originTally[noise][0]++; if (originExtreme(full, T, t.dir)) originTally[noise][1]++; }
      for (const st of ["C_EARLY", "C_LATE"]) {
        const c = byStage[st].closes, cut = c.length - 1, s = -t.dir; // confirmation direction
        let fresh = true;
        for (let i = t.patternEnd; i < cut; i++) if (s * c[i] >= s * c[cut]) { fresh = false; break; }
        const k = `${noise}|${st}`; extremeTally[k] = extremeTally[k] || [0, 0]; extremeTally[k][0]++; if (fresh) extremeTally[k][1]++;
        const dcBars = t.confIdx[t.confIdx.length - 1] - t.patternEnd, f = (cut - t.patternEnd) / dcBars;
        ok(cut - t.patternEnd >= 2 && (st === "C_EARLY" ? f >= 0.2 && f <= 0.55 : f >= 0.55 && f <= 1), byStage[st].id, `cut fraction ${f.toFixed(2)}`);
      }
      if (noise === "none") {
        if (POS_IMPULSE.has(cls)) {
          const r = impulseRules(full, T, t.dir);
          ok(r.w2 && r.w3 && r.w4, id, `hard rule broken ${JSON.stringify(r)}`);
          if (cls === "IMPULSE_TRUNCATED") ok(t.dir * full[T[5]] < t.dir * full[T[3]], id, "not truncated");
        }
        if (NEG_RULE[cls]) {
          const r = impulseRules(full, T, t.dir);
          const broken = Object.keys(r).filter((k) => !r[k]);
          ok(broken.length === 1 && broken[0] === NEG_RULE[cls], id, `negative breaks ${JSON.stringify(broken)}`);
        }
        if (cls.endsWith("_DIAGONAL")) {
          const r = impulseRules(full, T, t.dir);
          const y = (i) => t.dir * full[i];
          const L = (w) => Math.abs(y(T[w]) - y(T[w - 1]));
          ok(r.w2 && r.w3 && !r.w4 && L(1) > L(3) && L(3) > L(5), id, "diagonal rules");
        }
        // confirmation
        const y = (i) => t.dir * whole[i];
        const ce = t.confIdx[t.confIdx.length - 1];
        if (t.motive) {
          const ret = (y(t.patternEnd) - y(ce)) / (y(t.patternEnd) - y(T[0]));
          ok(ret > 0.35 && ret < 0.75, id, `motive confirmation retrace ${ret.toFixed(2)}`);
        } else {
          let lo = Infinity; for (let i = T[0]; i <= t.patternEnd; i++) lo = Math.min(lo, y(i));
          ok(y(ce) < lo, id, "corrective confirmation does not exceed pattern origin/extreme");
        }
        ok(t.confIdx.length >= 3, id, "confirmation not subdivided");
      }
    }
    // structure is noise-independent
    const ref = JSON.stringify({ ...lates.none.truth, cutAt: 0 });
    for (const noise of NOISES) {
      ok(JSON.stringify({ ...lates[noise].truth, cutAt: 0 }) === ref, lates[noise].id, "truth depends on noise");
      ok(lates[noise].closes.length === lates.none.closes.length, lates[noise].id, "length depends on noise");
      if (noise !== "none") {
        const a = lates[noise].closes, b = lates.none.closes;
        for (let i = 1; i < a.length; i++) noiseOnly[noise].push(Math.log(a[i] / b[i]) - Math.log(a[i - 1] / b[i - 1]));
      }
    }
  }
}

// ---------------------------------------------------------------- statistics
function stats(r) {
  const n = r.length, m = r.reduce((s, x) => s + x, 0) / n;
  const d = r.map((x) => x - m);
  const v = d.reduce((s, x) => s + x * x, 0) / n, sd = Math.sqrt(v);
  const k = d.reduce((s, x) => s + x ** 4, 0) / n / (v * v) - 3;
  const ac = (z) => { const mz = z.reduce((s, x) => s + x, 0) / z.length; let num = 0, den = 0; for (let i = 0; i < z.length; i++) { den += (z[i] - mz) ** 2; if (i) num += (z[i] - mz) * (z[i - 1] - mz); } return den ? num / den : 0; };
  return { sd, k, ac1: ac(r), acAbs: ac(r.map(Math.abs)), tail: r.filter((x) => Math.abs(x - m) > 3 * sd).length / n };
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
console.log("\nWeekly log-return statistics (C_LATE series, mean of per-series values; kurtosis also pooled on standardized returns)");
console.log("noise   | std    | exKurt(mean) | exKurt(pooled) | ac1(r) | ac1(|r|) | P(|r|>3sd) | noise-component std");
for (const noise of NOISES) {
  const per = fullByNoise[noise].map((c) => stats(c.slice(1).map((x, i) => Math.log(x / c[i]))));
  const pooled = [];
  for (const c of fullByNoise[noise]) { const r = c.slice(1).map((x, i) => Math.log(x / c[i])); const s = stats(r); const m = mean(r); for (const x of r) pooled.push((x - m) / s.sd); }
  const ns = noise === "none" ? 0 : stats(noiseOnly[noise]).sd;
  const f = (x, d = 3) => x.toFixed(d).padStart(6);
  console.log(`${noise.padEnd(7)} | ${f(mean(per.map((s) => s.sd)) * 100, 2)}% | ${f(mean(per.map((s) => s.k)), 2).padStart(12)} | ${f(stats(pooled).k, 2).padStart(14)} | ${f(mean(per.map((s) => s.ac1)))} | ${f(mean(per.map((s) => s.acAbs))).padStart(8)} | ${f(mean(per.map((s) => s.tail)) * 100, 2).padStart(9)}% | ${(ns * 100).toFixed(2)}%`);
}

console.log("\nNoise component only (log(closes_noise / closes_none) differences, pooled):");
for (const noise of ["low", "medium", "high"]) {
  const s = stats(noiseOnly[noise]);
  console.log(`${noise.padEnd(7)} | std ${(s.sd * 100).toFixed(2)}% | exKurt ${s.k.toFixed(2)} | ac1(r) ${s.ac1.toFixed(3)} | ac1(|r|) ${s.acAbs.toFixed(3)} | P(|r|>3sd) ${(s.tail * 100).toFixed(2)}%`);
}
console.log("\nShare of C-stage cuts whose last bar is a fresh extreme of the confirmation:");
for (const [k, [n, f]] of Object.entries(extremeTally)) console.log(`  ${k.padEnd(16)} ${(100 * f / n).toFixed(1)}%  (${f}/${n})`);
for (const [k, [n, f]] of Object.entries(originTally)) console.log(`  origin extreme at ${k}: ${(100 * f / n).toFixed(1)}%`);
console.log(`\n${checks} checks, ${failures.length ? failures.length + "+ failures" : "0 failures"}`);
if (failures.length) { for (const f of failures) console.log("FAIL " + f); process.exit(1); }
console.log("ALL C2 CHECKS PASSED");
