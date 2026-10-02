#!/usr/bin/env node
/* Synthetischer Elliott-Benchmark (Master Mission II §103/104):
   Erkennt die Engine bekannte Strukturen? Je Muster × Rauschen × 3 Seeds;
   Vergleich V2.1 (LEGACY) gegen V2.2 (MULTI). Ausgabe: JSON-Bericht. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/ti-data.mjs";
import { PATTERNS, syntheticSeries } from "../../quant/tests/elliott-synthetic.mjs";
const require = createRequire(import.meta.url);
const E = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
const F = require(join(ROOT, "quant/engines/technical/feature-store.js"));
const Pv = require(join(ROOT, "quant/engines/technical/pivot-engine.js"));
const CONFIGS = { "V2.1_LEGACY": { scaleSelection: "LEGACY", nestedHigherDegree: false }, "V2.2_MULTI": {} };
const rows = [], summary = {};
for (const [cfgName, cfg] of Object.entries(CONFIGS)) {
  for (const name of Object.keys(PATTERNS)) for (const noise of ["low", "medium", "high"]) for (const seed of [0, 1, 2]) {
    const { series: s, expect } = syntheticSeries(name, { noise, seed });
    const f = F.computeFeatures(s), pv = Pv.runPivots(s, f);
    const r = E.analyzeElliottV2({ series: s, features: f, pivots: pv, methodology: { engine: cfg } });
    const cands = [r.primary, ...(r.alternatives || [])].filter(Boolean);
    const rank = cands.findIndex((c) => expect.includes(c.pattern) && c.complete);
    rows.push({ cfg: cfgName, pattern: name, noise, seed, scale: r.degrees.analysis, primary: r.primary ? r.primary.pattern + (r.primary.complete ? "(C)" : "/" + r.primary.currentWave.label) : null, rank, applicability: r.applicability ? r.applicability.level : null });
    const k = cfgName + "|" + noise, g = summary[k] = summary[k] || { n: 0, primary: 0, top3: 0, abstain: 0 };
    g.n++; if (rank === 0) g.primary++; if (rank >= 0) g.top3++; if (r.applicability && r.applicability.abstain) g.abstain++;
  }
}
const byPattern = {};
rows.forEach((r) => { const k = r.cfg + "|" + r.pattern; const g = byPattern[k] = byPattern[k] || { n: 0, top3: 0, primary: 0 }; g.n++; if (r.rank >= 0) g.top3++; if (r.rank === 0) g.primary++; });
const out = { schemaVersion: "vu-elliott-synthetic-1.0.0", generatedAt: new Date().toISOString(), note: "rank = Position des erwarteten (abgeschlossenen) Musters unter Haupt- und bis zu 2 Alternativzaehlungen; -1 = nicht gefunden.", summary, byPattern, rows };
mkdirSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation"), { recursive: true });
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/synthetic-benchmark.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(summary, null, 1));
