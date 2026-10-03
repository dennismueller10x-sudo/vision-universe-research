#!/usr/bin/env node
/* Auswertung des Elliott-Korpus v2 (Remediation §14–§17, §78–§80).
   Je Fall: Engine am letzten Bar (Wochen-Close-only, Produktprofil 1W), Vergleich mit der bekannten Struktur.
     Muster   — Hauptzaehlung = Zielmuster, abgeschlossen, Wellenenden exakt (± Toleranz) → PRIMARY
                als Alternative → ALTERNATIVE; sonst MISSED
     Grad     — EXACT (Wellenenden = Zielpivots), PARTIAL (Teilmenge der Zielpivots), LOWER (nutzt Unterwellen-Pivots),
                HIGHER (Zielmuster ist nur ein Teil einer groesseren Zaehlung), OTHER
     Negativ  — Fall verletzt eine harte Regel; „false accept", wenn die Engine ihn als Zielmuster mit passenden Pivots liest
   Aufruf: node scripts/technical/elliott-corpus-eval.mjs --split DEVELOPMENT [--engine '{"scaleSelection":"LEGACY"}'] [--tag name] [--classes A,B] [--noise low,high] */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, weeklySeriesFromPoints } from "./lib/ti-data.mjs";
import { CLASSES, NOISES, corpusCase, seedsOf } from "../../quant/tests/elliott-corpus.mjs";
const require = createRequire(import.meta.url);
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; }

