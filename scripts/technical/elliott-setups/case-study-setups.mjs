#!/usr/bin/env node
/* VU MISSION X — Fallstudie unter Setup Library V1 (nur Erklaerung; nach der Universumsstudie; keine Rueckwirkung auf Definitionen).
   Je Stichtag: was zeigte die eingefrorene Engine (Primaerzaehlung, Setup-Status), Trend, RS26-Rang im Universum, Marktstruktur,
   Forschungskohorte Welle 3 — und was geschah danach.
     node scripts/technical/elliott-setups/case-study-setups.mjs --symbol ref_PLTR --dates D1,D2,... --weekly-dir DIR --out FILE */
import { writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ROOT, readJson, weeklySeriesFromPoints } from "../lib/ti-data.mjs";
import * as Core from "../hsab/lib/replay-core.mjs";
import { PRODUCT_METHODOLOGY } from "../lib/ti-product.mjs";
import { classify, researchInternalWave3 } from "./setup-library.mjs";

const require = createRequire(import.meta.url);
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const r3 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e3) / 1e3 : null);

/** RS26-Rang eines Titels am Datum d im Universum (Wochenreihen, nur Schluesse ≤ d). */
function rsRank(dir, sym, d) {
  const xs = []; let mine = null;
  for (const f of readdirSync(dir).filter((x) => x.startsWith("ref_") && x.endsWith(".json"))) {
    const p = readJson(join(dir, f)).points || []; let k = -1; for (let i = 0; i < p.length && p[i][0] <= d; i++) k = i;
    if (k < 26 || !(p[k - 26][1] > 0) || p[k][0] < d) continue;   // nur Titel mit einem Schluss genau in dieser Woche
    const r = p[k][1] / p[k - 26][1] - 1; xs.push(r); if (f === sym + ".json") mine = r;
  }
  if (mine === null) return null; xs.sort((a, b) => a - b); return xs.findIndex((x) => x >= mine) / (xs.length - 1);
}

export function caseStudySetups(sym, dates, dir) {
  const x = readJson(join(dir, sym + ".json")), rows = [];
  for (const d of dates) {
    const pts = (x.points || []).filter((p) => p[0] <= d); if (pts.length < 52) { rows.push({ date: d, skip: "TOO_SHORT" }); continue; }
    const s = weeklySeriesFromPoints(pts, x.ticker), t = s.length - 1, P = Core.prepareSeries(s), c = s.close;
    const rec = Core.recordAt(P, s, t, { symbol: sym, cohort: "CASE" });
    const E = EV3.analyzeElliottV3({ series: s, features: P.main.features, pivots: P.main.pivots, asOfIndex: t, barsPerYear: P.main.profile.barsPerYear, previous: null, methodology: PRODUCT_METHODOLOGY, forensics: true, debugAll: true });
    let trend = 0; if (t >= 43) { const sma = (j) => { let q = 0; for (let k = j - 39; k <= j; k++) q += c[k]; return q / 40; }; const m = sma(t), m4 = sma(t - 4); trend = c[t] > m && m > m4 ? 1 : c[t] < m && m < m4 ? -1 : 0; }
    const rsQ = rsRank(dir, sym, s.timestamps[t]);
    const setup = classify(E, { px: c[t], atr: P.main.features.columns.atr[t], trend, rsQ, msVote: rec.v ? rec.v.STRUCTURE ?? null : null });
    const rw = researchInternalWave3(E, c, t), all = x.points, i0 = all.findIndex((p) => p[0] === s.timestamps[t]);
    const fut = (h) => (i0 + h < all.length ? r3(all[i0 + h][1] / all[i0][1]) : null);
    rows.push({ date: s.timestamps[t], barsOfHistory: t + 1, outlook: rec.o, clarity: rec.cl, primary: E.primary ? { pattern: E.primary.pattern, complete: E.primary.complete, wave: E.primary.currentWave && E.primary.currentWave.label, nextMove: E.primary.nextMove, abstain: !!(E.applicability && E.applicability.abstain) } : null,
      setup: setup ? { id: setup.setupId, status: setup.status, displayed: setup.displayed, variants: setup.variants || null } : null,
      trend, rs26Rank: r3(rsQ), marketStructureVote: r3(rec.v ? rec.v.STRUCTURE : null), researchInternalWave3: rw ? { qualifies: rw.qualifies, dir: rw.dir, waves: rw.waves, rank: rw.rankInSearch } : null,
      after: { m13: fut(13), m26: fut(26), m52: fut(52), m104: fut(104) } });
  }
  return { schemaVersion: "elliott-setup-case-1.0.0", symbol: sym, purpose: "EXPLANATORY_ONLY_NOT_EVIDENCE_NOT_FOR_TUNING", rows };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = caseStudySetups(arg("symbol"), arg("dates").split(","), arg("weekly-dir"));
  writeFileSync(arg("out"), JSON.stringify(r, null, 1));
  for (const x of r.rows) console.log(JSON.stringify(x));
}
