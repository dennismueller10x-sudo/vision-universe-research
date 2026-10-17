#!/usr/bin/env node
// Vergleicht zwei Consumer-Bundle-Verzeichnisse (alter Kern vs. korrigierter Kern, gleiches SEC-Archiv, gleicher as_of).
// Zeilen werden ueber (Sektion, Kennzahl, Periodenende) gepaart; Label-Wechsel (fy/fp) werden getrennt gezaehlt.
//   node bundle-diff.mjs <old-dir> <new-dir> <out.json>
import fs from "node:fs";
import path from "node:path";

const [oldDir, newDir, outPath] = process.argv.slice(2);
if (!outPath) {
  console.error("usage: bundle-diff.mjs <old-dir> <new-dir> <out.json>");
  process.exit(2);
}

const FOCUS = ["revenue", "eps_diluted", "net_income", "gross_profit", "operating_income", "shares_outstanding"];
const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12));

function load(dir, file) {
  const p = path.join(dir, file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

function rowsByEnd(rows) {
  const map = new Map();
  for (const row of rows || []) map.set(row[2], row);
  return map;
}

const files = new Set([...fs.readdirSync(oldDir), ...fs.readdirSync(newDir)].filter((f) => /^CIK\d+\.json$/.test(f)));
const stats = {};
const examples = {};
const issuerTouched = new Set();
let onlyOld = 0;
let onlyNew = 0;
let compared = 0;

function bump(metric, key, cik, example) {
  const s = (stats[metric] ||= { issuers: {}, counts: {} });
  s.counts[key] = (s.counts[key] || 0) + 1;
  (s.issuers[key] ||= new Set()).add(cik);
  const ex = (examples[`${metric}:${key}`] ||= []);
  if (ex.length < 6) ex.push(example);
}

for (const file of [...files].sort()) {
  const a = load(oldDir, file);
  const b = load(newDir, file);
  if (!a) { onlyNew += 1; continue; }
  if (!b) { onlyOld += 1; continue; }
  compared += 1;
  const cik = b.cik;
  const ticker = (b.tickers || [])[0] || cik;
  let touched = false;
  for (const section of ["annual", "quarterly"]) {
    const metrics = new Set([...Object.keys(a[section] || {}), ...Object.keys(b[section] || {})]);
    for (const metric of metrics) {
      const ra = rowsByEnd(a[section]?.[metric]);
      const rb = rowsByEnd(b[section]?.[metric]);
      for (const end of new Set([...ra.keys(), ...rb.keys()])) {
        const x = ra.get(end);
        const y = rb.get(end);
        const tag = `${section}`;
        if (x && !y) { bump(metric, `${tag}.removed`, cik, { ticker, end, old: x[3] }); touched = true; continue; }
        if (!x && y) { bump(metric, `${tag}.added`, cik, { ticker, end, new: y[3] }); touched = true; continue; }
        if (rel(x[3], y[3]) > 1e-6) {
          bump(metric, `${tag}.valueChanged`, cik, { ticker, end, old: x[3], new: y[3], rel: +rel(x[3], y[3]).toFixed(4) });
          if (rel(x[3], y[3]) > 0.1) bump(metric, `${tag}.valueChangedOver10pct`, cik, { ticker, end, old: x[3], new: y[3] });
          touched = true;
        }
        if (x[0] !== y[0] || x[1] !== y[1]) { bump(metric, `${tag}.labelChanged`, cik, { ticker, end, old: `${x[0]}${x[1]}`, new: `${y[0]}${y[1]}` }); touched = true; }
        if (x[4] !== y[4]) { bump(metric, `${tag}.filedChanged`, cik, { ticker, end, old: x[4], new: y[4] }); touched = true; }
      }
    }
  }
  const tm = new Set([...Object.keys(a.ttm || {}), ...Object.keys(b.ttm || {})]);
  for (const metric of tm) {
    const x = a.ttm?.[metric];
    const y = b.ttm?.[metric];
    if (x && !y) { bump(metric, "ttm.removed", cik, { ticker, old: x.v, end: x.end }); touched = true; continue; }
    if (!x && y) { bump(metric, "ttm.added", cik, { ticker, new: y.v, end: y.end }); touched = true; continue; }
    if (x.end !== y.end) { bump(metric, "ttm.endChanged", cik, { ticker, old: x.end, new: y.end }); touched = true; }
    if (rel(x.v, y.v) > 1e-6) {
      bump(metric, "ttm.valueChanged", cik, { ticker, old: x.v, new: y.v, rel: +rel(x.v, y.v).toFixed(4) });
      if (rel(x.v, y.v) > 0.1) bump(metric, "ttm.valueChangedOver10pct", cik, { ticker, old: x.v, new: y.v });
      touched = true;
    }
  }
  if (touched) issuerTouched.add(cik);
}

const byMetric = {};
for (const [metric, s] of Object.entries(stats).sort()) {
  byMetric[metric] = Object.fromEntries(Object.entries(s.counts).sort().map(([k, n]) => [k, { rows: n, issuers: s.issuers[k].size }]));
}
const out = {
  schema: "vu-fundamental-bundle-diff-1.0.0",
  oldDir, newDir,
  issuersCompared: compared,
  issuersOnlyOld: onlyOld,
  issuersOnlyNew: onlyNew,
  issuersWithAnyChange: issuerTouched.size,
  focusMetrics: FOCUS,
  byMetric,
  examples,
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ compared, onlyOld, onlyNew, touched: issuerTouched.size }));
for (const m of FOCUS) if (byMetric[m]) console.log(m, JSON.stringify(byMetric[m]));
