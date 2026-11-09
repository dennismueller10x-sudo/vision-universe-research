#!/usr/bin/env node
'use strict';
/* V12 INDEXPOP step 3a: which of our weekly series are QUALIFIED by the research loader
 * createResearchLoader(root, {identityEvidence, corporateActionEvidence, listingLifecycleEvidence}) and which dates
 * the returned (possibly cut) points cover. Writes a private JSON (no repository data is changed).
 * Usage: node qualify.cjs --out <file> */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../../..');
const { createResearchLoader } = require(path.join(ROOT, 'quant/engines/research-weekly-loader.cjs'));
const out = process.argv[process.argv.indexOf('--out') + 1];
const OPTIONS = { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true };
const loader = createResearchLoader(ROOT, OPTIONS);
const dir = path.join(ROOT, 'quant/data/market/discover-series-long');
const files = fs.readdirSync(dir).filter(f => /^ref_.*\.json$/.test(f)).sort();
const series = {}, reasons = {};
for (const f of files) {
  const id = f.slice(0, -5);
  try {
    const r = loader(id);
    series[id] = { q: 1, first: r.points[0][0], last: r.points.at(-1)[0], n: r.points.length, lc: r.listingLifecycle ? r.listingLifecycle.status : null };
    reasons.QUALIFIED = (reasons.QUALIFIED || 0) + 1;
  } catch (e) {
    const k = String(e.message).split(':')[0];
    series[id] = { q: 0, reason: k };
    reasons[k] = (reasons[k] || 0) + 1;
  }
}
fs.writeFileSync(out, JSON.stringify({ schemaVersion: 'v12-indexpop-qualified-1.0.0', loaderOptions: OPTIONS, masterHash: loader.masterHash, files: files.length, reasons, series }));
console.log(JSON.stringify({ files: files.length, reasons }));