export function pointsOf(c) { return c ? [c.waves[0].fromIndex].concat(c.waves.map((w) => w.toIndex)) : []; }
export function degreeClass(c, truth) {
  if (!c) return "NONE";
  const E = pointsOf(c), T = truth.topIdx, S = truth.subIdx;
  const bars = []; for (let k = 1; k < T.length; k++) bars.push(T[k] - T[k - 1]);
  bars.sort((a, b) => a - b);
  const tol = Math.max(2, Math.round(0.2 * bars[Math.floor(bars.length / 2)]));
  const near = (arr, e) => arr.some((t) => Math.abs(t - e) <= tol);
  if (c.complete && E.length === T.length && E.every((e, k) => Math.abs(e - T[k]) <= tol)) return "EXACT";
  const inTop = E.filter((e) => near(T, e)).length, inSub = E.filter((e) => !near(T, e) && near(S, e)).length;
  const span = E[E.length - 1] - E[0], tspan = T[T.length - 1] - T[0];
  if (inTop === E.length) return "PARTIAL";
  if (inSub > 0 && inTop + inSub >= 0.75 * E.length && span <= tspan + tol) return "LOWER";
  const inside = E.filter((e) => e >= T[0] - tol && e <= T[T.length - 1] + tol).length;
  if (span > 1.3 * tspan && inside <= 2) return "HIGHER";
  return "OTHER";
}
function median(a) { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; }
function judge(c, truth) {
  if (!c) return { label: "NONE", degree: "NONE", hit: false };
  const deg = degreeClass(c, truth);
  /* Verschachtelter Treffer: das Zielmuster ist eine abgeschlossene Welle der Zaehlung (Grad +1), deren Unterteilung die
     Engine als Zielmuster benennt — fachlich korrekt (die Engine zaehlt eine Ebene hoeher und nennt die Unterstruktur). */
  const T = truth.topIdx, tol = Math.max(2, Math.round(0.2 * median(T.slice(1).map((x, k) => x - T[k]))));
  const nested = (c.waves || []).find((w) => w.status === "CONFIRMED" && Math.abs(w.fromIndex - T[0]) <= tol && Math.abs(w.toIndex - T[T.length - 1]) <= tol &&
    w.subdivision && truth.expect.includes(w.subdivision.pattern === "COMBINATION" ? "WXY" : w.subdivision.pattern));
  return { label: c.pattern + (c.complete ? "(C)" : "/" + c.currentWave.label), degree: nested ? "NESTED" : deg, hit: (deg === "EXACT" && truth.expect.includes(c.pattern) && c.complete) || !!nested,
           asNegTarget: !!truth.negativeOf && c.pattern === truth.negativeOf && deg === "EXACT" };
}
export function evaluateCase(cs, engineOpts) {
  const s = weeklySeriesFromPoints(cs.dates.map((d, i) => [d, cs.closes[i]]), "SYN");
  const P = Ctx.prepare(s);
  const t0 = Date.now();
  const r = EV2.analyzeElliottV2({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52, methodology: { engine: engineOpts || {} } });
  const ms = Date.now() - t0;
  const cands = [r.primary, ...(r.alternatives || [])].filter(Boolean);
  const js = cands.map((c) => judge(c, cs.truth));
  const k = js.findIndex((j) => j.hit);
  return { id: cs.id, cls: cs.truth.cls, scale: r.degrees.analysis, status: r.status, abstain: !!(r.applicability && r.applicability.abstain), applicability: r.applicability ? r.applicability.level : null,
           primary: js[0] || { label: "NONE", degree: "NONE" }, rank: k, falseAccept: js.some((j) => j.asNegTarget), quality: r.primary && r.primary.countQuality ? r.primary.countQuality.level : null,
           clarity: r.clarity, ms };
}
export function summarize(rows) {
  const by = (keyFn) => { const g = {}; rows.forEach((r) => { const k = keyFn(r); const x = g[k] = g[k] || { n: 0, primary: 0, primaryOrAlt: 0, abstain: 0, exactDegree: 0, falseAccept: 0 };
    x.n++; if (r.rank === 0) x.primary++; if (r.rank >= 0) x.primaryOrAlt++; if (r.abstain) x.abstain++; if (r.primary.degree === "EXACT" || r.primary.degree === "NESTED") x.exactDegree++; if (r.falseAccept) x.falseAccept++; }); return g; };
  const pos = rows.filter((r) => !CLASSES[r.cls].negativeOf && !CLASSES[r.cls].unsupported);
  const deg = {}; pos.forEach((r) => { deg[r.primary.degree] = (deg[r.primary.degree] || 0) + 1; });
  const conf = {}; rows.forEach((r) => { const k = r.cls; const lab = r.primary.label.replace(/\/.*$/, "/dev"); conf[k] = conf[k] || {}; conf[k][lab] = (conf[k][lab] || 0) + 1; });
  const neg = rows.filter((r) => CLASSES[r.cls].negativeOf);
  return { n: rows.length, positives: pos.length,
           primary: pos.filter((r) => r.rank === 0).length, primaryOrAlt: pos.filter((r) => r.rank >= 0).length,
           degree: deg, negatives: neg.length, falseAccepts: neg.filter((r) => r.falseAccept).length,
           abstainPositives: pos.filter((r) => r.abstain).length,
           byClass: by((r) => r.cls), byNoise: by((r) => r.id.split("|")[1]), patternConfusion: conf,
           medianMs: rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)] };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const split = arg("split", "DEVELOPMENT"), tag = arg("tag", "current"), engineOpts = JSON.parse(arg("engine", "{}"));
  const classes = arg("classes") ? arg("classes").split(",") : Object.keys(CLASSES);
  const noises = arg("noise") ? arg("noise").split(",") : NOISES;
  const rows = [];
  for (const cls of classes) for (const nz of noises) for (const seed of seedsOf(split)) rows.push(evaluateCase(corpusCase(cls, seed, nz), engineOpts));
  const sum = summarize(rows);
  const out = { schemaVersion: "vu-elliott-corpus-eval-1.0.0", generatedAt: new Date().toISOString(), engine: EV2.ENGINE_VERSION, engineOpts, split, tag, summary: sum, rows };
  const dir = join(ROOT, "quant/data/technical-intelligence/elliott-validation/corpus");
  mkdirSync(dir, { recursive: true });
  if (!process.argv.includes("--no-write")) writeFileSync(join(dir, "corpus-" + split.toLowerCase() + "-" + tag + ".json"), JSON.stringify(out));
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : "-") + "%";
  console.log(`split ${split} tag ${tag}: positives ${sum.positives} primary ${sum.primary} (${pct(sum.primary, sum.positives)}) primary+alt ${sum.primaryOrAlt} (${pct(sum.primaryOrAlt, sum.positives)}) | degree ${JSON.stringify(sum.degree)} | negatives ${sum.negatives} falseAccept ${sum.falseAccepts} | abstain(pos) ${sum.abstainPositives} | ${sum.medianMs} ms`);
  for (const [k, v] of Object.entries(sum.byClass)) console.log("  ", k.padEnd(22), "n", v.n, "prim", v.primary, "p+a", v.primaryOrAlt, "exactDeg", v.exactDegree, "abst", v.abstain, v.falseAccept ? "FA " + v.falseAccept : "");
  console.log("  byNoise", JSON.stringify(Object.fromEntries(Object.entries(sum.byNoise).map(([k, v]) => [k, v.primary + "/" + v.n]))));
}
