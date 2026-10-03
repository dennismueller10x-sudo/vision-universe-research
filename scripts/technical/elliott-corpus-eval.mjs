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
import { CLASSES, NOISES, corpusCase, seedsOf, observedPivots } from "../../quant/tests/elliott-corpus.mjs";
const require = createRequire(import.meta.url);
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
import { corpusCaseC, STAGES, seedsOfC } from "../../quant/tests/elliott-corpus-c.mjs";
import { caseC2 } from "../../quant/tests/elliott-corpus-c2.mjs";
/** Ein Fall eines C-Layouts (C1/C3 eigener Generator, C2 unabhaengiger Generator); laufende Stufen P60/P75/P90 als "mid". */
export function caseC(layout, cls, seed, noise, stage) {
  const cs = layout === "C2" ? caseC2(cls, seed, noise, { stage }) : corpusCaseC(cls, seed, noise, { layout, stage });
  if (stage[0] === "P") {
    const T = cs.truth.topIdx, cut = cs.closes.length - 1; let k0 = 0;
    /* Welle k gilt erst als abgeschlossen, wenn die Folgewelle mindestens 2 Bars bzw. 25 % ihrer Dauer gelaufen ist (Generator-Audit M6) */
    for (let k = 1; k < T.length - 1; k++) if (T[k] <= cut - Math.max(2, Math.round(0.25 * (T[k + 1] - T[k])))) k0 = k;
    cs.mid = k0 >= 2 && k0 + 1 <= T.length - 1 ? { completedWaves: k0, currentWave: k0 + 1, pts: T.slice(0, k0 + 1) } : null;
    if (!cs.mid) return null;                     // weniger als zwei abgeschlossene Wellen: nicht als laufendes Muster pruefbar
  } else cs.mid = null;
  return cs;
}
const PAT = require(join(ROOT, "quant/engines/technical/elliott/patterns.js"));
const USE_V3 = process.argv.includes("--v3");
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
/* Mitten im Muster: laufende Zaehlung, gleiche abgeschlossene Wellenenden, gleiche laufende Welle */
export function judgeMid(c, cs) {
  if (!c) return { label: "NONE", degree: "NONE", hit: false };
  const T = cs.mid.pts, all = cs.truth.topIdx, bars = all.slice(1).map((x, k) => x - all[k]).sort((a, b) => a - b), tol = Math.max(2, Math.round(0.2 * bars[Math.floor(bars.length / 2)]));
  const E = pointsOf(c).slice(0, -1);
  const ok = !c.complete && c.currentWave.wave === cs.mid.currentWave && E.length === T.length && E.every((e, k) => Math.abs(e - T[k]) <= tol);
  const fam = ok && cs.truth.expect.includes(c.pattern);
  return { label: c.pattern + (c.complete ? "(C)" : "/" + c.currentWave.label), degree: ok ? "EXACT" : "OTHER", hit: fam, structure: ok };
}
function judge(c, truth) {
  if (!c) return { label: "NONE", degree: "NONE", hit: false };
  const deg = degreeClass(c, truth);
  /* Verschachtelter Treffer: das Zielmuster ist eine abgeschlossene Welle der Zaehlung (Grad +1), deren Unterteilung die
     Engine als Zielmuster benennt — fachlich korrekt (die Engine zaehlt eine Ebene hoeher und nennt die Unterstruktur). */
  const T = truth.topIdx, tol = Math.max(2, Math.round(0.2 * median(T.slice(1).map((x, k) => x - T[k]))));
  /* Red-Team 3.2 (LOW): verschachtelter Treffer verlangt auch die inneren Wellenenden der Unterteilung an den wahren Pivots */
  const inner = (w) => !w.subdivision.waves || (w.subdivision.waves.length === T.length - 1 && w.subdivision.waves.every((x, k) => Math.abs(x.toIndex - T[k + 1]) <= tol));
  const nested = (c.waves || []).find((w) => w.status === "CONFIRMED" && Math.abs(w.fromIndex - T[0]) <= tol && Math.abs(w.toIndex - T[T.length - 1]) <= tol &&
    w.subdivision && truth.expect.includes(w.subdivision.pattern === "COMBINATION" ? "WXY" : w.subdivision.pattern) && inner(w));
  return { label: c.pattern + (c.complete ? "(C)" : "/" + c.currentWave.label), degree: nested ? "NESTED" : deg, hit: (deg === "EXACT" && truth.expect.includes(c.pattern) && c.complete) || !!nested,
           asNegTarget: !!truth.negativeOf && c.pattern === truth.negativeOf && deg === "EXACT" };
}
/** Unabhaengiger G8-Pruefer: harte Regeln gegen die Kursextreme INNERHALB jeder Welle (nicht nur an den Wellenenden). */
export function intraViolations(c, closes) {
  const v = [], W = c.waves, s = W[0].toPrice >= W[0].fromPrice ? 1 : -1, p0 = W[0].fromPrice, eps = 1e-4 * Math.abs(p0);   // Wellenpreise sind auf 4 Stellen gerundet
  const back = (w) => { const up = w.toPrice >= w.fromPrice; let e = w.fromPrice; for (let i = w.fromIndex; i <= w.toIndex; i++) e = up ? Math.min(e, closes[i]) : Math.max(e, closes[i]); return e; };
  const fwd = (w) => { const up = w.toPrice >= w.fromPrice; let e = w.toPrice; for (let i = w.fromIndex; i <= w.toIndex; i++) e = up ? Math.max(e, closes[i]) : Math.min(e, closes[i]); return e; };
  if (["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL"].includes(c.pattern)) {
    if (W[1] && s * fwd(W[1]) < s * p0 - eps) v.push("W2_BEYOND_W1_ORIGIN");
    if (W[3] && c.pattern === "IMPULSE" && s * fwd(W[3]) < s * W[0].toPrice - eps) v.push("W4_OVERLAP_W1");
    [0, 2, 4].forEach((k) => { if (W[k] && s * back(W[k]) < s * W[k].fromPrice - eps) v.push("MOTIVE_W" + (k + 1) + "_BELOW_START"); });
  }
  if (["ZIGZAG", "DOUBLE_ZIGZAG", "TRIPLE_ZIGZAG", "WXY"].includes(c.pattern) && W[1] && s * fwd(W[1]) < s * p0 - eps) v.push("B_OR_X_BEYOND_ORIGIN");
  /* Red-Team 3.2 H1: Motivwellen korrektiver Muster (Lehrbuch: Zigzag 5-3-5 → A, C; Flat 3-3-5 → C; Doppel-Zigzag a/c je Zigzag)
     duerfen nicht hinter ihren eigenen Start laufen — auch laufende Wellen. */
  const MOT = { ZIGZAG: [0, 2], FLAT: [2], DOUBLE_ZIGZAG: [0, 2, 4, 6] }[c.pattern] || [];
  MOT.forEach((k) => { if (W[k] && s * back(W[k]) < s * W[k].fromPrice - eps) v.push("MOTIVE_" + c.pattern + "_W" + (k + 1) + "_BEYOND_START"); });
  if (c.pattern === "IMPULSE" && W.length === 5 && W[4].status !== "DEVELOPING") { const L = W.map((w) => Math.abs(w.toPrice - w.fromPrice)); if (L[2] < Math.min(L[0], L[4])) v.push("W3_SHORTEST"); }
  return v;
}
/** Beobachtbare Wahrheit: Pivots am sichtbaren Extrem; gueltig nur, wenn das Zielmuster auf den sichtbaren Kursen regelkonform ist
    (Wellenenden und Extreme innerhalb der Wellen). Ungueltig = Rauschen/Kontext hat das Muster im Kursbild zerstoert. */
