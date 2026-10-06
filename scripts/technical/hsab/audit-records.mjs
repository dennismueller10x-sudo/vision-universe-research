#!/usr/bin/env node
/* Mission VIII §11 — Regressionsaudit bekannter Produktfehler ueber ALLE historischen Stage-1-Ausgaben
   (nicht nur den heutigen Stand). Liest die versiegelten Records, schreibt nur Zaehler.
     node scripts/technical/hsab/audit-records.mjs --records DIR --out FILE */
import { writeFileSync } from "node:fs";
import { readRecords } from "./evaluate.mjs";

function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const { man, recs } = readRecords(arg("records"));
const C = { records: 0, withScenario: 0, negativeOrZeroLevel: 0, targetBeyondFactor3: 0, crvAbove20: 0, crvAbove10: 0, scenarioOnStaleSeries: 0,
  elliottShapedWhileAbstaining: 0, target1AlreadyReachedAtDisplay: 0, entryFarFromPrice30pct: 0, invalidationOnWrongSide: 0, targetsOverlapEntry: 0,
  scenarioIdSameLevelsDifferentId: 0, scenarioIdPairsChecked: 0, examples: {} };
const ex = (k, r) => { (C.examples[k] = C.examples[k] || []).length < 5 && C.examples[k].push([r.s, r.d]); };
const idByLevels = new Map();
for (const r of recs) {
  C.records++;
  const p = r.P; if (!p || !(p.dir === 1 || p.dir === -1)) { if (p && r.stale) { C.scenarioOnStaleSeries++; ex("scenarioOnStaleSeries", r); } continue; }
  C.withScenario++;
  const lv = [p.inv, ...(p.e || []), ...(p.t1 || []), ...(p.t2 || []), p.conf].filter((x) => typeof x === "number");
  if (lv.some((x) => !(x > 0))) { C.negativeOrZeroLevel++; ex("negativeOrZeroLevel", r); }
  if ([...(p.t1 || []), ...(p.t2 || [])].some((x) => x > 3 * r.px || x < r.px / 3)) { C.targetBeyondFactor3++; ex("targetBeyondFactor3", r); }
  if (p.rr > 20) { C.crvAbove20++; ex("crvAbove20", r); } if (p.rr > 10) C.crvAbove10++;
  if (r.stale) { C.scenarioOnStaleSeries++; ex("scenarioOnStaleSeries", r); }
  if (p.es && r.ew && r.ew.ab) { C.elliottShapedWhileAbstaining++; ex("elliottShapedWhileAbstaining", r); }
  if (p.t1 && (p.dir > 0 ? r.px >= p.t1[0] : r.px <= p.t1[1])) { C.target1AlreadyReachedAtDisplay++; ex("target1AlreadyReachedAtDisplay", r); }
  if (p.e && Math.abs((p.e[0] + p.e[1]) / 2 - r.px) > 0.3 * r.px) { C.entryFarFromPrice30pct++; ex("entryFarFromPrice30pct", r); }
  if (p.e && (p.dir > 0 ? p.inv >= p.e[0] : p.inv <= p.e[1])) { C.invalidationOnWrongSide++; ex("invalidationOnWrongSide", r); }
  if (p.e && p.t1 && (p.dir > 0 ? p.t1[0] <= p.e[1] : p.t1[1] >= p.e[0])) { C.targetsOverlapEntry++; ex("targetsOverlapEntry", r); }
  /* Szenario-ID: gleiche Lesart (Art, Richtung, Vorlage, Einstiegszone, Invalidation) → gleiche ID (Alerts) */
  const key = [r.s, p.dir, p.tpl, JSON.stringify(p.e), p.inv].join("|");
  if (r.sid) { const prev = idByLevels.get(key); if (prev) { C.scenarioIdPairsChecked++; if (prev !== r.sid) { C.scenarioIdSameLevelsDifferentId++; ex("scenarioIdSameLevelsDifferentId", r); } } else idByLevels.set(key, r.sid); }
}
const share = (k) => Math.round((C[k] / Math.max(1, C.withScenario)) * 1e5) / 1e5;
const out = { schemaVersion: "hsab-record-audit-1.0.0", sealHash: man.sealHash, engine: man.engine, counts: C,
  shares: Object.fromEntries(["negativeOrZeroLevel", "targetBeyondFactor3", "crvAbove20", "crvAbove10", "scenarioOnStaleSeries", "elliottShapedWhileAbstaining", "target1AlreadyReachedAtDisplay", "entryFarFromPrice30pct", "invalidationOnWrongSide", "targetsOverlapEntry"].map((k) => [k, share(k)])) };
writeFileSync(arg("out"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.shares), "IDs:", C.scenarioIdSameLevelsDifferentId, "/", C.scenarioIdPairsChecked);
