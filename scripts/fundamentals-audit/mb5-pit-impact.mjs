// M-B5 Impact: alte Lesart (LATEST-Zeilen, filed <= t) gegen AS_REPORTED_AT_TIME, je Emittent und Monatsende.
// node mb5-pit-impact.mjs <consumer-dir> <consumer-pit-dir> <out.json>  (Ergebnis: artifacts/FUNDAMENTAL-MB5-PIT-IMPACT.json)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PIT = require(process.argv[5] || new URL("../../quant/engines/pit-fundamental-history.js", import.meta.url).pathname);
const [latestDir, pitDir, out] = process.argv.slice(2);
const V = { view: PIT.VIEW };
const METRICS = ["revenue","net_income","gross_profit","free_cash_flow","capital_expenditures","total_assets","stockholders_equity","cash_and_equivalents","shares_outstanding"];
// alte Lesart als PIT-Dokument nachgebaut: je Jahr genau die LATEST-Zeile, datiert auf ihr filed.
function oldAsPit(latest) {
  const annual = {};
  for (const m of METRICS) annual[m] = (latest.annual?.[m] || []).map((r) => [r[0], r[2], r[3], r[4], r[5]]);
  return { pit: { view: PIT.VIEW, annual } };
}
const grid = [];
for (let y = 2010; y <= 2026; y++) for (let mo = 1; mo <= 12; mo++) { const d = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); if (d <= "2026-09-30") grid.push(d); }
const res = { issuers: 0, yearsWithVersions: 0, metricYears: 0, restatedMetricYears: 0, latestDatedLaterThanFirstKnown: 0,
  observations: 0, visibilityOnlyNew: 0, visibilityOnlyOld: 0, featureDiffObs: 0, featureDiff: {}, featureCompared: {}, examples: [] };
for (const file of readdirSync(pitDir).filter((f) => f.startsWith("CIK"))) {
  const pit = JSON.parse(readFileSync(join(pitDir, file), "utf8"));
  const latest = JSON.parse(readFileSync(join(latestDir, file), "utf8"));
  res.issuers++;
  for (const m of METRICS) {
    const byFy = {};
    for (const r of pit.pit.annual[m] || []) (byFy[r[0]] ||= []).push(r);
    for (const [fy, rows] of Object.entries(byFy)) {
      res.metricYears++;
      if (rows.length > 1) res.restatedMetricYears++;
      const lr = (latest.annual?.[m] || []).find((r) => String(r[0]) === fy);
      const first = rows.map((r) => r[3]).sort()[0];
      if (lr && lr[4] > first) res.latestDatedLaterThanFirstKnown++;
    }
  }
  const old = oldAsPit(latest);
  for (const t of grid) {
    const a = PIT.featuresAt(old, t, V), b = PIT.featuresAt(pit, t, V);
    if (!a && !b) continue;
    res.observations++;
    if (!a) { res.visibilityOnlyNew++; continue; }
    if (!b) { res.visibilityOnlyOld++; continue; }
    let diff = false;
    for (const k of Object.keys(b)) {
      if (typeof b[k] !== "number" && typeof b[k] !== "boolean" && b[k] !== null) continue;
      res.featureCompared[k] = (res.featureCompared[k] || 0) + 1;
      const x = a[k], y = b[k];
      const same = x === y || (typeof x === "number" && typeof y === "number" && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y)));
      if (!same) { res.featureDiff[k] = (res.featureDiff[k] || 0) + 1; diff = true;
        if (res.examples.length < 25 && k === "revenueGrowthYoy") res.examples.push({ cik: pit.cik, tickers: pit.tickers, t, k, old: x, pit: y }); }
    }
    if (diff) res.featureDiffObs++;
  }
}
writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ ...res, examples: res.examples.length }, null, 1));