export function observableTruth(cs) {
  if (cs.mid || !cs.truth.expect.length) return null;
  const idx = observedPivots(cs), c = cs.closes;
  /* Unterteilung sichtbar gemacht (WXY/Dreifach-Zigzag verlangen sie per Definition; ohne sie waeren diese Klassen nie gueltig —
     Generator-Audit M5). Gleicher Skalenraum-Klassifikator wie in der Engine, nur auf den sichtbaren Kursen der Welle. */
  const ser = { close: c, timestamps: cs.dates }, memo = {};
  const waves = idx.slice(1).map((b, k) => ({ fromIndex: idx[k], toIndex: b, fromPrice: c[idx[k]], toPrice: c[b], duration: Math.max(1, b - idx[k]), status: "CONFIRMED",
                                               sub: EV3.classifySegment(ser, idx[k], b, EV3.DEFAULTS, memo) }));
  const valid = cs.truth.expect.some((t) => PAT.PATTERNS[t] && PAT.checkRules(t, waves) && intraViolations({ pattern: t, waves }, c).length === 0);
  return { topIdx: idx, valid, shifted: idx.filter((x, k) => x !== cs.truth.topIdx[k]).length };
}
export function evaluateCase(cs, engineOpts) {
  const s = weeklySeriesFromPoints(cs.dates.map((d, i) => [d, cs.closes[i]]), "SYN");
  const P = Ctx.prepare(s);
  const t0 = Date.now();
  const r = (engineOpts && engineOpts.v3) || USE_V3 ? EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52, engine: engineOpts || {} })
                                         : EV2.analyzeElliottV2({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52, methodology: { engine: engineOpts || {} } });
  const ms = Date.now() - t0;
  const cands = [r.primary, ...(r.alternatives || [])].filter(Boolean);
  const js = cands.map((c) => (cs.mid ? judgeMid(c, cs) : judge(c, cs.truth)));
  const k = js.findIndex((j) => j.hit);
  const ot = observableTruth(cs), tObs = ot ? Object.assign({}, cs.truth, { topIdx: ot.topIdx }) : null;
  const jo = tObs ? cands.map((c) => judge(c, tObs)) : null;
  const obs = ot ? { valid: ot.valid, shifted: ot.shifted, rank: jo.findIndex((j) => j.hit), degree: jo[0] ? jo[0].degree : "NONE" } : null;
  const g8 = cands.reduce((a, c) => a + intraViolations(c, cs.closes).length, 0);
  return { g8, obs, id: cs.id, mid: !!cs.mid, structureOnly: js[0] && js[0].structure && !js[0].hit, cls: cs.truth.cls, scale: r.degrees.analysis, status: r.status, abstain: !!(r.applicability && r.applicability.abstain), applicability: r.applicability ? r.applicability.level : null, applScore: r.applicability ? r.applicability.score : null,
           primary: js[0] || { label: "NONE", degree: "NONE" }, rank: k, falseAccept: js.some((j) => j.asNegTarget), quality: r.primary && r.primary.countQuality ? r.primary.countQuality.level : null,
           clarity: r.clarity, ms };
}
/** Gate-Kennzahlen laut ELLIOTT_ENGINE_QUALITY_PREREG.md §5 (Ende-Faelle; Rauschen none/low/medium, wo vorgesehen). */
export function gate(rowsAll) {
  const end = rowsAll.filter((r) => !r.mid), sup = (r) => !CLASSES[r.cls].negativeOf && !CLASSES[r.cls].unsupported;
  const nlm = end.filter((r) => sup(r) && r.id.split("|")[1] !== "high");
  const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : null);
  const byCls = {}; nlm.forEach((r) => { const x = byCls[r.cls] = byCls[r.cls] || { n: 0, pa: 0 }; x.n++; if (r.rank >= 0) x.pa++; });
  const minCls = Object.entries(byCls).map(([k, v]) => [k, pct(v.pa, v.n)]).sort((a, b) => a[1] - b[1]);
  const neg = end.filter((r) => CLASSES[r.cls].negativeOf);
  const high = end.filter((r) => sup(r) && r.applicability === "HIGH");
  const gross = nlm.filter((r) => r.primary.degree === "OTHER" || r.primary.degree === "NONE").length;
  const g = {
    G1_primary: pct(nlm.filter((r) => r.rank === 0).length, nlm.length),
    G2_primaryOrAlt: pct(nlm.filter((r) => r.rank >= 0).length, nlm.length),
    G3_minClassPrimaryOrAlt: minCls[0] || null, G3_byClass: Object.fromEntries(minCls),
    G4_degreeExactOrNested: pct(nlm.filter((r) => r.primary.degree === "EXACT" || r.primary.degree === "NESTED").length, nlm.length),
    G5_grossDegreeError: pct(gross, nlm.length),
    G6_falseAccept: pct(neg.filter((r) => r.falseAccept).length, neg.length),
    G7_falseCertainty: pct(high.filter((r) => r.rank !== 0).length, high.length), G7_nHigh: high.length,
    G8_intraWaveViolations: rowsAll.reduce((a, r) => a + (r.g8 || 0), 0)
  };
  const pass = { G1: g.G1_primary >= 45, G2: g.G2_primaryOrAlt >= 60, G3: g.G3_minClassPrimaryOrAlt && g.G3_minClassPrimaryOrAlt[1] >= 25, G4: g.G4_degreeExactOrNested >= 50, G5: g.G5_grossDegreeError <= 25, G6: g.G6_falseAccept <= 5, G7: g.G7_falseCertainty <= 25, G8: g.G8_intraWaveViolations === 0 };
  const hi = end.filter((r) => sup(r) && r.id.split("|")[1] === "high"), hiHigh = hi.filter((r) => r.applicability === "HIGH");
  g.high_G1_primary = pct(hi.filter((r) => r.rank === 0).length, hi.length); g.high_G7_falseCertainty = pct(hiHigh.filter((r) => r.rank !== 0).length, hiHigh.length); g.high_nHigh = hiHigh.length;
  g.high_abstain = pct(hi.filter((r) => r.abstain).length, hi.length);
  /* laufende Muster (Mitte bzw. P-Stufen): Wiedererkennung und falsche Sicherheit, Rauschen none/low/medium */
  const mids = rowsAll.filter((r) => r.mid && !CLASSES[r.cls].negativeOf && r.id.split("|")[1] !== "high");
  g.dev_primary = pct(mids.filter((r) => r.rank === 0).length, mids.length); g.dev_n = mids.length;
  const midHigh = mids.filter((r) => r.applicability === "HIGH"); g.dev_falseHigh = pct(midHigh.filter((r) => r.rank !== 0).length, midHigh.length); g.dev_nHigh = midHigh.length;
  pass.high_G1 = g.high_G1_primary >= 20; pass.high_G7 = hiHigh.length === 0 || g.high_G7_falseCertainty <= 30;
  return { metrics: g, pass };
}
/** Dieselben Kennzahlen gegen die beobachtbare Wahrheit (nur Faelle, deren Muster im Kursbild regelkonform sichtbar ist). */
export function gateObservable(rowsAll) {
  const conv = rowsAll.filter((r) => !r.mid && (CLASSES[r.cls].negativeOf || (r.obs && r.obs.valid))).map((r) => r.obs ? Object.assign({}, r, { rank: r.obs.rank, primary: Object.assign({}, r.primary, { degree: r.obs.degree }) }) : r);
  const g = gate(conv);
  const pos = rowsAll.filter((r) => !r.mid && r.obs);
  g.metrics.observableValidShare = pos.length ? +(100 * pos.filter((r) => r.obs.valid).length / pos.length).toFixed(1) : null;
  g.metrics.observableValidHigh = (() => { const h = pos.filter((r) => r.id.split("|")[1] === "high"); return h.length ? +(100 * h.filter((r) => r.obs.valid).length / h.length).toFixed(1) : null; })();
  return g;
}
export function summarize(rowsAll) {
  const rows = rowsAll.filter((r) => !r.mid), mids = rowsAll.filter((r) => r.mid);
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
           mid: { n: mids.filter((r) => !CLASSES[r.cls].unsupported).length, primary: mids.filter((r) => r.rank === 0 && !CLASSES[r.cls].unsupported).length, primaryOrAlt: mids.filter((r) => r.rank >= 0 && !CLASSES[r.cls].unsupported).length, structureOnly: mids.filter((r) => r.structureOnly).length, byClass: (() => { const g = {}; mids.forEach((r) => { const x = g[r.cls] = g[r.cls] || { n: 0, primary: 0 }; x.n++; if (r.rank === 0) x.primary++; }); return g; })() },
           medianMs: rowsAll.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)] };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const split = arg("split", "DEVELOPMENT"), tag = arg("tag", "current"), engineOpts = JSON.parse(arg("engine", "{}")), layout = arg("layout", "A");
  const classes = arg("classes") ? arg("classes").split(",") : Object.keys(CLASSES);
  const noises = arg("noise") ? arg("noise").split(",") : NOISES;
  const rows = [];
  if (/^C[123]$/.test(layout)) {
    const stages = arg("stages") ? arg("stages").split(",") : STAGES;
    for (const cls of classes) for (const nz of noises) for (const seed of seedsOfC(split)) for (const st of stages) {
      if (CLASSES[cls].negativeOf && st[0] === "P") continue;
      const cs = caseC(layout, cls, seed, nz, st); if (!cs) continue;
      const r = evaluateCase(cs, engineOpts); r.stage = st; rows.push(r);
    }
  } else
  for (const cls of classes) for (const nz of noises) for (const seed of seedsOf(split)) {
    rows.push(evaluateCase(corpusCase(cls, seed, nz, { layout }), engineOpts));
    if (!process.argv.includes("--end-only") && !CLASSES[cls].negativeOf) rows.push(evaluateCase(corpusCase(cls, seed, nz, { cut: "mid", layout }), engineOpts));
  }
  const sum = summarize(rows);
  const gt = gate(rows), go = gateObservable(rows);
  const out = { schemaVersion: "vu-elliott-corpus-eval-1.0.0", generatedAt: new Date().toISOString(), engine: USE_V3 ? EV3.ENGINE_VERSION : EV2.ENGINE_VERSION, engineOpts, split, layout, tag, gate: gt, gateObservable: go, summary: sum, rows };
  const dir = join(ROOT, "quant/data/technical-intelligence/elliott-validation/corpus");
  mkdirSync(dir, { recursive: true });
  if (!process.argv.includes("--no-write")) writeFileSync(join(dir, "corpus-" + split.toLowerCase() + (layout !== "A" ? "-layout" + layout : "") + "-" + tag + ".json"), JSON.stringify(out));
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : "-") + "%";
  console.log(`  MID: n ${sum.mid.n} primary ${sum.mid.primary} (${pct(sum.mid.primary, sum.mid.n)}) p+a ${sum.mid.primaryOrAlt} structure-right-label-wrong ${sum.mid.structureOnly}`);
  console.log(`split ${split} tag ${tag}: positives ${sum.positives} primary ${sum.primary} (${pct(sum.primary, sum.positives)}) primary+alt ${sum.primaryOrAlt} (${pct(sum.primaryOrAlt, sum.positives)}) | degree ${JSON.stringify(sum.degree)} | negatives ${sum.negatives} falseAccept ${sum.falseAccepts} | abstain(pos) ${sum.abstainPositives} | ${sum.medianMs} ms`);
  for (const [k, v] of Object.entries(sum.byClass)) console.log("  ", k.padEnd(22), "n", v.n, "prim", v.primary, "p+a", v.primaryOrAlt, "exactDeg", v.exactDegree, "abst", v.abstain, v.falseAccept ? "FA " + v.falseAccept : "");
  console.log("  GATE", JSON.stringify(gt.metrics), JSON.stringify(gt.pass));
  console.log("  GATE-OBS", JSON.stringify(Object.fromEntries(Object.entries(go.metrics).filter(([k]) => k !== "G3_byClass"))), JSON.stringify(go.pass));
  console.log("  byNoise", JSON.stringify(Object.fromEntries(Object.entries(sum.byNoise).map(([k, v]) => [k, v.primary + "/" + v.n]))));
}
