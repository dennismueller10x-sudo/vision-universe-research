#!/usr/bin/env node
/* =========================================================================
   HOLDOUT-3 — Auswertungscode (vorab registriert: docs/technical-intelligence/ELLIOTT_HOLDOUT3_PREREG.md)

   Phasen (Reihenfolge fest, jede genau einmal nach dem Einfrieren):
     --phase synthetic   Korpus C1, C2, C3, Seeds 60–79, alle Klassen, Rauschstufen, Stufen
                         → corpus/corpus-holdout3-layoutC*-<tag>.json
     --phase real        Echte Wochencharts, HOLDOUT-Emittenten, NEUES Fenster bis 2016-12-30 (6 Jahre), 100 Reihen,
                         Engine v3 (eingefroren) und v2 (2.2) auf denselben Reihen; Zeitebenen-Vergleich auf HOLDOUT-
                         Emittenten, die frueher nicht ausgewertet wurden (Hash-Rang 121–240)
     --phase gates       Gate G1–G17 + D1/D2 aus den Dateien → holdout3/holdout3-result-<tag>.json
   Aufruf: node scripts/technical/elliott-holdout3.mjs --phase synthetic|real|gates [--tag v32]
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { ROOT } from "./lib/ti-data.mjs";
import { CLASSES } from "../../quant/tests/elliott-corpus.mjs";

const VAL = join(ROOT, "quant/data/technical-intelligence/elliott-validation");
const LAYOUTS = ["C1", "C2", "C3"];
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; }
const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : null);
const run = (args) => new Promise((resolve, reject) => { const p = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] }); p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(args.join(" ") + " → " + c)))); });

/* ------------------------------------------------------------ Definitionen (Prereg §4) */
const FLATS = ["FLAT_REGULAR", "FLAT_EXPANDED", "FLAT_RUNNING"], TRIS = ["TRIANGLE_CONTRACTING", "TRIANGLE_EXPANDING"];
const noiseOf = (r) => r.id.split("|")[1];
const isNeg = (r) => !!CLASSES[r.cls].negativeOf;
/** Beobachtbare Sicht einer Zeile (rank/degree gegen die beobachtbare Wahrheit); null = Muster im Kursbild nicht regelkonform. */
const obs = (r) => (r.obs && r.obs.valid ? { rank: r.obs.rank, degree: r.obs.degree } : null);
function auc(rows) {
  const pos = rows.filter((r) => r.rank === 0).map((r) => r.applScore), neg = rows.filter((r) => r.rank !== 0).map((r) => r.applScore);
  if (!pos.length || !neg.length) return null;
  let s = 0; for (const p of pos) for (const q of neg) s += p > q ? 1 : p === q ? 0.5 : 0;
  return +(s / pos.length / neg.length).toFixed(3);
}
export function gates3(rows, real) {
  const end = rows.filter((r) => !r.mid), mids = rows.filter((r) => r.mid);
  const pos = end.filter((r) => !isNeg(r)), nlm = pos.filter((r) => noiseOf(r) !== "high"), hi = pos.filter((r) => noiseOf(r) === "high");
  const ov = (list) => list.map((r) => ({ r, o: obs(r) })).filter((x) => x.o);
  const nlmO = ov(nlm), hiO = ov(hi);
  const cls = (names) => { const s = nlmO.filter((x) => names.includes(x.r.cls)); return { pa: pct(s.filter((x) => x.o.rank >= 0).length, s.length), n: s.length }; };
  const high = pos.filter((r) => r.applicability === "HIGH"), hm = pos.filter((r) => r.applicability === "HIGH" || r.applicability === "MODERATE");
  const midPos = mids.filter((r) => !isNeg(r)), midHigh = midPos.filter((r) => r.applicability === "HIGH"), midHM = midPos.filter((r) => r.applicability !== "LOW");
  const strict = { G2: pct(nlm.filter((r) => r.rank === 0).length, nlm.length), G3: pct(nlm.filter((r) => r.rank >= 0).length, nlm.length),
                   G4: pct(nlm.filter((r) => ["EXACT", "NESTED"].includes(r.primary.degree)).length, nlm.length), G5: pct(nlm.filter((r) => ["OTHER", "NONE"].includes(r.primary.degree)).length, nlm.length),
                   G9: pct(hi.filter((r) => r.rank === 0).length, hi.length) };
  const m = {
    G1_hardRuleViolations: rows.reduce((a, r) => a + (r.g8 || 0), 0),
    G2_primary: pct(nlmO.filter((x) => x.o.rank === 0).length, nlmO.length),
    G3_primaryOrAlt: pct(nlmO.filter((x) => x.o.rank >= 0).length, nlmO.length),
    G4_degreeExact: pct(nlmO.filter((x) => ["EXACT", "NESTED"].includes(x.o.degree)).length, nlmO.length),
    G5_grossDegreeError: pct(nlmO.filter((x) => ["OTHER", "NONE"].includes(x.o.degree)).length, nlmO.length),
    G6_flats: cls(FLATS), G7_truncation: cls(["IMPULSE_TRUNCATED"]), G8_triangles: cls(TRIS),
    G9_highNoisePrimary: pct(hiO.filter((x) => x.o.rank === 0).length, hiO.length),
    G10_falseHigh: { high: pct(high.filter((r) => r.rank !== 0).length, high.length), nHigh: high.length, highOrModerate: pct(hm.filter((r) => r.rank !== 0).length, hm.length), nHM: hm.length },
    G11_unstableRelabels: real ? { v3: real.v3.unstable, v2: real.v2.unstable } : null,
    G12_relabels: real ? { v3: real.v3.relabel, v2: real.v2.relabel } : null,
    G13_multiResDirection: real && real.multires ? { agreement: real.multires.directionAgreement, n: real.multires.series } : null,
    G14_abstention: { auc: auc(pos.filter((r) => r.applScore !== null && r.applScore !== undefined)), precisionHM: pct(hm.filter((r) => r.rank === 0).length, hm.length), nHM: hm.length, abstainShare: pct(pos.filter((r) => r.abstain).length, pos.length) },
    /* nur C2: dort verletzen Negativfaelle genau eine Regel (Generator-Audit H2: in A/B/C1/C3 oft zwei) */
    G15_falseAccept: pct(end.filter((r) => isNeg(r) && /\|C2$/.test(r.id) && r.falseAccept).length, end.filter((r) => isNeg(r) && /\|C2$/.test(r.id)).length),
    G15_allLayouts: pct(end.filter((r) => isNeg(r) && r.falseAccept).length, end.filter(isNeg).length),
    D1_developingPrimary: pct(midPos.filter((r) => r.rank === 0 && noiseOf(r) !== "high").length, midPos.filter((r) => noiseOf(r) !== "high").length),
    D2_developingFalseHigh: { high: pct(midHigh.filter((r) => r.rank !== 0).length, midHigh.length), nHigh: midHigh.length, highOrModerate: pct(midHM.filter((r) => r.rank !== 0).length, midHM.length), nHM: midHM.length },
    observableValidShare: { nlm: pct(nlmO.length, nlm.length), high: pct(hiO.length, hi.length) },
    strictTruth: strict, n: { completedPositive: pos.length, nlm: nlm.length, nlmObservable: nlmO.length, high: hi.length, highObservable: hiO.length, developing: midPos.length }
  };
  const g10 = m.G10_falseHigh.nHigh >= 20 ? m.G10_falseHigh.high <= 20 : m.G10_falseHigh.highOrModerate !== null && m.G10_falseHigh.highOrModerate <= 35;
  const d2 = m.D2_developingFalseHigh.nHigh >= 20 ? m.D2_developingFalseHigh.high <= 30 : m.D2_developingFalseHigh.highOrModerate === null || m.D2_developingFalseHigh.highOrModerate <= 50;
  const pass = {
    G1: m.G1_hardRuleViolations === 0, G2: m.G2_primary >= 45, G3: m.G3_primaryOrAlt >= 60, G4: m.G4_degreeExact >= 50, G5: m.G5_grossDegreeError <= 25,
    G6: m.G6_flats.pa >= 25, G7: m.G7_truncation.pa >= 25, G8: m.G8_triangles.pa >= 25, G9: m.G9_highNoisePrimary >= 20, G10: g10,
    G11: real ? real.v3.unstable <= real.v2.unstable : null, G12: real ? real.v3.relabel <= real.v2.relabel : null,
    G13: real && real.multires ? real.multires.directionAgreement >= 0.7 : null,
    G14: m.G14_abstention.auc !== null && m.G14_abstention.auc >= 0.75 && m.G14_abstention.precisionHM >= 65,
    G15: m.G15_falseAccept === null ? m.G15_allLayouts <= 5 : m.G15_falseAccept <= 5, D2: d2
  };
  return { metrics: m, pass };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const phase = arg("phase", "gates"), tag = arg("tag", "v32");
  if (phase === "synthetic") {
    await Promise.all(LAYOUTS.map((L) => run(["scripts/technical/elliott-corpus-eval.mjs", "--split", "HOLDOUT3", "--layout", L, "--v3", "--tag", tag + "-holdout3"])));
  } else if (phase === "real") {
    await run(["scripts/technical/elliott-stability.mjs", "--split", "HOLDOUT", "--engine", "v3", "--series", "100", "--years", "6", "--end", "2016-12-30", "--workers", "4", "--tag", tag + "-holdout3"]);
    await run(["scripts/technical/elliott-stability.mjs", "--split", "HOLDOUT", "--engine", "v2", "--series", "100", "--years", "6", "--end", "2016-12-30", "--workers", "4", "--tag", "v22-holdout3"]);
    await run(["scripts/technical/elliott-multires.mjs", "--split", "HOLDOUT", "--n", "120", "--offset", "120", "--tag", tag + "-holdout3"]);
  } else {
    const rows = [], per = {};
    for (const L of LAYOUTS) {
      const f = join(VAL, "corpus", "corpus-holdout3-layout" + L + "-" + tag + "-holdout3.json");
      if (!existsSync(f)) { console.error("fehlt:", f); process.exit(1); }
      const j = JSON.parse(readFileSync(f, "utf8")); rows.push(...j.rows); per[L] = gates3(j.rows, null);
    }
    const st = (e, t) => { const f = join(VAL, "stability", "stability-holdout-" + e + "-" + t + ".json"); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
    const s3 = st("v3", tag + "-holdout3"), s2 = st("v2", "v22-holdout3");
    const mf = join(VAL, "multires", "multires-holdout-" + tag + "-holdout3.json");
    const real = s3 && s2 ? { v3: { unstable: s3.unstablePerWeek, relabel: s3.relabelPerWeek, series: s3.series, applicability: s3.applicability, ambiguity: s3.ambiguity, status: s3.status },
                              v2: { unstable: s2.unstablePerWeek, relabel: s2.relabelPerWeek, series: s2.series, applicability: s2.applicability },
                              multires: existsSync(mf) ? JSON.parse(readFileSync(mf, "utf8")) : null } : null;
    const g = gates3(rows, real);
    const out = { schemaVersion: "vu-elliott-holdout3-1.0.0", generatedAt: new Date().toISOString(), tag, prereg: "docs/technical-intelligence/ELLIOTT_HOLDOUT3_PREREG.md", pooled: g, perLayout: per, real };
    mkdirSync(join(VAL, "holdout3"), { recursive: true });
    writeFileSync(join(VAL, "holdout3", "holdout3-result-" + tag + ".json"), JSON.stringify(out, null, 1));
    console.log(JSON.stringify(g.metrics, null, 1)); console.log("PASS", JSON.stringify(g.pass));
  }
}
